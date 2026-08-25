# Cloudflare Preview 运维手册

## 当前边界

本手册只准备本地和 Cloudflare preview 环境。仓库中不包含 Cloudflare 账户标识、生产 D1/R2 标识或任何 Secret 值，也没有定义 production 环境。

**截至本文档编写时，尚未创建、迁移或部署任何 Cloudflare preview 资源。**

## 前置条件

- Node.js `22.22.2` 或更高版本，pnpm `11.19.0`。
- 在仓库根目录执行 `pnpm install --frozen-lockfile`。
- 本地开发不需要 Cloudflare 登录。只有在获得新的用户批准后，才能登录并执行任何云端变更。
- 不得在命令参数、聊天、文档或 Git 中写入密码、`SESSION_PEPPER` 或其他凭证值。

## 本地启动

1. 在 `apps/api/.dev.vars` 中只填写本地值。该文件已被 Git 忽略，不得提交。

   ```dotenv
   APP_ENV=local
   SESSION_PEPPER=<使用密码管理器生成的本地独立高强度值>
   ```

2. 在仓库根目录应用本地 D1 迁移。`--local` 是必需的，不得替换为 `--remote`。

   ```bash
   pnpm --filter @ad-agent/api exec wrangler d1 migrations apply DB --local
   ```

3. 创建本地授权用户。脚本会在 TTY 中隐藏输入密码，使用当前 shell 的 `SESSION_PEPPER` 生成 PBKDF2 记录，临时 SQL 文件权限为 `0600` 并在写入后删除。不得使用 `--password` 参数，不得把密码或 hash 粘贴到命令行或日志。

   ```bash
   set -a
   source apps/api/.dev.vars
   set +a
   node scripts/create-user.mjs --email operator@example.com
   unset SESSION_PEPPER
   ```

4. 分别在两个终端启动 API 和 Web。Vite 会将 `/api` 代理到 `http://localhost:8787`。

   ```bash
   pnpm --filter @ad-agent/api dev
   ```

   ```bash
   pnpm --filter @ad-agent/web dev
   ```

## 本地验证

```bash
pnpm build
pnpm --filter @ad-agent/api exec wrangler deploy --dry-run
pnpm --filter @ad-agent/api exec wrangler deploy --dry-run --env preview
pnpm typecheck
pnpm test
pnpm test:e2e
```

`--dry-run` 只执行本地打包和配置检查，不上传 Worker。必须先执行 `pnpm build`，以生成 `apps/web/dist`；Wrangler 会从该目录提供 SPA 静态资源，未命中资源的页面路由回退到 `index.html`，`/api/*` 则优先进入 Worker。

仓库中的 preview `database_id` 固定为 `preview-d1-id-requires-fresh-approval`，它是不对应任何云端资源的审批哨兵，使任何真实 UUID（包括误填生产 ID）都无法通过仓库配置测试。Worker 运行时只能比对 `wrangler.jsonc` 中的声明名称，**无法从 D1/R2 binding 内省得到云端资源 ID 或证明真实资源隔离**。真实身份必须在部署前通过 Cloudflare 查询另行核对。

## 创建 Preview 资源

以下操作会修改 Cloudflare 账户。每个操作都必须在执行前再次展示准确命令、账户和目标资源，并获得用户当次批准。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler d1 create cross-border-ad-agent-preview-db
```

记录创建命令返回的 preview D1 `database_id`，但先不要写入配置。不要填写 `account_id`，不要使用任何旧 ID 或生产数据库 ID。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler r2 bucket create cross-border-ad-agent-preview-media
```

## Preview 迁移、Secret 和部署

先确认 `APP_ENV=preview`，D1 和 R2 声明名称都含 `preview` 且不含 `prod`/`production`。名称相同不足以证明资源身份：必须用创建命令当次返回的 ID 做远程只读查询，并由操作人确认返回名称**精确等于** `cross-border-ad-agent-preview-db`。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler d1 info <NEW_PREVIEW_D1_ID>
```

查询结果必须同时显示该 ID 与名称 `cross-border-ad-agent-preview-db`。不得仅依赖配置中的 `database_name`。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler r2 bucket info cross-border-ad-agent-preview-media --json
```

确认当前 Cloudflare 账户正确，且返回的 bucket 名称精确等于 `cross-border-ad-agent-preview-media`。

**REQUIRES FRESH APPROVAL immediately before replacing the preview D1 sentinel**

只有 D1 ID 来自本次已批准的创建命令，且 D1/R2 查询都完全匹配时，才能在当次审批窗口内将 `wrangler.jsonc` 的哨兵值临时替换为该 D1 ID。替换后先执行 `pnpm build` 和上一节的 preview `--dry-run`，再继续迁移和部署。因为仓库测试会拒绝任何真实 ID，该临时变更不得提交，操作完成后必须恢复哨兵值并重跑测试。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler d1 migrations apply DB --env preview --remote
```

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler secret put SESSION_PEPPER --env preview
```

Wrangler 会在隐藏输入中读取 Secret。不得使用命令行参数、管道、文件或 shell 历史传入真实值。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler deploy --env preview
```

部署后只使用脱敏测试账号和测试素材做冒烟检查。当前的 `scripts/create-user.mjs` 只会写本地 D1，不得将本地数据库、临时 SQL 或密码 hash 上传到 preview。preview 用户创建需先单独审核安全脚本并获得新的执行批准。

## 回滚

先停止 preview 冒烟测试，查明待回滚版本及数据库兼容性。Worker 回滚不会自动回滚 D1 数据；本项目的迁移应优先采用向前修复，不要手工删表或改写历史迁移。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler rollback --env preview
```

## 清理 Preview

先导出需保留的脱敏证据，确认资源名称与账户。以下删除不可恢复，必须逐条重新批准。

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler delete --env preview
```

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler r2 bucket delete cross-border-ad-agent-preview-media
```

**REQUIRES FRESH APPROVAL immediately before execution**

```bash
pnpm --filter @ad-agent/api exec wrangler d1 delete cross-border-ad-agent-preview-db
```

清理后将本地 `wrangler.jsonc` 中的 preview `database_id` 恢复为 `preview-d1-id-requires-fresh-approval`，再次执行本地测试与 `--dry-run`。不得把旧 ID 改为任何生产 ID。
