-- CreateTable
CREATE TABLE "GitLabConnection" (
    "userId" TEXT NOT NULL,
    "gitlabUserId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT 'api read_user',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitLabConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitLabConnection_gitlabUserId_key" ON "GitLabConnection"("gitlabUserId");

-- AddForeignKey
ALTER TABLE "GitLabConnection" ADD CONSTRAINT "GitLabConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
