import { getSession } from "../lib/auth.server";
import { verifyMediaToken } from "../lib/media-token.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import { B2Error, b2AuthorizedDownloadUrl, b2DeleteFileVersion } from "../lib/b2.server";
import type { Route } from "./+types/api.files.$id";

type FileRow = {
  id: string;
  ownerId: string;
  objectKey: string;
  b2FileId: string | null;
  name: string;
  mimeType: string;
  kind: string;
  size: number;
  status: string;
};

async function loadFile(env: AppEnv, id: string): Promise<FileRow | null> {
  return (
    (await env.DB.prepare(
      'SELECT "id","ownerId","objectKey","b2FileId","name","mimeType","kind","size","status" FROM "file" WHERE "id" = ? LIMIT 1',
    )
      .bind(id)
      .first<FileRow>()) ?? null
  );
}

function ownerAccess(env: AppEnv, row: FileRow | null, me: string) {
  if (row && (row.ownerId === me || me === "admin")) return true;
  return false;
}

async function handle({ request, params, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  const url = new URL(request.url);
  let me = session ? String(session.user.id) : "";
  if (!me) {
    me = (await verifyMediaToken(env.SESSION_SIGNING_SECRET, url.searchParams.get("mt"))) ?? "";
  }
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  const fileId = String((params as { id?: string }).id ?? "");
  if (!fileId) return Response.json({ error: "Not found." }, { status: 404 });
  const row = await loadFile(env, fileId);
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  // Download: owner, conversation participant (via fileShare), or admin.
  if (request.method === "GET") {
    if (row.status !== "active") {
      return Response.json({ error: "File is unavailable." }, { status: 404 });
    }
    const adminRow = await env.DB.prepare(
      "SELECT 1 AS ok FROM \"user\" WHERE \"id\" = ? AND \"role\" = 'admin' LIMIT 1",
    )
      .bind(me)
      .first<{ ok: number }>();
    const isAdmin = adminRow !== null;
    if (!ownerAccess(env, row, me) && !isAdmin) {
      const shared = await env.DB.prepare(
        'SELECT 1 AS ok FROM "fileShare" AS s JOIN "conversationParticipant" AS p ON p."conversationId" = s."conversationId" WHERE s."fileId" = ? AND p."userId" = ? LIMIT 1',
      )
        .bind(fileId, me)
        .first<{ ok: number }>();
      if (!shared) {
        // Space avatar/banner: any active member of a shared Group Space may
        // view the referenced profile image (ChatSpace members pages).
        const spaceShared = await env.DB.prepare(
          `SELECT 1 AS ok FROM "groupSpaceMember" AS m1
            JOIN "groupSpaceMember" AS m2 ON m1."groupId" = m2."groupId"
           WHERE m1."status" = 'active' AND m2."status" = 'active'
             AND m1."userId" = ? AND m2."userId" = ? LIMIT 1`,
        )
          .bind(row.ownerId, me)
          .first<{ ok: number }>();
        if (!spaceShared) {
          return Response.json({ error: "Forbidden." }, { status: 403 });
        }
      }
    }
    const url = await b2AuthorizedDownloadUrl(env, env.B2_BUCKET_ID ?? "", row.objectKey);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "no-store" },
    });
  }

  // Delete: owner or admin (PROJECT_SPEC.md Section 11.5).
  if (request.method === "DELETE") {
    const adminRow = await env.DB.prepare(
      "SELECT 1 AS ok FROM \"user\" WHERE \"id\" = ? AND \"role\" = 'admin' LIMIT 1",
    )
      .bind(me)
      .first<{ ok: number }>();
    const isOwner = row.ownerId === me;
    const isAdmin = adminRow !== null;
    if (!isOwner && !isAdmin) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }

    await env.DB.prepare('UPDATE "file" SET "status" = \'deleting\', "updatedAt" = ? WHERE "id" = ?')
      .bind(new Date().toISOString().replace("T", " ").slice(0, 19), fileId)
      .run();

    let deleted = true;
    if (row.b2FileId) {
      try {
        await b2DeleteFileVersion(env, row.b2FileId, row.objectKey);
      } catch (error) {
        if (error instanceof B2Error && error.status !== 404 && error.status !== 400) {
          deleted = false;
        }
      }
    }
    if (deleted) {
      await env.DB.prepare('DELETE FROM "file" WHERE "id" = ?').bind(fileId).run();
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
