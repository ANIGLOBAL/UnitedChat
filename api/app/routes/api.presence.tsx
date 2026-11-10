import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.presence";

function nowStamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

  const stub = env.USER_PRESENCE.get(
    env.USER_PRESENCE.idFromName(String(session.user.id)),
  );

  if (request.method === "POST") {
    const sessionId = (session.session ?? { id: "" }) as { id?: string };
    await stub.heartbeat(String(sessionId.id || session.user.id), nowStamp());
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
