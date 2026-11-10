-- 0007: ChatSpace Group Spaces (PROJECT_SPEC_2.md §15).
-- ChatSpace reuses the shared ChatIndex backend: each Group Space maps to a
-- conversation row (kind='space') whose id drives the ConversationRoomDO room,
-- reusing the sealed conversation-key envelope. D1 holds Group Space
-- metadata, membership, and join requests. B2/files stay untouched.

CREATE TABLE IF NOT EXISTS "groupSpace" (
  "groupId" TEXT PRIMARY KEY NOT NULL,
  "conversationId" TEXT NOT NULL UNIQUE REFERENCES "conversation" ("id") ON DELETE CASCADE,
  "ownerUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "avatarFileId" TEXT,
  "coverFileId" TEXT,
  "theme" TEXT NOT NULL DEFAULT 'default',
  "status" TEXT NOT NULL DEFAULT 'active',
  "requireOwnerApproval" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS "groupSpace_owner_idx" ON "groupSpace" ("ownerUserId");
CREATE INDEX IF NOT EXISTS "groupSpace_status_idx" ON "groupSpace" ("status");

CREATE TABLE IF NOT EXISTS "groupSpaceMember" (
  "groupId" TEXT NOT NULL REFERENCES "groupSpace" ("groupId") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastReadAt" DATE,
  "joinedAt" DATE NOT NULL,
  PRIMARY KEY ("groupId", "userId")
);

CREATE INDEX IF NOT EXISTS "groupSpaceMember_userId_idx" ON "groupSpaceMember" ("userId");

CREATE TABLE IF NOT EXISTS "groupSpaceJoinRequest" (
  "requestId" TEXT PRIMARY KEY NOT NULL,
  "groupId" TEXT NOT NULL REFERENCES "groupSpace" ("groupId") ON DELETE CASCADE,
  "applicantUserId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATE NOT NULL,
  "processedAt" DATE,
  "processedByUserId" TEXT
);

CREATE INDEX IF NOT EXISTS "groupSpaceJoinRequest_group_idx"
  ON "groupSpaceJoinRequest" ("groupId");
CREATE INDEX IF NOT EXISTS "groupSpaceJoinRequest_applicant_idx"
  ON "groupSpaceJoinRequest" ("applicantUserId");

-- Duplicate pending requests per (group, applicant) are impossible.
CREATE UNIQUE INDEX IF NOT EXISTS "groupSpaceJoinRequest_pending_unique"
  ON "groupSpaceJoinRequest" ("groupId", "applicantUserId")
  WHERE "status" = 'pending';
