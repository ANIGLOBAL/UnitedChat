-- 0004: Personal files (PROJECT_SPEC.md Section 11) + per-conversation file
-- sharing (used to authorize short-lived downloads for message attachments).

CREATE TABLE IF NOT EXISTS "file" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "ownerId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "objectKey" TEXT NOT NULL UNIQUE,
  "b2FileId" TEXT,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "file_ownerId_idx" ON "file" ("ownerId");

CREATE TABLE IF NOT EXISTS "fileShare" (
  "fileId" TEXT NOT NULL REFERENCES "file" ("id") ON DELETE CASCADE,
  "conversationId" TEXT NOT NULL REFERENCES "conversation" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("fileId", "conversationId")
);
