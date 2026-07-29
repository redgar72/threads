"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  assignTaskToSelfAction,
  createTaskAction,
  inviteParticipantAction,
  postMessageAction,
  toggleTaskDoneAction,
} from "@/lib/actions/threads";
import { formatBytes, linkifyText } from "@/lib/linkify";

type AttachmentRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

type MessageRow = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
  attachments: AttachmentRow[];
};

type TaskRow = {
  id: string;
  title: string;
  done: boolean;
  assignee: { id: string; name: string } | null;
};

type ParticipantRow = {
  user: { id: string; name: string; email: string };
};

type MentionCandidate = {
  id: string;
  name: string;
  handle: string;
};

type PendingUpload = {
  localId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  attachmentId?: string;
  error?: string;
};

function handleFromEmail(email: string) {
  return email.split("@")[0] ?? email;
}

function getMentionQuery(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = before.match(/(^|[\s([{])@([a-zA-Z0-9._-]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = before.length - query.length - 1;
  return { start, query };
}

export function MessageComposer({
  threadId,
  participants,
}: {
  threadId: string;
  participants: ParticipantRow[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);

  const candidates = useMemo<MentionCandidate[]>(
    () =>
      participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        handle: handleFromEmail(p.user.email),
      })),
    [participants],
  );

  const mention = useMemo(
    () => getMentionQuery(value, caret),
    [value, caret],
  );

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return candidates.filter(
      (c) =>
        c.handle.toLowerCase().startsWith(q) ||
        c.name.toLowerCase().includes(q),
    );
  }, [candidates, mention]);

  useEffect(() => {
    setMenuOpen(Boolean(mention) && filtered.length > 0);
    setActiveIndex(0);
  }, [mention, filtered.length]);

  useEffect(() => {
    return () => {
      for (const u of uploads) {
        if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
      }
    };
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);

      const staged: PendingUpload[] = files.map((file) => ({
        localId: crypto.randomUUID(),
        filename: file.name || "paste",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
        status: "uploading" as const,
      }));

      setUploads((prev) => [...prev, ...staged]);

      await Promise.all(
        staged.map(async (item, index) => {
          const file = files[index]!;
          try {
            const body = new FormData();
            body.set("file", file, file.name || item.filename);
            const res = await fetch(`/api/threads/${threadId}/attachments`, {
              method: "POST",
              body,
            });
            const raw = await res.text();
            let data: { id?: string; error?: string } = {};
            try {
              data = raw ? (JSON.parse(raw) as { id?: string; error?: string }) : {};
            } catch {
              throw new Error(
                res.ok
                  ? "Upload returned an invalid response"
                  : `Upload failed (${res.status})`,
              );
            }
            if (!res.ok || !data.id) {
              throw new Error(data.error || `Upload failed (${res.status})`);
            }
            setUploads((prev) =>
              prev.map((u) =>
                u.localId === item.localId
                  ? { ...u, status: "ready", attachmentId: data.id }
                  : u,
              ),
            );
          } catch (e) {
            setUploads((prev) =>
              prev.map((u) =>
                u.localId === item.localId
                  ? {
                      ...u,
                      status: "error",
                      error: e instanceof Error ? e.message : "Upload failed",
                    }
                  : u,
              ),
            );
          }
        }),
      );
    },
    [threadId],
  );

  const applyMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mention || !inputRef.current) return;
      const before = value.slice(0, mention.start);
      const after = value.slice(caret);
      const insertion = `@${candidate.handle} `;
      const next = `${before}${insertion}${after}`;
      const nextCaret = before.length + insertion.length;
      setValue(next);
      setMenuOpen(false);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [caret, mention, value],
  );

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!menuOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      applyMention(filtered[activeIndex] ?? filtered[0]!);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMenuOpen(false);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    void uploadFiles(files);
  }

  const readyIds = uploads
    .filter((u) => u.status === "ready" && u.attachmentId)
    .map((u) => u.attachmentId!);
  const uploading = uploads.some((u) => u.status === "uploading");
  const canSend =
    !pending &&
    !uploading &&
    (value.trim().length > 0 || readyIds.length > 0);

  return (
    <form
      ref={formRef}
      className="border-t border-border p-3"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            formData.set("body", value);
            formData.set("attachmentIds", JSON.stringify(readyIds));
            await postMessageAction(threadId, formData);
            formRef.current?.reset();
            setValue("");
            setMenuOpen(false);
            for (const u of uploads) {
              if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
            }
            setUploads([]);
            router.refresh();
          } catch (err) {
            if (isRedirectError(err)) throw err;
            setError(err instanceof Error ? err.message : "Failed to send");
          }
        });
      }}
    >
      {uploads.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {uploads.map((u) => (
            <li
              key={u.localId}
              className="relative flex max-w-[180px] flex-col overflow-hidden rounded-lg border border-border bg-background"
            >
              {u.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.previewUrl}
                  alt={u.filename}
                  className="h-24 w-full object-cover"
                />
              ) : (
                <div className="flex h-24 items-center justify-center px-2 text-center text-xs text-muted">
                  {u.mimeType.startsWith("video/")
                    ? "Video"
                    : u.mimeType.startsWith("audio/")
                      ? "Audio"
                      : "File"}
                </div>
              )}
              <div className="truncate px-2 py-1 text-[11px]" title={u.filename}>
                {u.filename}
              </div>
              <div className="px-2 pb-1 text-[10px] text-muted">
                {u.status === "uploading"
                  ? "Uploading…"
                  : u.status === "error"
                    ? u.error || "Failed"
                    : formatBytes(u.sizeBytes)}
              </div>
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
                onClick={() => {
                  setUploads((prev) => {
                    const target = prev.find((x) => x.localId === u.localId);
                    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
                    return prev.filter((x) => x.localId !== u.localId);
                  });
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={[
          "relative flex gap-2 rounded-xl p-1 transition",
          dragging ? "bg-accent/10 ring-2 ring-accent" : "",
        ].join(" ")}
      >
        {menuOpen ? (
          <ul
            className="absolute bottom-full left-0 z-20 mb-2 max-h-48 w-72 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
            role="listbox"
          >
            {filtered.map((c, index) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    index === activeIndex
                      ? "bg-accent text-white"
                      : "hover:bg-background",
                  ].join(" ")}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyMention(c);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="font-medium">@{c.handle}</span>
                  <span
                    className={
                      index === activeIndex ? "text-white/80" : "text-muted"
                    }
                  >
                    {c.name}
                  </span>
                </button>
              </li>
            ))}
            <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
              Tab or Enter to complete
            </li>
          </ul>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.gif,.pdf,.zip,.json,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void uploadFiles(files);
          }}
        />

        <button
          type="button"
          title="Attach files"
          className="rounded-lg border border-border px-3 py-3 text-sm hover:bg-background"
          onClick={() => fileInputRef.current?.click()}
        >
          +
        </button>

        <input
          ref={inputRef}
          name="body"
          value={value}
          placeholder={
            dragging
              ? "Drop files to upload…"
              : "Message, paste files, /task @user1 …"
          }
          className="flex-1 rounded-lg border border-border bg-background px-3 py-3 outline-none ring-accent focus:ring-2"
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyUp={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length > 0) {
              e.preventDefault();
              void uploadFiles(files);
            }
          }}
          onBlur={() => {
            setTimeout(() => setMenuOpen(false), 150);
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          Send
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Paste or drop images, GIFs, video, audio, and files. Links in messages
        are clickable.{" "}
        <code className="rounded bg-background px-1">/task</code> ·{" "}
        <code className="rounded bg-background px-1">/leave</code>
      </p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

function AttachmentGallery({ attachments }: { attachments: AttachmentRow[] }) {
  if (attachments.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-col gap-2">
      {attachments.map((file) => {
        if (file.mimeType.startsWith("image/")) {
          return (
            <li key={file.id}>
              <a href={file.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.filename}
                  className="max-h-80 max-w-full rounded-lg border border-border object-contain"
                />
              </a>
            </li>
          );
        }
        if (file.mimeType.startsWith("video/")) {
          return (
            <li key={file.id}>
              <video
                src={file.url}
                controls
                className="max-h-96 max-w-full rounded-lg border border-border"
              />
              <p className="mt-1 text-xs text-muted">{file.filename}</p>
            </li>
          );
        }
        if (file.mimeType.startsWith("audio/")) {
          return (
            <li
              key={file.id}
              className="rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="mb-1 text-xs text-muted">{file.filename}</p>
              <audio src={file.url} controls className="w-full max-w-md" />
            </li>
          );
        }
        return (
          <li key={file.id}>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-background"
            >
              <span className="font-medium">{file.filename}</span>
              <span className="text-xs text-muted">
                {formatBytes(file.sizeBytes)}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function MessageFeed({ messages }: { messages: MessageRow[] }) {
  if (messages.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted">
        No messages yet. Paste a screenshot or start typing.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {messages.map((message) => {
        const isTaskCommand = /(^|\s)\/task(?=\s|$)/i.test(message.body);
        const isLeaveNote = /left the thread\.$/i.test(message.body);
        return (
          <li
            key={message.id}
            className={[
              "rounded-lg px-3 py-2",
              isTaskCommand
                ? "border border-accent/20 bg-blue-50"
                : isLeaveNote
                  ? "bg-background/60 text-muted italic"
                  : "bg-background",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{message.author.name}</span>
              <time
                className="text-xs text-muted"
                dateTime={message.createdAt.toISOString()}
                suppressHydrationWarning
              >
                {message.createdAt.toLocaleString()}
              </time>
            </div>
            {message.body ? (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {linkifyText(message.body)}
              </p>
            ) : null}
            <AttachmentGallery attachments={message.attachments} />
          </li>
        );
      })}
    </ul>
  );
}

export function TaskPanel({
  threadId,
  tasks,
  currentUserId,
  participants,
  compact = false,
}: {
  threadId: string;
  tasks: TaskRow[];
  currentUserId: string;
  participants: ParticipantRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      {!compact ? (
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold">Tasks</h2>
            <p className="text-xs text-muted">Or create via chat with /task</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
          >
            {showForm ? "Cancel" : "Add task"}
          </button>
        </div>
      ) : (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
          >
            {showForm ? "Cancel" : "Add task"}
          </button>
        </div>
      )}

      {showForm ? (
        <form
          ref={formRef}
          className="space-y-2 border-b border-border p-3"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await createTaskAction(threadId, formData);
                formRef.current?.reset();
                setShowForm(false);
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Failed to create task",
                );
              }
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Title</span>
            <input
              name="title"
              required
              placeholder="What needs doing?"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Assignee</span>
            <select
              name="assigneeId"
              defaultValue=""
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            >
              <option value="">Unassigned</option>
              {participants.map((p) => (
                <option key={p.user.id} value={p.user.id}>
                  {p.user.name}
                  {p.user.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            Create task
          </button>
        </form>
      ) : null}

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted">No tasks yet</li>
        ) : (
          tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-lg border border-border bg-background p-2"
            >
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.done}
                  className="mt-0.5"
                  onChange={() => {
                    startTransition(async () => {
                      await toggleTaskDoneAction(task.id);
                      router.refresh();
                    });
                  }}
                />
                <span className={task.done ? "text-muted line-through" : ""}>
                  {task.title}
                </span>
              </label>
              <div className="mt-2 flex items-center justify-between gap-2 pl-6 text-xs text-muted">
                <span>
                  {task.assignee
                    ? `Assigned: ${task.assignee.name}`
                    : "Unassigned"}
                </span>
                {task.assignee?.id !== currentUserId ? (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={() => {
                      startTransition(async () => {
                        await assignTaskToSelfAction(task.id);
                        router.refresh();
                      });
                    }}
                  >
                    Assign to me
                  </button>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type InviteableUser = {
  id: string;
  name: string;
  email: string;
};

export function InviteForm({
  threadId,
  users,
  compact = false,
}: {
  threadId: string;
  users: InviteableUser[];
  compact?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  if (users.length === 0) {
    return compact ? null : (
      <p className="text-sm text-muted">Everyone is already in this thread.</p>
    );
  }

  return (
    <form
      ref={formRef}
      className={
        compact
          ? "flex items-center gap-1.5"
          : "flex flex-wrap items-end gap-2"
      }
      action={(formData) => {
        startTransition(async () => {
          await inviteParticipantAction(threadId, formData);
          formRef.current?.reset();
          router.refresh();
        });
      }}
    >
      <label
        className={
          compact
            ? "flex items-center gap-1.5 text-xs"
            : "flex min-w-[220px] flex-1 flex-col gap-1 text-sm"
        }
      >
        {!compact ? <span className="font-medium">Invite user</span> : null}
        <select
          name="userId"
          required
          defaultValue=""
          className={
            compact
              ? "max-w-[160px] rounded-md border border-border bg-background px-2 py-1 text-xs outline-none ring-accent focus:ring-2"
              : "rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
          }
        >
          <option value="" disabled>
            {compact ? "Invite…" : "Select a user…"}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} (@{u.email.split("@")[0]})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className={
          compact
            ? "rounded-md border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-60"
            : "rounded-lg border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
        }
      >
        Invite
      </button>
    </form>
  );
}

export function ParticipantList({
  participants,
}: {
  participants: ParticipantRow[];
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {participants.map((p) => (
        <li
          key={p.user.id}
          className="rounded-full bg-background px-3 py-1 text-xs text-muted"
          title={p.user.email}
        >
          {p.user.name}{" "}
          <span className="text-foreground/50">
            @{p.user.email.split("@")[0]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RefreshHint() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="text-xs text-muted hover:text-foreground hover:underline"
    >
      Refresh
    </button>
  );
}
