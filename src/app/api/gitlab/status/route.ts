import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGitLabOAuthConfig, isGitLabOAuthConfigured } from "@/lib/gitlab-oauth";

/** Quick check that OAuth env is visible to the running Next server. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getGitLabOAuthConfig();
  return NextResponse.json({
    configured: isGitLabOAuthConfigured(),
    hasUrl: !!config?.apiBaseUrl,
    hasPublicUrl: !!config?.publicUrl,
    hasClientId: !!config?.clientId,
    hasClientSecret: !!config?.clientSecret,
    redirectUri: config?.redirectUri ?? null,
  });
}
