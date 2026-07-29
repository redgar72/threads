import type { ThreadStatus } from "@/generated/prisma/enums";

const labels: Record<ThreadStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  ARCHIVED: "Archived",
};

const colors: Record<ThreadStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-900",
  BLOCKED: "bg-red-100 text-red-800",
  DONE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-700",
};

export function StatusBadge({ status }: { status: ThreadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export const STATUS_OPTIONS = Object.entries(labels) as [
  ThreadStatus,
  string,
][];
