import { writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ROOT,
  ensureUploadDir,
  isAllowedMimeType,
  sanitizeFilename,
} from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await context.params;

  const participant = await prisma.threadParticipant.findUnique({
    where: {
      threadId_userId: { threadId, userId: session.user.id },
    },
  });
  if (!participant) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      {
        error: `Upload too large or corrupted (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)`,
      },
      { status: 413 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size <= 0) {
    return Response.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)` },
      { status: 400 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedMimeType(mimeType)) {
    return Response.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 400 },
    );
  }

  const filename = sanitizeFilename(file.name || "paste");
  await ensureUploadDir(threadId);
  const storedName = `${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const storageKey = `${threadId}/${storedName}`;
  const absolute = path.join(UPLOAD_ROOT, threadId, storedName);

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absolute, bytes);

    const attachment = await prisma.attachment.create({
      data: {
        threadId,
        uploaderId: session.user.id,
        filename,
        mimeType,
        sizeBytes: file.size,
        storageKey,
      },
    });

    return Response.json({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: `/api/attachments/${attachment.id}`,
    });
  } catch (e) {
    console.error("Attachment upload failed", e);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
