import Link from "next/link";
import { createThreadAction } from "@/lib/actions/threads";
import { StatusBadge } from "@/components/status-badge";
import type { ThreadStatus } from "@/generated/prisma/enums";

export type ThreadListItem = {
  id: string;
  title: string;
  status: ThreadStatus;
  updatedAt: Date;
  openTaskCount: number;
  messageCount: number;
};

export function ThreadList({ threads }: { threads: ThreadListItem[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <CreateThreadCard />
      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Your threads</h2>
          <p className="text-sm text-muted">
            Work packets you participate in
          </p>
        </div>
        {threads.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            No threads yet. Create one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/threads/${thread.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-3 transition hover:bg-background"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{thread.title}</p>
                      <StatusBadge status={thread.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Updated {formatRelative(thread.updatedAt)} ·{" "}
                      {thread.messageCount} message
                      {thread.messageCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {thread.openTaskCount > 0 ? (
                    <span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs font-medium text-muted">
                      {thread.openTaskCount} open task
                      {thread.openTaskCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateThreadCard() {
  return (
    <section className="h-fit rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">New thread</h2>
      <p className="mt-1 text-sm text-muted">
        Start a work packet. You&apos;ll be added as a participant.
      </p>
      <form action={createThreadAction} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            placeholder="Prod: Python venv won't populate"
            className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">First message (optional)</span>
          <textarea
            name="firstMessage"
            rows={4}
            maxLength={5000}
            placeholder="Context, links, logs…"
            className="resize-y rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Create thread
        </button>
      </form>
    </section>
  );
}

function formatRelative(date: Date) {
  const delta = Date.now() - date.getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
