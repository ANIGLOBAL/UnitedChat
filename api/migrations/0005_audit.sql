-- 0005: Admin audit log (PROJECT_SPEC.md Section 16.9). Actor, action, target,
-- outcome, reason. Never store passwords, tokens, or key plaintext here.

CREATE TABLE IF NOT EXISTS "auditLog" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "reason" TEXT,
  "createdAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "auditLog_createdAt_idx" ON "auditLog" ("createdAt");
