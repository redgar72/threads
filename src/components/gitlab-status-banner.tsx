"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function GitLabStatusBanner({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  const message = useMemo(() => {
    const status = first(params.gitlab);
    if (!status) return null;
    const detail = first(params.error);
    switch (status) {
      case "connected":
        return { tone: "ok" as const, text: "GitLab account connected." };
      case "denied":
        return {
          tone: "err" as const,
          text: `GitLab authorization was denied${detail ? `: ${detail}` : "."}`,
        };
      case "oauth_not_configured":
        return {
          tone: "err" as const,
          text: "GitLab OAuth is not configured on the server.",
        };
      case "bad_state":
      case "missing_code":
        return {
          tone: "err" as const,
          text: "GitLab connect failed (invalid OAuth state). Try again.",
        };
      case "error":
        return {
          tone: "err" as const,
          text: detail || "Failed to connect GitLab.",
        };
      default:
        return null;
    }
  }, [params]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => {
      setVisible(false);
      router.replace(pathname);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [message, pathname, router]);

  if (!message || !visible) return null;

  return (
    <div
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        message.tone === "ok"
          ? "border-green-200 bg-green-50 text-green-900"
          : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      {message.text}
    </div>
  );
}
