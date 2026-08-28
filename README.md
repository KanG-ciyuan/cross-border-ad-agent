# AdFlow

面向印度尼西亚 TikTok 广告生产的 AI 工作台。产品包含两条独立生产线：已有视频素材的智能重剪，以及从产品图生成 AI 广告视频。AI 负责理解、策划和生成可审计方案；FFmpeg、Remotion、剪映与视频模型只执行人工确认后的计划。

> 当前状态：开发中的 MVP 基线，不是完整生产版本。浏览器工作台、工作流协议、部分审核状态机和本地 FFmpeg 渲染已经实现；真实全视频理解、图片资产生成、MiniMax 成片闭环、印尼语配音、剪映自动化和 Windows 正式部署仍待完成。

## 产品边界

### 生产线 A：已有素材智能剪辑

```text
上传完整视频与自然语言要求
  -> 全片镜头/ASR/OCR/视觉理解
  -> 素材价值地图
  -> Agent 广告结构与精确剪辑时间线
  -> 人工确认
  -> 完整低清预览
  -> 自然语言改稿
  -> 高清执行与最终审核
```

Agent 必须理解视频内容后再选片，不能退回固定间隔截取、素材 A/B 机械交替、固定 30/45 秒或规则拼接。目标时长、画幅、语言和卖点来自用户要求。

### 生产线 B：产品图到 AI 广告视频

```text
上传产品主图
  -> 图片质量检测与可选高清母版
  -> 产品事实锚点
  -> 多角度/人物/场景资产候选
  -> 人工确认资产库
  -> 印尼广告脚本
  -> 九宫格分镜与镜头执行卡
  -> MiniMax 逐镜头生成
  -> 镜头审核与最终合成
```

产品画布是具有真实数据血缘的工作流图，不是固定六卡片向导或装饰连线。上游资产变化时，受影响的下游节点必须失效并重新确认。

## 核心原则

- 创意优先，已确认的产品包装、Logo、颜色、容量和事实是硬边界。
- 自然语言是主要输入；界面展示 Agent 的理解供人工确认，不用重复勾选项替代语义理解。
- Agent 负责素材理解、广告策略、选片理由、脚本、分镜和提示词；执行器不负责创意决策。
- 高成本生成和高清执行前必须确认方案；失败只重做受影响的步骤或镜头。
- Provider、Agent 框架、图片模型、视频模型和渲染工具均保持可替换。
- 静态演示、Fake Provider、固定规则渲染和真实 AI 能力必须明确区分。

完整产品规格见 [AdFlow 设计规格](docs/superpowers/specs/2026-08-25-indonesia-tiktok-ad-agent-design.md)。

## 当前实现

| 能力 | 状态 | 证据边界 |
| --- | --- | --- |
| React 浏览器工作台与公司账号登录 | 已实现 | 本地和 Cloudflare 历史部署均验证过登录流程 |
| 生产线 A 素材工作台 | 已实现交互与协议基线 | 真实 ASR/OCR/全视频理解 Provider 未接通 |
| 生产线 B XYFlow 产品画布 | 已实现桌面交互基线 | 节点布局主要保存在浏览器，本地图片选择不等于服务端资产持久化 |
| Agent Harness 与类型化 Skill | 已实现骨架 | 可替换 Provider；当前不能宣称完整自主广告生产 |
| `analysis_map.v1` / `edit_plan.v1` / `canvas_graph.v1` | 已实现协议基线 | 后续仍需与真实 Provider 端到端验证 |
| FFmpeg 视频预览/混剪 | 已验证本地输出 | 当前智能选片仍是模拟基线，字幕包装不是最终质量 |
| OpenAI-compatible 产品图视觉适配器 | 已实现并测试请求协议 | Cloudflare 到当前中转站的生产网络调用失败 |
| MiniMax / Seedance 适配器 | 已实现协议和模拟测试 | 未完成真实付费视频生成与回存验收 |
| Remotion、印尼语 TTS、剪映自动化 | 未完成 | 不得描述为可用能力 |
| Windows 常开主机正式部署 | 迁移目标 | 需要 Node 运行入口、SQLite/文件存储适配和服务化 |

最新事实、已知故障和恢复顺序以 [HANDOFF.md](HANDOFF.md) 为准。

## 技术结构

```text
apps/web        React + Vite 浏览器工作台
apps/api        Hono API、认证、任务、Agent Harness、Provider 适配
apps/renderer   Node + FFmpeg 独立渲染服务
packages/contracts  版本化业务协议
packages/workflow   工作流状态机
migrations      SQLite/D1 数据库迁移
docs            产品规格、架构、实施计划和部署交接
```

当前 API 运行入口仍是 Cloudflare Worker/Wrangler。目标 Windows 架构是同一套 Hono 业务代码增加 Node.js 入口，以本地 SQLite 和文件目录替代 D1/R2，同时保留未来云端适配能力。

## 当前开发环境运行

要求：Node.js `>=22.22.2`、pnpm `11.19.0`、FFmpeg/FFprobe。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

本地密钥放在忽略提交的 `apps/api/.dev.vars` 中。不要把真实值写入 `.env.example`、代码、文档、日志或 Git。

Windows 接手前先阅读：

1. [HANDOFF.md](HANDOFF.md)
2. [AGENTS.md](AGENTS.md)
3. [Windows 迁移与运行计划](docs/deployment/windows-node-migration.md)
4. [Agent Harness 架构](docs/architecture/agent-harness-runtime.md)
5. [已有素材智能剪辑计划](docs/superpowers/plans/2026-08-27-existing-material-agent-editing.md)
6. [资产血缘画布计划](docs/superpowers/plans/2026-08-27-xyflow-asset-lineage-canvas.md)

## 安全

- 仓库不得包含真实 API Key、密码、哈希、盐、Session Pepper、Cookie 或认证文件。
- `.env`、`.dev.vars`、数据库、用户素材、生成媒体和临时渲染文件不得提交。
- Provider 错误只能返回不含密钥、请求头和敏感响应正文的分类信息。
- Windows 电脑克隆后必须重新配置密钥，不能从 GitHub 下载真实密钥。

## 开源状态

当前建议先使用私有仓库完成 Windows 迁移和真实 Provider 验收。公开开源前还需要完成全历史密钥扫描、内部信息清理、许可证选择、示例素材授权审查和可重复安装验证。
