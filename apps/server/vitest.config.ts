import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The Colyseus test server binds a fixed port, so integration files must not overlap.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
