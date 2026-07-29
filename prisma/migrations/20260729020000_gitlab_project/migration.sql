-- AlterTable
ALTER TABLE "Thread" ADD COLUMN "gitlabProjectId" INTEGER,
ADD COLUMN "gitlabProjectPath" TEXT,
ADD COLUMN "gitlabProjectUrl" TEXT;
