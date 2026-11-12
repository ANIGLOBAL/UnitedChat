import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.conversations.$id";

async function membership(
  env: AppEnv,
  conversationId: string,
  userId: string,
): Promise<{ me: string; lastReadAt: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT p."userId", p."lastReadAt"
       FROM "conversationParticipant" AS p
      WHERE p."conversationId" = ? AND p."userId" = ?
      LIMIT 1`,
  )
    .bind(conversationId, userId)
    .first<{ userId: string; lastReadAt: string | null }>();
  return row ? { me: row.userId, lastReadAt: row.lastReadAt } : null;
}

async function listParticipants(env: AppEnv, conversationId: string) {
  const rows = await env.DB.prepare(
    `SELECT u."id", u."username", u."name", u."image"
       FROM "conversationParticipant" AS p
       JOIN "user" AS u ON u."id" = p."userId"
      WHERE p."conversationId" = ?`,
  )
    .bind(conversationId)
    .all<{ id: string; username: string; name: string; image: string | null }>();
  return rows.results;
}

function stubFor(env: AppEnv, conversationId: string) {
  return env.CONVERSATION_ROOM
    .get(env.CONVERSATION_ROOM.idFromName(conversationId));
}

async function handle({
  request,
  params,
  context,
}: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

  const conversationId = String(params.id ?? "");
  if (!conversationId) return Response.json({ error: "Not found." }, { status: 404 });

  const member = await membership(env, conversationId, String(session.user.id));
  if (!member) return Response.json({ error: "Not found." }, { status: 404 });

  const meta = await env.DB.prepare(
    'SELECT "kind", "title" FROM "conversation" WHERE "id" = ? LIMIT 1',
  )
    .bind(conversationId)
    .first<{ kind: string; title: string | null }>();

  const stub = stubFor(env, conversationId);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const afterSeq = Number(url.searchParams.get("after") ?? "0") || 0;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "80") || 80, 200);

    // Full history first-time loads pass after=0 (limited); incremental
    // polling passes after=<lastSeq> and receives only what's new.
    const history =
      afterSeq === 0
        ? (await stub.history(conversationId, 0, 2147483647, String(session.user.id))).slice(
            -limit,
          )
        : await stub.history(
            conversationId,
            afterSeq,
            limit,
            String(session.user.id),
          );

    // Sender display names for the batch.
    const senderIds = [...new Set(history.map((m) => m.senderId))];
    const senders: Record<string, { name: string; username: string }> = {};
    if (senderIds.length > 0) {
      const placeholders = senderIds.map(() => "?").join(",");
      const rows = await env.DB.prepare(
        `SELECT "id", "username", "name" FROM "user" WHERE id IN (${placeholders})`,
      )
        .bind(...senderIds)
        .all<{ id: string; username: string; name: string }>();
      for (const row of rows.results) {
        senders[row.id] = { name: row.name, username: row.username };
      }
    }

    return Response.json({
      id: conversationId,
      kind: meta?.kind === "group" ? "group" : "dm",
      title: meta?.kind === "group" ? (meta.title ?? "Nhóm") : null,
      participants: await listParticipants(env, conversationId),
      messages: history.map((m) => ({
        seq: m.seq,
        id: m.id,
        senderId: m.senderId,
        senderName: senders[m.senderId]?.name ?? "?",
        senderUsername: senders[m.senderId]?.username ?? "",
        body: m.body,
        attachment: m.attachment,
        sentAt: m.sentAt,
        deletedForEveryone: m.deletedForEveryone,
        mine: m.senderId === session.user.id,
      })),
    });
  }

  if (request.method === "POST") {
    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const body = (payload as { body?: unknown } | null)?.body;
    const attachmentId = (payload as { attachmentId?: unknown } | null)?.attachmentId;
    const hasAttachment = typeof attachmentId === "string" && attachmentId.length > 0;
    const text = typeof body === "string" ? body.trim() : "";

    let attachment: {
      id: string;
      name: string;
      mimeType: string;
      kind: "image" | "file";
      size: number;
    } | null = null;

    if (hasAttachment) {
      const fileRow = await env.DB.prepare(
        'SELECT "id","ownerId","name","mimeType","kind","size","status" FROM "file" WHERE "id" = ? LIMIT 1',
      )
        .bind(String(attachmentId))
        .first<{
          id: string;
          ownerId: string;
          name: string;
          mimeType: string;
          kind: string;
          size: number;
          status: string;
        }>();
      if (!fileRow || fileRow.ownerId !== session.user.id || fileRow.status !== "active") {
        return Response.json({ error: "File not available." }, { status: 403 });
      }
      attachment = {
        id: fileRow.id,
        name: fileRow.name,
        mimeType: fileRow.mimeType,
        kind: fileRow.kind === "image" ? "image" : "file",
        size: Number(fileRow.size ?? 0),
      };
    }

    if (!text && !attachment) {
      return Response.json({ error: "Message required (1-4000 chars)." }, { status: 400 });
    }
    if (text.length > 4000) {
      return Response.json({ error: "Message required (1-4000 chars)." }, { status: 400 });
    }

    const messageId = crypto.randomUUID();
    const sentAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    const result = await stub
      .append(
        conversationId,
        messageId,
        String(session.user.id),
        text,
        sentAt,
        String(session.user.name ?? ""),
        String(session.user.username ?? ""),
        attachment,
      )
      .catch(() => null);
    if (!result) {
      return Response.json({ error: "Can't send message." }, { status: 500 });
    }

    if (hasAttachment) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO "fileShare" ("fileId","conversationId") VALUES (?, ?)',
      )
        .bind(String(attachmentId), conversationId)
        .run();
    }

    await env.DB.prepare(
      'UPDATE "conversation" SET "updatedAt" = ? WHERE "id" = ?',
    )
      .bind(sentAt, conversationId)
      .run();

    return Response.json({
      message: {
        seq: result.seq,
        id: messageId,
        senderId: session.user.id,
        senderName: String(session.user.name ?? ""),
        senderUsername: String(session.user.username ?? ""),
        body: result.body,
        attachment: result.attachment,
        sentAt,
        mine: true,
      },
    });
  }

  if (request.method === "DELETE") {
    // Leave group. When the last member leaves, the group disappears entirely.
    if (meta?.kind !== "group") {
      return Response.json({ error: "Chỉ có thể rời nhóm, không thể rời tin nhắn cá nhân." }, { status: 400 });
    }
    await env.DB.prepare(
      'DELETE FROM "conversationParticipant" WHERE "conversationId" = ? AND "userId" = ?',
    )
      .bind(conversationId, session.user.id)
      .run();
    const left = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM "conversationParticipant" WHERE "conversationId" = ?',
    )
      .bind(conversationId)
      .first<{ n: number }>();
    const remaining = Number(left?.n ?? 0);
    let deleted = false;
    if (remaining === 0) {
      await env.DB.prepare('DELETE FROM "conversation" WHERE "id" = ?')
        .bind(conversationId)
        .run();
      deleted = true;
    } else {
      await env.DB.prepare('UPDATE "conversation" SET "updatedAt" = ? WHERE "id" = ?')
        .bind(new Date().toISOString().replace("T", " ").slice(0, 19), conversationId)
        .run();
    }
    return Response.json({ ok: true, deleted });
  }

  if (request.method === "PUT") {
    // Mark read.
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await env.DB.prepare(
      'UPDATE "conversationParticipant" SET "lastReadAt" = ? WHERE "conversationId" = ? AND "userId" = ?',
    )
      .bind(now, conversationId, session.user.id)
      .run();
    return Response.json({ ok: true, lastReadAt: now });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
