import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaterialIntelligenceWorkbench } from "./MaterialIntelligenceWorkbench";
import { ProductGenerationCanvas } from "./ProductGenerationCanvas";
import { analyzeProductImage, approveProductFacts, getTask, uploadAsset } from "../../api/client";

vi.mock("../../api/client", () => ({
  analyzeProductImage: vi.fn(),
  approveProductFacts: vi.fn(),
  createTask: vi.fn(),
  getTask: vi.fn(),
  startProductAnalysis: vi.fn(),
  uploadAsset: vi.fn()
}));

describe("MaterialIntelligenceWorkbench", () => {
  it("shows Agent understanding, value map, timeline, preview, and natural-language revision", async () => {
    const revise = vi.fn();
    render(<MaterialIntelligenceWorkbench demo onRevise={revise} />);
    expect(screen.getByRole("heading", { name: "素材智能分析" })).toBeInTheDocument();
    expect(screen.getByText("AI 理解的剪辑要求")).toBeInTheDocument();
    expect(screen.getByText("素材价值地图")).toBeInTheDocument();
    expect(screen.getByText("45 秒剪辑时间线")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/例如：开场换成/), "把产品收尾提前 2 秒");
    await userEvent.click(screen.getByRole("button", { name: "让 Agent 修改方案" }));
    expect(revise).toHaveBeenCalledWith("把产品收尾提前 2 秒");
  });
});

describe("ProductGenerationCanvas", () => {
  it("opens the real project launcher from the standalone canvas route", () => {
    render(<ProductGenerationCanvas />);
    expect(screen.getByRole("heading", { name: "从画布开始创建真实广告" })).toBeInTheDocument();
    expect(screen.getByLabelText("画布上传产品主图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建项目并进入画布" })).toBeInTheDocument();
  });

  it("loads real product analysis into the facts node and submits its approval snapshot", async () => {
    vi.mocked(getTask).mockResolvedValue({
      task: { id: "tsk_product01", title: "Kitchen Cleaner", goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok", status: "awaiting_generation_approval", budgetFen: null, updatedAt: 1 },
      assets: [{ id: "ast_product01", originalFilename: "front.png", mimeType: "image/png" }],
      costFen: 0,
      versions: [],
      productAnalysis: {
        id: "pan_product01", taskId: "tsk_product01", sourceAssetId: "ast_product01", versionNumber: 1, createdAt: 1,
        analysis: {
          version: "product_analysis.v1", taskId: "tsk_product01", sourceAssetId: "ast_product01",
          quality: { score: 0.82, decision: "usable_with_enhancement", issues: [] },
          factCandidates: [{ field: "capacity", value: "500 ml", certainty: "observed", confidence: 0.95, evidence: "正面标签" }],
          immutableConstraints: ["保持白绿瓶身"], missingFacts: ["背标文字"],
          recommendation: { action: "enhance", reason: "包装小字需要增强" }, requiresHumanConfirmation: true
        }
      }
    });
    render(<ProductGenerationCanvas taskId="tsk_product01" />);

    expect(await screen.findByText(/容量：500 ml/)).toBeInTheDocument();
    expect(screen.getByText(/包装小字需要增强/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /确认并锁定/ }));
    expect(approveProductFacts).toHaveBeenCalledWith("tsk_product01", expect.objectContaining({
      productAnalysisId: "pan_product01",
      versionNumber: 1
    }));
  });

  it("sends a real canvas image straight to Agent analysis without asset upload", async () => {
    vi.mocked(getTask).mockResolvedValue({
      task: { id: "tsk_direct01", title: "Direct product", goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok", status: "draft", budgetFen: null, updatedAt: 1 },
      assets: [], costFen: 0, versions: [], productAnalysis: null
    });
    render(<ProductGenerationCanvas taskId="tsk_direct01" />);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "front.png", { type: "image/png" });

    await userEvent.upload(screen.getByLabelText("上传产品主图"), file);

    expect(analyzeProductImage).toHaveBeenCalledWith("tsk_direct01", file);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it("shows the asset-lineage workflow and a selectable inspector", async () => {
    render(<ProductGenerationCanvas demo />);
    expect(screen.getByRole("heading", { name: "产品广告自由画布" })).toBeInTheDocument();
    for (const node of ["原始产品主图", "产品事实锚点", "产品多视图资产", "人物参考资产", "厨房场景资产", "印尼广告脚本", "分镜执行提示词", "单镜头视频", "广告时间线"]) {
      expect(screen.getByRole("button", { name: `选择节点：${node}` })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: "选择节点：产品事实锚点" }));
    expect(screen.getByText("节点设置 · 产品事实锚点")).toBeInTheDocument();
    expect(screen.getByText("结构化输入")).toBeInTheDocument();
    expect(screen.getByText("数据血缘")).toBeInTheDocument();
    expect(screen.getByText(/尚未接入真实 MiniMax/)).toBeInTheDocument();
  });

  it("does not pretend a demo upload is a real model run", async () => {
    window.localStorage.clear();
    render(<ProductGenerationCanvas demo />);
    const input = screen.getByLabelText("上传产品主图");
    const file = new File(["image"], "product.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(screen.getByText("这是演示画布，图片不会上传或调用模型；请先创建真实广告任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建真实广告任务" })).toBeInTheDocument();
  });

  it("exposes graph navigation and reset controls without claiming real generation", () => {
    render(<ProductGenerationCanvas demo />);

    expect(screen.getByRole("button", { name: "适应画布" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置演示画布" })).toBeInTheDocument();
    expect(screen.getByText("连线代表真实结构化数据依赖")).toBeInTheDocument();
    expect(screen.getByText(/尚未接入真实 MiniMax、生图模型和云端资产持久化/)).toBeInTheDocument();
  });
});
