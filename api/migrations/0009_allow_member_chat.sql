-- 0009: allowMemberChat flag — when 0, only owner/admin can post messages.
ALTER TABLE "groupSpace" ADD COLUMN "allowMemberChat" INTEGER NOT NULL DEFAULT 1;
