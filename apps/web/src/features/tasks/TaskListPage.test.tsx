import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "../auth/LoginPage";
import { TaskListPage, type TaskListItem } from "./TaskListPage";

const task: TaskListItem = {
  id: "tsk_demo0001",
  name: "KLIN 厨房清洁剂",
  mode: "图片生成模式",
  status: "awaiting_generation_approval",
  costFen: 32_800,
  updatedAtLabel: "10 分钟前",
  thumbnailUrl: "/uploads/product-main.jpg"
};

describe("TaskListPage", () => {
  it("renders business status, RMB, and the cropped product-main-image thumbnail", () => {
    render(<TaskListPage state="ready" tasks={[task]} onRetry={() => undefined} onOpen={() => undefined} onCreate={() => undefined} />);

    expect(screen.getByText("等待方案确认")).toBeInTheDocument();
    expect(screen.getAllByText("¥328.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "KLIN 厨房清洁剂产品图" })).toHaveAttribute(
      "src",
      "/uploads/product-main.jpg"
    );
  });

  it("supports loading, empty, and retriable failure states", async () => {
    const retry = vi.fn();
    const { rerender } = render(<TaskListPage state="loading" tasks={[]} onRetry={retry} onOpen={() => undefined} onCreate={() => undefined} />);
    expect(screen.getByLabelText("正在加载任务")).toBeInTheDocument();

    rerender(<TaskListPage state="empty" tasks={[]} onRetry={retry} onOpen={() => undefined} onCreate={() => undefined} />);
    expect(screen.getByText("还没有广告任务")).toBeInTheDocument();

    rerender(<TaskListPage state="error" tasks={[]} onRetry={retry} onOpen={() => undefined} onCreate={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("opens a task row without adding selection-only controls", async () => {
    const open = vi.fn();
    render(<TaskListPage state="ready" tasks={[task]} onRetry={() => undefined} onOpen={open} onCreate={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "打开 KLIN 厨房清洁剂" }));
    expect(open).toHaveBeenCalledWith("tsk_demo0001");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  it("validates company email and password before submitting", async () => {
    const login = vi.fn();
    render(<LoginPage onLogin={login} status="idle" />);
    await userEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(screen.getByText("请输入公司授权邮箱")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
