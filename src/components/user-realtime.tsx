"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps the sidebar / thread list fresh when you're invited or threads change. */
export function UserRealtime() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/me/events");
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        router.refresh();
      }, 50);
    };

    source.addEventListener("user", () => {
      scheduleRefresh();
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      source.close();
    };
  }, [router]);

  return null;
}
