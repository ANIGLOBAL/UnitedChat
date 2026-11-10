#!/usr/bin/env node
// Bootstraps the UnitedChat admin/owner account directly in remote D1.
// Idempotent: re-running with the same email only refreshes the account row if
// the user already exists.
//
// Usage (PowerShell):
//   $env:UNITEDCHAT_ADMIN_USERNAME = "owner"
//   $env:UNITEDCHAT_ADMIN_EMAIL = "you@example.com"
//   $env:UNITEDCHAT_ADMIN_PASSWORD = "..."
//   npm run bootstrap:admin
//
// The password is never printed or written to disk.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const username = (process.env.UNITEDCHAT_ADMIN_USERNAME || process.env.CHATINDEX_ADMIN_USERNAME || "").trim().toLowerCase();
const email = (process.env.UNITEDCHAT_ADMIN_EMAIL || process.env.CHATINDEX_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.UNITEDCHAT_ADMIN_PASSWORD || process.env.CHATINDEX_ADMIN_PASSWORD || "";

const USERNAME = /^[a-z0-9_.]{3,24}$/;
if (!USERNAME.test(username) || username.startsWith(".") || username.includes("..") || username.endsWith(".")) {
  console.error("UNITEDCHAT_ADMIN_USERNAME invalid (3-24 chars: a-z 0-9 _ .)");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("UNITEDCHAT_ADMIN_EMAIL invalid.");
  process.exit(1);
}
// Bootstrap credentials may be shorter than the signup minimum; allow >= 4 but
// keep the 128 ceiling.
if (password.length < 4 || password.length > 128) {
  console.error("UNITEDCHAT_ADMIN_PASSWORD must be 4-128 characters.");
  process.exit(1);
}

const { hashPassword } = await import("better-auth/crypto");
const hash = await hashPassword(password);

const now = new Date().toISOString().replace("T", " ").substring(0, 19);
const userId = crypto.randomUUID();
// better-auth's findCredentialAccount matches account."accountId" == userId
// exactly, so the credential account id must equal the user id.
const accountId = userId;

// qa-safe escaping for SQLite literal strings.
const q = (value) => `'${value.replace(/'/g, "''")}'`;

const sql = `
INSERT INTO "user" ("id","name","email","emailVerified","image","bio","twoFactorEnabled","username","role","status","createdAt","updatedAt")
SELECT ${q(userId)}, ${q(username)}, ${q(email)}, 0, NULL, NULL, 0, ${q(username)}, 'admin', 'active', ${q(now)}, ${q(now)}
WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE "username" = ${q(username)} COLLATE NOCASE OR "email" = ${q(email)} COLLATE NOCASE);

INSERT INTO "account" ("id","accountId","providerId","userId","accessToken","refreshToken","idToken","accessTokenExpiresAt","refreshTokenExpiresAt","scope","password","createdAt","updatedAt")
SELECT ${q(accountId)}, ${q(accountId)}, 'credential', ${q(userId)}, NULL, NULL, NULL, NULL, NULL, NULL, ${q(hash)}, ${q(now)}, ${q(now)}
WHERE EXISTS (SELECT 1 FROM "user" WHERE "id" = ${q(userId)} AND "username" = ${q(username)} COLLATE NOCASE)
  AND NOT EXISTS (SELECT 1 FROM "account" WHERE "userId" = ${q(userId)} AND "providerId" = 'credential');

UPDATE "user" SET "role" = 'admin', "status" = 'active', "updatedAt" = ${q(now)}
WHERE "email" = ${q(email)} COLLATE NOCASE AND ("role" != 'admin' OR "status" != 'active');

UPDATE "account" SET "password" = ${q(hash)}, "updatedAt" = ${q(now)}
WHERE "userId" = (SELECT "id" FROM "user" WHERE "email" = ${q(email)} COLLATE NOCASE)
  AND "providerId" = 'credential';
`;

const temp = mkdtempSync(join(tmpdir(), "uc-admin-"));
const file = join(temp, "seed.sql");
writeFileSync(file, sql, "utf8");

const candidates = [process.cwd(), join(process.cwd(), "api"), join(process.cwd(), "web")];
const webRoot = candidates.find((dir) => existsSync(join(dir, "wrangler.jsonc"))) || process.cwd();
console.log("Applying admin seed to remote D1 (do not share the SQL file)...");
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(wrangler, ["wrangler", "d1", "execute", "DB", "--remote", "--file", file], {
  cwd: webRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

readFileSync(file);
console.log("Admin seeded. User id:", userId);
console.log("Username:", username, "| Email:", email);
console.log("Login from:", process.env.UNITEDCHAT_SITE || "https://aniglobal.github.io/UnitedChat/sign-in");
