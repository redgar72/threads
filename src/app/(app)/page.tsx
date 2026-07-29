import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ThreadList } from "@/components/thread-list";
import { redirect } from "next/navigation";
import { GitLabStatusBanner } from "@/components/gitlab-status-banner";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;

  const threads = await prisma.thread.findMany({
    where: {
      participants: { some: { userId: session.user.id } },
      status: { not: "ARCHIVED" },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          messages: true,
          tasks: { where: { done: false } },
        },
      },
    },
  });

  return (
    <div className="h-full overflow-auto px-4 py-6 lg:px-6">
      <GitLabStatusBanner params={params} />
      <ThreadList
        threads={threads.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          updatedAt: t.updatedAt,
          openTaskCount: t._count.tasks,
          messageCount: t._count.messages,
        }))}
      />
    </div>
  );
}
