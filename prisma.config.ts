import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Fallback allows `prisma generate` during Docker image builds before runtime env is set.
    url:
      process.env.DATABASE_URL ??
      "postgresql://threads:threads@localhost:5432/threads?schema=public",
  },
});
