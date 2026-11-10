/**
 * Live smoke test cho UnitedChat API.
 * Chuẩn bị: UNITEDCHAT_E2E=1, QA_EMAIL, QA_PASSWORD, QA_GATE_KEY (nếu Turnstile bật),
 * API (mặc định https://unitedchat-api.aniviet.workers.dev).
 */
const API = (process.env.API || "https://unitedchat-api.aniviet.workers.dev").replace(/\/+$/, "");
const ORIGIN = process.env.UNITEDCHAT_ORIGIN || "https://aniglobal.github.io";
const GATE = process.env.QA_GATE_KEY || "";
const assert = (cond, label) => {
  if (!cond) {
    console.error("FAIL:", label);
    process.exitCode = 1;
  } else {
    console.log("PASS:", label);
  }
};

async function api(path, init = {}, cookieJar = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "omit",
    ...init,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(Object.keys(cookieJar).length
        ? { cookie: Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ") }
        : {}),
      ...(init.headers || {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookieJar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

const health = await api("/healthz");
assert(health.status === 200 && health.json?.ok === true, "healthz");

if (process.env.UNITEDCHAT_E2E === "1") {
  const a = {};
  const signIn = await api(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      body: JSON.stringify({
        email: process.env.QA_EMAIL || "qa-uc-a@unitedchat.local",
        password: process.env.QA_PASSWORD || "Passw0rd!1",
        cfTurnstileToken: GATE,
      }),
    },
    a,
  );
  assert(signIn.status === 200, "sign-in gate OK");
  const conversations = await api("/api/conversations", {}, a);
  assert(conversations.status === 200 && Array.isArray(conversations.json.conversations), "conversations list");
  const spaces = await api("/api/spaces", {}, a);
  assert(spaces.status === 200 && Array.isArray(spaces.json.spaces), "spaces list");
}
