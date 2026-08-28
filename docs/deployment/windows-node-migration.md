# Windows 常开主机迁移与运行计划

状态：已确认方向，尚未实施

## 1. 目标

把当前 Cloudflare Worker/D1 开发基线改造成可以在一台 24 小时在线的 Windows 台式机运行的统一应用。模型理解、图片生成和视频生成继续调用外部 API；Windows 负责网页、API、Agent 编排、状态、资产文件、FFmpeg/Remotion 和未来剪映桌面适配器。

本计划不要求立刻删除 Cloudflare 代码或生产资源。迁移期间保留两种运行入口，Windows 验收成功后再决定是否停用 Cloudflare。

## 2. 非目标

- 不在本地运行大模型、图片模型或视频模型。
- 不在第一阶段引入 Kubernetes、Redis、独立云数据库或对象存储。
- 不在迁移任务中同时实现完整图片生成、MiniMax 广告、真实全视频理解或剪映自动化。
- 不把 Windows 路径、某个中转站或某个 Agent 框架写死进业务协议。

## 3. 目标目录

```text
D:\AdFlow\app
D:\AdFlow\data\adflow.db
D:\AdFlow\data\uploads
D:\AdFlow\data\generated
D:\AdFlow\data\renders
D:\AdFlow\data\backups
D:\AdFlow\logs
```

目录位置必须通过环境变量配置。数据库、素材和日志不进入 Git。

## 4. 实施任务

### W1：Node API 入口

- 为 Hono 增加 Node.js 运行入口。
- Node 进程同时提供 `/api/*` 和 `apps/web/dist` 静态文件。
- SPA 未匹配路由回退到 `index.html`。
- 增加 `/health`，仅返回运行状态、版本和非敏感 Provider 配置状态。
- 保留 Worker 默认导出和 Wrangler 本地开发路径。

验收：Windows 本机可以登录并刷新任意 React 路由，无 404、CORS 或 Cookie origin 错误。

### W2：运行环境抽象

- 将 Cloudflare-specific bindings 与业务配置拆开。
- 业务代码依赖数据库、资产存储和 Provider 接口，不直接依赖全局 `D1Database`/`R2Bucket`。
- 环境变量在启动时校验；生产缺少 `SESSION_PEPPER` 或必要配置时 fail fast。
- Worker 和 Node 入口共享同一套路由及业务测试。

### W3：SQLite 适配器

- 使用稳定的 Node SQLite 驱动并复用 `migrations/*.sql`。
- 为认证、任务、attempt、approval、version、analysis、usage 和 canvas graph 提供存储接口。
- 开启 WAL、合理 busy timeout，并保持单机低并发边界。
- 使用 SQLite 一致性备份，不能在写入时简单复制半成品文件。

验收：重启服务后账号、任务、分析和确认状态仍可恢复。

### W4：本地文件资产适配器

- 使用内部 asset ID，原文件名只作为元数据。
- 校验 MIME、大小、扩展名和文件头，阻止路径穿越。
- 上传先写临时文件，校验后原子移动到正式目录。
- 下载必须鉴权并验证 company/task ownership。
- 不向前端暴露 Windows 绝对路径。
- 临时文件允许按策略清理，正式资产不得被开发脚本自动删除。

验收：产品图和视频上传后刷新可恢复，其他账号不能访问资产。

### W5：画布真实入口

- `/workbench/canvas` 第一个节点选择产品图后调用真实 API。
- 后端自动创建或复用 draft task，返回 task ID、asset ID 和 graph version。
- 产品分析结果写入产品事实节点，不只保存在 React state/localStorage。
- 节点执行、错误、重试、版本、确认和 stale 状态可恢复。
- `/tasks/new` 只作为快捷入口，并进入同一画布。

验收：刷新、关闭标签页和另一台授权电脑打开后看到同一任务状态。

### W6：Windows 服务化

- 提供 PowerShell 安装、启动、停止、状态和备份脚本。
- 使用 Windows 服务包装器或任务计划程序设置开机启动。
- API 与 Renderer 分别健康检查，异常退出自动重启并限制重启风暴。
- 日志轮转，不记录 Authorization、Cookie、完整模型请求或敏感响应。
- Windows 关闭睡眠并监控素材盘容量。

验收：Windows 重启后无需人工打开终端，应用自动恢复。

### W7：访问方式

顺序固定：本机 `127.0.0.1` -> 固定局域网 IP -> HTTPS 安全隧道。隧道只暴露 Web/API；SQLite、Renderer 管理端口和剪映执行器不得直接暴露公网。若 Cloudflare Tunnel 在目标网络不稳定，再评估国内内网穿透，并检查权限、流量、上传限制和隐私条款。

### W8：Windows 原生剪映执行节点

- 剪映自动化作为单独的 Windows executor 进程。
- executor 只接收已确认、校验过、版本化的剪辑计划。
- 执行前验证剪映登录、版本、素材路径和磁盘空间。
- 记录可恢复阶段和执行证据，不依赖不稳定坐标完成全部交互。
- 未经真实稳定性验证前，FFmpeg/Remotion 保留为回退路径。

该任务在 W1-W7 和核心真实闭环完成后开始。

## 5. Windows 环境准备

- Git for Windows。
- Node.js 22 或满足仓库 `engines` 的版本。
- Corepack/pnpm 11.19.0。
- FFmpeg 与 FFprobe，并加入 `PATH`。
- DeepSeek Harness 及其官方依赖。
- 剪映桌面版，仅在开始 executor 验证时安装和登录。

```powershell
git clone <private-repository-url> D:\AdFlow\app
Set-Location D:\AdFlow\app
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

在 Node Windows 入口完成前，仓库仍依赖 Wrangler，不能把上述命令成功等同于正式 Windows 服务已经完成。

## 6. 密钥配置

Windows 上重新设置密钥，不能通过 GitHub、聊天记录、README 或共享压缩包传输真实值。变量清单见 `.env.example`。页面和配置 API 只返回 `configured: true/false`；日志必须屏蔽 Key、Authorization 和 Cookie。

## 7. 第一个真实验收

使用一张不敏感的产品图完成：

1. 公司账号登录。
2. 进入 `/workbench/canvas`。
3. 上传产品主图并自动创建草稿任务。
4. Windows 后端成功访问视觉 Provider。
5. 返回结构化产品事实候选、证据和需确认项。
6. 用户确认准确快照。
7. 刷新页面后结果仍在。
8. 从另一台电脑登录后可恢复同一任务。
9. Provider 失败时显示安全、可操作的错误。
10. 重试不丢任务、不制造重复付费调用。

十项全部通过后，才能称“产品图真实分析链路可用”。

## 8. 回滚与数据保护

- 迁移不删除 Cloudflare Worker、D1 记录或 Secrets。
- Windows 初始化使用新数据库，除非另行批准生产数据迁移。
- 每次 schema 迁移前备份数据库并验证恢复命令。
- Git 回滚只回滚代码，不覆盖 Windows 数据目录。
