"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { ThreadStatus } from "@/generated/prisma/enums";
import { STATUS_OPTIONS } from "@/components/status-badge";
import {
  leaveThreadAction,
  updateThreadSettingsAction,
} from "@/lib/actions/threads";

export type ThreadSettingsValue = {
  id: string;
  title: string;
  status: ThreadStatus;
};

export function ThreadSettingsModal({
  thread,
  open,
  onClose,
}: {
  thread: ThreadSettingsValue | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(thread?.title ?? "");
  const [status, setStatus] = useState<ThreadStatus>(thread?.status ?? "OPEN");

  useEffect(() => {
    if (!open || !thread) return;
    setTitle(thread.title);
    setStatus(thread.status);
    setError(null);
    const t = window.setTimeout(() => inputRef.current?.select(), 50);
    return () => window.clearTimeout(t);
  }, [open, thread]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !thread) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Thread settings
            </h2>
            <p className="mt-1 text-sm text-muted">
              Rename this chat and update its status.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-background hover:text-foreground"
            aria-label="Close"
          >
            Esc
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                formData.set("title", title);
                formData.set("status", status);
                await updateThreadSettingsAction(thread.id, formData);
                onClose();
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Failed to save settings",
                );
              }
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              ref={inputRef}
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Status</span>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ThreadStatus)}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
            >
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !title.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm font-medium text-danger">Danger zone</p>
          <p className="mt-1 text-xs text-muted">
            Leave this thread. You can be invited back later.
          </p>
          <button
            type="button"
            disabled={pending}
            className="mt-3 rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-red-50 disabled:opacity-60"
            onClick={() => {
              if (
                !window.confirm(
                  `Leave “${thread.title}”? You’ll lose access until invited again.`,
                )
              ) {
                return;
              }
              setError(null);
              startTransition(async () => {
                try {
                  await leaveThreadAction(thread.id);
                } catch (e) {
                  if (isRedirectError(e)) throw e;
                  setError(
                    e instanceof Error ? e.message : "Failed to leave thread",
                  );
                }
              });
            }}
          >
            Leave thread
          </button>
        </div>
      </div>
    </div>
  );
}

export function ThreadSettingsButton({
  thread,
}: {
  thread: ThreadSettingsValue;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background"
        title="Thread settings"
      >
        Settings
      </button>
      <ThreadSettingsModal
        thread={thread}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
