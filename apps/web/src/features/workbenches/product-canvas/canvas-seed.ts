import { CanvasGraphV1 } from "@ad-agent/contracts";
import type { CanvasDataType, CanvasGraphV1 as CanvasGraph, CanvasNodeV1 } from "@ad-agent/contracts";

type Port = { id: string; dataType: CanvasDataType; label: string; required?: boolean };

const input = (id: string, dataType: CanvasDataType, label: string): Port => ({ id, dataType, label, required: true });
const output = (id: string, dataType: CanvasDataType, label: string): Port => ({ id, dataType, label });

function node(
  value: Pick<CanvasNodeV1, "id" | "type" | "position" | "status" | "title" | "description" | "inputs" | "outputs"> &
    Partial<Pick<CanvasNodeV1, "locked" | "version" | "config" | "derivedFrom" | "assetRefs">>
): CanvasNodeV1 {
  return {
    locked: false,
    version: 1,
    config: {},
    derivedFrom: [],
    assetRefs: [],
    ...value
  };
}

export const seedCanvasGraph: CanvasGraph = CanvasGraphV1.parse({
  version: "canvas_graph.v1",
  projectId: "prj_demo_product_ad",
  revision: 7,
  viewport: { x: 36, y: 52, zoom: 0.72 },
  nodes: [
    node({
      id: "source",
      type: "product_source",
      position: { x: 20, y: 160 },
      status: "locked",
      locked: true,
      version: 2,
      title: "原始产品主图",
      description: "用户上传的产品事实基准，后续资产均可追溯到此版本。",
      inputs: [],
      outputs: [output("image", "image_asset", "产品主图")],
      config: { stage: "01 输入与事实", summary: "包装、Logo、颜色和容量必须清晰" },
      assetRefs: [{ assetId: "ast_demo_product", kind: "image", version: 2, source: "uploaded" }]
    }),
    node({
      id: "facts",
      type: "product_facts",
      position: { x: 320, y: 70 },
      status: "awaiting_confirmation",
      title: "产品事实锚点",
      description: "AI 提取候选事实，由人确认后锁定，推测不会升级为事实。",
      inputs: [input("product_image", "image_asset", "产品主图")],
      outputs: [output("facts", "product_facts", "确认事实")],
      config: { stage: "01 输入与事实", facts: ["绿色瓶身与喷头", "品牌 Logo", "500 ml 容量", "厨房重油清洁"] },
      derivedFrom: [{ nodeId: "source", version: 2 }]
    }),
    node({
      id: "product_asset",
      type: "product_asset",
      position: { x: 650, y: 30 },
      status: "confirmed",
      title: "产品多视图资产",
      description: "生成高清主体、多视图和手持参考，保持包装事实一致。",
      inputs: [input("source_image", "image_asset", "产品主图"), input("facts", "product_facts", "产品事实")],
      outputs: [output("product_image", "image_asset", "产品资产")],
      config: { stage: "02 一致性资产", summary: "正面、侧面、45° 和透明底主体" },
      derivedFrom: [{ nodeId: "source", version: 2 }, { nodeId: "facts", version: 1 }],
      assetRefs: [{ assetId: "ast_demo_views", kind: "image", version: 1, source: "generated" }]
    }),
    node({
      id: "character_asset",
      type: "character_asset",
      position: { x: 650, y: 290 },
      status: "awaiting_confirmation",
      title: "人物参考资产",
      description: "印尼家庭场景中的人物参考，锁定外观和手持方式。",
      inputs: [input("product_image", "image_asset", "产品主图")],
      outputs: [output("character", "character_asset", "人物资产")],
      config: { stage: "02 一致性资产", summary: "人物外观、服装、手部和产品比例" },
      derivedFrom: [{ nodeId: "source", version: 2 }]
    }),
    node({
      id: "scene_asset",
      type: "scene_asset",
      position: { x: 650, y: 550 },
      status: "confirmed",
      title: "厨房场景资产",
      description: "建立油污灶台、清洁过程和完成态的场景参考。",
      inputs: [input("product_image", "image_asset", "产品主图")],
      outputs: [output("scene", "scene_asset", "场景资产")],
      config: { stage: "02 一致性资产", summary: "油污灶台、喷洒、擦拭和前后对比" },
      derivedFrom: [{ nodeId: "source", version: 2 }]
    }),
    node({
      id: "script",
      type: "script",
      position: { x: 320, y: 430 },
      status: "confirmed",
      title: "印尼广告脚本",
      description: "把已确认事实转为 Hook、演示、证明和收尾，不虚构功效。",
      inputs: [input("facts", "product_facts", "产品事实")],
      outputs: [output("script", "script", "广告脚本")],
      config: { stage: "03 脚本与分镜", excerpt: "Noda minyak membandel? Semprot, tunggu sebentar, lalu lap hingga bersih." },
      derivedFrom: [{ nodeId: "facts", version: 1 }]
    }),
    node({
      id: "storyboard",
      type: "storyboard",
      position: { x: 1010, y: 230 },
      status: "awaiting_confirmation",
      title: "分镜执行提示词",
      description: "Agent 汇合产品、人物、场景和脚本，输出逐镜头 MiniMax 提示词。",
      inputs: [
        input("product", "image_asset", "产品资产"),
        input("character", "character_asset", "人物资产"),
        input("scene", "scene_asset", "场景资产"),
        input("script", "script", "广告脚本")
      ],
      outputs: [output("prompt", "shot_prompt", "镜头提示词")],
      config: { stage: "03 脚本与分镜", shots: ["油污 Hook", "人物持瓶", "喷洒细节", "擦拭对比", "产品收尾"] },
      derivedFrom: [
        { nodeId: "product_asset", version: 1 },
        { nodeId: "character_asset", version: 1 },
        { nodeId: "scene_asset", version: 1 },
        { nodeId: "script", version: 1 }
      ]
    }),
    node({
      id: "video_shot",
      type: "video_shot",
      position: { x: 1360, y: 180 },
      status: "needs_configuration",
      title: "单镜头视频",
      description: "按镜头提交 MiniMax；失败只重试该镜头，不重做整条广告。",
      inputs: [
        input("prompt", "shot_prompt", "镜头提示词"),
        input("product", "image_asset", "产品资产"),
        input("character", "character_asset", "人物资产"),
        input("scene", "scene_asset", "场景资产")
      ],
      outputs: [output("video", "video_asset", "镜头视频")],
      config: { stage: "04 生成与合成", summary: "5 个镜头待人工确认后提交" },
      derivedFrom: [{ nodeId: "storyboard", version: 1 }]
    }),
    node({
      id: "timeline",
      type: "timeline",
      position: { x: 1690, y: 280 },
      status: "needs_configuration",
      title: "广告时间线",
      description: "合成镜头、印尼配音、字幕、转场与视觉包装并进入审核。",
      inputs: [input("video", "video_asset", "镜头视频"), input("script", "script", "字幕脚本")],
      outputs: [output("final", "video_asset", "广告成片")],
      config: { stage: "04 生成与合成", summary: "比例和时长由本任务设置决定" },
      derivedFrom: [{ nodeId: "video_shot", version: 1 }, { nodeId: "script", version: 1 }]
    })
  ],
  edges: [
    ["source", "image", "facts", "product_image", "image_asset"],
    ["source", "image", "product_asset", "source_image", "image_asset"],
    ["facts", "facts", "product_asset", "facts", "product_facts"],
    ["source", "image", "character_asset", "product_image", "image_asset"],
    ["source", "image", "scene_asset", "product_image", "image_asset"],
    ["facts", "facts", "script", "facts", "product_facts"],
    ["product_asset", "product_image", "storyboard", "product", "image_asset"],
    ["character_asset", "character", "storyboard", "character", "character_asset"],
    ["scene_asset", "scene", "storyboard", "scene", "scene_asset"],
    ["script", "script", "storyboard", "script", "script"],
    ["storyboard", "prompt", "video_shot", "prompt", "shot_prompt"],
    ["product_asset", "product_image", "video_shot", "product", "image_asset"],
    ["character_asset", "character", "video_shot", "character", "character_asset"],
    ["scene_asset", "scene", "video_shot", "scene", "scene_asset"],
    ["video_shot", "video", "timeline", "video", "video_asset"],
    ["script", "script", "timeline", "script", "script"]
  ].map(([sourceNodeId, sourcePort, targetNodeId, targetPort, dataType], index) => ({
    id: `edge_${index + 1}`,
    sourceNodeId,
    sourcePort,
    targetNodeId,
    targetPort,
    dataType
  }))
});
