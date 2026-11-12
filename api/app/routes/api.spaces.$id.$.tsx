import { getSession } from "../lib/auth.server";
import { audit } from "../lib/admin.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.spaces.$id.$";

function stubFor(env: AppEnv, conversationId: string) {
  return env.CONVERSATION_ROOM.get(env.CONVERSATION_ROOM.idFromName(conversationId));
}

/** DO room RPC shape (DurableObjectStub is untyped here; mirror ConversationRoomDO). */
type RoomAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file";
  size: number;
} | null;
interface RoomStub {
  history(
    conversationId: string,
    afterSeq: number,
    limit: number,
    viewerId?: string,
  ): Promise<
    Array<{
      seq: number;
      id: string;
      senderId: string;
      body: string;
      attachment: RoomAttachment;
      sentAt: string;
      deletedForEveryone: boolean;
    }>
  >;
  deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    scope: "me" | "everyone",
  ): Promise<{ ok: boolean; error?: string }>;
  append(
    conversationId: string,
    messageId: string,
    senderId: string,
    body: string,
    sentAt: string,
    senderName?: string,
    senderUsername?: string,
    attachment?: RoomAttachment,
  ): Promise<{ seq: number; body: string; attachment: RoomAttachment }>;
}

async function handle({ request, params, context }: Route.LoaderArgs | Route.ActionArgs) {
  const { getSpace, activeMembership } = await import("../lib/space.server");
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  const me = session ? String(session.user.id) : "";

  const groupId = String(params.id ?? "");
  const rest = String(params["*"] ?? "");
  if (!groupId) return Response.json({ error: "Not found." }, { status: 404 });

  // Recruiting actions (join = authenticated even without membership).
  if (rest === "join") {
    if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

    if (request.method === "POST") {
      const space = await getSpace(env, groupId);
      if (!space || space.status === "deleted") {
        return Response.json({ error: "Không tìm thấy Group Space." }, { status: 404 });
      }
      if (space.status === "suspended") {
        return Response.json(
          { error: "Không thể tham gia nhóm đang bị tạm ngừng.", membership: "suspended" },
          { status: 403 },
        );
      }
      const existing = await activeMembership(env, groupId, me);
      if (existing) {
        return Response.json({ ok: true, membership: "member", role: existing.role });
      }
      if (space.ownerUserId === me) {
        return Response.json({ ok: true, membership: "member", role: "owner" });
      }

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);

      if (space.requireOwnerApproval === 1) {
        // Cheap rate limit: no more than 5 pending requests per minute/user.
        const recent = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM \"groupSpaceJoinRequest\" WHERE \"applicantUserId\" = ? AND \"createdAt\" > ?",
        )
          .bind(me, new Date(Date.now() - 60_000).toISOString().replace("T", " ").slice(0, 19))
          .first<{ n: number }>();
        if (Number(recent?.n ?? 0) >= 5) {
          return Response.json(
            { error: "Đang gửi quá nhanh, thử lại sau một phút." },
            { status: 429 },
          );
        }
        const stale = await env.DB.prepare(
          "SELECT \"status\",\"requestId\" FROM \"groupSpaceJoinRequest\" WHERE \"groupId\" = ? AND \"applicantUserId\" = ? AND \"status\" IN ('pending','approved','rejected') ORDER BY \"createdAt\" DESC LIMIT 1",
        )
          .bind(groupId, me)
          .first<{ status: string; requestId: string }>();
        if (stale?.status === "pending") {
          return Response.json({ ok: true, membership: "pending" });
        }
        if (stale?.status === "rejected") {
          return Response.json(
            { error: "Yêu cầu trước đó đã bị từ chối.", membership: "rejected" },
            { status: 403 },
          );
        }
        const requestId = crypto.randomUUID();
        try {
          await env.DB.prepare(
            'INSERT INTO "groupSpaceJoinRequest" ("requestId","groupId","applicantUserId","status","createdAt") VALUES (?, ?, ?, ?, ?)',
          )
            .bind(requestId, groupId, me, "pending", now)
            .run();
        } catch {
          // unique pending index race → treat as already pending
          return Response.json({ ok: true, membership: "pending" });
        }
        return Response.json({ ok: true, membership: "pending" });
      }

      // Approval OFF — direct join, idempotent; rejoin awakens an old row.
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO "groupSpaceMember" ("groupId","userId","role","status","joinedAt") VALUES (?, ?, \'member\', \'active\', ?) ON CONFLICT("groupId","userId") DO UPDATE SET "status" = \'active\', "role" = \'member\', "joinedAt" = ?',
        ).bind(groupId, me, now, now),
        env.DB.prepare(
          'UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?',
        ).bind(now, groupId),
      ]);
      return Response.json({ ok: true, membership: "member", role: "member" });
    }

    if (request.method === "DELETE") {
      // Cancel my pending request.
      await env.DB.prepare(
        "DELETE FROM \"groupSpaceJoinRequest\" WHERE \"groupId\" = ? AND \"applicantUserId\" = ? AND \"status\" = 'pending'",
      )
        .bind(groupId, me)
        .run();
      return Response.json({ ok: true, membership: "none" });
    }
  }

  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

  if (rest === "leave" && request.method === "DELETE") {
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Không tìm thấy Group Space." }, { status: 404 });
    }
    if (space.ownerUserId === me) {
      return Response.json(
        { error: "Owner hãy chuyển quyền hoặc xoá nhóm trước khi rời." },
        { status: 400 },
      );
    }
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE \"groupSpaceMember\" SET \"status\" = 'left' WHERE \"groupId\" = ? AND \"userId\" = ?",
      ).bind(groupId, me),
      env.DB.prepare(
        'UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?',
      ).bind(now, groupId),
    ]);
    await audit(env, me, "space.leave", groupId, "member left");
    return Response.json({ ok: true });
  }

  if (rest === "transfer" && request.method === "POST") {
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Không tìm thấy Group Space." }, { status: 404 });
    }
    if (space.ownerUserId !== me) {
      return Response.json({ error: "Chỉ Owner được chuyển quyền." }, { status: 403 });
    }
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const nextOwner = String((body as { userId?: unknown })?.userId ?? "");
    if (!nextOwner || nextOwner === me) {
      return Response.json({ error: "Chọn một thành viên khác." }, { status: 400 });
    }
    const target = await activeMembership(env, groupId, nextOwner);
    if (!target) {
      return Response.json({ error: "Người nhận phải là thành viên." }, { status: 400 });
    }
    // One owned Group Space per account — the receiver must have a free slot.
    const targetOwned = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM \"groupSpace\" WHERE \"ownerUserId\" = ? AND \"status\" IN ('active','suspended')",
    )
      .bind(nextOwner)
      .first<{ n: number }>();
    if (Number(targetOwned?.n ?? 0) >= 1) {
      return Response.json(
        { error: "Người nhận đã có một Group Space của riêng họ." },
        { status: 409 },
      );
    }
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE "groupSpace" SET "ownerUserId" = ?, "updatedAt" = ? WHERE "groupId" = ?',
      ).bind(nextOwner, now, groupId),
      env.DB.prepare(
        'UPDATE "groupSpaceMember" SET "role" = ? WHERE "groupId" = ? AND "userId" = ?',
      ).bind("owner", groupId, nextOwner),
      env.DB.prepare(
        'UPDATE "groupSpaceMember" SET "role" = ? WHERE "groupId" = ? AND "userId" = ?',
      ).bind("admin", groupId, me),
    ]);
    await audit(env, me, "space.transfer", groupId, `owner → ${nextOwner}`);
    return Response.json({ ok: true, ownerUserId: nextOwner });
  }

  if (rest === "requests") {
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    if (space.ownerUserId !== me) {
      return Response.json({ error: "Chỉ Owner xem được yêu cầu." }, { status: 403 });
    }
    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT r."requestId", r."status", r."createdAt", u."id" AS userId, u."username", u."name"
           FROM "groupSpaceJoinRequest" AS r JOIN "user" AS u ON u."id" = r."applicantUserId"
          WHERE r."groupId" = ? AND r."status" = 'pending'
          ORDER BY r."createdAt" ASC LIMIT 100`,
      )
        .bind(groupId)
        .all<Record<string, unknown>>();
      return Response.json({
        requests: rows.results.map((row) => ({
          requestId: row.requestId,
          userId: row.userId,
          username: row.username,
          name: row.name,
          createdAt: row.createdAt,
        })),
      });
    }
  }

  const requestMatch = rest.match(/^requests\/([A-Za-z0-9-]+)$/);
  if (requestMatch && request.method === "POST") {
    const requestId = requestMatch[1];
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const decision = (body as { action?: unknown })?.action;
    if (decision !== "approve" && decision !== "reject") {
      return Response.json({ error: "action phải là approve hoặc reject." }, { status: 400 });
    }
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    if (space.ownerUserId !== me) {
      return Response.json({ error: "Chỉ Owner được duyệt yêu cầu." }, { status: 403 });
    }
    const next = decision === "approve" ? "approved" : "rejected";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const batch = [
      env.DB.prepare(
        "UPDATE \"groupSpaceJoinRequest\" SET \"status\" = ?, \"processedAt\" = ?, \"processedByUserId\" = ? WHERE \"requestId\" = ? AND \"groupId\" = ? AND \"status\" = 'pending'",
      ).bind(next, now, me, requestId, groupId),
    ];
    if (decision === "approve") {
      // Applicant = userId of the request row → create membership exactly once.
      const applicant = await env.DB.prepare(
        'SELECT "applicantUserId" FROM "groupSpaceJoinRequest" WHERE "requestId" = ? LIMIT 1',
      )
        .bind(requestId)
        .first<{ applicantUserId: string }>();
      if (applicant) {
        batch.push(
          env.DB.prepare(
            'INSERT INTO "groupSpaceMember" ("groupId","userId","role","status","joinedAt") VALUES (?, ?, \'member\', \'active\', ?) ON CONFLICT("groupId","userId") DO UPDATE SET "status" = \'active\', "role" = \'member\'',
          ).bind(groupId, applicant.applicantUserId, now),
        );
        batch.push(
          env.DB.prepare('UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?').bind(
            now,
            groupId,
          ),
        );
      }
    }
    const results = await env.DB.batch(batch);
    const updated = await env.DB.prepare(
      'SELECT "status" FROM "groupSpaceJoinRequest" WHERE "requestId" = ? LIMIT 1',
    )
      .bind(requestId)
      .first<{ status: string }>();
    const processed = updated?.status === next;
    if (!processed) {
      return Response.json(
        { error: "Yêu cầu đã được xử lý trước đó." },
        { status: 409 },
      );
    }
    void results;
    await audit(env, me, `space.request.${next}`, groupId, requestId);
    return Response.json({ ok: true, status: next });
  }

  if (rest === "members" && request.method === "GET") {
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    const membership = await activeMembership(env, groupId, me);
    if (!membership) {
      return Response.json({ error: "Not a member." }, { status: 403 });
    }
    const rows = await env.DB.prepare(
      `SELECT m."userId", m."role", m."joinedAt", u."username", u."name", u."image", u."bannerFileId", u."plan"
         FROM "groupSpaceMember" AS m JOIN "user" AS u ON u."id" = m."userId"
        WHERE m."groupId" = ? AND m."status" = 'active'
        ORDER BY CASE m."role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                 m."joinedAt" ASC LIMIT 500`,
    )
      .bind(groupId)
      .all<Record<string, unknown>>();
    return Response.json({
      members: rows.results.map((row) => ({
        userId: row.userId,
        username: row.username,
        name: row.name,
        role: row.role,
        joinedAt: row.joinedAt,
        avatarFileId: row.image ? String(row.image) : null,
        bannerFileId: row.bannerFileId ? String(row.bannerFileId) : null,
        plan: String(row.plan ?? "free"),
      })),
    });
  }

  // Member management: PATCH = role change (owner), DELETE = kick (owner/admin).
  const removeMatch = rest.match(/^members\/([A-Za-z0-9_-]+)$/);
  if (removeMatch && request.method === "PATCH") {
    const target = removeMatch[1];
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const role = (body as { role?: unknown })?.role;
    if (role !== "admin" && role !== "member") {
      return Response.json({ error: "role phải là admin hoặc member." }, { status: 400 });
    }
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Không tìm thấy Group Space." }, { status: 404 });
    }
    if (space.ownerUserId !== me) {
      return Response.json({ error: "Chỉ Owner được đổi vai trò." }, { status: 403 });
    }
    if (target === space.ownerUserId) {
      return Response.json({ error: "Không thể đổi vai trò của Owner." }, { status: 400 });
    }
    const targetMembership = await activeMembership(env, groupId, target);
    if (!targetMembership) {
      return Response.json({ error: "Người dùng không phải thành viên." }, { status: 404 });
    }
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE "groupSpaceMember" SET "role" = ? WHERE "groupId" = ? AND "userId" = ?',
      ).bind(role, groupId, target),
      env.DB.prepare(
        'UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?',
      ).bind(now, groupId),
    ]);
    await audit(env, me, "space.role", groupId, `${target} → ${role}`);
    return Response.json({ ok: true, role });
  }

  if (removeMatch && request.method === "DELETE") {
    const target = removeMatch[1];
    const space = await getSpace(env, groupId);
    if (!space || space.status === "deleted") {
      return Response.json({ error: "Không tìm thấy Group Space." }, { status: 404 });
    }
    const membership = await activeMembership(env, groupId, me);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return Response.json({ error: "Chỉ Owner/Admin được đá thành viên." }, { status: 403 });
    }
    if (target === space.ownerUserId) {
      return Response.json({ error: "Không thể đá Owner." }, { status: 400 });
    }
    if (target === me) {
      return Response.json({ error: "Dùng rời nhóm thay vì tự đá." }, { status: 400 });
    }
    const targetMembership = await activeMembership(env, groupId, target);
    if (!targetMembership) {
      return Response.json({ error: "Người dùng không phải thành viên." }, { status: 404 });
    }
    if (membership.role === "admin" && targetMembership.role !== "member") {
      return Response.json({ error: "Admin chỉ được đá member." }, { status: 403 });
    }
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE \"groupSpaceMember\" SET \"status\" = 'removed' WHERE \"groupId\" = ? AND \"userId\" = ?",
      ).bind(groupId, target),
      env.DB.prepare(
        'UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?',
      ).bind(now, groupId),
    ]);
    await audit(env, me, "space.remove", groupId, target);
    return Response.json({ ok: true });
  }

  if (rest === "messages" || rest.startsWith("messages/")) {
    const space = await getSpace(env, groupId);
    if (!space || (space.status !== "active" && space.status !== "suspended")) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    const membership = await activeMembership(env, groupId, me);
    if (!membership) {
      return Response.json({ error: "Not a member." }, { status: 403 });
    }
    const stub = stubFor(env, space.conversationId) as unknown as RoomStub;

    if (rest === "messages" && request.method === "GET") {
      const url = new URL(request.url);
      const afterSeq = Number(url.searchParams.get("after") ?? "0") || 0;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "80") || 80, 200);
      const history =
        afterSeq === 0
          ? (await stub.history(space.conversationId, 0, 2147483647, me)).slice(-limit)
          : await stub.history(space.conversationId, afterSeq, limit, me);

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
          mine: m.senderId === me,
        })),
      });
    }

    if (rest === "messages/read" && request.method === "PUT") {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      await env.DB.prepare(
        'UPDATE "groupSpaceMember" SET "lastReadAt" = ? WHERE "groupId" = ? AND "userId" = ?',
      )
        .bind(now, groupId, me)
        .run();
      return Response.json({ ok: true, lastReadAt: now });
    }

    const deleteMatch = rest.match(/^messages\/([0-9a-fA-F-]{36})$/);
    if (deleteMatch && request.method === "DELETE") {
      const scope = new URL(request.url).searchParams.get("scope");
      if (scope !== "me" && scope !== "everyone") {
        return Response.json(
          { error: "scope phải là me hoặc everyone." },
          { status: 400 },
        );
      }
      const result = await stub.deleteMessage(
        space.conversationId,
        deleteMatch[1],
        me,
        scope,
      );
      if (!result.ok) {
        return Response.json(
          { error: result.error ?? "Không xóa được tin nhắn." },
          { status: result.error?.includes("người gửi") ? 403 : 404 },
        );
      }
      return Response.json({ ok: true, messageId: deleteMatch[1], scope });
    }

    if (rest === "messages" && request.method === "POST") {
      if (space.status === "suspended") {
        return Response.json(
          { error: "Group Space đã bị tạm ngừng.", status: "suspended" },
          { status: 423 },
        );
      }
      if (space.allowMemberChat === 0 && membership.role === "member") {
        return Response.json(
          { error: "Chủ nhóm chỉ cho phép Admin và Owner nhắn tin trong không gian này." },
          { status: 403 },
        );
      }
      let body: unknown = null;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid data." }, { status: 400 });
      }
      const payload = (body ?? {}) as { body?: unknown; attachmentId?: unknown };
      const attachmentId =
        typeof payload.attachmentId === "string" && payload.attachmentId.length > 0
          ? payload.attachmentId
          : "";
      const text = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!text && !attachmentId) {
        return Response.json({ error: "Message required (1-4000 chars)." }, { status: 400 });
      }

      let attachment: {
        id: string;
        name: string;
        mimeType: string;
        kind: "image" | "file";
        size: number;
      } | null = null;

      if (attachmentId) {
        const fileRow = await env.DB.prepare(
          'SELECT "id","ownerId","name","mimeType","kind","size","status" FROM "file" WHERE "id" = ? LIMIT 1',
        )
          .bind(attachmentId)
          .first<{
            id: string;
            ownerId: string;
            name: string;
            mimeType: string;
            kind: string;
            size: number;
            status: string;
          }>();
        if (!fileRow || fileRow.status !== "active") {
          return Response.json({ error: "File not found." }, { status: 404 });
        }
        if (fileRow.ownerId !== me) {
          return Response.json({ error: "You can only attach your own files." }, { status: 403 });
        }
        await env.DB.prepare(
          'INSERT OR IGNORE INTO "fileShare" ("fileId","conversationId") VALUES (?, ?)',
        )
          .bind(attachmentId, space.conversationId)
          .run();
        attachment = {
          id: fileRow.id,
          name: fileRow.name,
          mimeType: fileRow.mimeType,
          kind: fileRow.kind === "image" ? "image" : "file",
          size: Number(fileRow.size ?? 0),
        };
      }

      const messageId = crypto.randomUUID();
      const sentAt = new Date().toISOString().replace("T", " ").slice(0, 19);
      const stub = stubFor(env, space.conversationId) as unknown as RoomStub;
      const result = await stub
        .append(
          space.conversationId,
          messageId,
          me,
          text,
          sentAt,
          String(session.user.name ?? ""),
          String(session.user.username ?? ""),
          attachment,
        )
        .catch((error: unknown) => {
          console.error("space append failed:", error);
          return null;
        });
      if (!result) {
        return Response.json({ error: "Can't send message." }, { status: 500 });
      }

      await env.DB.prepare(
        'UPDATE "groupSpace" SET "updatedAt" = ? WHERE "groupId" = ?',
      )
        .bind(new Date().toISOString().replace("T", " ").slice(0, 19), groupId)
        .run();

      return Response.json({
        message: {
          seq: result.seq,
          id: messageId,
          senderId: me,
          senderName: String(session.user.name ?? ""),
          senderUsername: String(session.user.username ?? ""),
          body: result.body,
          attachment: result.attachment,
          sentAt,
          mine: true,
        },
      });
    }
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
