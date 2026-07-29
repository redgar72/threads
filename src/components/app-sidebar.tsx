"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { logoutAction } from "@/lib/actions/auth";
import { leaveThreadAction } from "@/lib/actions/threads";
import type { ThreadStatus } from "@/generated/prisma/enums";
import {
  ThreadSettingsModal,
  type ThreadSettingsValue,
} from "@/components/thread-settings-modal";
import {
  GitLabConnectControl,
  type GitLabSidebarStatus,
} from "@/components/gitlab-connect";

export type SidebarThread = {
  id: string;
  title: string;
  status: ThreadStatus;
  openTaskCount: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  thread: SidebarThread;
};

export function AppSidebar({
  userName,
  userEmail,
  threads,
  gitlab,
}: {
  userName: string;
  userEmail: string;
  threads: SidebarThread[];
  gitlab: GitLabSidebarStatus;
}) {
  const pathname = usePathname();
  const initials = getInitials(userName || userEmail);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [settingsThread, setSettingsThread] =
    useState<ThreadSettingsValue | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaving, startLeave] = useTransition();

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function openSettings(thread: SidebarThread) {
    setSettingsThread({
      id: thread.id,
      title: thread.title,
      status: thread.status,
    });
    setSettingsOpen(true);
    setMenu(null);
  }

  return (
    <>
      <aside className="sidebar-rail group/sidebar relative z-30 flex h-full w-16 shrink-0 flex-col border-r border-border bg-[#1e1f22] text-[#dbdee1] transition-[width] duration-200 ease-out hover:w-60">
        <div className="flex h-14 items-center gap-3 overflow-hidden border-b border-white/10 px-3">
          <Link
            href="/"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-white transition hover:rounded-xl"
            title="Work Threads"
          >
            WT
          </Link>
          <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
            <p className="truncate text-sm font-semibold text-white">
              Work Threads
            </p>
            <p className="truncate text-xs text-[#949ba4]">Your workspace</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2">
          <SidebarLink
            href="/"
            active={pathname === "/"}
            icon={<HashIcon />}
            label="All threads"
          />

          <div className="my-2 flex items-center gap-2 px-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#949ba4] opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
              Threads
            </span>
            <div className="h-px flex-1 bg-white/10 opacity-0 group-hover/sidebar:opacity-100" />
          </div>

          {threads.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[#949ba4] opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
              No threads yet
            </p>
          ) : (
            threads.map((thread) => {
              const active = pathname === `/threads/${thread.id}`;
              return (
                <SidebarLink
                  key={thread.id}
                  href={`/threads/${thread.id}`}
                  active={active}
                  icon={
                    <span className="text-[11px] font-semibold">
                      {getInitials(thread.title)}
                    </span>
                  }
                  label={thread.title}
                  badge={
                    thread.openTaskCount > 0 ? thread.openTaskCount : undefined
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const pad = 8;
                    const menuW = 180;
                    const menuH = 120;
                    const x = Math.min(
                      e.clientX,
                      window.innerWidth - menuW - pad,
                    );
                    const y = Math.min(
                      e.clientY,
                      window.innerHeight - menuH - pad,
                    );
                    setMenu({ x, y, thread });
                  }}
                />
              );
            })
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-1 overflow-hidden border-t border-white/10 p-2">
          <div className="px-1">
            <GitLabConnectControl status={gitlab} />
          </div>
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-xs font-semibold text-white"
              title={userName}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
              <p className="truncate text-sm font-medium text-white">
                {userName}
              </p>
              <p className="truncate text-xs text-[#949ba4]">{userEmail}</p>
            </div>
            <form
              action={logoutAction}
              className="shrink-0 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100"
            >
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-xs text-[#949ba4] hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                Out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {menu ? (
        <div
          className="fixed z-[60] min-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-[#111214] py-1 text-sm text-[#dbdee1] shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left hover:bg-[#5865f2] hover:text-white"
            onClick={() => openSettings(menu.thread)}
          >
            Rename / settings
          </button>
          <Link
            href={`/threads/${menu.thread.id}`}
            role="menuitem"
            className="flex w-full px-3 py-2 text-left hover:bg-[#5865f2] hover:text-white"
            onClick={() => setMenu(null)}
          >
            Open thread
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={leaving}
            className="flex w-full px-3 py-2 text-left text-[#f23f43] hover:bg-[#f23f43] hover:text-white disabled:opacity-60"
            onClick={() => {
              const thread = menu.thread;
              if (
                !window.confirm(
                  `Leave “${thread.title}”? You’ll lose access until invited again.`,
                )
              ) {
                setMenu(null);
                return;
              }
              setMenu(null);
              startLeave(async () => {
                try {
                  await leaveThreadAction(thread.id);
                } catch (e) {
                  if (isRedirectError(e)) throw e;
                }
              });
            }}
          >
            Leave thread
          </button>
        </div>
      ) : null}

      <ThreadSettingsModal
        thread={settingsThread}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  label,
  badge,
  onContextMenu,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      title={label}
      onContextMenu={onContextMenu}
      className={[
        "flex items-center gap-3 overflow-hidden rounded-lg px-1.5 py-1.5 transition",
        active
          ? "bg-white/10 text-white"
          : "text-[#dbdee1] hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-accent text-white" : "bg-white/5",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
        {label}
      </span>
      {badge != null ? (
        <span className="shrink-0 rounded-full bg-[#f23f43] px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function HashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
