"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGitLabIssueAction,
  getGitLabIssueDraftAction,
} from "@/lib/actions/gitlab";

export function CreateGitLabIssueButton({
  threadId,
  configured,
  disabledReason,
  existingIssue,
}: {
  threadId: string;
  configured: boolean;
  disabledReason?: string;
  existingIssue: { iid: number; url: string } | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {existingIssue ? (
          <a
            href={existingIssue.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground"
            title="Open latest GitLab issue"
          >
            #{existingIssue.iid}
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!configured}
          title={
            configured
              ? "Create a GitLab issue from this thread"
              : disabledReason || "Connect GitLab to enable"
          }
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          GitLab issue
        </button>
      </div>
      <CreateGitLabIssueModal
        threadId={threadId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function CreateGitLabIssueModal({
  threadId,
  open,
  onClose,
}: {
  threadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCreatedUrl(null);
    setLoadingDraft(true);
    let cancelled = false;
    void (async () => {
      try {
        const draft = await getGitLabIssueDraftAction(threadId);
        if (cancelled) return;
        setTitle(draft.title);
        setDescription(draft.description);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load draft");
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

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
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Create GitLab issue
            </h2>
            <p className="mt-1 text-sm text-muted">
              Manual export only — review the title and description, then create.
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
            <p className="text-sm text-foreground">
              Issue created. A link was also posted in the thread.
            </p>
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
            className="flex min-h-0 flex-1 flex-col gap-4"
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  formData.set("title", title);
                  formData.set("description", description);
                  const result = await createGitLabIssueAction(
                    threadId,
                    formData,
                  );
                  setCreatedUrl(result.webUrl);
                  router.refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Failed to create issue",
                  );
                }
              });
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Title</span>
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={255}
                disabled={loadingDraft || pending}
                className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium">Description</span>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={14}
                disabled={loadingDraft || pending}
                className="min-h-48 resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none ring-accent focus:ring-2 disabled:opacity-60"
              />
            </label>

            {loadingDraft ? (
              <p className="text-sm text-muted">Generating draft…</p>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex shrink-0 justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  pending ||
                  loadingDraft ||
                  !title.trim() ||
                  !description.trim()
                }
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create issue"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
