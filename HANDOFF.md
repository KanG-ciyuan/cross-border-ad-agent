# AdFlow 完整项目交接

更新时间：2026-08-28

私有仓库：`https://github.com/KanG-ciyuan/cross-border-ad-agent`

本文是另一台电脑或另一种 Agent Harness 接手项目时的第一入口。它记录产品不能偏离的边界、当前事实、历史状态、已知失败、环境迁移方向和恢复顺序。不得仅凭页面可见或测试通过就宣称真实模型链路已经完成。

## 1. 接手目标

下一阶段目标不是继续扩充静态页面，而是把现有代码迁移为可在一台长期在线的 Windows 台式机运行的统一应用，并完成第一个真实闭环：

```text
打开产品广告画布
  -> 第一个节点上传产品图
  -> 后台自动创建草稿任务
  -> Agent 调用真实视觉模型分析
  -> 产品事实节点展示候选与证据
  -> 人工确认
  -> 结果在刷新或换设备后仍可恢复
```

完成这个闭环后，再接图片增强/生成、资产库、脚本、分镜和 MiniMax。不要同时铺开所有未完成 Provider。

## 2. 已确认产品决策

### 2.1 用户与市场

- 首发平台：TikTok。
- 首发市场：印度尼西亚。
- 当前品类不固定，家清产品只是首个代表案例。
- 用户是公司运营人员，不要求其掌握 AI、提示词或开发工具。
- 公司邮箱和密码登录，不开放公共注册。
- 移动端画布当前不在验收范围，优先成熟的桌面操作体验。

### 2.2 两条独立生产线

- A 线：上传已有视频，完整理解后重新策划、选片、剪辑、本地化和审核。
- B 线：上传产品图，建立产品事实和资产库，再生成脚本、分镜、逐镜头视频和完整广告。
- 两条线共享账号、任务、资产、Agent Harness、审核、版本和调用记录，但不能强制串成一条流程。
- 用户只要求剪辑时，不得强迫其进入图片资产或 AI 视频生成流程。

### 2.3 Agent 与执行器

- Agent 是剪辑和生成决策者，负责理解、创意、结构、选片、理由、脚本、分镜和提示词编译。
- FFmpeg、Remotion、剪映和 MiniMax 是执行器，不是决策大脑。
- 禁止使用固定交替片段、固定 30/45 秒或规则拼接冒充智能剪辑。
- 用户指定的时长和画幅是任务级硬约束；未指定时才由 Agent 建议。
- 自然语言是主要输入。Agent 解析后展示理解，不增加表达同一要求的冗余勾选项。

### 2.4 人工确认

- AI 输出都是候选。产品事实、资产、脚本/分镜、剪辑时间线、低清预览和高清成片均保留人工确认。
- 产品图侧面、背面或隐藏标签可以生成候选，但不能被升级为真实产品事实。
- AI 来源写入元数据，不在生成图片像素里嵌入“AI 推测”字样。
- 上游资产或事实变化后，受影响下游节点进入 stale 状态并要求重新确认。

### 2.5 合规与风险

- 上传素材不以“已授权确认”作为阻断条件。
- 系统应识别并提示硬字幕、水印、第三方标记、夸大宣传、音乐和平台风险，但不能保证 TikTok 审核必过。
- 不承诺万能无痕去水印。裁切、覆盖、局部修复、换片段或弃用都必须通过预览让用户判断。
- MVP 不自动发布 TikTok，最终成片必须人工观看和批准。

## 3. 画布正确产品形态

产品广告画布是资产血缘图：

```text
原始产品图
  -> 质量检测/高清母版候选
  -> 已确认产品母版
  -> 产品事实锚点
  -> 多角度/人物/场景资产
  -> 印尼广告脚本
  -> 九宫格分镜与镜头执行卡
  -> MiniMax 逐镜头任务
  -> 镜头审核与最终合成
```

节点必须具备明确输入输出、真实资产引用、`derivedFrom`、版本、确认/锁定状态、执行状态和 stale 传播。正确入口是 `/workbench/canvas`：用户在第一个节点上传产品图，后台自动创建草稿任务。`/tasks/new` 只能是快捷入口，不能形成另一套重复流程。

## 4. 当前代码与分支状态

- 当前开发分支：`feat/mvp-foundation`。
- GitHub 默认分支当前也是 `feat/mvp-foundation`，普通 clone 会取得最新交接基线；旧 `main` 仅保留历史基础版本。
- 项目是 pnpm monorepo，Node.js 要求 `>=22.22.2`。
- 前端：React 19、Vite、React Router、XYFlow。
- API：Hono，当前通过 Wrangler 运行并使用 Cloudflare bindings。
- 数据库：D1，SQL 结构与 SQLite 兼容方向一致。
- 渲染器：独立 Node HTTP 服务，调用 FFmpeg/FFprobe。
- 协议：Zod + TypeScript，位于 `packages/contracts`。
- 状态机：位于 `packages/workflow`。

接手时先运行：

```bash
git status --short
git log --oneline --decorate -12
pnpm install
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

测试结果必须以接手电脑的实际输出为准，不要复制旧数字作为当前证明。

## 5. Verified：当前有证据支持的能力

- 公司账号、Session、任务和审批 API 有集成测试覆盖。
- React 任务页面、素材智能分析工作台和产品广告画布已经进入正式应用路由。
- XYFlow 画布支持桌面节点拖动、缩放、视图适配和本地图片选择交互。
- `analysis_map.v1`、`edit_plan.v1`、`canvas_graph.v1` 和产品分析协议已经建立。
- Agent Harness 与类型化媒体分析、产品图分析 Skill 已有代码和测试。
- FFmpeg 渲染器可以在已验证的 macOS 环境输出 H.264/AAC MP4，并支持 9:16/16:9 比例适配基线。
- OpenAI-compatible 产品视觉 Provider 支持 Responses 和 Chat Completions 兼容及结构化输出校验。
- MiniMax 和 Seedance Provider 的请求协议、错误映射和配置状态存在测试；这不等于真实视频生成已成功。
- Cloudflare 生产部署记录存在，生产 D1 中存在产品图分析失败记录。

## 6. Historical：需要避免误读的历史状态

- `docs/architecture/mvp-foundation-verification.md` 中“未部署 Cloudflare”已经被后续部署事实覆盖。
- 早期 FFmpeg 混剪曾使用固定片段交替和固定时长，仅用于打通执行通路，已经被产品方向否定。
- `FakeAnalysisProvider` 只能用于明确标识的演示和测试，不能在生产路径静默回退。
- 旧页面曾从 `/tasks/new` 创建任务后再进入工作台；B 线已决定从画布直接开始。

## 7. To verify / 未完成

### 7.1 生产线 A

- 真实镜头边界检测、ASR、OCR、关键帧多模态理解和完整视频价值地图。
- Agent 基于真实分析生成精确、有业务理由的剪辑时间线。
- 印尼语翻译审核、TTS 配音、字幕时间轴和原中文声音替换。
- Remotion 动态字幕、贴纸、转场和品牌视觉包装。
- 剪映桌面适配器、会员能力范围、失败恢复和工程交付。

### 7.2 生产线 B

- 确定性图片质量检测和真实视觉 Provider 成功调用。
- 高清产品母版、三视图/多角度、人物图和场景图生成 Provider。
- 服务端画布图、资产文件和血缘持久化。
- 印尼广告脚本、分镜执行卡和提示词编译的真实 Agent 链路。
- MiniMax 逐镜头生成、轮询/回调、结果回存、一致性审核和单镜头重试。

### 7.3 运行环境

- Windows Node API 入口。
- D1 到本地 SQLite 的存储适配。
- R2 到 Windows 文件目录的资产适配。
- Windows 服务开机自启、健康检查、备份和恢复。
- 局域网访问和跨网络安全隧道。

## 8. 当前生产故障与根因

Cloudflare Worker 上的真实产品图分析没有成功。生产 D1 最新失败记录包含 `PRODUCT_VISION_NETWORK_FAILED` 和 `PRODUCT_VISION_INVALID_OUTPUT_RESPONSES_0`。后续错误分类确认 Responses 和 Chat Completions 两条路径均发生网络连接失败，图片没有成功到达模型。

用户电脑浏览器能访问中转站，是因为电脑本地网络/代理可用；Cloudflare Worker 不会继承该代理。因此不要继续围绕图片格式、模型名或 JSON Schema 重复排查。当前优先方向是让长期在线的 Windows 电脑调用模型 API。

## 9. Windows 目标架构

```text
其他电脑浏览器
  -> HTTPS/内网穿透
  -> Windows 常开台式机
       -> React 静态前端
       -> Hono Node API
       -> Agent Harness / 状态机
       -> SQLite
       -> 本地资产目录
       -> FFmpeg / Remotion
       -> Windows 原生剪映执行器
       -> 外部模型 API
```

模型推理、图片生成和视频生成由外部 API 完成。Windows 主要负责业务编排、文件传输、状态保存、轻量渲染和剪映桌面执行，不需要本地运行大模型。详细步骤见 [Windows 迁移与运行计划](docs/deployment/windows-node-migration.md)。

## 10. DeepSeek Harness 接手要求

DeepSeek Harness 是开发项目的 Agent，不等于产品内的 Agent Harness。接手后必须：

1. 先读 `AGENTS.md`、本文和正式设计规格。
2. 先运行基线测试，不凭页面截图判断能力完成度。
3. 优先完成 Windows 可运行适配和产品图真实分析闭环。
4. 保留 Provider 接口，不把 DeepSeek、中转站、MiniMax 或剪映写死进业务协议。
5. 真实模型结果保存输入版本、输出、错误分类和人工确认状态。
6. 不得用 Fake Provider、固定规则或静态 UI 代替待完成能力。
7. 不得在输出、日志、代码或 Git 中暴露真实 Key。

建议交给 Harness 的第一条任务：

> 阅读 AGENTS.md、HANDOFF.md、正式设计规格和 Windows 迁移计划。先执行只读基线检查和测试，然后将 Hono API 增加 Node.js 运行入口，为 D1/SQLite 与 R2/本地文件建立可替换适配器。保持现有 Cloudflare路径和业务协议可用，不实现新的产品功能。完成后在真实 Windows 环境验证登录、画布上传、任务持久化和模型网络连通性。

## 11. 密钥与数据边界

- 真实 Key 只能在 Windows 本地环境/密钥存储中重新配置。
- 不从 GitHub 传输 `.env`、`.dev.vars`、数据库、Cookie、账号密码或用户素材。
- 只允许 `.env.example` 保存变量名和非敏感占位符。
- 生产 D1 中的账号、任务和失败 attempts 不应在没有明确批准时删除。
- 从 Cloudflare 迁移数据必须单独设计脱敏导出，不把生产数据库提交到仓库。

## 12. 恢复顺序

1. 克隆仓库并验证 Git/Node/pnpm/FFmpeg 环境。
2. 运行测试、类型检查和构建，记录真实基线。
3. 完成 Windows Node + SQLite + 文件存储适配。
4. 先在 Windows 本机访问，再验证同一局域网访问。
5. 配置模型密钥并只验证连接状态，不立即触发高成本批量任务。
6. 从画布完成一次真实产品图分析和人工确认。
7. 配置安全隧道验证跨网络访问和任务恢复。
8. 接图片生成资产链路。
9. 接 MiniMax 单镜头生成与验收。
10. 再推进生产线 A 的真实全视频理解和剪映适配器。

任何阶段失败都应停在对应层排查，不能用静态示例绕过验收。
