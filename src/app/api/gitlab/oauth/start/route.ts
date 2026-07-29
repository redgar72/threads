import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GITLAB_OAUTH_STATE_COOKIE,
  createOAuthState,
  getGitLabOAuthConfig,
} from "@/lib/gitlab-oauth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL || "http://localhost:3000"));
  }

  const config = getGitLabOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/?gitlab=oauth_not_configured", process.env.AUTH_URL || "http://localhost:3000"),
    );
  }

  const state = createOAuthState(session.user.id);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
    scope: config.scopes,
  });

  const authorizeUrl = `${config.publicUrl}/oauth/authorize?${params.toString()}`;
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(GITLAB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return res;
}
