import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, Panel, ReactFlow,
  ReactFlowProvider, useEdgesState, useNodesState, useReactFlow
} from "@xyflow/react";
import type { Connection, Edge, NodeChange, OnReconnect, Viewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasGraphV1 } from "@ad-agent/contracts";
import type { CanvasGraphV1 as CanvasGraph } from "@ad-agent/contracts";
import { Check, GitBranch, ImagePlus, Maximize2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import productAsset from "../../../../../.superpowers/brainstorm/80528-1787806991/content/assets/generate-20260827-140159-e3777348.png";
import { analyzeProductImage, approveProductFacts, createTask, getTask, type TaskDetail } from "../../api/client";
import { AdFlowCanvasNode } from "./product-canvas/AdFlowCanvasNode";
import type { AdFlowNode } from "./product-canvas/AdFlowCanvasNode";
import { CanvasInspector } from "./product-canvas/CanvasInspector";
import { connectCanvasNodes, reconnectCanvasEdge, restoreCanvasGraph, serializeCanvasGraph, updateCanvasNodeVersion } from "./product-canvas/canvas-graph";
import { seedCanvasGraph } from "./product-canvas/canvas-seed";

const DEMO_STORAGE_KEY = "adflow.canvas.canvas_graph.v1.demo";
const nodeTypes = { adflow: AdFlowCanvasNode };

function readInitialGraph(storageKey: string): CanvasGraph {
  if (typeof window === "undefined") return seedCanvasGraph;
  const stored = window.localStorage.getItem(storageKey);
  return stored ? restoreCanvasGraph(stored) ?? seedCanvasGraph : seedCanvasGraph;
}

const factLabels: Record<string, string> = {
  brand: "品牌", product_name: "产品名称", capacity: "容量", color: "颜色",
  package_shape: "包装形状", material: "材质", closure: "瓶盖/喷头", label_text: "标签文字", other: "其他"
};

function applyProductAnalysis(graph: CanvasGraph, record: NonNullable<TaskDetail["productAnalysis"]>): CanvasGraph {
  const facts = record.analysis.factCandidates.map((fact) =>
    `${factLabels[fact.field] ?? fact.field}：${fact.value} · ${Math.round(fact.confidence * 100)}%`
  );
  return CanvasGraphV1.parse({
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id === "source") return {
        ...node,
        status: "locked",
        locked: true,
        assetRefs: [{ assetId: record.sourceAssetId, kind: "image", version: record.versionNumber, source: "uploaded" }]
      };
      if (node.id !== "facts") return node;
      return {
        ...node,
        status: "awaiting_confirmation",
        locked: false,
        version: record.versionNumber,
        config: {
          ...node.config,
          facts,
          summary: record.analysis.recommendation.reason,
          qualityDecision: record.analysis.quality.decision,
          missingFacts: record.analysis.missingFacts
        },
        derivedFrom: [{ nodeId: "source", version: record.versionNumber }]
      };
    })
  });
}

function toFlowNodes(graph: CanvasGraph, uploadedPreview: string | undefined, demo: boolean): AdFlowNode[] {
  return graph.nodes.map((contract) => ({
    id: contract.id,
    type: "adflow",
    position: contract.position,
    data: {
      contract,
      preview: contract.id === "source" && uploadedPreview
        ? uploadedPreview
        : demo && ["source", "product_asset", "character_asset", "scene_asset"].includes(contract.id)
          ? productAsset
          : undefined
    }
  }));
}

function toFlowEdges(graph: CanvasGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourcePort,
    target: edge.targetNodeId,
    targetHandle: edge.targetPort,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { dataType: edge.dataType },
    className: `canvas-edge type-${edge.dataType}`,
    reconnectable: true
  }));
}

function toContractGraph(nodes: AdFlowNode[], edges: Edge[], revision: number, viewport: Viewport): CanvasGraph {
  return CanvasGraphV1.parse({
    version: "canvas_graph.v1",
    projectId: seedCanvasGraph.projectId,
    revision,
    viewport,
    nodes: nodes.map((node) => ({ ...node.data.contract, position: node.position })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      sourcePort: edge.sourceHandle,
      targetNodeId: edge.target,
      targetPort: edge.targetHandle,
      dataType: edge.data?.dataType
    }))
  });
}

function ProductGenerationCanvasInner({ demo, taskId }: { demo: boolean; taskId?: string }) {
  const storageKey = taskId ? `adflow.canvas.canvas_graph.v1.${taskId}` : DEMO_STORAGE_KEY;
  const initialGraph = useMemo(() => readInitialGraph(storageKey), [storageKey]);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<AdFlowNode>(toFlowNodes(initialGraph, undefined, demo));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initialGraph));
  const [revision, setRevision] = useState(initialGraph.revision);
  const [selectedId, setSelectedId] = useState<string | null>(initialGraph.nodes.some((node) => node.id === "facts") ? "facts" : null);
  const [uploadedName, setUploadedName] = useState(() => {
    const fileName = initialGraph.nodes.find((node) => node.id === "source")?.config.fileName;
    return typeof fileName === "string" ? fileName : null;
  });
  const [uploadedPreview, setUploadedPreview] = useState<string>();
  const [feedback, setFeedback] = useState("连线代表真实结构化数据依赖");
  const [saved, setSaved] = useState(false);
  const [productAnalysis, setProductAnalysis] = useState<TaskDetail["productAnalysis"]>(null);
  const { fitView, getViewport, setViewport } = useReactFlow<AdFlowNode, Edge>();
  const selectedNode = nodes.find((node) => node.id === selectedId)?.data.contract ?? null;

  useEffect(() => () => {
    if (uploadedPreview?.startsWith("blob:")) URL.revokeObjectURL(uploadedPreview);
  }, [uploadedPreview]);

  const applyGraph = useCallback((graph: CanvasGraph, preview = uploadedPreview) => {
    setNodes(toFlowNodes(graph, preview, demo));
    setEdges(toFlowEdges(graph));
    setRevision(graph.revision);
  }, [demo, setEdges, setNodes, uploadedPreview]);

  useEffect(() => {
    if (demo || !taskId) return;
    let active = true;
    void getTask(taskId).then((detail) => {
      if (!active) return;
      setProductAnalysis(detail.productAnalysis);
      const source = detail.assets.find((asset) => asset.id === detail.productAnalysis?.sourceAssetId) ?? detail.assets[0];
      const sourcePreview = source && taskId ? `/api/tasks/${taskId}/assets/${source.id}` : undefined;
      if (source) {
        setUploadedName(source.originalFilename);
        setUploadedPreview(sourcePreview);
      }
      if (detail.productAnalysis) {
        applyGraph(applyProductAnalysis(initialGraph, detail.productAnalysis), sourcePreview);
        setFeedback("真实产品图分析已完成，请确认产品事实候选");
      }
    }).catch((reason) => {
      if (active) setFeedback(reason instanceof Error ? reason.message : "产品任务加载失败");
    });
    return () => { active = false; };
  }, [applyGraph, demo, initialGraph, taskId]);

  const currentGraph = useCallback((nextRevision = revision) => (
    toContractGraph(nodes, edges, nextRevision, getViewport())
  ), [edges, getViewport, nodes, revision]);

  const onNodesChange = useCallback((changes: NodeChange<AdFlowNode>[]) => {
    onNodesChangeBase(changes);
    const removed = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    if (removed.size > 0) {
      setEdges((current) => current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)));
      if (selectedId && removed.has(selectedId)) setSelectedId(null);
    }
    setSaved(false);
  }, [onNodesChangeBase, selectedId, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      setFeedback("连接失败：请选择明确的输入与输出端口");
      return;
    }
    const result = connectCanvasNodes(currentGraph(), {
      sourceNodeId: connection.source,
      sourcePort: connection.sourceHandle,
      targetNodeId: connection.target,
      targetPort: connection.targetHandle
    });
    if (!result.ok) {
      setFeedback(result.reason);
      return;
    }
    applyGraph(result.graph);
    setFeedback("连接成功：下游节点现在可以读取这项结构化数据");
    setSaved(false);
  }, [applyGraph, currentGraph]);

  const onReconnect = useCallback<OnReconnect>((oldEdge, connection) => {
    if (!connection.sourceHandle || !connection.targetHandle) return;
    const result = reconnectCanvasEdge(currentGraph(), oldEdge.id, {
      sourceNodeId: connection.source,
      sourcePort: connection.sourceHandle,
      targetNodeId: connection.target,
      targetPort: connection.targetHandle
    });
    if (!result.ok) {
      setFeedback(result.reason);
      return;
    }
    applyGraph(result.graph);
    setFeedback("连线已重新连接");
    setSaved(false);
  }, [applyGraph, currentGraph]);

  const handleUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    if (demo || !taskId) {
      setFeedback("这是演示画布，图片不会上传或调用模型；请先创建真实广告任务");
      return;
    }
    const preview = URL.createObjectURL(file);
    setUploadedPreview(preview);
    setUploadedName(file.name);
    const graph = updateCanvasNodeVersion(currentGraph(), "source");
    const updated = CanvasGraphV1.parse({
      ...graph,
      nodes: graph.nodes.map((node) => node.id === "source" ? {
        ...node,
        config: { ...node.config, fileName: file.name },
        assetRefs: [{ assetId: `local_${file.name}`, kind: "image", version: node.version, source: "uploaded" }]
      } : node)
    });
    applyGraph(updated, preview);
    try {
      setFeedback("正在将产品图直接交给 Agent 分析，不保存原图…");
      await analyzeProductImage(taskId, file);
      const detail = await getTask(taskId);
      setProductAnalysis(detail.productAnalysis);
      if (detail.productAnalysis) applyGraph(applyProductAnalysis(updated, detail.productAnalysis), preview);
      setFeedback("真实产品图分析已完成，请确认产品事实候选");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "产品图分析失败");
    }
    setSaved(false);
  }, [applyGraph, currentGraph, demo, taskId]);

  const saveGraph = useCallback(() => {
    const graph = currentGraph(revision + 1);
    window.localStorage.setItem(storageKey, serializeCanvasGraph(graph));
    setRevision(graph.revision);
    setSaved(true);
    setFeedback("画布已保存在此浏览器");
  }, [currentGraph, revision, storageKey]);

  const resetGraph = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setUploadedName(null);
    setUploadedPreview(undefined);
    applyGraph(seedCanvasGraph, undefined);
    setSelectedId("facts");
    void setViewport(seedCanvasGraph.viewport, { duration: 240 });
    setFeedback("已恢复演示画布");
    setSaved(false);
  }, [applyGraph, setViewport, storageKey]);

  const confirmSelected = useCallback(async () => {
    if (!selectedId) return;
    if (!demo && selectedId === "facts") {
      if (!taskId || !productAnalysis) {
        setFeedback("尚无可确认的真实产品分析结果");
        return;
      }
      try {
        await approveProductFacts(taskId, {
          productAnalysisId: productAnalysis.id,
          versionNumber: productAnalysis.versionNumber,
          sourceAssetId: productAnalysis.sourceAssetId,
          factCandidates: productAnalysis.analysis.factCandidates,
          immutableConstraints: productAnalysis.analysis.immutableConstraints
        });
      } catch (reason) {
        setFeedback(reason instanceof Error ? reason.message : "产品事实确认失败");
        return;
      }
    }
    const graph = currentGraph(revision + 1);
    const updated = CanvasGraphV1.parse({
      ...graph,
      nodes: graph.nodes.map((node) => node.id === selectedId ? { ...node, status: "locked", locked: true } : node)
    });
    applyGraph(updated);
    setFeedback(demo ? "已在演示图中锁定结果；未调用外部模型" : "节点已确认并锁定");
    setSaved(false);
  }, [applyGraph, currentGraph, demo, productAnalysis, revision, selectedId, taskId]);

  const regenerateSelected = useCallback(() => {
    if (!selectedId) return;
    const graph = updateCanvasNodeVersion(currentGraph(), selectedId);
    const updated = CanvasGraphV1.parse({
      ...graph,
      nodes: graph.nodes.map((node) => node.id === selectedId ? { ...node, status: "needs_configuration", locked: false } : node)
    });
    applyGraph(updated);
    setFeedback(demo ? "已建立局部重生成草案；演示模式未调用模型" : "局部重生成任务已建立");
    setSaved(false);
  }, [applyGraph, currentGraph, demo, selectedId]);

  const assetPreviews = [
    ["产品多视图", "product_asset"], ["透明底主体", "source"],
    ["人物手持", "character_asset"], ["厨房场景", "scene_asset"]
  ] as const;

  return (
    <section className="page-section product-canvas-page">
      <header className="page-heading canvas-page-heading">
        <div><h1>产品广告自由画布</h1><p>从产品事实和一致性资产出发，让脚本、分镜、镜头与成片共享同一条数据血缘。</p></div>
        <div className="page-heading-actions">
          <span className="status-badge status-warning">{demo ? "产品线 B · 交互演示" : "等待产品事实确认"}</span>
          <button aria-label="保存画布" className="button" onClick={saveGraph} type="button"><Save size={15} />保存画布</button>
          <button className="button primary" disabled={!selectedNode} onClick={confirmSelected} type="button"><ShieldCheck size={15} />确认当前节点</button>
        </div>
      </header>

      {demo ? <div className="canvas-demo-banner" role="note"><div><strong>当前是交互演示，不会调用模型</strong><span>创建真实任务后，产品图会在本次请求中直接交给视觉模型，当前不写入云端资产库。</span></div><button className="button primary" onClick={() => { window.location.href = "/tasks/new"; }} type="button">创建真实广告任务</button></div> : null}

      <div className="canvas-feedback" role="status"><span className={saved ? "is-saved" : ""}><Check size={14} />{feedback}</span><small>图版本 r{revision} · {nodes.length} 个节点 · {edges.length} 条数据依赖</small></div>

      <div className="canvas-shell xyflow-shell">
        <aside className="canvas-assets">
          <div className="surface-heading"><div><span className="inspector-kicker">资产来源</span><h2>产品资产库</h2></div><span className="asset-count">{demo ? 4 : uploadedName ? 1 : 0}</span></div>
          <label className="canvas-upload"><ImagePlus size={22} /><strong>上传产品主图</strong><span>Logo、包装和容量清晰可见</span><input aria-label="上传产品主图" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)} /></label>
          {uploadedName ? <div className="upload-result"><Check size={14} />{uploadedName}</div> : null}
          <div className="canvas-asset-grid">{assetPreviews.map(([label, nodeId], index) => {
            const preview = nodeId === "source" ? uploadedPreview : demo ? productAsset : undefined;
            return <button key={label} onClick={() => setSelectedId(nodeId)} type="button">
              {preview ? <img src={preview} alt={label} style={{ objectPosition: `${20 + index * 18}% ${12 + index * 16}%` }} /> : <div className="canvas-asset-empty">尚无真实资产</div>}
              <span>{label}</span><small>{nodeId === "source" && uploadedName ? "真实上传" : demo ? "演示资产" : "等待生成"}</small>
            </button>;
          })}</div>
          <div className="asset-lineage-note"><GitBranch size={17} /><span><strong>资产有版本，不覆盖原图</strong>确认过的产品、人物和场景资产会作为后续镜头的固定参考。</span></div>
          <nav aria-label="流程节点" className="canvas-node-nav">
            <span>流程节点</span>
            {nodes.map((node, index) => <button aria-label={`选择节点：${node.data.contract.title}`} className={selectedId === node.id ? "active" : ""} key={node.id} onClick={() => setSelectedId(node.id)} type="button"><b>{String(index + 1).padStart(2, "0")}</b><span>{node.data.contract.title}</span></button>)}
          </nav>
        </aside>

        <div className="free-canvas xyflow-canvas">
          <ReactFlow<AdFlowNode, Edge>
            defaultViewport={initialGraph.viewport}
            deleteKeyCode={["Backspace", "Delete"]}
            edges={edges}
            edgesReconnectable
            elementsSelectable
            maxZoom={1.8}
            minZoom={0.25}
            multiSelectionKeyCode={["Meta", "Control"]}
            nodeTypes={nodeTypes}
            nodes={nodes}
            nodesConnectable
            nodesDraggable
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onNodesChange={onNodesChange}
            onReconnect={onReconnect}
            panOnDrag={[0, 1, 2]}
            selectionOnDrag
            snapGrid={[16, 16]}
            snapToGrid
          >
            <Background color="#c3cec8" gap={24} size={1.2} variant={BackgroundVariant.Dots} />
            <MiniMap aria-label="画布缩略图" maskColor="rgba(235, 240, 237, 0.72)" nodeColor={(node) => node.selected ? "#1d6846" : "#8aa797"} pannable zoomable />
            <Controls position="bottom-left" showFitView={false} />
            <Panel className="canvas-stage-legend" position="top-left"><span>输入与事实</span><span>一致性资产</span><span>脚本与分镜</span><span>生成与合成</span></Panel>
            <Panel className="canvas-custom-controls" position="bottom-center">
              <button aria-label="适应画布" onClick={() => void fitView({ duration: 300, padding: 0.14 })} title="适应画布" type="button"><Maximize2 size={16} /></button>
              <span>拖动空白处平移 · 滚轮缩放 · 从端口拖线连接</span>
              <button aria-label="重置演示画布" onClick={resetGraph} title="重置演示画布" type="button"><RotateCcw size={16} /></button>
            </Panel>
          </ReactFlow>
        </div>

        <CanvasInspector demo={demo} node={selectedNode} onConfirm={confirmSelected} onRegenerate={regenerateSelected} />
      </div>
    </section>
  );
}

export function ProductGenerationCanvas({ demo = false, taskId }: { demo?: boolean; taskId?: string }) {
  if (!demo && !taskId) return <CanvasProjectLauncher />;
  return <ReactFlowProvider><ProductGenerationCanvasInner demo={demo} taskId={taskId} /></ReactFlowProvider>;
}

function CanvasProjectLauncher() {
  const [name, setName] = useState("KLIN 厨房重油清洁剂");
  const [facts, setFacts] = useState("500 ml；适用于灶台、抽油烟机等厨房重油表面；喷洒后擦拭使用。");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!file) return setError("请先上传一张产品主图");
    setBusy(true);
    setError("");
    try {
      const task = await createTask({
        goal: "complete_creation",
        market: "ID",
        platform: "tiktok",
        inputMode: "product_images",
        product: {
          name: name.trim() || "未命名产品",
          category: "kitchen_cleaner",
          facts: [facts.trim()],
          approvedClaims: [],
          prohibitedClaims: [],
          usage: "喷洒后擦拭"
        },
        referenceGeneration: ["three_view", "nine_grid"]
      });
      await analyzeProductImage(task.id, file);
      window.location.href = `/tasks/${task.id}/canvas`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建真实画布项目失败");
      setBusy(false);
    }
  };

  return <section className="page-section canvas-launcher"><header className="page-heading"><div><span className="inspector-kicker">产品广告画布</span><h1>从画布开始创建真实广告</h1><p>上传产品主图后，Agent 会在画布节点中分析产品事实；后续资产、脚本、分镜和视频任务都在同一张画布上推进。</p></div><span className="status-badge status-success">真实任务入口</span></header><div className="canvas-launcher-grid"><section className="surface"><h2>01 · 输入产品资料</h2><label>产品名称<input aria-label="画布产品名称" value={name} onChange={(event) => setName(event.target.value)} /></label><label>已知产品事实<textarea aria-label="画布产品事实" value={facts} onChange={(event) => setFacts(event.target.value)} /></label><label className="canvas-launcher-upload"><ImagePlus size={22} /><strong>{file ? file.name : "上传产品主图"}</strong><span>PNG、JPG 或 WEBP；仅用于本次 Agent 分析，不保存到云端资产库</span><input aria-label="画布上传产品主图" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{error ? <div className="notice error" role="alert">{error}</div> : null}<button className="button primary wide" disabled={busy} onClick={() => void submit()} type="button">{busy ? "正在创建并分析…" : "创建项目并进入画布"}</button></section><section className="surface canvas-launcher-flow"><h2>02 · 画布内执行</h2><div className="launcher-steps"><span><b>1</b>产品事实锚点<small>gpt-5.6-terra 视觉分析</small></span><span><b>2</b>一致性资产<small>生成三视图、人物和场景</small></span><span><b>3</b>脚本与分镜<small>Agent 汇合资产生成提示词</small></span><span><b>4</b>视频与合成<small>逐镜头生成并人工确认</small></span></div><p className="empty-copy">创建后会进入任务专属画布，例如：</p><code>/tasks/任务编号/canvas</code></section></div></section>;
}
