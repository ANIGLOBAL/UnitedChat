import { authErrorMessage, createAuth, getSession } from "../lib/auth.server";
import { createMediaToken } from "../lib/media-token.server";
import { verifyPassword } from "better-auth/crypto";
import { b2DeleteFileVersion } from "../lib/b2.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.me";

type PublicUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  bio: string | null;
  role: string;
  status: string;
  image: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  plan: string;
  bannerFileId: string | null;
};

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: String(user.id),
    name: String(user.name ?? ""),
    email: String(user.email ?? ""),
    username: String(user.username ?? ""),
    bio: user.bio ? String(user.bio) : null,
    role: String(user.role ?? "user"),
    status: String(user.status ?? "active"),
    image: user.image ? String(user.image) : null,
    bannerFileId: (user as { bannerFileId?: unknown }).bannerFileId
      ? String((user as { bannerFileId: unknown }).bannerFileId)
      : null,
    plan: String((user as { plan?: unknown }).plan ?? "free"),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    createdAt: String(user.createdAt ?? ""),
  } satisfies PublicUser;
}

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);

  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  if (request.method === "PATCH") {
    let body: {
      name?: unknown;
      bio?: unknown;
      avatarFileId?: unknown;
      bannerFileId?: unknown;
    } | null = null;
    try {
      body = (await request.json()) as {
        name?: unknown;
        bio?: unknown;
        avatarFileId?: unknown;
        bannerFileId?: unknown;
      };
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    if (!body) {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const rawBio = typeof body?.bio === "string" ? body.bio.trim() : null;
    const wantsBio = body?.bio !== undefined;
    const wantsName = body?.name !== undefined;
    const wantsAvatar = body?.avatarFileId !== undefined;
    const wantsBanner = body?.bannerFileId !== undefined;
    if (!wantsBio && !wantsName && !wantsAvatar && !wantsBanner) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }
    if (wantsName) {
      if (!name || name.length > 80) {
        return Response.json(
          { error: "Display name must be 1-80 characters long." },
          { status: 400 },
        );
      }
    }
    if (wantsBio && rawBio && rawBio.length > 280) {
      return Response.json(
        { error: "Bio must be up to 280 characters long." },
        { status: 400 },
      );
    }
    const bio = rawBio === "" ? null : rawBio;

    const meId = String(session.user.id);
    const meRole = String(session.user.role ?? "user");
    const mePlan = String(session.user.plan ?? "free");
    const isPaid = meRole === "admin" || mePlan === "basic" || mePlan === "premium";

    async function validateImageFile(
      fileId: unknown,
      allowGif: boolean,
      kind: "avatar" | "banner",
    ) {
      const id = typeof fileId === "string" ? fileId.trim() : "";
      const row = await env.DB.prepare(
        'SELECT "id","ownerId","mimeType","kind","status","size" FROM "file" WHERE "id" = ? LIMIT 1',
      )
        .bind(id)
        .first<{ id: string; ownerId: string; mimeType: string; kind: string; status: string; size: number }>();
      if (!row || row.ownerId !== meId || row.status !== "active") {
        return { fail: `Ảnh ${kind === "avatar" ? "đại diện" : "banner"} không hợp lệ.` };
      }
      const mime = row.mimeType;
      if (!mime.startsWith("image/") && row.kind !== "image") {
        return { fail: `Ảnh ${kind === "avatar" ? "đại diện" : "banner"} phải là ảnh.` };
      }
      if (mime === "image/gif" && !allowGif) {
        return {
          fail:
            kind === "avatar"
              ? "Chỉ gói trả phí mới dùng GIF làm ảnh đại diện."
              : "Banner không nhận GIF — dùng PNG/JPG/WebP.",
        };
      }
      return { ok: row };
    }

    async function wipeOldFile(oldId: string | null) {
      if (!oldId) return;
      try {
        const old = await env.DB.prepare(
          'SELECT "objectKey","b2FileId" FROM "file" WHERE "id" = ?',
        )
          .bind(oldId)
          .first<{ objectKey: string; b2FileId: string | null }>();
        if (old?.b2FileId) {
          try {
            await b2DeleteFileVersion(env, old.b2FileId, old.objectKey);
          } catch {
            // orphan B2 fine
          }
        }
        await env.DB.prepare('DELETE FROM "file" WHERE "id" = ?')
          .bind(oldId)
          .run();
      } catch {
        // ignore
      }
    }

    if (wantsAvatar) {
      const avatar = await validateImageFile(body.avatarFileId, isPaid, "avatar");
      if ("fail" in avatar && avatar.fail) {
        return Response.json({ error: avatar.fail }, { status: 400 });
      }
      const oldRow = await env.DB.prepare('SELECT "image" FROM "user" WHERE "id" = ?')
        .bind(meId)
        .first<{ image: string | null }>();
      await env.DB.prepare('UPDATE "user" SET "image" = ?, "updatedAt" = ? WHERE "id" = ?')
        .bind((avatar as { ok: { id: string } }).ok.id, now(), meId)
        .run();
      await wipeOldFile(oldRow?.image ?? null);
    }
    if (wantsBanner) {
      const banner = await validateImageFile(body.bannerFileId, false, "banner");
      if ("fail" in banner && banner.fail) {
        return Response.json({ error: banner.fail }, { status: 400 });
      }
      const oldRow = await env.DB.prepare('SELECT "bannerFileId" FROM "user" WHERE "id" = ?')
        .bind(meId)
        .first<{ bannerFileId: string | null }>();
      await env.DB.prepare('UPDATE "user" SET "bannerFileId" = ?, "updatedAt" = ? WHERE "id" = ?')
        .bind((banner as { ok: { id: string } }).ok.id, now(), meId)
        .run();
      await wipeOldFile(oldRow?.bannerFileId ?? null);
    }

    if (wantsName || wantsBio) {
      try {
        await createAuth(env).api.updateUser({
          body: { name: wantsName ? name : session.user.name, bio: wantsBio ? bio : session.user.bio },
          headers: request.headers,
        });
      } catch (error) {
        console.error("PATCH /api/me updateUser failed:", authErrorMessage(error));
        return Response.json({ error: "Can't save changes." }, { status: 500 });
      }
    }

    try {
      const row = await env.DB.prepare(
        'SELECT id, name, email, username, bio, role, status, image, bannerFileId, plan, twoFactorEnabled, createdAt, updatedAt FROM "user" WHERE id = ? LIMIT 1',
      )
        .bind(session.user.id)
        .first<Record<string, unknown>>();
      if (!row) {
        return Response.json({ error: "Can't save changes." }, { status: 500 });
      }
      return Response.json({ user: publicUser(row) });
    } catch (error) {
      console.error("PATCH /api/me reselect failed:", authErrorMessage(error));
      return Response.json({ error: "Can't save changes." }, { status: 500 });
    }
  }

  if (request.method === "DELETE") {
    // Self-service account deletion: requires the current password.
    let body: { password?: unknown } | null = null;
    try {
      body = (await request.json()) as { password?: unknown };
    } catch {
      return Response.json({ error: "Invalid data." }, { status: 400 });
    }
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) {
      return Response.json({ error: "Nhập mật khẩu để xác nhận xoá tài khoản." }, { status: 400 });
    }

    const accountRow = await env.DB.prepare(
      'SELECT "password" FROM "account" WHERE "userId" = ? AND "providerId" = ? LIMIT 1',
    )
      .bind(session.user.id, "credential")
      .first<{ password: string }>();
    const hash = accountRow?.password ?? "";
    if (!hash) {
      return Response.json({ error: "Tài khoản chưa có mật khẩu để xác nhận." }, { status: 400 });
    }
    if (!(await verifyPassword({ hash, password }))) {
      return Response.json({ error: "Sai mật khẩu." }, { status: 400 });
    }

    if (String(session.user.role ?? "") === "admin") {
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

    // Best-effort removal of owned files on B2 (D1 rows cascade).
    try {
      const files = await env.DB.prepare(
        'SELECT "objectKey", "b2FileId" FROM "file" WHERE "ownerId" = ?',
      )
        .bind(session.user.id)
        .all<{ objectKey: string; b2FileId: string | null }>();
      for (const f of files.results) {
        if (!f.b2FileId) continue;
        try {
          await b2DeleteFileVersion(env, f.b2FileId, f.objectKey);
        } catch {
          // orphan B2 objects are acceptable; D1 is the source of truth
        }
      }
    } catch {
      // ignore
    }

    await env.DB.prepare('DELETE FROM "user" WHERE "id" = ?')
      .bind(session.user.id)
      .run();
    return Response.json({ ok: true });
  }

  const mediaToken = await createMediaToken(
    env.SESSION_SIGNING_SECRET,
    String(session.user.id),
  );
  return Response.json({ user: publicUser(session.user as Record<string, unknown>), mediaToken });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
