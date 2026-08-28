import type { CanvasGraphV1 } from "@ad-agent/contracts";
import { describe, expect, it } from "vitest";
import {
  connectCanvasNodes,
  reconnectCanvasEdge,
  restoreCanvasGraph,
  serializeCanvasGraph,
  updateCanvasNodeVersion
} from "./canvas-graph";

const graph: CanvasGraphV1 = {
  version: "canvas_graph.v1",
  projectId: "prj_canvas_test",
  revision: 1,
  viewport: { x: 12, y: -8, zoom: 0.85 },
  nodes: [
    {
      id: "source",
      type: "product_source",
      position: { x: 0, y: 0 },
      status: "locked",
      version: 1,
      locked: true,
      title: "产品主图",
      description: "事实基准",
      config: {},
      inputs: [],
      outputs: [{ id: "image", dataType: "image_asset", label: "产品图" }],
      assetRefs: [],
      derivedFrom: []
    },
    {
      id: "facts",
      type: "product_facts",
      position: { x: 320, y: 0 },
      status: "confirmed",
      version: 1,
      locked: false,
      title: "产品事实",
      description: "事实锚点",
      config: {},
      inputs: [{ id: "image", dataType: "image_asset", label: "产品图" }],
      outputs: [{ id: "facts", dataType: "product_facts", label: "产品事实" }],
      assetRefs: [],
      derivedFrom: [{ nodeId: "source", version: 1 }]
    },
    {
      id: "asset",
      type: "product_asset",
      position: { x: 640, y: 0 },
      status: "locked",
      version: 1,
      locked: true,
      title: "产品资产",
      description: "多视图资产",
      config: {},
      inputs: [
        { id: "source_image", dataType: "image_asset", label: "产品图" },
        { id: "facts", dataType: "product_facts", label: "产品事实" }
      ],
      outputs: [{ id: "image", dataType: "image_asset", label: "资产图" }],
      assetRefs: [],
      derivedFrom: [{ nodeId: "facts", version: 1 }]
    }
  ],
  edges: [{
    id: "edge_source_facts",
    sourceNodeId: "source",
    sourcePort: "image",
    targetNodeId: "facts",
    targetPort: "image",
    dataType: "image_asset"
  }]
};

describe("product canvas graph operations", () => {
  it("connects compatible ports and derives the edge type from the ports", () => {
    const result = connectCanvasNodes(graph, {
      sourceNodeId: "facts",
      sourcePort: "facts",
      targetNodeId: "asset",
      targetPort: "facts"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid connection");
    expect(result.graph.edges[1]).toMatchObject({
      sourceNodeId: "facts",
      targetNodeId: "asset",
      dataType: "product_facts"
    });
  });

  it("returns a business-readable reason for incompatible ports", () => {
    const result = connectCanvasNodes(graph, {
      sourceNodeId: "source",
      sourcePort: "image",
      targetNodeId: "asset",
      targetPort: "facts"
    });

    expect(result).toEqual({ ok: false, reason: "不能连接：产品图 与 产品事实 的数据类型不同" });
  });

  it("reconnects an existing edge only after validating the replacement ports", () => {
    const result = reconnectCanvasEdge(graph, "edge_source_facts", {
      sourceNodeId: "source",
      sourcePort: "image",
      targetNodeId: "asset",
      targetPort: "source_image"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid reconnection");
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]).toMatchObject({
      sourceNodeId: "source",
      targetNodeId: "asset",
      targetPort: "source_image",
      dataType: "image_asset"
    });
  });

  it("marks every reachable downstream node stale when an upstream version changes", () => {
    const connected = connectCanvasNodes(graph, {
      sourceNodeId: "facts",
      sourcePort: "facts",
      targetNodeId: "asset",
      targetPort: "facts"
    });
    if (!connected.ok) throw new Error("Expected a valid connection");

    const updated = updateCanvasNodeVersion(connected.graph, "source");

    expect(updated.revision).toBe(3);
    expect(updated.nodes.find((node) => node.id === "source")).toMatchObject({
      version: 2,
      status: "locked",
      locked: true
    });
    expect(updated.nodes.find((node) => node.id === "facts")?.status).toBe("stale");
    expect(updated.nodes.find((node) => node.id === "asset")?.status).toBe("stale");
  });

  it("round-trips a validated graph and rejects corrupted storage", () => {
    expect(restoreCanvasGraph(serializeCanvasGraph(graph))).toEqual(graph);
    expect(restoreCanvasGraph("{broken-json")).toBeNull();
    expect(restoreCanvasGraph(JSON.stringify({ ...graph, version: "canvas_graph.v0" }))).toBeNull();
  });
});
