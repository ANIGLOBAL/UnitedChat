import { DurableObject } from "cloudflare:workers";

import type { AppEnv } from "../lib/env";

/**
 * One instance per immutable User ID (PROJECT_SPEC.md Section 5.2). Presence
 * reconstructed from live connections stays ephemeral here (DO SQLite, no D1
 * writes for heartbeats). Multi-device: one row per device session.
 */
export class UserPresenceDO extends DurableObject<AppEnv> {
  private schemaReady: Promise<void> | null = null;

  private ready(): Promise<void> {
    this.schemaReady ??= (async () => {
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS devices (
           sessionId TEXT PRIMARY KEY,
           lastSeen TEXT NOT NULL
         )`,
      );
    })();
    return this.schemaReady;
  }

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
  }

  /** Records a heartbeat for one device session (ephemeral, DO-local). */
  async heartbeat(sessionId: string, now: string): Promise<{ online: boolean }> {
    await this.ready();
    this.ctx.storage.sql.exec(
      `INSERT INTO devices (sessionId, lastSeen) VALUES (?, ?)
       ON CONFLICT(sessionId) DO UPDATE SET lastSeen = excluded.lastSeen`,
      sessionId,
      now,
    );
    return { online: true };
  }

  /**
   * Online = any device seen within `ttlSeconds` of wall-clock `now`.
   */
  async statusOf(now: string, ttlSeconds = 15): Promise<{ online: boolean; devices: number }> {
    await this.ready();
    const limit = new Date(
      new Date(now.replace(" ", "T") + "Z").getTime() - ttlSeconds * 1000,
    )
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT COUNT(*) AS n FROM devices WHERE lastSeen >= ?`,
        limit,
      )
      .toArray();
    const devices = Number((rows[0] as { n: number | bigint } | undefined)?.n ?? 0);
    return { online: devices > 0, devices };
  }

  async drop(sessionId: string): Promise<void> {
    await this.ready();
    this.ctx.storage.sql.exec(`DELETE FROM devices WHERE sessionId = ?`, sessionId);
  }
}
