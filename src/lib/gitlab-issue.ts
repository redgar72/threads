import type { ThreadStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<ThreadStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  ARCHIVED: "Archived",
};

export type IssueDraftInput = {
  threadId: string;
  title: string;
  status: ThreadStatus;
  appOrigin: string;
  participants: { name: string; email: string }[];
  tasks: {
    title: string;
    done: boolean;
    assigneeName: string | null;
  }[];
  messages: {
    authorName: string;
    body: string;
    createdAt: Date;
    attachmentCount: number;
  }[];
};

const MAX_MESSAGES = 40;
const MAX_BODY_CHARS = 500;

function truncate(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildGitLabIssueDraft(input: IssueDraftInput) {
  const threadUrl = `${input.appOrigin.replace(/\/+$/, "")}/threads/${input.threadId}`;
  const openTasks = input.tasks.filter((t) => !t.done);
  const doneTasks = input.tasks.filter((t) => t.done);

  const lines: string[] = [
    `Exported from Work Threads.`,
    ``,
    `**Thread:** [${input.title}](${threadUrl})`,
    `**Status:** ${STATUS_LABELS[input.status]}`,
    ``,
    `### Participants`,
  ];

  if (input.participants.length === 0) {
    lines.push(`_None_`);
  } else {
    for (const p of input.participants) {
      lines.push(`- ${p.name} (${p.email})`);
    }
  }

  lines.push(``, `### Tasks`);

  if (input.tasks.length === 0) {
    lines.push(`_No tasks_`);
  } else {
    if (openTasks.length > 0) {
      lines.push(`**Open (${openTasks.length})**`);
      for (const t of openTasks) {
        const who = t.assigneeName ? ` — @${t.assigneeName}` : "";
        lines.push(`- [ ] ${t.title}${who}`);
      }
    }
    if (doneTasks.length > 0) {
      lines.push(`**Done (${doneTasks.length})**`);
      for (const t of doneTasks) {
        const who = t.assigneeName ? ` — @${t.assigneeName}` : "";
        lines.push(`- [x] ${t.title}${who}`);
      }
    }
  }

  const recent = input.messages.slice(-MAX_MESSAGES);
  lines.push(``, `### Recent messages`);
  if (recent.length === 0) {
    lines.push(`_No messages_`);
  } else {
    for (const m of recent) {
      const when = m.createdAt.toISOString().replace("T", " ").slice(0, 16);
      const attachmentNote =
        m.attachmentCount > 0
          ? ` _(${m.attachmentCount} attachment${m.attachmentCount === 1 ? "" : "s"})_`
          : "";
      const body = m.body.trim()
        ? truncate(m.body, MAX_BODY_CHARS)
        : "_ (attachment only)_";
      lines.push(`**${m.authorName}** · ${when} UTC${attachmentNote}`);
      lines.push(``);
      lines.push(body);
      lines.push(``);
    }
  }

  return {
    title: input.title.slice(0, 255),
    description: lines.join("\n").trim(),
  };
}

export function appOriginFromEnv() {
  return (
    process.env.AUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}
