import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGitLabProjectId, isGitLabExportConfigured } from "@/lib/gitlab";
import { ThreadStatusSelect } from "@/components/thread-status-select";
import { ThreadSettingsButton } from "@/components/thread-settings-modal";
import { CreateGitLabIssueButton } from "@/components/create-gitlab-issue";
import { CreateGitLabProjectButton } from "@/components/create-gitlab-project";
import { TasksDock } from "@/components/tasks-dock";
import { ThreadRealtime } from "@/components/thread-realtime";
import {
  InviteForm,
  MessageComposer,
  MessageFeed,
  ParticipantList,
} from "@/components/thread-view";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      messages: {
        include: {
          author: { select: { id: true, name: true } },
          attachments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              filename: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      tasks: {
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!thread) notFound();

  const isParticipant = thread.participants.some(
    (p) => p.userId === session.user.id,
  );
  if (!isParticipant) notFound();

  const participantIds = thread.participants.map((p) => p.userId);
  const inviteableUsers = await prisma.user.findMany({
    where: { id: { notIn: participantIds } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const gitlabConnection = await prisma.gitLabConnection.findUnique({
    where: { userId: session.user.id },
    select: { username: true },
  });

  const canUseGitLab = isGitLabExportConfigured() && !!gitlabConnection;
  const gitlabDisabledReason = !isGitLabExportConfigured()
    ? "Set GITLAB_OAUTH_CLIENT_ID and GITLAB_OAUTH_CLIENT_SECRET"
    : !gitlabConnection
      ? "Connect GitLab from the sidebar first"
      : undefined;

  const existingIssue =
    thread.gitlabIssueIid != null && thread.gitlabIssueUrl
      ? { iid: thread.gitlabIssueIid, url: thread.gitlabIssueUrl }
      : null;

  const existingProject =
    thread.gitlabProjectId != null &&
    thread.gitlabProjectUrl &&
    thread.gitlabProjectPath
      ? {
          id: thread.gitlabProjectId,
          path: thread.gitlabProjectPath,
          url: thread.gitlabProjectUrl,
        }
      : null;

  const hasIssueTarget = !!existingProject || !!getGitLabProjectId();
  const canCreateIssue = canUseGitLab && hasIssueTarget;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {thread.title}
              </h1>
              <ThreadStatusSelect
                threadId={thread.id}
                status={thread.status}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <ParticipantList participants={thread.participants} />
              <InviteForm
                threadId={thread.id}
                users={inviteableUsers}
                compact
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CreateGitLabProjectButton
              threadId={thread.id}
              threadTitle={thread.title}
              configured={isGitLabExportConfigured()}
              connected={!!gitlabConnection}
              disabledReason={gitlabDisabledReason}
              project={existingProject}
            />
            <CreateGitLabIssueButton
              threadId={thread.id}
              configured={canCreateIssue}
              disabledReason={
                gitlabDisabledReason ||
                (!hasIssueTarget
                  ? "Create a GitLab project for this thread first (or set GITLAB_PROJECT_ID)"
                  : undefined)
              }
              existingIssue={existingIssue}
            />
            <ThreadRealtime threadId={thread.id} />
            <ThreadSettingsButton
              thread={{
                id: thread.id,
                title: thread.title,
                status: thread.status,
              }}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40">
          <MessageFeed
            messages={thread.messages.map((m) => ({
              ...m,
              attachments: m.attachments.map((a) => ({
                ...a,
                url: `/api/attachments/${a.id}`,
              })),
            }))}
          />
        </div>

        <MessageComposer
          threadId={thread.id}
          participants={thread.participants}
        />
      </section>

      <TasksDock
        threadId={thread.id}
        tasks={thread.tasks}
        currentUserId={session.user.id}
        participants={thread.participants}
      />
    </div>
  );
}
