import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GITLAB_OAUTH_SCOPES = "api read_user";
export const GITLAB_OAUTH_STATE_COOKIE = "gitlab_oauth_state";

/** Dynamic lookup so Next/Turbopack does not inline empty values at compile time. */
function env(name: string) {
  return process.env[name]?.trim() || "";
}

/** Server-side API / token exchange base (may be host.docker.internal). */
export function getGitLabApiBaseUrl(): string | null {
  const url = env("GITLAB_URL").replace(/\/+$/, "");
  return url || null;
}

/** Browser-facing GitLab origin for authorize redirects. */
export function getGitLabPublicUrl(): string | null {
  const publicUrl = env("GITLAB_PUBLIC_URL").replace(/\/+$/, "");
  if (publicUrl) return publicUrl;
  return getGitLabApiBaseUrl();
}

export function getGitLabOAuthConfig() {
  const apiBaseUrl = getGitLabApiBaseUrl();
  const publicUrl = getGitLabPublicUrl();
  const clientId = env("GITLAB_OAUTH_CLIENT_ID");
  const clientSecret = env("GITLAB_OAUTH_CLIENT_SECRET");
  const appOrigin = env("AUTH_URL").replace(/\/+$/, "") || "http://localhost:3000";

  if (!apiBaseUrl || !publicUrl || !clientId || !clientSecret) return null;

  return {
    apiBaseUrl,
    publicUrl,
    clientId,
    clientSecret,
    redirectUri: `${appOrigin}/api/gitlab/oauth/callback`,
    scopes: GITLAB_OAUTH_SCOPES,
  };
}

export function isGitLabOAuthConfigured() {
  return getGitLabOAuthConfig() !== null;
}

export function getGitLabProjectId(): string | null {
  const id = env("GITLAB_PROJECT_ID");
  return id || null;
}

/** OAuth app configured; per-thread or env project used when exporting. */
export function isGitLabExportConfigured() {
  return isGitLabOAuthConfigured();
}

function signingKey() {
  return env("AUTH_SECRET") || "dev-secret";
}

export function createOAuthState(userId: string) {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}.${nonce}.${Date.now()}`;
  const sig = createHmac("sha256", signingKey()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string, userId: string) {
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [uid, nonce, ts, sig] = parts;
  if (!uid || !nonce || !ts || !sig) return false;
  if (uid !== userId) return false;
  const ageMs = Date.now() - Number(ts);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15 * 60 * 1000) {
    return false;
  }
  const payload = `${uid}.${nonce}.${ts}`;
  const expected = createHmac("sha256", signingKey()).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export type GitLabTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  created_at?: number;
  scope?: string;
};

export async function exchangeAuthorizationCode(code: string) {
  const config = getGitLabOAuthConfig();
  if (!config) throw new Error("GitLab OAuth is not configured");

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const res = await fetch(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const raw = await res.text();
  let data: GitLabTokenResponse & { error?: string; error_description?: string } =
    {} as GitLabTokenResponse;
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : ({} as typeof data);
  } catch {
    throw new Error(`GitLab token exchange failed (${res.status})`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `GitLab token exchange failed (${res.status})`,
    );
  }

  return data;
}

export async function refreshAccessToken(refreshToken: string) {
  const config = getGitLabOAuthConfig();
  if (!config) throw new Error("GitLab OAuth is not configured");

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: config.redirectUri,
  });

  const res = await fetch(`${config.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const raw = await res.text();
  let data: GitLabTokenResponse & { error?: string; error_description?: string } =
    {} as GitLabTokenResponse;
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : ({} as typeof data);
  } catch {
    throw new Error(`GitLab token refresh failed (${res.status})`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `GitLab token refresh failed (${res.status})`,
    );
  }

  return data;
}

export async function fetchGitLabUser(accessToken: string) {
  const apiBaseUrl = getGitLabApiBaseUrl();
  if (!apiBaseUrl) throw new Error("GITLAB_URL is not set");

  const res = await fetch(`${apiBaseUrl}/api/v4/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const raw = await res.text();
  let data: { id?: number; username?: string; name?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    throw new Error(`GitLab /user failed (${res.status})`);
  }

  if (!res.ok || typeof data.id !== "number" || !data.username) {
    throw new Error(`GitLab /user failed (${res.status})`);
  }

  return {
    id: data.id,
    username: data.username,
    name: data.name ?? data.username,
  };
}

export function tokenExpiresAt(token: GitLabTokenResponse): Date | null {
  if (typeof token.expires_in !== "number") return null;
  // Refresh a minute early
  return new Date(Date.now() + Math.max(0, token.expires_in - 60) * 1000);
}
