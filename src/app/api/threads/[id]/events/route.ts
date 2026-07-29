import { Client } from "pg";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  THREAD_EVENTS_CHANNEL,
  type ThreadRealtimeEvent,
} from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: threadId } = await context.params;

  const participant = await prisma.threadParticipant.findUnique({
    where: {
      threadId_userId: { threadId, userId: session.user.id },
    },
  });
  if (!participant) {
    return new Response("Forbidden", { status: 403 });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return new Response("DATABASE_URL is not set", { status: 500 });
  }

  const encoder = new TextEncoder();
  let client: Client | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      client = new Client({ connectionString });
      await client.connect();
      await client.query(`LISTEN ${THREAD_EVENTS_CHANNEL}`);

      send("ready", { threadId, at: new Date().toISOString() });

      client.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as ThreadRealtimeEvent;
          if (event.threadId !== threadId) return;
          send("thread", event);
        } catch {
          // ignore malformed payloads
        }
      });

      client.on("error", () => {
        // connection errors end the stream; EventSource will retry
        cleanup();
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        void client?.end().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      void client?.end().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
