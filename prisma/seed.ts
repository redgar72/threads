import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://threads:threads@localhost:5433/threads?schema=public",
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "password123";

const users = [
  { name: "User One", email: "user1@example.com" },
  { name: "User Two", email: "user2@example.com" },
  { name: "User Three", email: "user3@example.com" },
  { name: "Alice Chen", email: "alice@example.com" },
  { name: "Bob Martinez", email: "bob@example.com" },
] as const;

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  const created = [];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: { name: u.name, email: u.email, passwordHash },
    });
    created.push(user);
  }

  const [user1, user2, user3, alice] = created;

  const existing = await prisma.thread.findFirst({
    where: { title: "Demo: Build break on Network B" },
  });

  if (!existing && user1 && user2 && user3 && alice) {
    await prisma.thread.create({
      data: {
        title: "Demo: Build break on Network B",
        status: "IN_PROGRESS",
        participants: {
          create: [
            { userId: user1.id },
            { userId: user2.id },
            { userId: user3.id },
            { userId: alice.id },
          ],
        },
        messages: {
          create: [
            {
              authorId: user1.id,
              body: "CI is failing after the cert rotation. Anyone on Network B?",
            },
            {
              authorId: alice.id,
              body: "I can repro. Proxy looks wrong in the bootstrap script.",
            },
            {
              authorId: user2.id,
              body: "/task @user3 check cert/proxy settings on Network B",
            },
          ],
        },
        tasks: {
          create: [
            {
              title: "check cert/proxy settings on Network B",
              assigneeId: user3.id,
            },
            {
              title: "Patch bootstrap script",
              assigneeId: alice.id,
            },
          ],
        },
      },
    });
  }

  console.log("Seeded demo users (password for all: password123):");
  for (const u of users) {
    console.log(`  ${u.email}  (@${u.email.split("@")[0]})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
