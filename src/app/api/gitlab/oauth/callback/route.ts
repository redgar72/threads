import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveGitLabConnection } from "@/lib/gitlab";
import {
  GITLAB_OAUTH_STATE_COOKIE,
  exchangeAuthorizationCode,
  verifyOAuthState,
} from "@/lib/gitlab-oauth";

function appOrigin() {
  return process.env.AUTH_URL?.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

export async function GET(request: Request) {
  const origin = appOrigin();
  const session = await auth();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const clear = (res: NextResponse) => {
    res.cookies.set(GITLAB_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  };

  if (oauthError) {
    return clear(
      NextResponse.redirect(
        new URL(`/?gitlab=denied&error=${encodeURIComponent(oauthError)}`, origin),
      ),
    );
  }

  if (!session?.user?.id) {
    return clear(NextResponse.redirect(new URL("/login", origin)));
  }

  if (!code || !state) {
    return clear(NextResponse.redirect(new URL("/?gitlab=missing_code", origin)));
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieState = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GITLAB_OAUTH_STATE_COOKIE}=`))
    ?.slice(GITLAB_OAUTH_STATE_COOKIE.length + 1);

  if (!cookieState || cookieState !== state) {
    return clear(NextResponse.redirect(new URL("/?gitlab=bad_state", origin)));
  }

  if (!verifyOAuthState(state, session.user.id)) {
    return clear(NextResponse.redirect(new URL("/?gitlab=bad_state", origin)));
  }

  try {
    const token = await exchangeAuthorizationCode(code);
    await saveGitLabConnection(session.user.id, token);
    return clear(NextResponse.redirect(new URL("/?gitlab=connected", origin)));
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to connect GitLab";
    return clear(
      NextResponse.redirect(
        new URL(`/?gitlab=error&error=${encodeURIComponent(message)}`, origin),
      ),
    );
  }
}
