"use client";

import { useState } from "react";
import { TaskPanel } from "@/components/thread-view";

type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  assignee: { id: string; name: string } | null;
};

type ParticipantRow = {
  user: { id: string; name: string; email: string };
};

export function TasksDock({
  threadId,
  tasks,
  currentUserId,
  participants,
}: {
  threadId: string;
  tasks: TaskRow[];
  currentUserId: string;
  participants: ParticipantRow[];
}) {
  const [pinned, setPinned] = useState(false);
  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <aside
      className={[
        "group/tasks relative z-20 flex h-full shrink-0 flex-col border-l border-border bg-surface transition-[width] duration-200 ease-out",
        pinned ? "w-80" : "w-14 hover:w-80",
      ].join(" ")}
    >
      <div className="flex h-12 items-center justify-between gap-2 overflow-hidden border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span
            className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-foreground"
            title="Tasks"
          >
            <ChecklistIcon />
            {openCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#f23f43] text-[10px] font-semibold text-white">
                {openCount > 9 ? "9+" : openCount}
              </span>
            ) : null}
          </span>
          <div
            className={[
              "min-w-0 transition-opacity duration-200",
              pinned
                ? "opacity-100"
                : "opacity-0 group-hover/tasks:opacity-100",
            ].join(" ")}
          >
            <p className="truncate text-sm font-semibold">Tasks</p>
            <p className="truncate text-xs text-muted">
              {openCount} open · /task in chat
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          className={[
            "shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground transition-opacity duration-200",
            pinned
              ? "opacity-100"
              : "opacity-0 group-hover/tasks:opacity-100",
          ].join(" ")}
          title={pinned ? "Collapse dock" : "Keep dock open"}
        >
          {pinned ? "Unpin" : "Pin"}
        </button>
      </div>

      <div
        className={[
          "min-h-0 flex-1 overflow-hidden transition-opacity duration-200",
          pinned
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover/tasks:pointer-events-auto group-hover/tasks:opacity-100",
        ].join(" ")}
      >
        <TaskPanel
          threadId={threadId}
          tasks={tasks}
          currentUserId={currentUserId}
          participants={participants}
          compact
        />
      </div>
    </aside>
  );
}

function ChecklistIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
