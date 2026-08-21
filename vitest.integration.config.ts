import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": new URL("./tests/helpers/stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    // Les tests partagent une seule base Postgres : exécution séquentielle.
    fileParallelism: false,
    globalSetup: "./tests/integration/setup/global-setup.ts",
    setupFiles: ["./tests/integration/setup/env.ts"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
