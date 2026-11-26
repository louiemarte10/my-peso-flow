// Prisma CLI config (migrations, studio, db pull).
// Uses a DIRECT (non-pooled) connection when available — safer for DDL on
// serverless Postgres like Neon — and falls back to DATABASE_URL.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
