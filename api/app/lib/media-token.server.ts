const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createMediaToken(
  secret: string | undefined,
  userId: string,
  ttlSeconds = 60 * 60 * 24 * 7,
) {
  if (!secret || !userId) return "";
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${expires}`;
  const key = await hmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
  );
  return `${toBase64Url(encoder.encode(payload))}.${toBase64Url(signature)}`;
}

export async function verifyMediaToken(secret: string | undefined, token: string | null) {
  if (!secret || !token) return null;
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  try {
    const payload = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const [userId, rawExpires] = payload.split(".");
    const expires = Number(rawExpires);
    if (!userId || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(encodedSignature),
      encoder.encode(payload),
    );
    return ok ? userId : null;
  } catch {
    return null;
  }
}
