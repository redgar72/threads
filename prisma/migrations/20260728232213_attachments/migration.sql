-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "body" SET DEFAULT '';

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_threadId_idx" ON "Attachment"("threadId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
