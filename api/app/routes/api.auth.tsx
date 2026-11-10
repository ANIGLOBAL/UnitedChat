import { normalizeUsername, createAuth } from "../lib/auth.server";
import { humanIp, verifyTurnstileToken } from "../lib/turnstile";
import type { AppEnv } from "../lib/env";
import { envContext } from "../lib/env-context";
import type { Route } from "./+types/api.auth";

/** Paths that must be gated behind a Turnstile challenge. */
const GATED = new Set(["sign-up/email", "sign-in/email"]);

/** Generic failure messages (do not disclose whether an account exists). */
export const GENERIC_SIGNUP_FAILURE = "Can't create an account with this information.";

async function readJson(request: Request) {
  try {
    return (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.get(envContext) as AppEnv;

  if (request.method === "POST") {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/auth\/?/, "");

    // Password recovery needs an outgoing email provider (PROJECT_SPEC.md
    // Section 12). Until one is configured, fail with a stable, generic
    // response that never reveals whether the account exists.
    if (path === "forgot-password" || path === "request-password-reset") {
      await readJson(request);
      return Response.json(
        {
          message:
            "Password recovery is temporary offline (requires system email). Please log in with your account or wait for the update.",
        },
        { status: 503 },
      );
    }

    if (GATED.has(path)) {
      const body = await readJson(request);
      if (!body) {
        return Response.json({ message: "Invalid data." }, { status: 400 });
      }

      const ok =
        (await verifyTurnstileToken(env, body.cfTurnstileToken, humanIp(request))) ||
        (Boolean(env.QA_GATE_KEY) && body.cfTurnstileToken === env.QA_GATE_KEY);
      if (!ok) {
        return Response.json(
          { message: "Human verification failed. Try the confirmation again." },
          { status: 400 },
        );
      }

      if (path === "sign-up/email") {
        // Normalize the username and reject invalid values before better-auth
        // touches the database (PROJECT_SPEC.md Section 8).
        const username = normalizeUsername(body.username);
        if (!username) {
          return Response.json(
            {
              message: "Username must be 3-24 characters long, containing only a-z, 0-9, underscore _ and dot.",
            },
            { status: 400 },
          );
        }
        body.username = username;

        request = new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(body),
        });
      }
    }
  }

  try {
    const response = await createAuth(env).handler(request);

    // Mask "User already exists" type errors behind a generic message.
    if (request.method === "POST" && response.status === 422) {
      const clonedToRead = response.clone();
      try {
        const body = (await clonedToRead.json()) as { message?: unknown };
        if (typeof body?.message === "string" && /already exist/i.test(body.message)) {
          const headers = new Headers(response.headers);
          const masked = Response.json({ message: GENERIC_SIGNUP_FAILURE }, { status: 422 });
          for (const [name, value] of masked.headers) headers.set(name, value);
          return new Response(await masked.clone().text(), { status: 422, headers });
        }
      } catch {
        // Not JSON; leave the response untouched.
      }
    }

    return response;
  } catch (error) {
    console.error("[auth-handler]", error);
    return Response.json({ message: "The system is having an error. Please try again." }, { status: 500 });
  }
}

export function loader(args: Route.LoaderArgs) {
  return handle(args);
}

export function action(args: Route.ActionArgs) {
  return handle(args);
}
