import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function resolveLocalWrangler(repositoryRoot = defaultRepositoryRoot) {
  const cwd = join(repositoryRoot, "apps", "api");
  const executable = join(cwd, "node_modules", ".bin", "wrangler");
  await access(executable);
  return { cwd, executable };
}
