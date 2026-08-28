import { z } from "zod";

export const CanvasNodeType = z.enum([
  "product_source",
  "product_facts",
  "product_asset",
  "character_asset",
  "scene_asset",
  "script",
  "storyboard",
  "video_shot",
  "timeline"
]);

export const CanvasDataType = z.enum([
  "image_asset",
  "product_facts",
  "character_asset",
  "scene_asset",
  "script",
  "shot_prompt",
  "video_asset"
]);

export const CanvasNodeStatus = z.enum([
  "needs_configuration",
  "running",
  "awaiting_confirmation",
  "confirmed",
  "locked",
  "stale",
  "failed"
]);

const CanvasPortV1 = z.object({
  id: z.string().min(1).max(80),
  dataType: CanvasDataType,
  label: z.string().min(1).max(80),
  required: z.boolean().optional()
}).strict();

const CanvasAssetRefV1 = z.object({
  assetId: z.string().min(1).max(120),
  kind: z.enum(["image", "video", "audio", "text", "json"]),
  version: z.number().int().positive(),
  source: z.enum(["uploaded", "generated", "derived"])
}).strict();

export const CanvasNodeV1 = z.object({
  id: z.string().min(1).max(120),
  type: CanvasNodeType,
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  status: CanvasNodeStatus,
  version: z.number().int().positive(),
  locked: z.boolean(),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  config: z.record(z.string(), z.unknown()),
  inputs: z.array(CanvasPortV1),
  outputs: z.array(CanvasPortV1),
  assetRefs: z.array(CanvasAssetRefV1),
  derivedFrom: z.array(z.object({
    nodeId: z.string().min(1).max(120),
    version: z.number().int().positive()
  }).strict())
}).strict().superRefine((node, context) => {
  const portIds = new Set<string>();
  for (const port of [...node.inputs, ...node.outputs]) {
    if (portIds.has(port.id)) {
      context.addIssue({ code: "custom", message: `节点 ${node.title} 的端口 ${port.id} 重复` });
    }
    portIds.add(port.id);
  }
});

export const CanvasEdgeV1 = z.object({
  id: z.string().min(1).max(120),
  sourceNodeId: z.string().min(1).max(120),
  sourcePort: z.string().min(1).max(80),
  targetNodeId: z.string().min(1).max(120),
  targetPort: z.string().min(1).max(80),
  dataType: CanvasDataType
}).strict();

const CanvasGraphBaseV1 = z.object({
  version: z.literal("canvas_graph.v1"),
  projectId: z.string().min(1).max(120),
  revision: z.number().int().nonnegative(),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().min(0.1).max(4)
  }).strict(),
  nodes: z.array(CanvasNodeV1),
  edges: z.array(CanvasEdgeV1)
}).strict();

export const CanvasGraphV1 = CanvasGraphBaseV1.superRefine((graph, context) => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const connectedInputs = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      context.addIssue({ code: "custom", message: `节点 ID 重复：${node.id}` });
    }
    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      context.addIssue({ code: "custom", message: `连线 ID 重复：${edge.id}` });
    }
    edgeIds.add(edge.id);

    const source = nodes.get(edge.sourceNodeId);
    const target = nodes.get(edge.targetNodeId);
    if (!source) {
      context.addIssue({ code: "custom", message: `来源节点不存在：${edge.sourceNodeId}` });
      continue;
    }
    if (!target) {
      context.addIssue({ code: "custom", message: `目标节点不存在：${edge.targetNodeId}` });
      continue;
    }
    if (source.id === target.id) {
      context.addIssue({ code: "custom", message: "节点不能连接到自身" });
      continue;
    }

    const sourcePort = source.outputs.find((port) => port.id === edge.sourcePort);
    const targetPort = target.inputs.find((port) => port.id === edge.targetPort);
    if (!sourcePort) {
      context.addIssue({ code: "custom", message: `来源输出端口不存在：${edge.sourcePort}` });
      continue;
    }
    if (!targetPort) {
      context.addIssue({ code: "custom", message: `目标输入端口不存在：${edge.targetPort}` });
      continue;
    }
    if (sourcePort.dataType !== edge.dataType || targetPort.dataType !== edge.dataType) {
      context.addIssue({ code: "custom", message: `端口类型不兼容：${sourcePort.dataType} -> ${targetPort.dataType}` });
    }

    const inputKey = `${edge.targetNodeId}:${edge.targetPort}`;
    if (connectedInputs.has(inputKey)) {
      context.addIssue({ code: "custom", message: `输入端口已连接：${inputKey}` });
    }
    connectedInputs.add(inputKey);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (nodes.has(edge.sourceNodeId) && nodes.has(edge.targetNodeId)) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const nextId of adjacency.get(nodeId) ?? []) {
      if (hasCycle(nextId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if (graph.nodes.some((node) => hasCycle(node.id))) {
    context.addIssue({ code: "custom", message: "画布连线不能形成循环依赖" });
  }
});

export type CanvasNodeType = z.infer<typeof CanvasNodeType>;
export type CanvasDataType = z.infer<typeof CanvasDataType>;
export type CanvasNodeStatus = z.infer<typeof CanvasNodeStatus>;
export type CanvasNodeV1 = z.infer<typeof CanvasNodeV1>;
export type CanvasEdgeV1 = z.infer<typeof CanvasEdgeV1>;
export type CanvasGraphV1 = z.infer<typeof CanvasGraphV1>;

export function validateCanvasGraph(input: unknown): CanvasGraphV1 {
  return CanvasGraphV1.parse(input);
}
