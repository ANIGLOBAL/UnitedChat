import { getSession } from "../lib/auth.server";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.conversations.$id.messages.$messageId";

async function handle({ request, params, context }: Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;
  const session = await getSession(env, request);
  if (!session) return Response.json({ error: "Đăng nhập để tiếp tục." }, { status: 401 });

  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const conversationId = String(params.id ?? "");
  const messageId = String(params.messageId ?? "");
  if (!conversationId || !messageId) {
    return Response.json({ error: "Không tìm thấy tin nhắn." }, { status: 404 });
  }

  const me = String(session.user.id);
  const member = await env.DB.prepare(
    'SELECT 1 AS ok FROM "conversationParticipant" WHERE "conversationId" = ? AND "userId" = ? LIMIT 1',
  )
    .bind(conversationId, me)
    .first<{ ok: number }>();
  if (!member) return Response.json({ error: "Not found." }, { status: 404 });

  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== "me" && scope !== "everyone") {
    return Response.json(
      { error: "scope phải là me hoặc everyone." },
      { status: 400 },
    );
  }

  const stub = env.CONVERSATION_ROOM.get(
    env.CONVERSATION_ROOM.idFromName(conversationId),
  );
  const result = await stub.deleteMessage(conversationId, messageId, me, scope);
  if (!result.ok) {
    return Response.json(
      { error: result.error ?? "Không xóa được tin nhắn." },
      { status: result.error?.includes("người gửi") ? 403 : 404 },
    );
  }

  return Response.json({ ok: true, messageId, scope });
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
