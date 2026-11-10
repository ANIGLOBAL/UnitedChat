-- 0008: account plan + banner (premium tiers) for ChatSpace profile features.
-- plan: free | basic | premium (admin-set; free default).
-- bannerFileId: file id presented as profile banner (image only, no GIF).
ALTER TABLE "user" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "user" ADD COLUMN "bannerFileId" TEXT;
