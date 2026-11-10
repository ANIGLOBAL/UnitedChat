import { useEffect, useRef, useState } from "react";

// Public widget site key for chatindex.aniviet.workers.dev. The matching
// secret lives in the Worker as TURNSTILE_SECRET_KEY.
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFu6hbY1Si8CPJvn";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string | undefined;
      remove: (id: string) => void;
    };
    __turnstileQueue?: Array<() => void>;
  }
}

function loadTurnstile(onReady: () => void) {
  if (typeof window === "undefined") return;
  if (window.turnstile) {
    onReady();
    return;
  }
  const queue = (window.__turnstileQueue = window.__turnstileQueue ?? []);
  queue.push(onReady);
  if (document.getElementById("cf-turnstile-api")) return;

  const script = document.createElement("script");
  script.id = "cf-turnstile-api";
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.onload = () => {
    const pending = window.__turnstileQueue ?? [];
    window.__turnstileQueue = [];
    for (const fn of pending) fn();
  };
  script.onerror = () => {
    window.__turnstileQueue = [];
  };
  document.head.appendChild(script);
}

export function useTurnstile(siteKey: string = TURNSTILE_SITE_KEY) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const element = ref.current;
    if (!siteKey || typeof window === "undefined") return;
    let cancelled = false;
    let widgetId: string | undefined;

    loadTurnstile(() => {
      if (cancelled || !element || !window.turnstile) return;
      widgetId = window.turnstile.render(element, {
        sitekey: siteKey,
        theme: "light",
        callback: (value: unknown) => setToken(typeof value === "string" ? value : ""),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    });

    return () => {
      cancelled = true;
      if (widgetId) {
        try {
          window.turnstile?.remove(widgetId);
        } catch {
          // The site is unmounting anyway.
        }
      }
    };
  }, [siteKey]);

  return { ref, token };
}

export async function verifyTurnstileToken(
  // Accept the full worker env or a narrower object; only the Turnstile secret matters.
  env: { TURNSTILE_SECRET_KEY?: string } | object | undefined,
  token: unknown,
  remoteIp?: string | null,
) {
  const secret = env ? (env as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY : undefined;
  if (!secret) return true; // Not configured locally; nothing to verify.
  if (typeof token !== "string" || !token) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

export function humanIp(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null
  );
}
