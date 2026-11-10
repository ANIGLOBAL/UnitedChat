import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import { B2Error, b2Upload } from "../lib/b2.server";
import type { Route } from "./+types/api.files";

const IMAGE_MAGICS: { prefix: number[]; mime: string }[] = [
  { prefix: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png" },
  { prefix: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
  { prefix: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
];

  // Note: `mime` field is the detected magic-byte type when available, else
  // the client-supplied fileMeta.type (filename guess). Callers validating
  // images should trust only a real magic-byte detection, so we export
  // detectMime for server routes that need it.
export function detectImageMime(bytes: Uint8Array): string | null {
  return detectMime(bytes);
}

function detectMime(bytes: Uint8Array): string | null {
  for (const { prefix, mime } of IMAGE_MAGICS) {
    if (prefix.every((b, i) => bytes[i] === b)) {
      if (mime === "image/webp") {
        const signature = [0x57, 0x45, 0x42, 0x50];
        if (!signature.every((b, i) => bytes[8 + i] === b)) continue;
      }
      return mime;
    }
  }
  return null;
}

function sanitizeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\x00-\x1f]/g, "").trim();
  return (cleaned || "file").slice(0, 80);
}

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const me = String(session.user.id);

  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      'SELECT "id","name","mimeType","kind","size","status","createdAt" FROM "file" WHERE "ownerId" = ? ORDER BY "createdAt" DESC LIMIT 200',
    )
      .bind(me)
      .all<Record<string, unknown>>();
    const quota = Number(env.FREE_STORAGE_BYTES) || 500 * 1024 * 1024;
    const used = rows.results.reduce((sum, r) => sum + Number(r.size ?? 0), 0);
    return Response.json({ files: rows.results, quota: { free: quota, used } });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const fileMeta = form.get("file");
  if (!(fileMeta instanceof File)) {
    return Response.json({ error: "File field is required." }, { status: 400 });
  }

  const imageLimit = Number(env.IMAGE_MAX_BYTES) || 20 * 1024 * 1024;
  const fileLimit = Number(env.FILE_MAX_BYTES) || 20 * 1024 * 1024;
  if (fileMeta.size < 1) {
    return Response.json({ error: "File is empty." }, { status: 400 });
  }
  if (fileMeta.size > fileLimit) {
    return Response.json(
      { error: `Tệp quá lớn (tối đa ${Math.floor(fileLimit / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await fileMeta.arrayBuffer());
  const detected = detectMime(bytes);
  const isImage = detected !== null;
  if (isImage && bytes.byteLength > imageLimit) {
    return Response.json(
      { error: `Ảnh quá lớn (tối đa ${Math.floor(imageLimit / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  const quota = Number(env.FREE_STORAGE_BYTES) || 500 * 1024 * 1024;
  const usageRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(\"size\"), 0) AS used FROM \"file\" WHERE \"ownerId\" = ? AND \"status\" = 'active'",
  )
    .bind(me)
    .first<{ used: number }>();
  const used = Number(usageRow?.used ?? 0);
  if (used + bytes.byteLength > quota) {
    return Response.json(
      { error: "Quá hạn mức lưu trữ 500 MB cho tài khoản Free." },
      { status: 413 },
    );
  }

  const fileId = crypto.randomUUID();
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const displayName = sanitizeName(fileMeta.name || "file");
  const objectKey = `chat/${me}/${fileId}/${displayName.replace(/[^\x20-\x7e]/g, "_").replace(/\s+/g, " ")}`;
  const mime = detected ?? (fileMeta.type || "application/octet-stream");

  try {
    const uploaded = await b2Upload(env, env.B2_BUCKET_ID ?? "", objectKey, mime, bytes);
    const result = await env.DB.prepare(
      'INSERT INTO "file" ("id","ownerId","objectKey","b2FileId","name","mimeType","kind","size","status","createdAt","updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        fileId,
        me,
        objectKey,
        uploaded.b2FileId,
        displayName,
        mime,
        isImage ? "image" : "file",
        bytes.byteLength,
        "active",
        now,
        now,
      )
      .run();
    if (!result.success) throw new Error("D1 insert failed");
  } catch (error) {
    if (error instanceof B2Error) {
      return Response.json(
        { error: "Tải tệp lên thất bại (B2). Vui lòng thử lại." },
        { status: 502 },
      );
    }
    console.error("files.upload_fail", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "Tải tệp lên thất bại." }, { status: 500 });
  }

  return Response.json({
    file: {
      id: fileId,
      name: displayName,
      mimeType: mime,
      kind: isImage ? "image" : "file",
      size: bytes.byteLength,
    },
  });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
