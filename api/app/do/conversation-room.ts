import { DurableObject } from "cloudflare:workers";

import {
  openConversationKey,
  openMessageBody,
  sealMessageBody,
} from "../lib/conv-key.server";
import type { AppEnv } from "../lib/env";

type StoredMessage = {
  seq: number;
  id: string;
  senderId: string;
  bodyCipher: string;
  attCipher: string | null;
  sentAt: string;
  deletedAt: string | null;
};

/** Attachment metadata carried by a message (file ID reference only). */
export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file";
  size: number;
};

type PublicMessage = Omit<StoredMessage, "bodyCipher" | "attCipher"> & {
  body: string;
  attachment: MessageAttachment | null;
  deletedForEveryone: boolean;
};

/**
 * One instance per conversation (DM or Group Chat). Owns that conversation's
 * SQLite message store, WebSocket room, and outbound relay (PROJECT_SPEC.md
 * Phase 4). Message bodies are stored encrypted under the conversation's
 * content key and only decrypted on the way out.
 */
export class ConversationRoomDO extends DurableObject<AppEnv> {
  private contentKey: CryptoKey | null = null;
  private contentKeyFor: string | null = null;
  private schemaReady: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
  }

  private ready(): Promise<void> {
    this.schemaReady ??= (async () => {
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS messages (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          senderId TEXT NOT NULL,
          bodyCipher TEXT NOT NULL,
          attCipher TEXT,
          sentAt TEXT NOT NULL,
          deletedAt TEXT,
          deletedBy TEXT
        )`,
      );
      const columns = this.ctx.storage.sql
        .exec(`PRAGMA table_info(messages)`)
        .toArray() as { name: string }[];
      if (!columns.some((col) => col.name === "attCipher")) {
        this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN attCipher TEXT`);
      }
      if (!columns.some((col) => col.name === "deletedAt")) {
        this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN deletedAt TEXT`);
      }
      if (!columns.some((col) => col.name === "deletedBy")) {
        this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN deletedBy TEXT`);
      }
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS messageDeletion (
          messageId TEXT NOT NULL,
          userId TEXT NOT NULL,
          deletedAt TEXT NOT NULL,
          PRIMARY KEY (messageId, userId)
        )`,
      );
      this.ctx.storage.sql.exec(
        `CREATE INDEX IF NOT EXISTS messageDeletion_userId_idx
           ON messageDeletion (userId)`,
      );
    })();
    return this.schemaReady;
  }

  private async key(conversationId: string): Promise<CryptoKey> {
    await this.ready();
    if (this.contentKey && this.contentKeyFor === conversationId) {
      return this.contentKey;
    }
    const row = await this.env.DB.prepare(
      'SELECT "keyEnvelope" FROM "conversation" WHERE "id" = ? LIMIT 1',
    )
      .bind(conversationId)
      .first<{ keyEnvelope: string }>();
    if (!row) throw new Error("Conversation row missing in D1.");
    const key = await openConversationKey(
      this.env.CONVERSATION_KEY_ENCRYPTION_KEY,
      row.keyEnvelope,
    );
    this.contentKey = key;
    this.contentKeyFor = conversationId;
    return key;
  }

  private async readAll(
    rows: unknown[],
    decryptKey: CryptoKey,
  ): Promise<PublicMessage[]> {
    const list = rows as unknown as StoredMessage[];
    return Promise.all(
      list.map(async (row) => {
        if (row.deletedAt) {
          return {
            seq: row.seq,
            id: row.id,
            senderId: row.senderId,
            sentAt: row.sentAt,
            deletedAt: row.deletedAt,
            deletedForEveryone: true,
            body: "",
            attachment: null,
          };
        }
        let attachment: MessageAttachment | null = null;
        if (row.attCipher) {
          try {
            attachment = JSON.parse(await openMessageBody(decryptKey, row.attCipher)) as
              | MessageAttachment
              | null;
          } catch {
            attachment = null;
          }
        }
        return {
          seq: row.seq,
          id: row.id,
          senderId: row.senderId,
          sentAt: row.sentAt,
          deletedAt: null,
          deletedForEveryone: false,
          body: await openMessageBody(decryptKey, row.bodyCipher),
          attachment,
        };
      }),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    // Realtime room (browser WebSocket upgrade). The conversation id rides
    // in the ?c= query; it is validated by the calling route before upgrade.
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const conversationId = new URL(request.url).searchParams.get("c") ?? "";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ c: conversationId });
      server.send(JSON.stringify({ type: "hello" }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response(
      JSON.stringify({ ok: true, object: "ConversationRoomDO" }),
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  /** Appends one message (plaintext inbound only from authorized routes). */
  async append(
    conversationId: string,
    messageId: string,
    senderId: string,
    body: string,
    sentAt: string,
    senderName?: string,
    senderUsername?: string,
    attachment?: MessageAttachment | null,
  ): Promise<{ seq: number; body: string; attachment: MessageAttachment | null }> {
    await this.ready();
    const encryptKey = await this.key(conversationId);
    const bodyCipher = await sealMessageBody(encryptKey, body);
    const attCipher = attachment
      ? await sealMessageBody(encryptKey, JSON.stringify(attachment))
      : null;
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, senderId, bodyCipher, attCipher, sentAt) VALUES (?, ?, ?, ?, ?)`,
      messageId,
      senderId,
      bodyCipher,
      attCipher,
      sentAt,
    );
    const row = this.ctx.storage.sql
      .exec(`SELECT seq FROM messages WHERE id = ?`, messageId)
      .toArray()[0] as { seq: number } | undefined;
    const seq = Number(row?.seq ?? 0);
    this.broadcast({
      type: "message",
      message: {
        seq,
        id: messageId,
        senderId,
        senderName: senderName ?? senderId,
        senderUsername: senderUsername ?? "",
        body,
        attachment: attachment ?? null,
        sentAt,
        deletedForEveryone: false,
      },
    });
    return { seq, body, attachment: attachment ?? null };
  }

  /** Message history after `afterSeq` (ascending, capped by `limit`). */
  async history(
    conversationId: string,
    afterSeq: number,
    limit: number,
    viewerId = "",
  ): Promise<PublicMessage[]> {
    await this.ready();
    const decryptKey = await this.key(conversationId);
    const rows = viewerId
      ? this.ctx.storage.sql
          .exec(
            `SELECT seq, id, senderId, bodyCipher, attCipher, sentAt, deletedAt
               FROM messages
              WHERE seq > ?
                AND id NOT IN (
                  SELECT messageId FROM messageDeletion WHERE userId = ?
                )
              ORDER BY seq ASC LIMIT ?`,
            afterSeq,
            viewerId,
            limit,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec(
            `SELECT seq, id, senderId, bodyCipher, attCipher, sentAt, deletedAt
               FROM messages WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
            afterSeq,
            limit,
          )
          .toArray();
    return this.readAll(rows, decryptKey);
  }

  /** Latest message preview for the D1 inbox listing. */
  async latest(conversationId: string, viewerId = ""): Promise<PublicMessage | null> {
    await this.ready();
    const decryptKey = await this.key(conversationId);
    const rows = viewerId
      ? this.ctx.storage.sql
          .exec(
            `SELECT seq, id, senderId, bodyCipher, attCipher, sentAt, deletedAt
               FROM messages
              WHERE id NOT IN (
                SELECT messageId FROM messageDeletion WHERE userId = ?
              )
              ORDER BY seq DESC LIMIT 1`,
            viewerId,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec(
            `SELECT seq, id, senderId, bodyCipher, attCipher, sentAt, deletedAt
               FROM messages ORDER BY seq DESC LIMIT 1`,
          )
          .toArray();
    const all = await this.readAll(rows, decryptKey);
    return all[0] ?? null;
  }

  /**
   * Deletes one message for the caller or for everyone. Only the original
   * sender may remove a message from every participant's view.
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    scope: "me" | "everyone",
  ): Promise<{ ok: boolean; error?: string }> {
    await this.ready();
    const row = this.ctx.storage.sql
      .exec(
        `SELECT senderId, deletedAt FROM messages WHERE id = ? LIMIT 1`,
        messageId,
      )
      .toArray()[0] as { senderId: string; deletedAt: string | null } | undefined;
    if (!row) return { ok: false, error: "Không tìm thấy tin nhắn." };

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (scope === "everyone") {
      if (row.senderId !== userId) {
        return { ok: false, error: "Chỉ người gửi mới xóa được ở mọi người." };
      }
      if (!row.deletedAt) {
        this.ctx.storage.sql.exec(
          `UPDATE messages
              SET bodyCipher = '', attCipher = NULL, deletedAt = ?, deletedBy = ?
            WHERE id = ?`,
          now,
          userId,
          messageId,
        );
      }
      this.broadcast({ type: "message-deleted", messageId, deletedBy: userId });
      return { ok: true };
    }

    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO messageDeletion (messageId, userId, deletedAt)
       VALUES (?, ?, ?)`,
      messageId,
      userId,
      now,
    );
    this.broadcast({ type: "message-hidden", messageId, userId });
    void conversationId;
    return { ok: true };
  }

  /** Number of stored messages after `afterSeq` (for unread counters). */
  async countAfter(conversationId: string, afterSeq: number): Promise<number> {
    await this.ready();
    const rows = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) AS n FROM messages WHERE seq > ?`, afterSeq)
      .toArray();
    return Number((rows[0] as { n: number | bigint } | undefined)?.n ?? 0);
  }

  private broadcast(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch {
        // Socket may be closing in parallel; hibernation cleans it up.
      }
    }
  }

  override async webSocketMessage(ws: WebSocket, _text: string | ArrayBuffer) {
    // Clients never write through the socket: every message is validated and
    // persisted by the REST route first, then broadcast from `append`.
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Send messages through POST /api/conversations/:id or /api/spaces/:id/messages.",
      }),
    );
  }
}
