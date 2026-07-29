"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGitLabProjectAction,
  syncGitLabProjectMembersAction,
} from "@/lib/actions/gitlab";

export type ThreadGitLabProject = {
  id: number;
  path: string;
  url: string;
};

export function CreateGitLabProjectButton({
  threadId,
  threadTitle,
  configured,
  connected,
  disabledReason,
  project,
}: {
  threadId: string;
  threadTitle: string;
  configured: boolean;
  connected: boolean;
  disabledReason?: string;
  project: ThreadGitLabProject | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);

  if (project) {
    return (
      <div className="flex items-center gap-1">
        <a
          href={project.url}
          target="_blank"
          rel="noreferrer"
          className="max-w-[10rem] truncate rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground"
          title={project.path}
        >
          {project.path.split("/").pop() || "Project"}
        </a>
        <button
          type="button"
          disabled={pending || !connected}
          title="Add linked GitLab participants as Developers"
          className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
          onClick={() => {
            setSyncError(null);
            startTransition(async () => {
              try {
                await syncGitLabProjectMembersAction(threadId);
                router.refresh();
              } catch (e) {
                setSyncError(
                  e instanceof Error ? e.message : "Failed to sync members",
                );
              }
            });
          }}
        >
          {pending ? "…" : "Sync"}
        </button>
        {syncError ? (
          <span className="max-w-[8rem] truncate text-xs text-danger" title={syncError}>
            !
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!configured || !connected}
        title={
          configured && connected
            ? "Create a private GitLab project for this thread"
            : disabledReason || "Connect GitLab to enable"
        }
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        GitLab project
      </button>
      <CreateGitLabProjectModal
        threadId={threadId}
        threadTitle={threadTitle}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function CreateGitLabProjectModal({
  threadId,
  threadTitle,
  open,
  onClose,
}: {
  threadId: string;
  threadTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(threadTitle);
  const [path, setPath] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCreatedUrl(null);
    setName(threadTitle);
    setPath("");
  }, [open, threadTitle]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
              Create GitLab project
            </h2>
            <p className="mt-1 text-sm text-muted">
              Private project in your personal namespace. Linked participants are
              added as Developers.
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

        {createdUrl ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">Project created. A link was posted in chat.</p>
            <a
              href={createdUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm font-medium text-accent hover:underline"
            >
              {createdUrl}
            </a>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.refresh();
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  formData.set("name", name);
                  formData.set("path", path);
                  const result = await createGitLabProjectAction(
                    threadId,
                    formData,
                  );
                  setCreatedUrl(result.webUrl);
                  router.refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Failed to create project",
                  );
                }
              });
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={255}
                disabled={pending}
                className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">
                Path{" "}
                <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                name="path"
                value={path}
                onChange={(e) => setPath(e.target.value.toLowerCase())}
                placeholder="auto-from-name"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                disabled={pending}
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none ring-accent focus:ring-2 disabled:opacity-60"
              />
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
                disabled={pending || !name.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
