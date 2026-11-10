-- 0006: System-wide settings (PROJECT_SPEC.md Section 16.8).
CREATE TABLE IF NOT EXISTS "setting" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" DATE NOT NULL
);