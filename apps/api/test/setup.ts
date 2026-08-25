import { applyD1Migrations, env, reset } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { beforeEach } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      MEDIA: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeEach(async () => {
  reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
