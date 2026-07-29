import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUploadPath } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  const participant = await prisma.threadParticipant.findUnique({
    where: {
      threadId_userId: {
        threadId: attachment.threadId,
        userId: session.user.id,
      },
    },
  });
  if (!participant) {
    return new Response("Forbidden", { status: 403 });
  }

  const filePath = absoluteUploadPath(attachment.storageKey);
  const info = await stat(filePath);
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(info.size),
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
