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
    expect(screen.getByLabelText("剪辑要求")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "转场" }));
    await userEvent.click(screen.getByRole("button", { name: "检查并开始剪辑" }));

    expect(submit).toHaveBeenCalledOnce();
    const payload = submit.mock.calls[0]![0];
    expect(payload.goal).toBe("edit_only");
    expect(payload.allowedOperations).toEqual(["trim", "concat", "captions"]);
    expect(payload).not.toHaveProperty("product");
    expect(payload).not.toHaveProperty("referenceGeneration");
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
