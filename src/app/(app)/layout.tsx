import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { UserRealtime } from "@/components/user-realtime";
import { isGitLabOAuthConfigured } from "@/lib/gitlab";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [threads, gitlabConnection] = await Promise.all([
    prisma.thread.findMany({
      where: {
        participants: { some: { userId: session.user.id } },
        status: { not: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: {
        _count: {
          select: {
            tasks: { where: { done: false } },
          },
        },
      },
    }),
    prisma.gitLabConnection.findUnique({
      where: { userId: session.user.id },
      select: { username: true },
    }),
  ]);

  return (
    <div className="flex h-dvh min-h-0 flex-1 overflow-hidden">
      <UserRealtime />
      <AppSidebar
        userName={session.user.name ?? "User"}
        userEmail={session.user.email ?? ""}
        gitlab={{
          exportConfigured: isGitLabOAuthConfigured(),
          username: gitlabConnection?.username ?? null,
        }}
        threads={threads.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          openTaskCount: t._count.tasks,
        }))}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
