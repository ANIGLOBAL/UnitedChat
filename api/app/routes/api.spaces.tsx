import { sealConversationKey } from "../lib/conv-key.server";
import { getSession } from "../lib/auth.server";
import { requireAdmin, audit } from "../lib/admin.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.spaces";

// Cached helpers live in lib/space.server.ts; route modules may not export
// non-standard members (they leak into the client bundle otherwise).

async function settingsFor(
  env: AppEnv,
  key: string,
  fallback: string,
): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT "value" FROM "setting" WHERE "key" = ? LIMIT 1',
  )
    .bind(key)
    .first<{ value: string }>();
  return row ? row.value : fallback;
}

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const me = String(session.user.id);

  if (request.method === "GET") {
    const memberships = await env.DB.prepare(
      `SELECT g."groupId", g."displayName", g."description", g."status",
              g."requireOwnerApproval", g."avatarFileId", g."coverFileId",
              g."createdAt", g."updatedAt",
              m."role", m."lastReadAt", m."joinedAt"
         FROM "groupSpaceMember" AS m
         JOIN "groupSpace" AS g ON g."groupId" = m."groupId"
        WHERE m."userId" = ? AND m."status" = 'active'
        ORDER BY g."updatedAt" DESC`,
    )
      .bind(me)
      .all<Record<string, unknown>>();

    const spaces = memberships.results.map((row) => ({
      groupId: row.groupId,
      displayName: row.displayName,
      description: row.description ?? null,
      status: row.status,
      requireOwnerApproval: Boolean(row.requireOwnerApproval),
      avatarFileId: row.avatarFileId ? String(row.avatarFileId) : null,
      coverFileId: row.coverFileId ? String(row.coverFileId) : null,
      role: row.role,
      lastReadAt: row.lastReadAt ?? null,
      joinedAt: row.joinedAt,
    }));

    const ownedCount = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM \"groupSpace\" WHERE \"ownerUserId\" = ? AND \"status\" IN ('active','suspended')",
    )
      .bind(me)
      .first<{ n: number }>();

    return Response.json({
      spaces,
      ownsGroupSpace: Number(ownedCount?.n ?? 0),
    });
  }

  if (request.method === "POST") {
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
    };

    const displayName =
      typeof decoded.displayName === "string" ? decoded.displayName.trim() : "";
    if (displayName.length < 1 || displayName.length > 80) {
      return Response.json(
        { error: "Tên nhóm hiển thị cần 1–80 ký tự." },
        { status: 400 },
      );
    }
    const description =
      typeof decoded.description === "string" && decoded.description.trim()
        ? decoded.description.trim().slice(0, 500)
        : null;
    const requireOwnerApproval =
      decoded.requireOwnerApproval === false ? 0 : 1;

    // Global creation switch — checked server-side (PROJECT_SPEC_2.md §5.2).
    const creationEnabled =
      (await settingsFor(env, "group_space_creation_enabled", "1")) === "1";
    const isAdmin = await requireAdmin(env, me);
    if (!creationEnabled && !isAdmin) {
      return Response.json(
        { error: "Tạo Group Space đang bị tắt bởi quản trị viên." },
        { status: 403 },
      );
    }

    // Owned-space limit by plan (admin = unlimited; basic = 2; premium = 3;
    // free = 1). Active or suspended spaces occupy slots; deleted frees them.
    const owned = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM \"groupSpace\" WHERE \"ownerUserId\" = ? AND \"status\" IN ('active','suspended')",
    )
      .bind(me)
      .first<{ n: number }>();
    const myPlan = await env.DB.prepare('SELECT "plan", "role" FROM "user" WHERE "id" = ?')
      .bind(me)
      .first<{ plan: string; role: string }>();
    const plan = String(myPlan?.plan ?? "free");
    const isSysAdmin = String(myPlan?.role ?? "") === "admin";
    const planLimit = isSysAdmin ? 999 : plan === "premium" ? 3 : plan === "basic" ? 2 : 1;
    if (Number(owned?.n ?? 0) >= planLimit) {
      return Response.json(
        {
          error:
            `Bạn đã đạt giới hạn ${planLimit} không gian của gói ${plan === "basic" ? "Basic (tức thời)" : plan === "premium" ? "Premium" : "Free"} — nâng cấp để tạo thêm.`,
        },
        { status: 409 },
      );
    }

    const groupId = `cs-${crypto.randomUUID().replace(/-/g, "")}`;
    const conversationId = `spc:${crypto.randomUUID()}`;
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const keyEnvelope = await sealConversationKey(
      env.CONVERSATION_KEY_ENCRYPTION_KEY,
    );

    const results = await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO "conversation" ("id","kind","title","keyEnvelope","createdByUserId","createdAt","updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(conversationId, "space", displayName, keyEnvelope, me, now, now),
      env.DB.prepare(
        'INSERT INTO "groupSpace" ("groupId","conversationId","ownerUserId","displayName","description","status","requireOwnerApproval","createdAt","updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        groupId,
        conversationId,
        me,
        displayName,
        description,
        "active",
        requireOwnerApproval,
        now,
        now,
      ),
      env.DB.prepare(
        'INSERT INTO "groupSpaceMember" ("groupId","userId","role","status","lastReadAt","joinedAt") VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(groupId, me, "owner", "active", now, now),
    ]);
    if (results.some((r) => !r.success)) {
      return Response.json({ error: "Không tạo được Group Space." }, { status: 500 });
    }

    await audit(env, me, "space.create", groupId, displayName);
    return Response.json({
      groupSpace: {
        groupId,
        conversationId,
        displayName,
        description,
        requireOwnerApproval: requireOwnerApproval === 1,
        status: "active",
        ownerUserId: me,
      },
    });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
