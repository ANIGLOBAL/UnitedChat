import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";

import type { AppEnv } from "./env";

type AuthInstance = ReturnType<typeof buildAuth>;

let cachedEnv: AppEnv | null = null;
let cachedAuth: AuthInstance | null = null;

function buildAuth(env: AppEnv) {
  if (!env.SESSION_SIGNING_SECRET) {
    throw new Error("SESSION_SIGNING_SECRET is not configured.");
  }

  const origin = (env.APP_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
  const secure = origin.startsWith("https://");

  const trustedOrigins = new Set([origin]);
  const uiOrigin = (env.UI_ORIGIN || "").replace(/\/+$/, "");
  if (uiOrigin) trustedOrigins.add(uiOrigin);
  const pagesOrigin = (env.PAGES_ORIGIN || "").replace(/\/+$/, "");
  if (pagesOrigin) trustedOrigins.add(pagesOrigin);
  const chatspaceOrigin = (env.CHATSPACE_ORIGIN || "").replace(/\/+$/, "");
  if (chatspaceOrigin) trustedOrigins.add(chatspaceOrigin);
  if (origin === "http://localhost:5173") {
    trustedOrigins.add("http://127.0.0.1:5173");
    trustedOrigins.add("http://localhost:4173");
    trustedOrigins.add("http://127.0.0.1:4173");
    trustedOrigins.add("http://localhost:5174");
    trustedOrigins.add("http://127.0.0.1:5174");
  }

  return betterAuth({
    appName: "UnitedChat",
    baseURL: origin,
    secret: env.SESSION_SIGNING_SECRET,
    database: env.DB,
    trustedOrigins: [...trustedOrigins],
    plugins: [twoFactor({ issuer: "UnitedChat" })],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    user: {
      // role/status are server-managed (PROJECT_SPEC.md Section 9/10).
      additionalFields: {
        username: { type: "string", required: true, input: true },
        bio: { type: "string", required: false, input: true },
        role: { type: "string", required: false, defaultValue: "user", input: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
        // Premium tiers (ChatSpace profile features).
        plan: { type: "string", required: false, defaultValue: "free", input: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      freshAge: 0,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        delete: {
          after: async (user) => {
            try {
              const userId = (user as { id: string }).id;
              await env.DB.prepare("DELETE FROM passwordResetToken WHERE userId = ?").bind(userId).run();
            } catch {
              // Cleanup failures must not block the account deletion flow.
            }
          },
        },
      },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: {
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
        path: "/",
      },
    },
  });
}

export function createAuth(env: AppEnv) {
  if (cachedEnv === env && cachedAuth) return cachedAuth;
  cachedEnv = env;
  cachedAuth = buildAuth(env);
  return cachedAuth;
}

const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

/**
 * Username rules (PROJECT_SPEC.md Section 8):
 * 3-24 characters, ASCII letters/digits/underscore/dot, no leading dot,
 * no trailing dot, no double dots, case-insensitively unique (UNIQUE COLLATE NOCASE).
 * Stored lowercase for stable lookups.
 */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(candidate)) return null;
  if (candidate.startsWith(".") || candidate.includes("..") || candidate.endsWith(".")) return null;
  return candidate;
}

export type SessionResult = Awaited<ReturnType<AuthInstance["api"]["getSession"]>>;
export type AuthUser = NonNullable<SessionResult>["user"];

export async function getSession(env: AppEnv, request: Request) {
  return createAuth(env).api.getSession({ headers: request.headers });
}

export function copySetCookieHeaders(target: Headers, source: Headers) {
  const sourceWithCookies = source as Headers & { getSetCookie?: () => string[] };
  const cookies = sourceWithCookies.getSetCookie?.();
  if (cookies && cookies.length > 0) {
    for (const cookie of cookies) target.append("Set-Cookie", cookie);
    return target;
  }

  const combined = source.get("set-cookie");
  if (combined) target.append("Set-Cookie", combined);
  return target;
}

export function authErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { body?: { message?: unknown }; message?: unknown };
    const bodyMessage = candidate.body?.message;
    if (typeof bodyMessage === "string" && bodyMessage.trim()) return bodyMessage;
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
  }
  return "Something went wrong. Try again.";
}
