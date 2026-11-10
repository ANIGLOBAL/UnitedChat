import { getSession } from "../lib/auth.server";
import { requireAdmin, audit } from "../lib/admin.server";
import { b2DeleteFileVersion } from "../lib/b2.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.admin";

const BANNED = "Suspended or banned users can't use the Admin panel.";

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session || !(await requireAdmin(env, session.user.id))) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  const me = String(session.user.id);

  if (request.method === "GET") {
    const url = new URL(request.url);

    // Dashboard counters (Section 16.3) — real queries only.
    if (url.searchParams.get("stats") !== null) {
      const [users, conversations, files, plans, groupSwitch, spaceSwitch] = await Promise.all([
        env.DB.prepare(
          "SELECT \"status\", COUNT(*) AS n FROM \"user\" GROUP BY \"status\"",
        ).all<{ status: string; n: number }>(),
        env.DB.prepare(
          'SELECT "kind", COUNT(*) AS n FROM "conversation" GROUP BY "kind"',
        ).all<{ kind: string; n: number }>(),
        env.DB.prepare(
          "SELECT COUNT(*) AS n, COALESCE(SUM(\"size\"), 0) AS bytes FROM \"file\" WHERE \"status\" = 'active'",
        ).first<{ n: number; bytes: number }>(),
        env.DB.prepare(
          'SELECT "role", COUNT(*) AS n FROM "user" GROUP BY "role"',
        ).all<{ role: string; n: number }>(),
        env.DB.prepare(
          'SELECT "value" FROM "setting" WHERE "key" = \'allow_group_creation\' LIMIT 1',
        ).first<{ value: string }>(),
        env.DB.prepare(
          'SELECT "value" FROM "setting" WHERE "key" = \'group_space_creation_enabled\' LIMIT 1',
        ).first<{ value: string }>(),
      ]);
      return Response.json({
        stats: {
          users: Object.fromEntries(users.results.map((r) => [r.status, r.n])),
          conversations: Object.fromEntries(
            conversations.results.map((r) => [r.kind, r.n]),
          ),
          files: { count: Number(files?.n ?? 0), bytes: Number(files?.bytes ?? 0) },
          roles: Object.fromEntries(plans.results.map((r) => [r.role, r.n])),
          allowGroupCreation: groupSwitch ? groupSwitch.value === "1" : true,
          allowSpaceCreation: spaceSwitch ? spaceSwitch.value === "1" : true,
        },
      });
    }

    // Recent files for moderation (owner-visible management in control panel).
    if (url.searchParams.get("files") !== null) {
      const rows = await env.DB.prepare(
        `SELECT f."id", f."name", f."mimeType", f."kind", f."size", f."createdAt",
                f."ownerId", u."username" AS ownerUsername
           FROM "file" AS f LEFT JOIN "user" AS u ON u."id" = f."ownerId"
          WHERE f."status" = 'active'
          ORDER BY f."createdAt" DESC LIMIT 25`,
      )
        .all<Record<string, unknown>>();
      return Response.json({ files: rows.results });
    }

    // Group Spaces overview (PROJECT_SPEC_2.md §12.1/§12.2).
    if (url.searchParams.get("spaces_stats") !== null) {
      const [byStatus, members, pending] = await Promise.all([
        env.DB.prepare(
          'SELECT "status", COUNT(*) AS n FROM "groupSpace" GROUP BY "status"',
        ).all<{ status: string; n: number }>(),
        env.DB.prepare(
          "SELECT COUNT(*) AS n FROM \"groupSpaceMember\" WHERE \"status\" = 'active'",
        ).first<{ n: number }>(),
        env.DB.prepare(
          "SELECT COUNT(*) AS n FROM \"groupSpaceJoinRequest\" WHERE \"status\" = 'pending'",
        ).first<{ n: number }>(),
      ]);
      return Response.json({
        spaces: {
          total: byStatus.results.reduce((a, r) => a + r.n, 0),
          byStatus: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
          members: Number(members?.n ?? 0),
          pendingRequests: Number(pending?.n ?? 0),
        },
      });
    }

    if (url.searchParams.get("spaces") !== null) {
      const like = `%${(url.searchParams.get("q") ?? "").trim()}%`;
      const rows = await env.DB.prepare(
        `SELECT g."groupId", g."displayName", g."status", g."createdAt", g."ownerUserId",
                u."username" AS ownerUsername,
                (SELECT COUNT(*) FROM "groupSpaceMember" AS m WHERE m."groupId" = g."groupId" AND m."status" = 'active') AS memberCount
           FROM "groupSpace" AS g LEFT JOIN "user" AS u ON u."id" = g."ownerUserId"
          WHERE g."status" IN ('active','suspended')
            AND (g."displayName" LIKE ? OR g."groupId" LIKE ? OR u."username" LIKE ?)
          ORDER BY g."updatedAt" DESC LIMIT 25`,
      )
        .bind(like, like, like)
        .all<Record<string, unknown>>();
      return Response.json({ groupSpaces: rows.results });
    }

    // Audit log feed (Section 16.9).
    if (url.searchParams.get("audit") !== null) {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
      const rows = await env.DB.prepare(
        'SELECT a."id", a."action", a."targetId", a."reason", a."createdAt", u."username" AS actor FROM "auditLog" AS a LEFT JOIN "user" AS u ON u."id" = a."actorId" ORDER BY a."createdAt" DESC LIMIT ?',
      )
        .bind(limit)
        .all<Record<string, unknown>>();
      return Response.json({ audit: rows.results });
    }

    // Account search (Section 16.4).
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length >= 1) {
      const like = `%${q}%`;
      const rows = await env.DB.prepare(
        `SELECT "id", "username", "name", "email" IS NULL AS noEmail, "email", "role", "status", "createdAt", "plan"
           FROM "user"
          WHERE "username" LIKE ? OR "name" LIKE ? OR "email" LIKE ?
          ORDER BY "createdAt" DESC LIMIT 25`,
      )
        .bind(like, like, like)
        .all<Record<string, unknown>>();
      return Response.json({ users: rows.results });
    }
    return Response.json({ users: [] });
  }

  if (request.method === "POST") {
    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const body = (payload ?? {}) as {
      userId?: unknown;
      action?: unknown;
      reason?: unknown;
      enabled?: unknown;
      groupId?: unknown;
    };
    const action2 = typeof body.action === "string" ? body.action : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 200)
        : null;

    // System-wide switch: Allow Group Creation (Section 16.8).
    if (action2 === "toggle_group_creation") {
      const enabled = body.enabled === true || body.enabled === "true" || body.enabled === "1";
      await env.DB.prepare(
        "INSERT INTO \"setting\" (\"key\",\"value\",\"updatedAt\") VALUES ('allow_group_creation', ?, ?) ON CONFLICT(\"key\") DO UPDATE SET \"value\" = excluded.\"value\", \"updatedAt\" = excluded.\"updatedAt\"",
      )
        .bind(enabled ? "1" : "0", new Date().toISOString().replace("T", " ").slice(0, 19))
        .run();
      await audit(
        env,
        me,
        "setting.allow_group_creation",
        null,
        enabled ? "enabled group creation" : "disabled group creation",
      );
      return Response.json({ ok: true, allowGroupCreation: enabled });
    }

    // ChatSpace global switch (PROJECT_SPEC_2.md §5.2/§12.3).
    if (action2 === "toggle_space_creation") {
      const enabled = body.enabled === true || body.enabled === "true" || body.enabled === "1";
      await env.DB.prepare(
        "INSERT INTO \"setting\" (\"key\",\"value\",\"updatedAt\") VALUES ('group_space_creation_enabled', ?, ?) ON CONFLICT(\"key\") DO UPDATE SET \"value\" = excluded.\"value\", \"updatedAt\" = excluded.\"updatedAt\"",
      )
        .bind(enabled ? "1" : "0", new Date().toISOString().replace("T", " ").slice(0, 19))
        .run();
      await audit(
        env,
        me,
        "setting.group_space_creation_enabled",
        null,
        enabled ? "enabled space creation" : "disabled space creation",
      );
      return Response.json({ ok: true, spaceCreation: enabled });
    }

    if (action2 === "set_plan") {
      const targetId = typeof body.userId === "string" ? body.userId.trim() : "";
      const planRaw = typeof (body as { plan?: unknown }).plan === "string" ? String((body as { plan: string }).plan) : "";
      const allowed = new Set(["free", "basic", "premium"]);
      if (!targetId || !allowed.has(planRaw)) {
        return Response.json({ error: "userId + plan (free|basic|premium) required." }, { status: 400 });
      }
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      await env.DB.prepare('UPDATE "user" SET "plan" = ?, "updatedAt" = ? WHERE "id" = ?')
        .bind(planRaw, now, targetId)
        .run();
      await audit(env, me, "admin.set_plan", targetId, planRaw);
      return Response.json({ ok: true, plan: planRaw });
    }

    // ChatSpace moderation: suspend/unsuspend/delete a Group Space (§12.2).
    // Suspended preserves the owner slot; delete frees it (id not reusable).
    if (action2 === "space_suspend" || action2 === "space_unsuspend" || action2 === "space_delete") {      const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
      if (!groupId) {
        return Response.json({ error: "groupId required." }, { status: 400 });
      }
      const space = await env.DB.prepare(
        'SELECT "groupId", "displayName", "conversationId", "status" FROM "groupSpace" WHERE "groupId" = ? LIMIT 1',
      )
        .bind(groupId)
        .first<{ groupId: string; displayName: string; conversationId: string; status: string }>();
      if (!space || space.status === "deleted") {
        return Response.json({ error: "Not found." }, { status: 404 });
      }
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const next =
        action2 === "space_suspend" ? "suspended" : action2 === "space_unsuspend" ? "active" : "deleted";
      if (space.status === next) {
        return Response.json({ ok: true, status: next });
      }
      const statements: D1PreparedStatement[] = [
        env.DB.prepare(
          'UPDATE "groupSpace" SET "status" = ?, "updatedAt" = ? WHERE "groupId" = ?',
        ).bind(next, now, groupId),
      ];
      if (action2 === "space_delete") {
        statements.push(
          env.DB.prepare(
            'UPDATE "groupSpaceMember" SET "status" = ? WHERE "groupId" = ?',
          ).bind("left", groupId),
        );
      }
      await env.DB.batch(statements);
      await audit(env, me, `space.admin.${next}`, groupId, reason ?? space.displayName);
      return Response.json({ ok: true, status: next });
    }

    const userId = typeof body.userId === "string" ? body.userId : "";
    if (userId === me) {
      return Response.json({ error: BANNED }, { status: 400 });
    }

    // Remove a file as admin (any owner).
    if (action2 === "delete_file") {
      const fileId = userId; // reuse field
      const row = await env.DB.prepare(
        'SELECT "id", "objectKey", "b2FileId" FROM "file" WHERE "id" = ? LIMIT 1',
      )
        .bind(fileId)
        .first<{ id: string; objectKey: string; b2FileId: string | null }>();
      if (!row) return Response.json({ error: "Not found." }, { status: 404 });
      if (row.b2FileId) {
        try {
          await b2DeleteFileVersion(env, row.b2FileId, row.objectKey);
        } catch {
          // swallow: row deletion still proceeds
        }
      }
      await env.DB.prepare("DELETE FROM \"file\" WHERE \"id\" = ?")
        .bind(fileId)
        .run();
      await audit(env, me, "file.delete", fileId, reason ?? "admin removed file");
      return Response.json({ ok: true });
    }

    // Admin can delete any other account outright (PROJECT_SPEC.md §15/§16).
    if (action2 === "delete_account") {
      const target = await env.DB.prepare(
        'SELECT "role", "status" FROM "user" WHERE "id" = ? LIMIT 1',
      )
        .bind(userId)
        .first<{ role: string; status: string }>();
      if (!target) {
        return Response.json({ error: "Not found." }, { status: 404 });
      }
      if (target.role === "admin") {
        const admins = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM \"user\" WHERE role = 'admin' AND status = 'active'",
        )
          .first<{ n: number }>();
        if (Number(admins?.n ?? 0) <= 1) {
          return Response.json(
            { error: "Phải giữ ít nhất một quản trị viên." },
            { status: 400 },
          );
        }
      }
      await env.DB.prepare('DELETE FROM "user" WHERE "id" = ?')
        .bind(userId)
        .run();
      await audit(env, me, "account.delete", userId, reason ?? "admin removed account");
      return Response.json({ ok: true, deleted: true });
    }

    const statusByAction: Record<string, string> = {
      ban: "banned",
      activate: "active",
      deactivate: "suspended",
    };
    const next = statusByAction[action2];
    if (!next) {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    if (next === "banned") {
      // Clear live sessions on ban so restricted accounts drop immediately.
      await env.DB.prepare('DELETE FROM "session" WHERE "userId" = ?')
        .bind(userId)
        .run();
    }
    const result = await env.DB.prepare(
      'UPDATE "user" SET "status" = ?, "updatedAt" = ? WHERE "id" = ?',
    )
      .bind(next, new Date().toISOString().replace("T", " ").slice(0, 19), userId)
      .run();
    if (!result.success) {
      return Response.json({ error: "Update failed." }, { status: 500 });
    }
    await audit(env, me, `account.${action2}`, userId, reason);
    return Response.json({ ok: true, status: next });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
