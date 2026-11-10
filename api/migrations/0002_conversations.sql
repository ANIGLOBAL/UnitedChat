-- 0002: Conversations + participants (PROJECT_SPEC.md Phase 4).
-- The message store lives inside ConversationRoomDO's SQLite; D1 keeps the
-- routing index (who can see which conversation) so the inbox can be listed
-- with plain SQL. Conversation content keys are generated server-side and
-- stored encrypted (AES-256-GCM envelope with CONVERSATION_KEY_ENCRYPTION_KEY).

CREATE TABLE IF NOT EXISTS "conversation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'dm',
  "keyEnvelope" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversationParticipant" (
  "conversationId" TEXT NOT NULL REFERENCES "conversation" ("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "lastReadAt" DATE,
  "joinedAt" DATE NOT NULL,
  PRIMARY KEY ("conversationId", "userId")
);

CREATE INDEX IF NOT EXISTS "conversationParticipant_userId_idx"
  ON "conversationParticipant" ("userId");
CREATE INDEX IF NOT EXISTS "conversation_updatedAt_idx"
  ON "conversation" ("updatedAt");
