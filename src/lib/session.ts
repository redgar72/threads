import { auth } from "@/lib/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}
