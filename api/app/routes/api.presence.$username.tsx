import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.presence.$username";

export async function loader({
  request,
  params,
  context,
}: Route.LoaderArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  const username = String((params as { username?: string }).username ?? "");
  const target = await env.DB.prepare(
    'SELECT "id" FROM "user" WHERE "username" = ? COLLATE NOCASE LIMIT 1',
  )
    .bind(username)
    .first<{ id: string }>();
  if (!target) return Response.json({ error: "Not found." }, { status: 404 });
  const stub = env.USER_PRESENCE.get(env.USER_PRESENCE.idFromName(target.id));
  const status = await stub.statusOf(
    new Date().toISOString().replace("T", " ").slice(0, 19),
    15,
  );
  return Response.json({ online: status.online, devices: status.devices });
}
