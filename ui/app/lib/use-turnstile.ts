import { useEffect, useRef, useState } from "react";

import { turnstileSiteKey } from "./api";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | undefined;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __unitedchatTurnstileQueue?: Array<() => void>;
  }
}

function loadTurnstile(onReady: () => void) {
  if (typeof window === "undefined") return;
  if (window.turnstile) {
    onReady();
    return;
  }
  const queue = (window.__unitedchatTurnstileQueue ??= []);
  queue.push(onReady);
  if (document.getElementById("cf-turnstile-api")) return;

  const script = document.createElement("script");
  script.id = "cf-turnstile-api";
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.onload = () => {
    const pending = window.__unitedchatTurnstileQueue ?? [];
    window.__unitedchatTurnstileQueue = [];
    for (const run of pending) run();
  };
  script.onerror = () => {
    window.__unitedchatTurnstileQueue = [];
  };
  document.head.appendChild(script);
}

export function useTurnstile(siteKey = turnstileSiteKey()) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [token, setToken] = useState("");
  const enabled = Boolean(siteKey);

  useEffect(() => {
    const element = ref.current;
    if (!element || !siteKey || typeof window === "undefined") return;

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
          // unmounting
        }
      }
    };
  }, [siteKey]);

  return { ref, token, enabled };
}
