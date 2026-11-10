import type { AppEnv } from "./env";

/**
 * Participant check used by conversation routes and the WebSocket upgrade
 * path in workers/app.ts.
 */
export async function isParticipantDb(
  env: AppEnv,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM "conversationParticipant" WHERE "conversationId" = ? AND "userId" = ? LIMIT 1',
  )
    .bind(conversationId, userId)
    .first<{ ok: number }>();
  return row !== null;
}
