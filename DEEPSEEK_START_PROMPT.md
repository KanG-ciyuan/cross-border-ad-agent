# 给另一台 Windows 电脑上的 DeepSeek Harness 的首次启动指令

你现在面对的是一台**可能完全没有 AdFlow 项目文件的 Windows 电脑**。本消息就是完整启动上下文，不依赖之前的聊天记录。请先按照“首次获取项目”部分从 GitHub 下载项目，下载完成后再读取仓库内的交接文件，然后开始执行迁移工作。

## 0. AdFlow 是什么

AdFlow 是一个面向公司运营人员的跨境电商广告生产工作台，首发市场是印度尼西亚，首发平台是 TikTok。它不是一个普通网页 Demo，也不是单纯的 FFmpeg 拼接器，而是一个由 Agent 负责理解和规划、由媒体工具负责执行、由人工负责确认的广告生产系统。

它有两条互相独立的生产线：

- **已有素材智能剪辑：** 用户上传一个或多个已有视频，Agent 理解画面、口播、字幕、产品动作和卖点，重新规划广告结构、选择片段、处理声音和字幕，再生成可审核成片。
- **产品图生成 AI 广告：** 用户从产品广告画布上传产品主图，Agent 检测图片、建立产品事实和资产库，生成高清母版、三视图/多角度、人物和场景候选、印尼语脚本、九宫格分镜，最后调用 MiniMax 逐镜头生成视频。

核心目标是：运营人员主要输入产品信息和自然语言要求，Agent 提供可解释的方案，用户在关键节点确认，系统再调用外部模型和剪辑执行器完成任务。

## 1. 首次获取项目

### 1.1 仓库信息

## 一、仓库与分支

本项目原始开发电脑是 macOS，当前本地仓库工作目录为：

```text
/Users/kang/Documents/ChatGPT/跨境电商/.worktrees/mvp-foundation
```

这个路径只用于说明项目原来位于哪台 Mac，Windows 上不要尝试访问它。Windows 电脑可以使用任意有写权限的本地目录，不要求存在 `D:` 盘。下面以 `C:\AdFlow\app` 为例；如果电脑没有 C 盘可用空间，可改成 `E:\AdFlow\app`、用户目录或其他实际存在的路径。

公开仓库：

```text
https://github.com/KanG-ciyuan/cross-border-ad-agent
```

### 1.2 在空白 Windows 电脑上克隆

```powershell
New-Item -ItemType Directory -Force C:\AdFlow | Out-Null
git clone https://github.com/KanG-ciyuan/cross-border-ad-agent.git C:\AdFlow\app
Set-Location C:\AdFlow\app
```

如果 `C:\AdFlow` 已存在，先不要删除其中任何文件；改用一个新的空目录，例如 `C:\AdFlow\app-new`，或先报告冲突。克隆命令本身会创建项目文件，用户不需要事先准备 AdFlow 文件夹。

GitHub 默认分支是 `feat/mvp-foundation`，它包含最新完整交接；旧 `main` 只是历史基础版本。先从默认分支创建新的工作分支，例如：

```powershell
git switch -c deepseek/windows-local-runtime
```

不要直接修改、覆盖或合并 `main`。不要删除 Cloudflare Worker、D1 数据、Secrets 或任何历史分支。

当前交接基线提交是 `1848cc0`。克隆后如果 HEAD 不是该提交或更新提交，先执行 `git fetch --all --prune` 和 `git status`，不要自行猜测使用哪个分支。

这是 GitHub **公开仓库**，克隆不需要仓库访问权限。如果拉取失败，先检查网络、Git 和代理配置。

不要把 GitHub Personal Access Token 写入本提示词、代码、`.env`、聊天记录或日志。DeepSeek Harness 读取的是克隆后的本地文件；公开仓库不代表可以把本地密钥、用户素材或运行配置上传到其他外部服务。

## 二、必须先完整阅读

按以下顺序完整阅读，不要只看摘要：

1. `AGENTS.md`
2. `HANDOFF.md`
3. `README.md`
4. `docs/superpowers/specs/2026-08-25-indonesia-tiktok-ad-agent-design.md`
5. `docs/deployment/windows-node-migration.md`
6. `docs/architecture/agent-harness-runtime.md`
7. `docs/superpowers/plans/2026-08-27-existing-material-agent-editing.md`
8. `docs/superpowers/plans/2026-08-27-xyflow-asset-lineage-canvas.md`
9. `docs/architecture/mvp-foundation-verification.md`

若文档冲突，按以下优先级处理：

```text
AGENTS.md
  > HANDOFF.md
  > 已确认正式设计规格
  > Windows 迁移计划
  > 旧实施计划和历史验证报告
```

发现冲突时明确记录，不要静默选择旧方案。

## 三、项目最终产品目标

AdFlow 是面向公司非 AI 专业运营人员的浏览器广告生产工作台，首发市场为印度尼西亚，首发平台为 TikTok。产品包含两条独立生产线：

### A 线：已有素材智能剪辑

```text
上传多条完整视频与自然语言要求
  -> 镜头边界/ASR/OCR/多模态全片理解
  -> 素材价值地图
  -> Agent 重新策划广告结构和选片
  -> 精确剪辑时间线
  -> 人工确认
  -> 完整低清预览
  -> 自然语言改稿
  -> 高清执行
  -> 人工观看、批准和下载
```

### B 线：产品图到 AI 广告视频

```text
画布首节点上传产品主图
  -> 图片质量检测与可选高清母版
  -> 产品事实锚点
  -> 多角度/人物/场景资产候选
  -> 人工确认资产库
  -> 印尼广告脚本
  -> 九宫格分镜与镜头执行卡
  -> Agent 编译镜头提示词
  -> MiniMax 逐镜头生成
  -> 镜头审核、重做和最终合成
```

两条线共享账号、任务、资产、Agent Harness、审核和版本，但不能强迫用户串行完成。只需要剪辑的用户只进入 A 线；只有产品图的用户可直接进入 B 线。

## 四、不能偏离的产品原则

1. 创意优先，但已确认的产品包装、Logo、颜色、容量和事实是硬边界。
2. 自然语言是主要输入。Agent 展示理解供用户确认，不用重复勾选项代替语义理解。
3. 时长和画幅由用户任务决定，不得固定成 30 秒、45 秒或 9:16；至少支持 9:16 和 16:9。
4. Agent 负责素材理解、广告结构、选片、理由、脚本、分镜和提示词。FFmpeg、Remotion、剪映和 MiniMax 只执行确认后的计划。
5. 禁止用固定片段交替、规则拼接、静态卡片或 Fake Provider 冒充 AI 自动剪辑。
6. 产品画布是真实资产血缘图，不是固定六卡片向导或装饰连线。节点必须传递真实数据，保存版本、`derivedFrom`、确认、锁定、执行和 stale 状态。
7. AI 结果都是候选。产品事实、资产、剪辑计划、脚本/分镜、预览和成片保留人工确认。
8. 上游事实或资产修改后，受影响的下游节点自动失效并重新确认。
9. 不承诺万能无痕去水印或 TikTok 审核必过。MVP 不自动发布 TikTok。
10. Provider、Agent 框架、模型中转站、图片模型、视频模型和执行器均保持可替换。

## 五、当前真实状态

已经有代码和测试支持：

- React/Vite 浏览器工作台、登录、任务和审核页面。
- A 线素材工作台和 B 线 XYFlow 产品画布的桌面交互基线。
- `analysis_map.v1`、`edit_plan.v1`、`canvas_graph.v1` 和产品分析协议。
- 产品图分析 Skill、媒体分析 Skill 和可替换 Agent Harness 骨架。
- OpenAI-compatible 产品视觉 Provider 的 Responses/Chat 兼容及结构化输出校验。
- MiniMax/Seedance 请求适配和错误映射的测试基线。
- Node + FFmpeg 独立渲染器和本地 MP4 输出基线。
- 当前交接提交完成前的最终验证：类型检查、构建和全套测试通过，其中 API 133、Web 43、contracts 36、workflow 13、renderer 10。

尚未完成或不能宣称可用：

- 真实全视频 ASR/OCR/多模态理解和智能选片。
- 印尼语配音替换、成熟字幕和视觉包装。
- 图片高清母版、三视图、人物图、场景图真实生成。
- MiniMax 真实逐镜头生成、回存和完整广告闭环。
- Remotion 成熟包装和剪映桌面自动化。
- 画布全图和资产文件的服务端持久化。
- Windows 正式 Node/SQLite/本地文件运行环境。

Cloudflare 曾成功部署前端、认证和 D1，但真实产品图分析失败。生产失败码包括 `PRODUCT_VISION_NETWORK_FAILED` 和 `PRODUCT_VISION_INVALID_OUTPUT_RESPONSES_0`。根因是 Cloudflare Worker 无法连接当前模型中转站；图片没有到达模型。Windows 电脑可以使用本地可用的国内网络/代理调用外部 API，因此现在转向 Windows 常开主机。

## 六、本次第一阶段任务

先完成 Windows 本地运行基础，不扩展新的广告功能。目标架构：

```text
其他电脑浏览器
  -> 局域网或 HTTPS 安全隧道
  -> Windows 常开台式机
       -> React 静态前端
       -> Hono Node API
       -> Agent Harness / 状态机
       -> SQLite
       -> Windows 本地资产目录
       -> FFmpeg / Remotion
       -> 未来 Windows 原生剪映执行器
       -> 外部模型 API
```

请按 `docs/deployment/windows-node-migration.md` 的 W1-W7 顺序推进：

1. 为 Hono 增加 Node.js 入口，同时保留现有 Worker 入口。
2. 抽象运行配置、数据库和资产存储，不让业务路由直接绑定 D1/R2。
3. 增加 SQLite 适配器并复用 migrations，支持安全迁移和一致性备份。
4. 增加 Windows 本地文件资产适配器，校验文件并防止路径穿越和越权下载。
5. 把 `/workbench/canvas` 变成 B 线真实入口：首节点上传产品图后自动创建/复用 draft task，结果写入服务端画布图。
6. 增加 Windows 启动、停止、状态、备份和开机自启脚本。
7. 先验证本机，再验证局域网；最后才配置安全隧道。

不要在这个阶段实现剪映自动化。W1-W7 和真实产品图分析闭环稳定后，剪映作为独立 Windows executor 开始。

## 七、第一个真实业务验收

以下全部通过后，才能宣称“产品图真实分析链路可用”：

1. 公司账号登录。
2. 进入 `/workbench/canvas`。
3. 第一个节点上传一张不敏感产品图。
4. 后台自动创建或复用草稿任务。
5. Windows 后端成功访问真实视觉 Provider。
6. 返回结构化产品事实候选、证据和需确认项。
7. 用户确认准确的结果快照。
8. 刷新、关闭页面、重启服务后结果仍在。
9. 另一台授权电脑登录后可恢复同一任务。
10. Provider 失败时错误安全、可恢复，重试不重复制造付费调用。

## 八、安全和数据要求

- 可以读取并使用用户授权配置的 API Key，但不得显示完整值。
- 不得把真实 Key、密码、哈希、盐、Session Pepper、Cookie 或 Token 写入回复、代码、文档、测试、日志、`.env.example` 或 Git。
- 不得提交 `.env`、`.dev.vars`、认证文件、数据库、用户素材或生成媒体。
- 检查密钥时只报告变量名、位置和风险。
- 未经明确批准，不得移动、删除、替换或撤销现有 Key。
- 不得删除 Cloudflare Worker、D1 任务、失败记录或 Secrets。
- Windows 使用新数据库；生产数据迁移需要单独批准和脱敏方案。
- 来源不明确的插件、脚本或内网穿透工具，安装前检查来源、权限、安装行为和联网行为，并获得用户确认。

## 九、开始执行方式

先进行只读基线检查：

```powershell
git status --short
git log --oneline --decorate -12
node --version
corepack --version
ffmpeg -version
ffprobe -version
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

如果 `pnpm` 尚未安装，先使用 Corepack 启用仓库声明的 pnpm 版本；如果 Node.js、FFmpeg 或 FFprobe 缺失，先报告缺失项，不要用假版本或静态输出冒充验证。

先报告：

- 当前分支和 HEAD。
- Windows 环境缺失项。
- 各项测试的真实通过/失败数量。
- 文档或代码中的冲突。
- 本阶段准备修改的文件和验收方法。

基线明确后直接执行 W1-W5，不停留在泛泛规划。遇到需要用户选择、安装未知软件、配置真实 Key、触发付费模型、开放公网访问或删除/迁移生产数据时，暂停并说明准确原因，等待授权。

## 十、完成时的交付格式

每个阶段完成时必须提供：

1. 实际完成内容。
2. 修改文件。
3. 验证命令和真实结果。
4. 浏览器/Windows 运行证据。
5. `verified / historical / to verify / not implemented` 能力清单。
6. 未解决问题和下一步。
7. 密钥检查结论，只列变量名和风险，不展示值。

禁止使用“应该可以”“看起来完成”代替真实验收。不要因为 UI 可点击、Mock 测试通过或 API 请求结构正确，就宣称模型、视频或剪映链路已经跑通。
