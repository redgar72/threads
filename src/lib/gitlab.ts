import "server-only";

import { prisma } from "@/lib/prisma";
import {
  fetchGitLabUser,
  getGitLabApiBaseUrl,
  getGitLabOAuthConfig,
  getGitLabProjectId,
  isGitLabExportConfigured,
  refreshAccessToken,
  tokenExpiresAt,
  type GitLabTokenResponse,
} from "@/lib/gitlab-oauth";

export type CreatedGitLabIssue = {
  iid: number;
  webUrl: string;
  title: string;
};

export type CreatedGitLabProject = {
  id: number;
  pathWithNamespace: string;
  webUrl: string;
  membersAdded: string[];
  membersSkipped: string[];
};

export { isGitLabExportConfigured, isGitLabOAuthConfigured, getGitLabProjectId } from "@/lib/gitlab-oauth";

const DEVELOPER_ACCESS = 30;

function projectSegment(projectId: string | number) {
  const id = String(projectId);
  if (/^\d+$/.test(id)) return id;
  return encodeURIComponent(id);
}

async function persistTokens(userId: string, token: GitLabTokenResponse) {
  const gitlabUser = await fetchGitLabUser(token.access_token);

  const taken = await prisma.gitLabConnection.findFirst({
    where: {
      gitlabUserId: gitlabUser.id,
      NOT: { userId },
    },
    select: { userId: true },
  });
  if (taken) {
    throw new Error(
      `GitLab @${gitlabUser.username} is already linked to another Work Threads account`,
    );
  }

  await prisma.gitLabConnection.upsert({
    where: { userId },
    create: {
      userId,
      gitlabUserId: gitlabUser.id,
      username: gitlabUser.username,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: tokenExpiresAt(token),
      scopes: token.scope || "api read_user",
    },
    update: {
      gitlabUserId: gitlabUser.id,
      username: gitlabUser.username,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: tokenExpiresAt(token),
      scopes: token.scope || "api read_user",
    },
  });
  return gitlabUser;
}

export async function saveGitLabConnection(
  userId: string,
  token: GitLabTokenResponse,
) {
  return persistTokens(userId, token);
}

export async function getGitLabConnectionSummary(userId: string) {
  const row = await prisma.gitLabConnection.findUnique({
    where: { userId },
    select: { username: true, gitlabUserId: true, connectedAt: true },
  });
  return row;
}

export async function disconnectGitLab(userId: string) {
  await prisma.gitLabConnection.deleteMany({ where: { userId } });
}

/** Returns a valid access token for the user, refreshing if needed. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const row = await prisma.gitLabConnection.findUnique({ where: { userId } });
  if (!row) {
    throw new Error("Connect your GitLab account first");
  }

  const needsRefresh =
    row.expiresAt != null && row.expiresAt.getTime() <= Date.now();

  if (!needsRefresh) return row.accessToken;

  if (!row.refreshToken) {
    throw new Error("GitLab token expired — reconnect your account");
  }

  const token = await refreshAccessToken(row.refreshToken);
  await persistTokens(userId, token);
  return token.access_token;
}

async function gitlabJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T; raw: string }> {
  const apiBaseUrl = getGitLabApiBaseUrl();
  if (!apiBaseUrl) throw new Error("GITLAB_URL is not set");

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const raw = await res.text();
  let data = {} as T;
  try {
    data = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, data, raw };
}

function gitlabErrorMessage(
  data: { message?: unknown; error?: string; error_description?: string },
  raw: string,
  status: number,
  fallback: string,
) {
  if (typeof data.message === "string") return data.message;
  if (data.message && typeof data.message === "object") {
    return JSON.stringify(data.message);
  }
  if (data.error_description) return data.error_description;
  if (data.error) return data.error;
  return raw.slice(0, 200) || `${fallback} (${status})`;
}

/** Sanitize a GitLab project path (lowercase, dashes). */
export function slugifyProjectPath(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "work-thread";
}

export async function resolveIssueProjectId(threadId: string): Promise<string> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { gitlabProjectId: true },
  });
  if (thread?.gitlabProjectId != null) {
    return String(thread.gitlabProjectId);
  }
  const envProject = getGitLabProjectId();
  if (envProject) return envProject;
  throw new Error(
    "This thread has no GitLab project yet. Create one first, or set GITLAB_PROJECT_ID.",
  );
}

export async function createGitLabProjectForThread(input: {
  userId: string;
  threadId: string;
  name: string;
  path?: string;
  description?: string;
}): Promise<CreatedGitLabProject> {
  if (!getGitLabOAuthConfig()) {
    throw new Error(
      "GitLab OAuth is not configured. Set GITLAB_URL, GITLAB_OAUTH_CLIENT_ID, and GITLAB_OAUTH_CLIENT_SECRET.",
    );
  }

  const accessToken = await getValidAccessToken(input.userId);
  const path = slugifyProjectPath(input.path || input.name);

  const created = await gitlabJson<{
    id?: number;
    path_with_namespace?: string;
    web_url?: string;
    message?: unknown;
  }>(accessToken, "/api/v4/projects", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 255),
      path,
      visibility: "private",
      description:
        input.description?.slice(0, 2000) ||
        `Work Threads project for thread ${input.threadId}`,
      initialize_with_readme: true,
    }),
  });

  if (
    !created.ok ||
    typeof created.data.id !== "number" ||
    !created.data.web_url ||
    !created.data.path_with_namespace
  ) {
    throw new Error(
      gitlabErrorMessage(
        created.data,
        created.raw,
        created.status,
        "GitLab project create failed",
      ),
    );
  }

  const projectId = created.data.id;
  const creator = await getGitLabConnectionSummary(input.userId);

  const participants = await prisma.threadParticipant.findMany({
    where: { threadId: input.threadId },
    include: {
      user: {
        include: {
          gitlabConnection: {
            select: { gitlabUserId: true, username: true },
          },
        },
      },
    },
  });

  const membersAdded: string[] = [];
  const membersSkipped: string[] = [];

  for (const p of participants) {
    const conn = p.user.gitlabConnection;
    if (!conn) {
      membersSkipped.push(p.user.name);
      continue;
    }
    if (creator && conn.gitlabUserId === creator.gitlabUserId) {
      continue; // already Owner
    }

    const member = await gitlabJson<{ message?: unknown }>(
      accessToken,
      `/api/v4/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: conn.gitlabUserId,
          access_level: DEVELOPER_ACCESS,
        }),
      },
    );

    if (member.ok || member.status === 409) {
      membersAdded.push(conn.username);
    } else {
      membersSkipped.push(`@${conn.username}`);
    }
  }

  return {
    id: projectId,
    pathWithNamespace: created.data.path_with_namespace,
    webUrl: created.data.web_url,
    membersAdded,
    membersSkipped,
  };
}

export async function syncGitLabProjectMembers(input: {
  userId: string;
  threadId: string;
}): Promise<{ membersAdded: string[]; membersSkipped: string[] }> {
  const thread = await prisma.thread.findUnique({
    where: { id: input.threadId },
    select: { gitlabProjectId: true },
  });
  if (thread?.gitlabProjectId == null) {
    throw new Error("Create a GitLab project for this thread first");
  }

  const accessToken = await getValidAccessToken(input.userId);
  const creator = await getGitLabConnectionSummary(input.userId);
  const projectId = thread.gitlabProjectId;

  const participants = await prisma.threadParticipant.findMany({
    where: { threadId: input.threadId },
    include: {
      user: {
        include: {
          gitlabConnection: {
            select: { gitlabUserId: true, username: true },
          },
        },
      },
    },
  });

  const membersAdded: string[] = [];
  const membersSkipped: string[] = [];

  for (const p of participants) {
    const conn = p.user.gitlabConnection;
    if (!conn) {
      membersSkipped.push(p.user.name);
      continue;
    }
    if (creator && conn.gitlabUserId === creator.gitlabUserId) continue;

    const member = await gitlabJson<{ message?: unknown }>(
      accessToken,
      `/api/v4/projects/${projectId}/members`,
      {
        method: "POST",
        body: JSON.stringify({
          user_id: conn.gitlabUserId,
          access_level: DEVELOPER_ACCESS,
        }),
      },
    );

    if (member.ok || member.status === 409) {
      membersAdded.push(conn.username);
    } else {
      membersSkipped.push(`@${conn.username}`);
    }
  }

  return { membersAdded, membersSkipped };
}

export async function createGitLabIssueForUser(
  userId: string,
  threadId: string,
  input: { title: string; description: string },
): Promise<CreatedGitLabIssue> {
  if (!getGitLabOAuthConfig()) {
    throw new Error(
      "GitLab OAuth is not configured. Set GITLAB_URL, GITLAB_OAUTH_CLIENT_ID, and GITLAB_OAUTH_CLIENT_SECRET.",
    );
  }

  const projectId = await resolveIssueProjectId(threadId);
  const accessToken = await getValidAccessToken(userId);

  const result = await gitlabJson<{
    iid?: number;
    web_url?: string;
    title?: string;
    message?: unknown;
  }>(accessToken, `/api/v4/projects/${projectSegment(projectId)}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      description: input.description,
    }),
  });

  if (
    !result.ok ||
    typeof result.data.iid !== "number" ||
    !result.data.web_url
  ) {
    throw new Error(
      gitlabErrorMessage(
        result.data,
        result.raw,
        result.status,
        "GitLab issue create failed",
      ),
    );
  }

  return {
    iid: result.data.iid,
    webUrl: result.data.web_url,
    title: result.data.title ?? input.title,
  };
}
