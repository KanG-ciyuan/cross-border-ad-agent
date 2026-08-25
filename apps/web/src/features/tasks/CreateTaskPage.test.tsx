import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateTaskPage } from "./CreateTaskPage";

describe("CreateTaskPage", () => {
  it("submits edit-only without any generation or product fields", async () => {
    const submit = vi.fn();
    render(<CreateTaskPage onSubmit={submit} onCancel={() => undefined} />);

    await userEvent.click(screen.getByRole("radio", { name: "只剪现有素材" }));
    expect(screen.queryByLabelText("产品名称")).not.toBeInTheDocument();
    expect(screen.queryByText("生成三视图")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("剪辑要求"));
    await userEvent.type(screen.getByLabelText("剪辑要求"), "只保留产品使用过程，成片 20 秒。");
    await userEvent.click(screen.getByRole("checkbox", { name: "转场" }));
    await userEvent.click(screen.getByRole("button", { name: "检查并开始剪辑" }));

    expect(submit).toHaveBeenCalledOnce();
    const payload = submit.mock.calls[0]![0];
    expect(payload.goal).toBe("edit_only");
    expect(payload.editInstructions).toBe("只保留产品使用过程，成片 20 秒。");
    expect(payload.allowedOperations).toEqual(["trim", "concat", "captions"]);
    expect(payload).not.toHaveProperty("product");
    expect(payload).not.toHaveProperty("referenceGeneration");
  });

  it("uses the selected complete-creation input mode and progressively shows its upload areas", async () => {
    const submit = vi.fn();
    render(<CreateTaskPage onSubmit={submit} onCancel={() => undefined} />);

    expect(screen.getByLabelText("上传产品图片")).toBeInTheDocument();
    expect(screen.queryByLabelText("上传现有视频或素材包")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "现有视频或素材包" }));
    expect(screen.queryByLabelText("上传产品图片")).not.toBeInTheDocument();
    expect(screen.getByLabelText("上传现有视频或素材包")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "开始分析资料" }));
    expect(submit.mock.calls[0]![0].inputMode).toBe("video");

    await userEvent.click(screen.getByRole("radio", { name: "混合输入" }));
    expect(screen.getByLabelText("上传产品图片")).toBeInTheDocument();
    expect(screen.getByLabelText("上传现有视频或素材包")).toBeInTheDocument();
  });

  it("preserves separate goal drafts while switching on the unsaved page", async () => {
    render(<CreateTaskPage onSubmit={() => undefined} onCancel={() => undefined} />);

    await userEvent.clear(screen.getByLabelText("产品名称"));
    await userEvent.type(screen.getByLabelText("产品名称"), "自定义产品名");
    await userEvent.click(screen.getByRole("radio", { name: "只剪现有素材" }));
    await userEvent.clear(screen.getByLabelText("剪辑要求"));
    await userEvent.type(screen.getByLabelText("剪辑要求"), "保留我的纯剪辑草稿");

    await userEvent.click(screen.getByRole("radio", { name: "完整广告创作" }));
    expect(screen.getByLabelText("产品名称")).toHaveValue("自定义产品名");
    await userEvent.click(screen.getByRole("radio", { name: "只剪现有素材" }));
    expect(screen.getByLabelText("剪辑要求")).toHaveValue("保留我的纯剪辑草稿");
  });

  it("shows honest per-file ready and validation states with recovery controls", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<CreateTaskPage onSubmit={() => undefined} onCancel={() => undefined} />);
    const valid = new File(["image"], "front.jpg", { type: "image/jpeg" });
    const invalid = new File(["notes"], "notes.txt", { type: "text/plain" });
    const tooLarge = new File(["video"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(tooLarge, "size", { value: 100 * 1024 * 1024 + 1 });

    await user.upload(screen.getByLabelText("上传产品图片"), [valid, invalid, tooLarge]);

    expect(screen.getByText("已选择，提交任务后上传")).toBeInTheDocument();
    expect(screen.getByText("文件类型不支持")).toBeInTheDocument();
    expect(screen.getByText("文件超过 100 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除 front.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新选择 notes.txt" })).toBeInTheDocument();
    expect(screen.queryByText(/(上传中|上传完成|上传进度)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新选择 notes.txt" }));
    expect(screen.getByLabelText("上传产品图片")).toHaveValue("");
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除 front.jpg" }));
    expect(screen.queryByText("front.jpg")).not.toBeInTheDocument();
  });

  it("shows three-view and nine-grid choices after a product image is selected", async () => {
    render(<CreateTaskPage onSubmit={() => undefined} onCancel={() => undefined} />);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "front.jpg", {
      type: "image/jpeg"
    });
    await userEvent.upload(screen.getByLabelText("上传产品图片"), file);

    expect(screen.getByText("生成三视图")).toBeInTheDocument();
    expect(screen.getByText("生成九宫格分镜")).toBeInTheDocument();
    expect(screen.getByText(/来源信息显示在第三步确认界面/)).toBeInTheDocument();
  });
});
