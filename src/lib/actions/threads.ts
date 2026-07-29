"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ThreadStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  isLeaveCommand,
  matchesMentionHandle,
  parseTaskCommand,
} from "@/lib/task-command";
import {
  notifyThreadParticipants,
  publishThreadEvent,
  publishUserEvent,
} from "@/lib/realtime";

async function assertParticipant(threadId: string, userId: string) {
  const participant = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participant) {
    throw new Error("Not a participant of this thread");
  }
}

async function resolveMentionInThread(threadId: string, handle: string) {
  const participants = await prisma.threadParticipant.findMany({
    where: { threadId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const match = participants.find((p) =>
    matchesMentionHandle(handle, p.user),
  );
  return match?.user ?? null;
}

const createThreadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  firstMessage: z.string().trim().max(5000).optional(),
});

export async function createThreadAction(formData: FormData) {
  const user = await requireUser();
  const parsed = createThreadSchema.safeParse({
    title: formData.get("title"),
    firstMessage: formData.get("firstMessage") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const thread = await prisma.thread.create({
    data: {
      title: parsed.data.title,
      participants: {
        create: { userId: user.id },
      },
      ...(parsed.data.firstMessage
        ? {
            messages: {
              create: {
                body: parsed.data.firstMessage,
                authorId: user.id,
              },
            },
          }
        : {}),
    },
  });

  revalidatePath("/");
  redirect(`/threads/${thread.id}`);
}

export async function updateThreadStatusAction(
  threadId: string,
  status: ThreadStatus,
) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  await prisma.thread.update({
    where: { id: threadId },
    data: { status },
  });

  await publishThreadEvent({ threadId, type: "thread" });
  await notifyThreadParticipants(threadId);
  revalidatePath("/");
  revalidatePath(`/threads/${threadId}`);
}

const threadSettingsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "BLOCKED",
    "DONE",
    "ARCHIVED",
  ]),
});

export async function updateThreadSettingsAction(
  threadId: string,
  formData: FormData,
) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  const parsed = threadSettingsSchema.safeParse({
    title: formData.get("title"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid settings");
  }

  await prisma.thread.update({
    where: { id: threadId },
    data: {
      title: parsed.data.title,
      status: parsed.data.status,
    },
  });

  await publishThreadEvent({ threadId, type: "thread" });
  await notifyThreadParticipants(threadId);
  revalidatePath("/");
  revalidatePath(`/threads/${threadId}`);
}

const messageSchema = z.object({
  body: z.string().max(5000),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
});

export async function postMessageAction(threadId: string, formData: FormData) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  let attachmentIds: string[] = [];
  const rawIds = String(formData.get("attachmentIds") ?? "").trim();
  if (rawIds) {
    try {
      const parsedIds = JSON.parse(rawIds) as unknown;
      if (Array.isArray(parsedIds)) {
        attachmentIds = parsedIds.filter((id): id is string => typeof id === "string");
      }
    } catch {
      throw new Error("Invalid attachments payload");
    }
  }

  const parsed = messageSchema.safeParse({
    body: String(formData.get("body") ?? ""),
    attachmentIds,
  });
  if (!parsed.success) {
    throw new Error("Invalid message");
  }

  const body = parsed.data.body.trim();
  attachmentIds = parsed.data.attachmentIds;

  if (!body && attachmentIds.length === 0) {
    throw new Error("Message cannot be empty");
  }

  if (isLeaveCommand(body)) {
    await leaveThreadForUser(threadId, user.id, user.name ?? "Someone");
    redirect("/");
  }

  const command = body ? parseTaskCommand(body) : null;

  if (command) {
    if (!command.title) {
      throw new Error("Add a task title, e.g. /task @user1 fix the proxy");
    }

    let assigneeId: string | null = null;
    if (command.mention) {
      const assignee = await resolveMentionInThread(threadId, command.mention);
      if (!assignee) {
        throw new Error(
          `No thread participant matches @${command.mention}. Invite them first.`,
        );
      }
      assigneeId = assignee.id;
    }

    await prisma.$transaction([
      prisma.task.create({
        data: {
          threadId,
          title: command.title,
          assigneeId,
        },
      }),
      prisma.message.create({
        data: {
          threadId,
          authorId: user.id,
          body,
        },
      }),
      prisma.thread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      }),
    ]);

    await publishThreadEvent({ threadId, type: "message" });
    await publishThreadEvent({ threadId, type: "task" });
    revalidatePath(`/threads/${threadId}`);
    revalidatePath("/");
    return;
  }

  if (attachmentIds.length > 0) {
    const owned = await prisma.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        threadId,
        uploaderId: user.id,
        messageId: null,
      },
      select: { id: true },
    });
    if (owned.length !== attachmentIds.length) {
      throw new Error("One or more attachments are invalid");
    }
  }

  const message = await prisma.message.create({
    data: {
      threadId,
      authorId: user.id,
      body,
      ...(attachmentIds.length > 0
        ? {
            attachments: {
              connect: attachmentIds.map((id) => ({ id })),
            },
          }
        : {}),
    },
  });

  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  void message;

  await publishThreadEvent({ threadId, type: "message" });
  revalidatePath(`/threads/${threadId}`);
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  assigneeId: z.string().optional(),
});

export async function createTaskAction(threadId: string, formData: FormData) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  const rawAssignee = String(formData.get("assigneeId") ?? "").trim();
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    assigneeId: rawAssignee || undefined,
  });
  if (!parsed.success) {
    throw new Error("Task title is required");
  }

  const assigneeId = parsed.data.assigneeId ?? null;

  if (assigneeId) {
    await assertParticipant(threadId, assigneeId);
  }

  await prisma.task.create({
    data: {
      threadId,
      title: parsed.data.title,
      assigneeId,
    },
  });

  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  await publishThreadEvent({ threadId, type: "task" });
  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/");
}

export async function toggleTaskDoneAction(taskId: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  await assertParticipant(task.threadId, user.id);

  await prisma.task.update({
    where: { id: taskId },
    data: { done: !task.done },
  });

  await publishThreadEvent({ threadId: task.threadId, type: "task" });
  revalidatePath(`/threads/${task.threadId}`);
  revalidatePath("/");
}

export async function assignTaskToSelfAction(taskId: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");
  await assertParticipant(task.threadId, user.id);

  await prisma.task.update({
    where: { id: taskId },
    data: { assigneeId: user.id },
  });

  await publishThreadEvent({ threadId: task.threadId, type: "task" });
  revalidatePath(`/threads/${task.threadId}`);
}

export async function inviteParticipantAction(
  threadId: string,
  formData: FormData,
) {
  const user = await requireUser();
  await assertParticipant(threadId, user.id);

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("Select a user to invite");

  const invitee = await prisma.user.findUnique({ where: { id: userId } });
  if (!invitee) throw new Error("User not found");

  await prisma.threadParticipant.upsert({
    where: {
      threadId_userId: { threadId, userId: invitee.id },
    },
    create: { threadId, userId: invitee.id },
    update: {},
  });

  await publishThreadEvent({ threadId, type: "participant" });
  // Invitee needs their sidebar to pick up the new chat without a manual refresh.
  await publishUserEvent({
    userId: invitee.id,
    type: "threads",
    threadId,
  });
  await notifyThreadParticipants(threadId, { excludeUserId: invitee.id });
  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/");
}

async function leaveThreadForUser(
  threadId: string,
  userId: string,
  displayName: string,
) {
  await assertParticipant(threadId, userId);

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId,
        authorId: userId,
        body: `${displayName} left the thread.`,
      },
    }),
    prisma.task.updateMany({
      where: { threadId, assigneeId: userId },
      data: { assigneeId: null },
    }),
    prisma.threadParticipant.delete({
      where: { threadId_userId: { threadId, userId } },
    }),
    prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    }),
  ]);

  await publishThreadEvent({ threadId, type: "message" });
  await publishThreadEvent({ threadId, type: "participant" });
  await publishUserEvent({ userId, type: "threads", threadId });
  await notifyThreadParticipants(threadId);
  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/");
}

export async function leaveThreadAction(threadId: string) {
  const user = await requireUser();
  await leaveThreadForUser(
    threadId,
    user.id,
    user.name?.trim() || user.email || "Someone",
  );
  redirect("/");
}

