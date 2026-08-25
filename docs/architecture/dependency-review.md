# Dependency Review

**Review date:** 2026-08-25

## Scope

This review covers the direct packages planned for the MVP workflow foundation and the binary lifecycle packages that materially affect installation. Metadata was checked against `https://registry.npmjs.org` and the upstream repositories declared by each package.

## Direct Packages

| Package | Reviewed version | Upstream | License | Lifecycle install script |
| --- | ---: | --- | --- | --- |
| `react` | 19.2.8 | `facebook/react` | MIT | None |
| `react-dom` | 19.2.8 | `facebook/react` | MIT | None |
| `react-router-dom` | 7.18.2 | `remix-run/react-router` | MIT | None |
| `vite` | 8.2.2 | `vitejs/vite` | MIT | None |
| `@vitejs/plugin-react` | 6.1.0 | `vitejs/vite-plugin-react` | MIT | None |
| `hono` | 4.13.2 | `honojs/hono` | MIT | None |
| `zod` | 4.4.3 | `colinhacks/zod` | MIT | None |
| `vitest` | 4.1.11 | `vitest-dev/vitest` | MIT | None |
| `@cloudflare/vitest-pool-workers` | 0.22.0 | `cloudflare/workers-sdk` | MIT | None |
| `@playwright/test` | 1.62.1 | `microsoft/playwright` | Apache-2.0 | None |
| `lucide-react` | 1.31.0 | `lucide-icons/lucide` | ISC | None |
| `wrangler` | 4.125.0 | `cloudflare/workers-sdk` | MIT OR Apache-2.0 | None |
| `typescript` | 5.9.x | `microsoft/TypeScript` | Apache-2.0 | None |
| `@testing-library/react` | 16.3.2 | `testing-library/react-testing-library` | MIT | None |
| `@testing-library/jest-dom` | 7.0.1 | `testing-library/jest-dom` | MIT | None |
| `@testing-library/user-event` | 14.6.6 | `testing-library/user-event` | MIT | None |
| `jsdom` | 30.0.1 | `jsdom/jsdom` | MIT | None |
| `@types/react` | 19.2.18 | `DefinitelyTyped/DefinitelyTyped` | MIT | None |
| `@types/react-dom` | 19.2.5 | `DefinitelyTyped/DefinitelyTyped` | MIT | None |
| `@types/node` | 26.2.0 | `DefinitelyTyped/DefinitelyTyped` | MIT | None |
| `@cloudflare/workers-types` | 5.20260820.1 | `cloudflare/workerd` | MIT OR Apache-2.0 | None |

The reviewed versions are compatible with the installed Node.js `22.22.3`. `@cloudflare/vitest-pool-workers` 0.22.0 declares Vitest 4.1 compatibility.

## Binary Lifecycle Packages

### `esbuild` 0.28.1

- License: MIT; upstream `evanw/esbuild`.
- Runs `node install.js` after installation.
- Selects the official `@esbuild/<platform>` optional dependency, checks the binary SHA-256 against the package manifest, and validates its version.
- Writes only inside the installed `esbuild` package directory.
- If the optional platform package is absent, it may run npm locally inside a temporary package subdirectory or download the official platform tarball from `registry.npmjs.org`.
- It does not request elevated permissions or write to a system binary directory.

### `workerd` 1.20260820.1

- License: Apache-2.0; upstream `cloudflare/workerd`.
- Runs `node install.js` after installation.
- Selects the official `@cloudflare/workerd-<platform>` optional dependency and validates the executable version.
- Writes only inside the installed `workerd` package directory.
- If the optional platform package is absent, it may run npm locally inside a temporary package subdirectory or download the official platform tarball from `registry.npmjs.org`.
- It does not request elevated permissions or write to a system binary directory.

The lack of a content-hash check in the `workerd` fallback path is a residual supply-chain risk. Normal installation should use the lockfile integrity and platform optional dependency instead of the fallback download.

The same script was reviewed for transitive `workerd` 1.20260815.1, which is required by the Cloudflare Vitest pool. It has the same platform-package selection, project-local write behavior, npm fallback, and version validation pattern.

## Network Behavior

- Package installation contacts the configured npm registry. Verification was repeated explicitly against the official npm registry because this computer currently configures `https://registry.npmmirror.com` as its default registry.
- The project install will explicitly use `https://registry.npmjs.org` so reviewed metadata and downloaded packages come from the same source.
- Vite, Vitest, Hono, Zod, React, React Router, and Lucide do not require runtime internet access for local development.
- Wrangler contacts Cloudflare only when the user explicitly runs authentication, resource, development, or deployment commands that need Cloudflare. No deployment is authorized in the foundation phase.
- Playwright's npm package does not contain a lifecycle script that downloads browsers. A later explicit browser-install command may contact the Playwright CDN and will be recorded as a separate setup action.
- The fake analysis and renderer providers perform no external model calls.

## Installation Decision

Approved for the first-stage foundation under the user's 2026-08-25 authorization. Use a committed pnpm lockfile, the official npm registry, and project-local dependencies. Do not enable additional build scripts, plugins, model SDKs, or Cloudflare deployment without a separate review of their source, permissions, installation behavior, and network behavior.
