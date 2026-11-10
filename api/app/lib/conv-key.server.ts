/**
 * Conversation content-key envelope helpers (PROJECT_SPEC.md Sections 5, 14).
 *
 * Each conversation has a random 32-byte content key. The key itself is
 * never stored in plaintext: it is wrapped with AES-256-GCM using the
 * worker's CONVERSATION_KEY_ENCRYPTION_KEY secret, and the base64
 * envelope (`ckv1:<iv><ciphertext>`) is stored in D1. Only the DO and
 * server routes can unwrap it, so a leaked D1 dump alone cannot decrypt
 * stored message bodies.
 *
 * Envelope format: "ckv1:" + base64(iv[12] || ciphertext(+tag)).
 */

function requireKeySecret(envKey: string | undefined): Uint8Array<ArrayBuffer> {
  if (!envKey) {
    throw new Error("CONVERSATION_KEY_ENCRYPTION_KEY is not configured.");
  }
  if (!/^[0-9a-f]{32,128}$/.test(envKey)) {
    throw new Error("CONVERSATION_KEY_ENCRYPTION_KEY must be 32-128 hex characters.");
  }
  const secretBytes = new Uint8Array(
    (envKey.match(/.{2}/g) ?? []).map((pair) => Number.parseInt(pair, 16)),
  );

  // Spread the 24/48-byte secret into an AES-256 key deterministically.
  return crypto.subtle.digest("SHA-256", secretBytes).then((digestBytes) => {
    return new Uint8Array(digestBytes);
  }) as unknown as Uint8Array<ArrayBuffer>;
}

async function aeadKey(envKey: string | undefined): Promise<CryptoKey> {
  const raw = await requireKeySecret(envKey);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array<ArrayBuffer> | ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Wraps a freshly generated 32-byte conversation key. */
export async function sealConversationKey(
  envKey: string | undefined,
): Promise<string> {
  const key = await aeadKey(envKey);
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    contentKey,
  );
  const packed = new Uint8Array(12 + sealed.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(sealed), 12);
  return `ckv1:${toBase64(packed)}`;
}

/** Unwraps an envelope back into a usable AES-GCM key. */
export async function openConversationKey(
  envKey: string | undefined,
  envelope: string,
): Promise<CryptoKey> {
  if (!envelope.startsWith("ckv1:")) {
    throw new Error("Unknown conversation key envelope.");
  }
  const packed = fromBase64(envelope.slice(5));
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  await requireKeySecret(envKey);
  const contentKeyBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await aeadKey(envKey),
    ciphertext,
  );
  return crypto.subtle.importKey("raw", contentKeyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypts one message body under the conversation key. */
export async function sealMessageBody(
  key: CryptoKey,
  body: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(body),
  );
  return `ckv1:${toBase64(iv)}:${toBase64(sealed)}`;
}

/** Decrypts a message body stored by sealMessageBody. */
export async function openMessageBody(
  key: CryptoKey,
  stored: string,
): Promise<string> {
  if (!stored.startsWith("ckv1:")) return stored;
  const [ivPart, ctPart] = stored.slice(5).split(":");
  if (!ivPart || !ctPart) throw new Error("Bad message envelope.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(ctPart),
  );
  return new TextDecoder().decode(plaintext);
}
