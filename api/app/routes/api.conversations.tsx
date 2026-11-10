import { sealConversationKey } from "../lib/conv-key.server";
import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.conversations";

/**
 * Deterministic DM id: two users always share one conversation row.
 */
async function dmId(userA: string, userB: string): Promise<string> {
  const ordered = [userA, userB].sort().join("|");
  const digestBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ordered),
  );
  const digest = [
    ...new Uint8Array(digestBytes),
  ].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `dm:${digest}`;
}

async function isParticipant(
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

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const me = String(session.user.id);

  if (request.method === "GET") {
    // Two-step inbox assembly: my membership rows first, then every
    // conversation's participants (DM or group) in one join query.
    const mine = await env.DB.prepare(
      `SELECT p."conversationId", c."kind", c."title", c."createdAt" AS startedAt, c."updatedAt", p."lastReadAt"
         FROM "conversationParticipant" AS p
         JOIN "conversation" AS c ON c."id" = p."conversationId"
        WHERE p."userId" = ?
        ORDER BY c."updatedAt" DESC`,
    )
      .bind(me)
      .all<Record<string, unknown>>();

    if (mine.results.length === 0) {
      return Response.json({ conversations: [] });
    }

    const ids = mine.results.map((r) => String(r.conversationId));
    const placeholders = ids.map(() => "?").join(",");
    const members = await env.DB.prepare(
      `SELECT p."conversationId", u."id" AS userId, u."username", u."name", u."image"
         FROM "conversationParticipant" AS p
         JOIN "user" AS u ON u."id" = p."userId"
        WHERE p."conversationId" IN (${placeholders})`,
    )
      .bind(...ids)
      .all<Record<string, unknown>>();

    const membersByConversation: Record<string, unknown[]> = {};
    for (const m of members.results) {
      const key = String(m.conversationId);
      (membersByConversation[key] ??= []).push({
        id: String(m.userId),
        username: String(m.username),
        name: String(m.name ?? ""),
        image: (m.image as string | null) ?? null,
      });
    }

    const conversations: unknown[] = [];
    for (const row of mine.results) {
      const conversationId = String(row.conversationId);
      const stub = env.CONVERSATION_ROOM.get(
        env.CONVERSATION_ROOM.idFromName(conversationId),
      );
      const lastMessage = await stub
        .latest(conversationId)
        .catch(() => null);
      conversations.push({
        id: conversationId,
        kind: row.kind,
        title: row.title ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        participants: membersByConversation[conversationId] ?? [],
        unread: Boolean(
          lastMessage && row.lastReadAt && lastMessage.sentAt > String(row.lastReadAt),
        ),
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              sentAt: lastMessage.sentAt,
              senderId: lastMessage.senderId,
            }
          : null,
      });
    }

    return Response.json({ conversations });
  }

  if (request.method === "POST") {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const decoded = (body ?? {}) as {
      username?: unknown;
      usernames?: unknown;
      userId?: unknown;
      userIds?: unknown;
      title?: unknown;
      kind?: unknown;
    };

    const collect = (value: unknown): string[] => {
      if (typeof value === "string") return [value.trim().toLowerCase()];
      if (Array.isArray(value)) {
        return value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().toLowerCase())
          .filter((v) => v.length > 0);
      }
      return [];
    };

    const collectIds = (value: unknown): string[] => {
      if (typeof value === "string") return [value.trim()];
      if (Array.isArray(value)) {
        return value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }
      return [];
    };

    const myUsername = String(session.user.username ?? "").toLowerCase();
    const requestedUsernames = [...collect(decoded.username), ...collect(decoded.usernames)]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .filter((username) => username !== myUsername);
    const requestedIds = [...collectIds(decoded.userId), ...collectIds(decoded.userIds)]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .filter((id) => id !== me);

    if (requestedUsernames.length === 0 && requestedIds.length === 0) {
      return Response.json(
        { error: "Cần ít nhất một người dùng khác (username hoặc userId)." },
        { status: 400 },
      );
    }

    type Person = { id: string; username: string; name: string; image: string | null };
    const foundPeople: Person[] = [];

    if (requestedUsernames.length > 0) {
      const placeholders2 = requestedUsernames.map(() => "?").join(",");
      const found = await env.DB.prepare(
        `SELECT "id", "username", "name", "image" FROM "user" WHERE "username" IN (${placeholders2}) COLLATE NOCASE AND status = 'active'`,
      )
        .bind(...requestedUsernames)
        .all<Person>();
      if (found.results.length !== requestedUsernames.length) {
        return Response.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
      }
      foundPeople.push(...found.results);
    }

    if (requestedIds.length > 0) {
      const placeholders3 = requestedIds.map(() => "?").join(",");
      const found = await env.DB.prepare(
        `SELECT "id", "username", "name", "image" FROM "user" WHERE "id" IN (${placeholders3}) AND status = 'active'`,
      )
        .bind(...requestedIds)
        .all<Person>();
      if (found.results.length !== requestedIds.length) {
        return Response.json({ error: "Không tìm thấy người dùng." }, { status: 404 });
      }
      foundPeople.push(...found.results);
    }

    const others = foundPeople.filter(
      (person, index, arr) => arr.findIndex((p) => p.id === person.id) === index,
    );
    if (others.length === 0) {
      return Response.json(
        { error: "Cần ít nhất một người dùng khác." },
        { status: 400 },
      );
    }

    const isGroup = decoded.kind === "group" || others.length > 1;
    if (isGroup) {
      // System-wide switch (PROJECT_SPEC.md Section 16.8): admins may disable
      // group creation for everyone (admins keep their own override).
      const settingRow = await env.DB.prepare(
        'SELECT "value" FROM "setting" WHERE "key" = \'allow_group_creation\' LIMIT 1',
      ).first<{ value: string }>();
      const groupAdmin =
        session.user.role === "admin";
      const allowed = settingRow ? settingRow.value === "1" : true;
      if (!allowed && !groupAdmin) {
        return Response.json(
          { error: "Tạo nhóm hiện bị tắt bởi quản trị viên." },
          { status: 403 },
        );
      }
    }
    const title =
      isGroup && typeof decoded.title === "string" && decoded.title.trim()
        ? decoded.title.trim().slice(0, 80)
        : null;

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const conversationId = isGroup
      ? `grp:${crypto.randomUUID()}`
      : await dmId(me, others[0].id);

    const existing = await env.DB.prepare(
      'SELECT "keyEnvelope" FROM "conversation" WHERE "id" = ? LIMIT 1',
    )
      .bind(conversationId)
      .first<{ keyEnvelope: string }>();

    if (!existing) {
      const keyEnvelope = await sealConversationKey(
        env.CONVERSATION_KEY_ENCRYPTION_KEY,
      );
      const statements: D1PreparedStatement[] = [
        env.DB.prepare(
          'INSERT INTO "conversation" ("id","kind","title","keyEnvelope","createdByUserId","createdAt","updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).bind(conversationId, isGroup ? "group" : "dm", title, keyEnvelope, me, now, now),
      ];
      const participantUserIds = [me, ...others.map((r) => r.id)];
      for (const userId of [...new Set(participantUserIds)]) {
        statements.push(
          env.DB.prepare(
            'INSERT OR IGNORE INTO "conversationParticipant" ("conversationId","userId","lastReadAt","joinedAt") VALUES (?, ?, ?, ?)',
          ).bind(conversationId, userId, userId === me ? now : null, now),
        );
      }
      const results = await env.DB.batch(statements);
      if (results.some((r) => !r.success)) {
        return Response.json({ error: "Can't open conversation." }, { status: 500 });
      }
    } else if (!(await isParticipant(env, conversationId, me))) {
      return Response.json({ error: "Can't open conversation." }, { status: 409 });
    }

    return Response.json({
      conversation: {
        id: conversationId,
        kind: isGroup ? "group" : "dm",
        title,
        participants: [
          {
            id: me,
            username: session.user.username,
            name: session.user.name,
            image: (session.user as { image?: string | null }).image ?? null,
          },
          ...others.map((r) => ({ id: r.id, username: r.username, name: r.name, image: r.image })),
        ],
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
