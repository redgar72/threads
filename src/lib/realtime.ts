import "server-only";

import { prisma } from "@/lib/prisma";

export type ThreadRealtimeEvent = {
  threadId: string;
  type: "message" | "task" | "thread" | "participant";
  at: string;
};

export type UserRealtimeEvent = {
  userId: string;
  type: "threads";
  threadId?: string;
  at: string;
};

export const THREAD_EVENTS_CHANNEL = "thread_events";
export const USER_EVENTS_CHANNEL = "user_events";

export async function publishThreadEvent(
  event: Omit<ThreadRealtimeEvent, "at">,
) {
  const full: ThreadRealtimeEvent = {
    ...event,
    at: new Date().toISOString(),
  };

  await prisma.$executeRaw`SELECT pg_notify(${THREAD_EVENTS_CHANNEL}, ${JSON.stringify(full)})`;
}

export async function publishUserEvent(
  event: Omit<UserRealtimeEvent, "at">,
) {
  const full: UserRealtimeEvent = {
    ...event,
    at: new Date().toISOString(),
  };

  await prisma.$executeRaw`SELECT pg_notify(${USER_EVENTS_CHANNEL}, ${JSON.stringify(full)})`;
}

/** Refresh sidebars / home lists for everyone in a thread. */
export async function notifyThreadParticipants(
  threadId: string,
  opts?: { excludeUserId?: string },
) {
  const participants = await prisma.threadParticipant.findMany({
    where: { threadId },
    select: { userId: true },
  });

  await Promise.all(
    participants
      .filter((p) => p.userId !== opts?.excludeUserId)
      .map((p) =>
        publishUserEvent({
          userId: p.userId,
          type: "threads",
          threadId,
        }),
      ),
  );
}
