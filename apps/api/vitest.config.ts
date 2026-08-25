import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(
  fileURLToPath(new URL("../../migrations", import.meta.url))
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
        d1Databases: ["DB"]
      }
    })
  ],
  test: {
    setupFiles: ["./test/setup.ts"]
  }
});
