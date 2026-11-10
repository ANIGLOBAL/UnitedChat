import type { AppEnv } from "./env";

export async function requireAdmin(
  env: AppEnv,
  userId: unknown,
): Promise<boolean> {
  if (typeof userId !== "string" || userId.length === 0) return false;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM \"user\" WHERE \"id\" = ? AND \"role\" = 'admin' AND \"status\" = 'active' LIMIT 1",
  )
    .bind(userId)
    .first<{ ok: number }>();
  return row !== null;
}

export async function audit(
  env: AppEnv,
  actorId: string,
  action: string,
  targetId: string | null,
  reason: string | null,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO "auditLog" ("id","actorId","action","targetId","reason","createdAt") VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      targetId,
      reason,
      new Date().toISOString().replace("T", " ").slice(0, 19),
    )
    .run();
}
