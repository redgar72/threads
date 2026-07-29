"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ThreadStatus } from "@/generated/prisma/enums";
import { updateThreadStatusAction } from "@/lib/actions/threads";
import { STATUS_OPTIONS, StatusBadge } from "@/components/status-badge";

export function ThreadStatusSelect({
  threadId,
  status,
}: {
  threadId: string;
  status: ThreadStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} />
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as ThreadStatus;
          startTransition(async () => {
            await updateThreadStatusAction(threadId, next);
            router.refresh();
          });
        }}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none ring-accent focus:ring-2"
      >
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
