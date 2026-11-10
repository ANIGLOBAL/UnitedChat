-- 0001: Authentication + accounts (PROJECT_SPEC.md Phase 2).
-- better-auth core tables. camelCase columns match better-auth's CySQL/Kysely
-- default user table mapping; ChatIndex-specific columns added on "user".

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT COLLATE NOCASE NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "bio" TEXT,
  "twoFactorEnabled" INTEGER NOT NULL DEFAULT 0,
  "username" TEXT COLLATE NOCASE NOT NULL UNIQUE,
  "role" TEXT NOT NULL DEFAULT 'user',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);

-- two-factor plugin table (TOTP secret and backup codes are encrypted at
-- rest by better-auth using SESSION_SIGNING_SECRET).
CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "user" ("id") ON DELETE CASCADE,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" INTEGER NOT NULL DEFAULT 0,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" DATE
);

-- Password recovery core (PROJECT_SPEC.md Section 4.5). Delivery goes live
-- once an email provider is configured; accepts and stores nothing until then.
CREATE TABLE IF NOT EXISTS "passwordResetToken" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" DATE NOT NULL,
  "usedAt" DATE,
  "createdAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "passwordResetToken_userId_idx" ON "passwordResetToken" ("userId");
