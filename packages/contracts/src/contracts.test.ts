import { describe, expect, it } from "vitest";

import { AnalysisMapV1, CanvasGraphV1, EditPlanV1, ProductAnalysisV1, TaskCreateInput, validateCanvasGraph } from "./index";

const fixtureAnalysisMap = {
  version: "analysis_map.v1",
  taskId: "tsk_12345678",
  segments: [{
    id: "seg_12345678",
    sourceAssetId: "ast_12345678",
    startMs: 0,
    endMs: 2_500,
    valueLabel: "high",
    confidence: 0.92,
    evidence: {
      asr: [{ startMs: 0, endMs: 1_000, text: "Bersihkan dapur" }],
      ocr: [{ startMs: 1_000, endMs: 2_000, text: "500 ml" }],
      vision: [{ startMs: 500, endMs: 2_500, label: "product_use" }]
    },
    risks: [{ kind: "watermark", severity: "medium", description: "Brand watermark visible", confidence: 0.8 }]
  }]
} as const;

const fixtureCanvasGraph = {
  version: "canvas_graph.v1",
  projectId: "prj_demo001",
  revision: 3,
  viewport: { x: 24, y: -18, zoom: 0.9 },
  nodes: [
    {
      id: "node_source",
      type: "product_source",
      position: { x: 80, y: 120 },
      status: "locked",
      version: 2,
      locked: true,
      title: "产品主图",
      description: "用户上传并确认的产品事实基准",
      config: { fileName: "cleaner.png" },
      inputs: [],
      outputs: [{ id: "image", dataType: "image_asset", label: "产品图" }],
      assetRefs: [{ assetId: "ast_product01", kind: "image", version: 2, source: "uploaded" }],
      derivedFrom: []
    },
    {
      id: "node_facts",
      type: "product_facts",
      position: { x: 420, y: 120 },
      status: "awaiting_confirmation",
      version: 1,
      locked: false,
      title: "产品事实锚点",
      description: "从产品图和人工资料提取事实",
      config: {},
      inputs: [{ id: "product_image", dataType: "image_asset", label: "产品图", required: true }],
      outputs: [{ id: "facts", dataType: "product_facts", label: "事实锚点" }],
      assetRefs: [],
      derivedFrom: [{ nodeId: "node_source", version: 2 }]
    }
  ],
  edges: [{
    id: "edge_source_facts",
    sourceNodeId: "node_source",
    sourcePort: "image",
    targetNodeId: "node_facts",
    targetPort: "product_image",
    dataType: "image_asset"
  }]
} as const;

const fixtureProductAnalysis = {
  version: "product_analysis.v1",
  taskId: "tsk_12345678",
  sourceAssetId: "ast_12345678",
  quality: {
    score: 0.78,
    decision: "usable_with_enhancement",
    issues: [{
      kind: "label_legibility",
      severity: "medium",
      description: "包装小字不够清晰",
      confidence: 0.84
    }]
  },
  factCandidates: [{
    field: "capacity",
    value: "500 ml",
    certainty: "observed",
    confidence: 0.93,
    evidence: "正面标签可见 500 ml"
  }],
  immutableConstraints: ["瓶身主色保持白色和绿色"],
  missingFacts: ["背标文字"],
  recommendation: {
    action: "enhance",
    reason: "主体清晰，但包装小字需要增强后再生成多视图"
  },
  requiresHumanConfirmation: true
} as const;

describe("ProductAnalysisV1", () => {
  it("accepts image-quality findings and observed fact candidates for human confirmation", () => {
    const analysis = ProductAnalysisV1.parse(fixtureProductAnalysis);

    expect(analysis.quality.decision).toBe("usable_with_enhancement");
    expect(analysis.factCandidates[0]?.certainty).toBe("observed");
    expect(analysis.requiresHumanConfirmation).toBe(true);
  });

  it("rejects model output that bypasses human confirmation", () => {
    expect(() => ProductAnalysisV1.parse({
      ...fixtureProductAnalysis,
      requiresHumanConfirmation: false
    })).toThrow();
  });
});

describe("CanvasGraphV1", () => {
  it("accepts a typed asset-lineage graph with viewport and versions", () => {
    const graph = validateCanvasGraph(fixtureCanvasGraph);

    expect(graph).toEqual(CanvasGraphV1.parse(fixtureCanvasGraph));
    expect(graph.nodes[1]?.derivedFrom).toEqual([{ nodeId: "node_source", version: 2 }]);
    expect(graph.viewport.zoom).toBe(0.9);
  });

  it("rejects an edge whose declared type does not match both ports", () => {
    const invalid = structuredClone(fixtureCanvasGraph) as unknown as {
      edges: Array<{ dataType: string }>;
    };
    invalid.edges[0]!.dataType = "script";

    expect(() => validateCanvasGraph(invalid)).toThrow(/端口类型不兼容/);
  });

  it("rejects edges with missing endpoints and duplicate target connections", () => {
    expect(() => validateCanvasGraph({
      ...fixtureCanvasGraph,
      edges: [{ ...fixtureCanvasGraph.edges[0], targetNodeId: "node_missing" }]
    })).toThrow(/目标节点不存在/);

    expect(() => validateCanvasGraph({
      ...fixtureCanvasGraph,
      edges: [fixtureCanvasGraph.edges[0], { ...fixtureCanvasGraph.edges[0], id: "edge_duplicate" }]
    })).toThrow(/输入端口已连接/);
  });

  it("rejects cycles because downstream lineage must remain directional", () => {
    const cyclic = structuredClone(fixtureCanvasGraph) as unknown as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
    cyclic.nodes[0]!.inputs = [{ id: "facts", dataType: "product_facts", label: "回流事实" }];
    cyclic.nodes[1]!.outputs = [{ id: "facts", dataType: "product_facts", label: "事实锚点" }];
    cyclic.edges.push({
      id: "edge_cycle",
      sourceNodeId: "node_facts",
      sourcePort: "facts",
      targetNodeId: "node_source",
      targetPort: "facts",
      dataType: "product_facts"
    });

    expect(() => validateCanvasGraph(cyclic)).toThrow(/不能形成循环依赖/);
  });
});

describe("TaskCreateInput", () => {
  it("accepts an edit-only task without product generation options", () => {
    const task = TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      editInstructions: "Keep the product-use sequence and cut to 9:16.",
      allowedOperations: ["trim", "concat", "captions"],
      targetDurationSeconds: 30,
      ratio: "9:16",
      mustUseClipIds: ["clp_12345678"]
    });

    expect(task.goal).toBe("edit_only");
    if (task.goal !== "edit_only") {
      throw new Error("Expected an edit-only task");
    }
    expect(task.editInstructions).toBe("Keep the product-use sequence and cut to 9:16.");
    expect(task.ratio).toBe("9:16");
    expect(task.mustUseClipIds).toEqual(["clp_12345678"]);
  });

  it.each(["", " ".repeat(4), "x".repeat(1_001)])(
    "rejects empty or oversized edit instructions",
    (editInstructions) => {
      expect(() => TaskCreateInput.parse({
        goal: "edit_only",
        market: "ID",
        platform: "tiktok",
        editInstructions,
        targetDurationSeconds: 30,
        ratio: "9:16",
        allowedOperations: ["trim"]
      })).toThrow();
    }
  );

  it.each(["editInstructions", "targetDurationSeconds", "ratio"] as const)(
    "requires edit-only %s",
    (field) => {
      const input: Record<string, unknown> = {
        goal: "edit_only",
        market: "ID",
        platform: "tiktok",
        editInstructions: "Use only the supplied footage.",
        targetDurationSeconds: 30,
        ratio: "9:16"
      };
      delete input[field];

      expect(() => TaskCreateInput.parse(input)).toThrow();
    }
  );

  it.each([
    { referenceGeneration: ["three_view"] },
    { generatedShotBriefs: ["Create a product reveal"] },
    { approvedClaims: ["Fast cleaning"] }
  ])("rejects generation or new-copy fields in edit-only mode", (forbidden) => {
    expect(() => TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      editInstructions: "Use only the supplied footage.",
      targetDurationSeconds: 30,
      ratio: "9:16",
      allowedOperations: ["trim"],
      ...forbidden
    })).toThrow();
  });

  it("accepts complete creation with product facts and reference choices", () => {
    const task = TaskCreateInput.parse({
      goal: "complete_creation",
      inputMode: "product_images",
      market: "ID",
      platform: "tiktok",
      product: {
        name: "KLIN Kitchen Cleaner",
        category: "kitchen_cleaner",
        facts: ["500 ml", "For kitchen grease surfaces"],
        approvedClaims: ["Helps soften kitchen grease"],
        prohibitedClaims: ["100% disinfects", "food grade"],
        usage: "Spray, wait briefly, then wipe"
      },
      referenceGeneration: ["three_view", "nine_grid"]
    });

    expect(task.goal).toBe("complete_creation");
    if (task.goal !== "complete_creation") {
      throw new Error("Expected a complete-creation task");
    }
    expect(task.referenceGeneration).toEqual(["three_view", "nine_grid"]);
  });
});

describe("EditPlanV1", () => {
  const validPlan = {
    version: "edit_plan.v1",
    taskId: "tsk_12345678",
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      language: "id-ID",
      ratio: "9:16",
      durationSeconds: 2.5
    },
    tracks: [{
      id: "trk_12345678",
      type: "video",
      clips: [{
        id: "clp_12345678",
        sourceAssetId: "ast_12345678",
        startMs: 0,
        endMs: 1_000,
        origin: "uploaded"
      }]
    }],
    processing: { cropMode: "crop", muteOriginalAudio: false },
    explanations: [{ clipId: "clp_12345678", reason: "Keeps the product-use proof" }],
    approvals: [{ id: "apr_12345678", kind: "content", approvedAt: 1_700_000_000_000, approvedBy: "user" }],
    receipt: {
      id: "rcp_12345678",
      provider: "local_renderer",
      planHash: "a".repeat(64),
      outputAssetId: "ast_output001",
      completedAt: 1_700_000_001_000
    }
  } as const;

  it("accepts a complete analysis map with evidence and confidence", () => {
    expect(AnalysisMapV1.parse(fixtureAnalysisMap).version).toBe("analysis_map.v1");
  });

  it("rejects incomplete analysis intervals and out-of-range confidence", () => {
    expect(() => AnalysisMapV1.parse({
      ...fixtureAnalysisMap,
      segments: [{ ...fixtureAnalysisMap.segments[0], endMs: 0 }]
    })).toThrow();
    expect(() => AnalysisMapV1.parse({
      ...fixtureAnalysisMap,
      segments: [{ ...fixtureAnalysisMap.segments[0], confidence: 1.1 }]
    })).toThrow();
  });

  it.each(["asr", "ocr", "vision"])("rejects duplicate top-level %s evidence", (kind) => {
    const duplicateEvidence = kind === "vision"
      ? { startMs: 0, endMs: 1_000, label: "duplicate" }
      : { startMs: 0, endMs: 1_000, text: "duplicate" };
    expect(() => AnalysisMapV1.parse({
      ...fixtureAnalysisMap,
      segments: [{
        ...fixtureAnalysisMap.segments[0],
        [kind]: [duplicateEvidence]
      }]
    })).toThrow();
  });

  it("accepts ratio-aware plans without estimated costs", () => {
    const parsed = EditPlanV1.parse(validPlan);
    expect(parsed.output.ratio).toBe("9:16");
    expect(parsed.tracks[0]?.clips[0]?.sourceAssetId).toBe("ast_12345678");
    expect(EditPlanV1.parse({ ...validPlan, output: { ...validPlan.output, ratio: "16:9", width: 1920, height: 1080 } }).output.ratio).toBe("16:9");
  });

  it.each(["providerCommand", "command"])("rejects nested %s fields", (field) => {
    expect(() => EditPlanV1.parse({
      ...validPlan,
      processing: { ...validPlan.processing, [field]: "ffmpeg -i source.mp4" }
    })).toThrow();
  });

  it("requires sourceAssetId and rejects the legacy assetId alias", () => {
    const legacy = structuredClone(validPlan) as unknown as {
      tracks: Array<{ clips: Array<Record<string, unknown>> }>;
    };
    const firstClip = legacy.tracks[0]?.clips[0];
    if (!firstClip) throw new Error("Expected the fixture to contain one clip");
    firstClip.assetId = firstClip.sourceAssetId;
    delete firstClip.sourceAssetId;

    expect(() => EditPlanV1.parse(legacy)).toThrow();
  });

  it("rejects a top-level plan hash while retaining receipt planHash", () => {
    expect(() => EditPlanV1.parse({ ...validPlan, planHash: "b".repeat(64) })).toThrow();
    expect(EditPlanV1.parse(validPlan).receipt?.planHash).toBe("a".repeat(64));
  });

  it.each(["1:1", "4:5", "3:2"])("keeps unsupported output ratio %s outside the v1 boundary", (ratio) => {
    expect(() => EditPlanV1.parse({
      ...validPlan,
      output: { ...validPlan.output, ratio }
    })).toThrow();
  });

  it.each([
    { sourcePath: "/tmp/run.sh" },
    { command: "ffmpeg -i secret.mp4 output.mp4" },
    { executable: "/bin/sh" },
    { estimatedFen: 1 },
    { limitFen: 999_999 }
  ])("rejects cost and arbitrary execution fields", (unsafeField) => {
    const unsafe = { ...structuredClone(validPlan), ...unsafeField } as Record<string, unknown>;

    expect(() => EditPlanV1.parse(unsafe)).toThrow();
  });

  it("rejects clips whose end is not after the start", () => {
    const invalid = structuredClone(validPlan) as unknown as {
      tracks: Array<{ clips: Array<{ endMs: number }> }>;
    };
    const firstTrack = invalid.tracks[0];
    const firstClip = firstTrack?.clips[0];
    if (!firstClip) {
      throw new Error("Expected the fixture to contain one clip");
    }
    firstClip.endMs = 0;

    expect(() => EditPlanV1.parse(invalid)).toThrow();
  });

});
