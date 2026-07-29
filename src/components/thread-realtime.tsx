"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ThreadRealtime({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );

  useEffect(() => {
    const source = new EventSource(`/api/threads/${threadId}/events`);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      // Coalesce bursts (e.g. message + task from /task)
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        router.refresh();
      }, 50);
    };

    source.addEventListener("ready", () => {
      setStatus("live");
    });

    source.addEventListener("thread", () => {
      setStatus("live");
      scheduleRefresh();
    });

    source.onerror = () => {
      setStatus("offline");
    };

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      source.close();
    };
  }, [threadId, router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      title={
        status === "live"
          ? "Realtime connected"
          : status === "connecting"
            ? "Connecting…"
            : "Realtime disconnected — retrying"
      }
    >
      <span
        className={[
          "size-2 rounded-full",
          status === "live"
            ? "bg-green-500"
            : status === "connecting"
              ? "bg-amber-400"
              : "bg-red-400",
        ].join(" ")}
      />
      {status === "live" ? "Live" : status === "connecting" ? "…" : "Offline"}
    </span>
  );
}
