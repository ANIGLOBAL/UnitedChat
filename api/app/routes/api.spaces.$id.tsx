import { getSession } from "../lib/auth.server";
import { audit } from "../lib/admin.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.spaces.$id";

async function handle({ request, params, context }: Route.LoaderArgs | Route.ActionArgs) {
  const {
    getSpace,
    membership: spaceMembership,
    memberShape,
    publicShape,
  } = await import("../lib/space.server");
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const me = String(session.user.id);

  const groupId = String(params.id ?? "");
  if (!groupId) return Response.json({ error: "Not found." }, { status: 404 });

  const space = await getSpace(env, groupId);
  if (!space || space.status === "deleted") {
    return Response.json({ exists: false, membership: "none" }, { status: 404 });
  }

  const membership = await spaceMembership(env, groupId, me);
  const myMembership = membership;

  if (request.method === "GET") {
    if (!membership) {
      const pending = await env.DB.prepare(
        "SELECT 1 AS ok FROM \"groupSpaceJoinRequest\" WHERE \"groupId\" = ? AND \"applicantUserId\" = ? AND \"status\" = 'pending' LIMIT 1",
      )
        .bind(groupId, me)
        .first<{ ok: number }>();
      return Response.json(
        publicShape(space, pending ? "pending" : "none"),
      );
    }
    return Response.json(memberShape(space, membership));
  }

  const isOwner = space.ownerUserId === me;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  if (request.method === "PATCH") {
    if (!isOwner) {
      return Response.json({ error: "Chỉ Owner được phép sửa nhóm." }, { status: 403 });
    }
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const decoded = (body ?? {}) as {
      displayName?: unknown;
      description?: unknown;
      requireOwnerApproval?: unknown;
      allowMemberChat?: unknown;
      theme?: unknown;
      avatarFileId?: unknown;
      coverFileId?: unknown;
    };
    const updates: string[] = [];
    const binds: (string | null)[] = [];
    if (typeof decoded.displayName === "string") {
      const value = decoded.displayName.trim();
      if (value.length < 1 || value.length > 80) {
        return Response.json(
          { error: "Tên nhóm hiển thị cần 1–80 ký tự." },
          { status: 400 },
        );
      }
      updates.push('"displayName" = ?');
      binds.push(value);
    }
    if (typeof decoded.description === "string") {
      const value = decoded.description.trim();
      if (value.length > 500) {
        return Response.json(
          { error: "Mô tả tối đa 500 ký tự." },
          { status: 400 },
        );
      }
      updates.push('"description" = ?');
      binds.push(value === "" ? null : value);
    }
    if (typeof decoded.requireOwnerApproval === "boolean") {
      updates.push('"requireOwnerApproval" = ?');
      binds.push(decoded.requireOwnerApproval ? "1" : "0");
    }
    if (typeof decoded.theme === "string") {
      const value = decoded.theme.trim().slice(0, 40);
      updates.push('"theme" = ?');
      binds.push(value || "default");
    }
    if (decoded.allowMemberChat !== undefined) {
      updates.push('"allowMemberChat" = ?');
      binds.push(decoded.allowMemberChat === false ? "0" : "1");
    }
    async function assertOwnImage(fileId: unknown) {
      const id = typeof fileId === "string" ? fileId.trim() : "";
      const row = await env.DB.prepare(
        'SELECT "id","ownerId","mimeType","kind","status" FROM "file" WHERE "id" = ? LIMIT 1',
      )
        .bind(id)
        .first<{ id: string; ownerId: string; mimeType: string; kind: string; status: string }>();
      if (!row || row.ownerId !== me || row.status !== "active") {
        return null;
      }
      if (!row.mimeType.startsWith("image/") && row.kind !== "image") {
        return null;
      }
      return row;
    }
    if (decoded.avatarFileId !== undefined) {
      const row = await assertOwnImage(decoded.avatarFileId);
      if (!row) {
        return Response.json({ error: "Avatar không hợp lệ (ảnh của bạn, đang hoạt động)." }, { status: 400 });
      }
      if (row.mimeType === "image/gif") {
        const ownerPlan = await env.DB.prepare('SELECT "plan", "role" FROM "user" WHERE "id" = ?')
          .bind(me)
          .first<{ plan: string; role: string }>();
        const paid = ownerPlan?.role === "admin" || ownerPlan?.plan === "basic" || ownerPlan?.plan === "premium";
        if (!paid) return Response.json({ error: "Chỉ gói trả phí mới dùng GIF làm avatar nhóm." }, { status: 400 });
      }
      updates.push('"avatarFileId" = ?');
      binds.push(row.id);
    }
    if (decoded.coverFileId !== undefined) {
      const row = await assertOwnImage(decoded.coverFileId);
      if (!row) {
        return Response.json({ error: "Ảnh bìa không hợp lệ (ảnh tĩnh của bạn, đang hoạt động)." }, { status: 400 });
      }
      if (row.mimeType === "image/gif") {
        return Response.json({ error: "Ảnh bìa không nhận GIF — dùng PNG/JPG/WebP." }, { status: 400 });
      }
      updates.push('"coverFileId" = ?');
      binds.push(row.id);
    }
    if (updates.length === 0) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }
    updates.push('"updatedAt" = ?');
    binds.push(now);
    await env.DB.prepare(
      `UPDATE "groupSpace" SET ${updates.join(", ")} WHERE "groupId" = ?`,
    )
      .bind(...binds, groupId)
      .run();
    await audit(env, me, "space.update", groupId, "owner settings update");
    const fresh = await getSpace(env, groupId);
    const freshMembership = await spaceMembership(env, groupId, me);
    return Response.json(
      fresh && freshMembership ? memberShape(fresh, freshMembership) : { ok: true },
    );
  }

  if (request.method === "DELETE") {
    // Owner deletes the Group Space (PROJECT_SPEC_2.md §5.3): slot released,
    // Group ID stays retired and is never reassigned.
    if (!isOwner) {
      return Response.json({ error: "Chỉ Owner được xoá nhóm." }, { status: 403 });
    }
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE "groupSpace" SET "status" = ? , "updatedAt" = ? WHERE "groupId" = ?',
      ).bind("deleted", now, groupId),
      env.DB.prepare(
        'UPDATE "groupSpaceMember" SET "status" = ? WHERE "groupId" = ?',
      ).bind("left", groupId),
    ]);
    await audit(env, me, "space.delete", groupId, space.displayName);
    return Response.json({ ok: true, deleted: true });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
