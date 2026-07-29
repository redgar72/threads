"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  createGitLabIssueForUser,
  createGitLabProjectForThread,
  disconnectGitLab,
  getGitLabConnectionSummary,
  isGitLabExportConfigured,
  slugifyProjectPath,
  syncGitLabProjectMembers,
} from "@/lib/gitlab";
import {
  appOriginFromEnv,
  buildGitLabIssueDraft,
} from "@/lib/gitlab-issue";
import {
  notifyThreadParticipants,
  publishThreadEvent,
} from "@/lib/realtime";

async function assertParticipant(threadId: string, userId: string) {
  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participant) {
    throw new Error("Not a participant of this thread");
  }
}

async function loadThreadForExport(threadId: string) {
  return prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      tasks: {
        include: { assignee: { select: { name: true } } },
        orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      },
      messages: {
        include: {
          author: { select: { name: true } },
          _count: { select: { attachments: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getGitLabConnectionAction() {
  const user = await requireUser();
  const connection = await getGitLabConnectionSummary(user.id);
  return {
    exportConfigured: isGitLabExportConfigured(),
    connection,
  };
}

export async function disconnectGitLabAction() {
  const user = await requireUser();
  await disconnectGitLab(user.id);
  revalidatePath("/");
  revalidatePath("/threads", "layout");
}

export async function getGitLabIssueDraftAction(threadId: string) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  if (!isGitLabExportConfigured()) {
    throw new Error(
      "GitLab OAuth is not configured. Set GITLAB_URL, GITLAB_OAUTH_CLIENT_ID, and GITLAB_OAUTH_CLIENT_SECRET.",
    );
  }

  const connection = await getGitLabConnectionSummary(user.id);
  if (!connection) {
    throw new Error("Connect your GitLab account first (sidebar → Connect GitLab)");
  }

  const thread = await loadThreadForExport(threadId);
  if (!thread) throw new Error("Thread not found");

  return buildGitLabIssueDraft({
    threadId: thread.id,
    title: thread.title,
    status: thread.status,
    appOrigin: appOriginFromEnv(),
    participants: thread.participants.map((p) => ({
      name: p.user.name,
      email: p.user.email,
    })),
    tasks: thread.tasks.map((t) => ({
      title: t.title,
      done: t.done,
      assigneeName: t.assignee?.name ?? null,
    })),
    messages: thread.messages.map((m) => ({
      authorName: m.author.name,
      body: m.body,
      createdAt: m.createdAt,
      attachmentCount: m._count.attachments,
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().min(1, "Description is required").max(100_000),
});

export async function createGitLabIssueAction(
  threadId: string,
  formData: FormData,
) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  if (!isGitLabExportConfigured()) {
    throw new Error(
      "GitLab OAuth is not configured. Set GITLAB_URL, GITLAB_OAUTH_CLIENT_ID, and GITLAB_OAUTH_CLIENT_SECRET.",
    );
  }

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const issue = await createGitLabIssueForUser(user.id, threadId, parsed.data);

  await prisma.$transaction([
    prisma.thread.update({
      where: { id: threadId },
      data: {
        gitlabIssueIid: issue.iid,
        gitlabIssueUrl: issue.webUrl,
        updatedAt: new Date(),
      },
    }),
    prisma.message.create({
      data: {
        threadId,
        authorId: user.id,
        body: `Created GitLab issue #${issue.iid}: ${issue.webUrl}`,
      },
    }),
  ]);

  await publishThreadEvent({ threadId, type: "message" });
  await publishThreadEvent({ threadId, type: "thread" });
  await notifyThreadParticipants(threadId);
  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/");

  return { iid: issue.iid, webUrl: issue.webUrl };
}

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  path: z
    .string()
    .trim()
    .max(60)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Path must be lowercase letters, numbers, and dashes",
    )
    .optional(),
});

export async function createGitLabProjectAction(
  threadId: string,
  formData: FormData,
) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  if (!isGitLabExportConfigured()) {
    throw new Error(
      "GitLab OAuth is not configured. Set GITLAB_URL, GITLAB_OAUTH_CLIENT_ID, and GITLAB_OAUTH_CLIENT_SECRET.",
    );
  }

  const connection = await getGitLabConnectionSummary(user.id);
  if (!connection) {
    throw new Error("Connect your GitLab account first (sidebar → Connect GitLab)");
  }

  const existing = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      title: true,
      gitlabProjectId: true,
      gitlabProjectUrl: true,
    },
  });
  if (!existing) throw new Error("Thread not found");
  if (existing.gitlabProjectId != null && existing.gitlabProjectUrl) {
    throw new Error("This thread already has a GitLab project");
  }

  const rawPath = String(formData.get("path") ?? "").trim();
  const parsed = projectSchema.safeParse({
    name: formData.get("name") || existing.title,
    path: rawPath.length > 0 ? rawPath : undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const path = parsed.data.path || slugifyProjectPath(parsed.data.name);

  const project = await createGitLabProjectForThread({
    userId: user.id,
    threadId,
    name: parsed.data.name,
    path,
    description: `Private project for Work Thread “${existing.title}” (${appOriginFromEnv()}/threads/${threadId})`,
  });

  const memberNote =
    project.membersAdded.length > 0
      ? ` Added as Developer: ${project.membersAdded.map((u) => `@${u}`).join(", ")}.`
      : "";

  await prisma.$transaction([
    prisma.thread.update({
      where: { id: threadId },
      data: {
        gitlabProjectId: project.id,
        gitlabProjectPath: project.pathWithNamespace,
        gitlabProjectUrl: project.webUrl,
        updatedAt: new Date(),
      },
    }),
    prisma.message.create({
      data: {
        threadId,
        authorId: user.id,
        body: `Created GitLab project ${project.pathWithNamespace}: ${project.webUrl}.${memberNote}`,
      },
    }),
  ]);

  await publishThreadEvent({ threadId, type: "message" });
  await publishThreadEvent({ threadId, type: "thread" });
  await notifyThreadParticipants(threadId);
  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/");

  return {
    id: project.id,
    webUrl: project.webUrl,
    pathWithNamespace: project.pathWithNamespace,
    membersAdded: project.membersAdded,
    membersSkipped: project.membersSkipped,
  };
}

export async function syncGitLabProjectMembersAction(threadId: string) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  const connection = await getGitLabConnectionSummary(user.id);
  if (!connection) {
    throw new Error("Connect your GitLab account first");
  }

  const result = await syncGitLabProjectMembers({
    userId: user.id,
    threadId,
  });

  if (result.membersAdded.length > 0) {
    await prisma.message.create({
      data: {
        threadId,
        authorId: user.id,
        body: `Synced GitLab project members (Developer): ${result.membersAdded
          .map((u) => `@${u}`)
          .join(", ")}`,
      },
    });
    await publishThreadEvent({ threadId, type: "message" });
  }

  revalidatePath(`/threads/${threadId}`);
  return result;
}
