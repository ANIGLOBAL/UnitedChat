import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.users.$username";

type ProfileRow = {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  image: string | null;
  bannerFileId: string | null;
  plan: string | null;
  createdAt: string;
};

/**
 * Public profile lookup (PROJECT_SPEC.md Section 4.1/4.3/18.2):
 * case-insensitive username match, non-sensitive fields only.
 * 404 for everything else — no hidden-account confirmation leak.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context.get(envContext) as AppEnv;
  const requested = typeof params.username === "string" ? params.username.trim() : "";
  if (!requested) {
    return Response.json({ error: "Account doesn't exist." }, { status: 404 });
  }

  const result = await env.DB.prepare(
    "SELECT id, name, username, bio, image, bannerFileId, plan, createdAt FROM \"user\" WHERE username = ? COLLATE NOCASE AND status = 'active' LIMIT 1",
  )
    .bind(requested)
    .first<ProfileRow>();

  if (result) {
    return Response.json({
      user: {
        id: result.id,
        name: result.name,
        username: result.username,
        bio: result.bio,
        image: result.image,
        bannerFileId: result.bannerFileId,
        plan: result.plan ?? "free",
        createdAt: result.createdAt,
      },
    });
  }

  return Response.json({ error: "Account doesn't exist." }, { status: 404 });
}
