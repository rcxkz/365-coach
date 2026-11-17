import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/data/schema.ts",
  out: "./drizzle",
  // Only needed by `drizzle-kit migrate` (run with .env.local sourced);
  // `generate` works offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
