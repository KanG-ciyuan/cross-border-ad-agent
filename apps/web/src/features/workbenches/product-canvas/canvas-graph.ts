import { CanvasGraphV1 } from "@ad-agent/contracts";
import type { CanvasEdgeV1, CanvasGraphV1 as CanvasGraph, CanvasNodeV1 } from "@ad-agent/contracts";

export type CanvasConnection = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

export type CanvasConnectionResult =
  | { ok: true; graph: CanvasGraph }
  | { ok: false; reason: string };

export function connectCanvasNodes(
  graph: CanvasGraph,
  connection: CanvasConnection
): CanvasConnectionResult {
  const source = graph.nodes.find((node) => node.id === connection.sourceNodeId);
  const target = graph.nodes.find((node) => node.id === connection.targetNodeId);
  if (!source || !target) return { ok: false, reason: "不能连接：节点不存在" };

  const sourcePort = source.outputs.find((port) => port.id === connection.sourcePort);
  const targetPort = target.inputs.find((port) => port.id === connection.targetPort);
  if (!sourcePort || !targetPort) return { ok: false, reason: "不能连接：端口不存在" };
  if (sourcePort.dataType !== targetPort.dataType) {
    return {
      ok: false,
      reason: `不能连接：${sourcePort.label} 与 ${targetPort.label} 的数据类型不同`
    };
  }

  const edge: CanvasEdgeV1 = {
    id: `edge_${connection.sourceNodeId}_${connection.sourcePort}_${connection.targetNodeId}_${connection.targetPort}`,
    ...connection,
    dataType: sourcePort.dataType
  };
  const result = CanvasGraphV1.safeParse({
    ...graph,
    revision: graph.revision + 1,
    edges: [...graph.edges, edge]
  });
  if (!result.success) {
    return { ok: false, reason: `不能连接：${result.error.issues[0]?.message ?? "图结构无效"}` };
  }
  return { ok: true, graph: result.data };
}

export function reconnectCanvasEdge(
  graph: CanvasGraph,
  edgeId: string,
  connection: CanvasConnection
): CanvasConnectionResult {
  if (!graph.edges.some((edge) => edge.id === edgeId)) {
    return { ok: false, reason: "不能重连：原连线不存在" };
  }
  return connectCanvasNodes({
    ...graph,
    edges: graph.edges.filter((edge) => edge.id !== edgeId)
  }, connection);
}

export function updateCanvasNodeVersion(graph: CanvasGraph, nodeId: string): CanvasGraph {
  if (!graph.nodes.some((node) => node.id === nodeId)) return graph;

  const downstream = findDescendants(graph, nodeId);
  const nodes = graph.nodes.map((node): CanvasNodeV1 => {
    if (node.id === nodeId) return { ...node, version: node.version + 1 };
    if (downstream.has(node.id)) return { ...node, status: "stale" };
    return node;
  });

  return CanvasGraphV1.parse({ ...graph, revision: graph.revision + 1, nodes });
}

function findDescendants(graph: CanvasGraph, nodeId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const edge of graph.edges) {
      if (edge.sourceNodeId !== current || descendants.has(edge.targetNodeId)) continue;
      descendants.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }
  return descendants;
}

export function serializeCanvasGraph(graph: CanvasGraph): string {
  return JSON.stringify(CanvasGraphV1.parse(graph));
}

export function restoreCanvasGraph(serialized: string): CanvasGraph | null {
  try {
    const result = CanvasGraphV1.safeParse(JSON.parse(serialized));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
