import type { AppEnv } from "./env";

export type GroupSpaceRow = {
  groupId: string;
  conversationId: string;
  ownerUserId: string;
  displayName: string;
  description: string | null;
  avatarFileId: string | null;
  coverFileId: string | null;
  theme: string;
  status: string;
  requireOwnerApproval: number;
  allowMemberChat: number;
  createdAt: string;
  updatedAt: string;
};

export async function getSpace(
  env: AppEnv,
  groupId: string,
): Promise<GroupSpaceRow | null> {
  return await env.DB.prepare(
    'SELECT "groupId","conversationId","ownerUserId","displayName","description","avatarFileId","coverFileId","theme","status","requireOwnerApproval","allowMemberChat","createdAt","updatedAt" FROM "groupSpace" WHERE "groupId" = ? LIMIT 1',
  )
    .bind(groupId)
    .first<GroupSpaceRow>();
}

export type SpaceMembership = {
  role: "owner" | "admin" | "member";
  status: string;
  lastReadAt: string | null;
};

export async function membership(
  env: AppEnv,
  groupId: string,
  userId: string,
): Promise<SpaceMembership | null> {
  const row = await env.DB.prepare(
    'SELECT "role","status","lastReadAt" FROM "groupSpaceMember" WHERE "groupId" = ? AND "userId" = ? LIMIT 1',
  )
    .bind(groupId, userId)
    .first<{ role: string; status: string; lastReadAt: string | null }>();
  if (!row) return null;
  return {
    role: row.role === "owner" ? "owner" : row.role === "admin" ? "admin" : "member",
    status: row.status,
    lastReadAt: row.lastReadAt ?? null,
  };
}

export async function activeMembership(
  env: AppEnv,
  groupId: string,
  userId: string,
): Promise<SpaceMembership | null> {
  const current = await membership(env, groupId, userId);
  return current?.status === "active" ? current : null;
}

export async function memberCount(env: AppEnv, groupId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM \"groupSpaceMember\" WHERE \"groupId\" = ? AND \"status\" = 'active'",
  )
    .bind(groupId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Public (non-member) shape: existence and policy flags only — never leaks
 * display name, members, or content (PROJECT_SPEC_2.md §18).
 */
export function publicShape(space: GroupSpaceRow, membershipStatus: string) {
  return {
    groupId: space.groupId,
    exists: true,
    status: space.status,
    requireOwnerApproval: space.requireOwnerApproval === 1,
    membership: membershipStatus,
  };
}

export function memberShape(space: GroupSpaceRow, membership: SpaceMembership) {
  return {
    groupId: space.groupId,
    conversationId: space.conversationId,
    displayName: space.displayName,
    description: space.description,
    avatarFileId: space.avatarFileId,
    coverFileId: space.coverFileId,
  theme: space.theme,
    status: space.status,
    requireOwnerApproval: space.requireOwnerApproval === 1,
    allowMemberChat: space.allowMemberChat !== 0,
    ownerUserId: space.ownerUserId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    role: membership.role,
  };
}
