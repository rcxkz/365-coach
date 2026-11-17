import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Each data-layer test file boots an in-memory PGlite and runs all
    // migrations; under a full parallel run the first test in a file
    // can exceed the 5s default purely on WASM boot contention.
    // hookTimeout has its own 10s default — seeding a library inside
    // beforeAll hits it as the migration set grows.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
