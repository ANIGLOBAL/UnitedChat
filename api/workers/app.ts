import { createRequestHandler, RouterContextProvider } from "react-router";

import type { AppEnv } from "../app/lib/env";
import { envContext } from "../app/lib/env-context";

// --- Durable Objects (SQLite-backed) -------------------------------------

export { ConversationRoomDO } from "../app/do/conversation-room";
export { UserPresenceDO } from "../app/do/user-presence";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const API_ONLY = "UnitedChat API. The web app is served from GitHub Pages.";

function health() {
  return new Response(JSON.stringify({ ok: true, service: "unitedchat-api" }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function allowedOrigins(env: AppEnv) {
  const origins = new Set<string>();
  const apiOrigin = (env.APP_ORIGIN || "").replace(/\/+$/, "");
  if (apiOrigin) origins.add(apiOrigin);

  // GitHub Pages origin (scheme + host only; the repo path is not part of it).
  const uiOrigin = (env.UI_ORIGIN || "").replace(/\/+$/, "");
  if (uiOrigin) origins.add(uiOrigin);

  // Legacy origins kept during the ChatIndex -> UnitedChat migration.
  const pagesOrigin = (env.PAGES_ORIGIN || "").replace(/\/+$/, "");
  if (pagesOrigin) origins.add(pagesOrigin);
  const spaceOrigin = (env.CHATSPACE_ORIGIN || "").replace(/\/+$/, "");
  if (spaceOrigin) origins.add(spaceOrigin);

  if (apiOrigin === "http://localhost:5173") {
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:4173");
    origins.add("http://127.0.0.1:4173");
    origins.add("http://localhost:5174");
    origins.add("http://127.0.0.1:5174");
  }

  return origins;
}

function corsHeaders(request: Request, env: AppEnv) {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (!origin) return headers;

  if (!allowedOrigins(env).has(origin)) return headers;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  headers.set("Access-Control-Expose-Headers", "set-auth-token");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return headers;
}

function securityHeaders(request: Request, response: Response, env: AppEnv) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  const headers = new Headers(response.headers);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  if (isApi) {
    for (const [name, value] of corsHeaders(request, env)) {
      headers.set(name, value);
    }
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function isSpaceMember(env: AppEnv, conversationId: string, userId: string) {
  // Group Space rooms authorize through groupSpaceMember; the chat pipeline
  // stays conversation-agnostic (PROJECT_SPEC_2.md §9.3).
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM \"groupSpace\" AS g JOIN \"groupSpaceMember\" AS m ON m.\"groupId\" = g.\"groupId\" WHERE g.\"conversationId\" = ? AND m.\"userId\" = ? AND m.\"status\" = 'active' AND g.\"status\" = 'active' LIMIT 1",
  )
    .bind(conversationId, userId)
    .first<{ ok: number }>();
  return row !== null;
}

export default {
  async fetch(request, env, ctx) {
    const appEnv = env as unknown as AppEnv;
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return health();
    }

    // This Worker only serves the API. Pages are deployed on GitHub Pages.
    if (!url.pathname.startsWith("/api/")) {
      return Response.json({ error: API_ONLY }, { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, appEnv) });
    }

    // Realtime conversation rooms: /api/ws/<conversationId>?c=<conversationId>
    // Browser cannot set headers on WebSocket, so the session cookie rides on
    // the handshake itself and the origin must be allowlisted.
    const wsMatch = url.pathname.match(/^\/api\/ws\/([A-Za-z0-9:_-]+)$/);
    if (wsMatch && (request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      const origin = request.headers.get("Origin");
      if (!origin || !allowedOrigins(appEnv).has(origin)) {
        return new Response("Web Socket origin denied.", { status: 403 });
      }

      const [{ getSession }, { isParticipantDb }] = await Promise.all([
        import("../app/lib/auth.server"),
        import("../app/lib/conversation-db"),
      ]);
      const session = await getSession(appEnv, request);
      if (!session) {
        return new Response("Sign in first.", { status: 401 });
      }
      const conversationId = wsMatch[1];
      if (
        !(await isParticipantDb(appEnv, conversationId, String(session.user.id))) &&
        !(await isSpaceMember(appEnv, conversationId, String(session.user.id)))
      ) {
        return new Response("Not found.", { status: 404 });
      }

      const internalUrl = new URL(request.url);
      internalUrl.searchParams.set("c", conversationId);
      const upstream = await appEnv.CONVERSATION_ROOM
        .get(appEnv.CONVERSATION_ROOM.idFromName(conversationId))
        .fetch(
          new Request(internalUrl, {
            headers: request.headers,
            method: "GET",
          }),
        );
      return upstream;
    }

    const context = new RouterContextProvider();
    context.set(envContext, appEnv);
    const response = await requestHandler(request, context);
    return securityHeaders(request, response, appEnv);
  },
} satisfies ExportedHandler<Env>;
