"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGitLabAction } from "@/lib/actions/gitlab";

export type GitLabSidebarStatus = {
  /** OAuth app env is present (user can connect). */
  exportConfigured: boolean;
  username: string | null;
};

export function GitLabConnectControl({ status }: { status: GitLabSidebarStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!status.exportConfigured) {
    return (
      <p
        className="truncate px-1 text-[10px] leading-tight text-[#949ba4]"
        title="Server is missing GITLAB_OAUTH_CLIENT_ID / GITLAB_OAUTH_CLIENT_SECRET"
      >
        GitLab OAuth not set
      </p>
    );
  }

  if (status.username) {
    return (
      <div className="flex min-w-0 items-center gap-1 px-1">
        <span
          className="truncate text-[10px] text-[#949ba4]"
          title={`Connected as @${status.username}`}
        >
          GL @{status.username}
        </span>
        <button
          type="button"
          disabled={pending}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-[#949ba4] hover:bg-white/10 hover:text-white disabled:opacity-50"
          title="Disconnect GitLab"
          onClick={() => {
            startTransition(async () => {
              await disconnectGitLabAction();
              router.refresh();
            });
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/gitlab/oauth/start"
      className="mx-1 block truncate rounded-md bg-accent/20 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/30 hover:underline"
      title="Connect GitLab to create projects and issues as yourself"
    >
      Connect GitLab
    </a>
  );
}
