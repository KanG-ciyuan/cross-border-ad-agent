import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { resolveLocalWrangler } from "./local-wrangler.mjs";

test("resolves the repository-local Wrangler without requiring pnpm on PATH", async () => {
  const { executable, cwd } = await resolveLocalWrangler(process.cwd());
  assert.equal(executable.endsWith("apps/api/node_modules/.bin/wrangler"), true);
  assert.equal(cwd.endsWith("apps/api"), true);
  await access(executable);
});
