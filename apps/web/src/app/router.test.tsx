import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRouter, canRenderEditTask, canUseDemoBypass, loginErrorMessage, renderActionLabel, resolveVersionsTaskId } from "./router";

describe("AppRouter", () => {
  it("allows the public demo query only in Vite development", () => {
    expect(canUseDemoBypass("?demo=1", true)).toBe(true);
    expect(canUseDemoBypass("?demo=1", false)).toBe(false);
    expect(canUseDemoBypass("?demo=0", true)).toBe(false);
  });

  it("does not report a blocked same-origin request as a wrong password", () => {
    expect(loginErrorMessage(new Error("CROSS_ORIGIN_REQUEST"))).toBe("本地连接配置异常，请刷新后重试");
    expect(loginErrorMessage(new Error("INVALID_CREDENTIALS"))).toBe("邮箱或密码不正确");
    expect(loginErrorMessage(new Error("请求失败"))).toBe("登录失败，请稍后重试");
  });

  it("does not route the real versions entry to a fixed demo task", () => {
    expect(resolveVersionsTaskId([], false)).toBeNull();
    expect(resolveVersionsTaskId([{ id: "tsk_real0001", status: "approved" }], false)).toBe("tsk_real0001");
    expect(resolveVersionsTaskId([], true)).toBe("tsk_demo0002");
  });

  it("names the real FFmpeg action as automatic editing", () => {
    expect(renderActionLabel(false)).toBe("开始自动剪辑");
    expect(renderActionLabel(true)).toBe("开始模拟剪辑");
  });

  it("lets a failed edit-only render retry from the progress page", () => {
    expect(canRenderEditTask("edit_only", "failed_retryable")).toBe(true);
    expect(canRenderEditTask("edit_only", "ready_to_render")).toBe(true);
    expect(canRenderEditTask("complete_creation", "failed_retryable")).toBe(false);
  });

  it("opens the matching task review after generation approval", async () => {
    window.history.pushState({}, "", "/tasks/tsk_demo0001/confirm?demo=1");
    render(<AppRouter />);

    for (const checkbox of screen.getAllByRole("checkbox")) await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "确认并生成初版" }));

    expect(await screen.findByRole("heading", { name: "审核广告初版" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tasks/tsk_demo0001/review");
  });

  it("discloses fixed simulated data on the desktop workbench", () => {
    window.history.pushState({}, "", "/versions?demo=1");
    render(<AppRouter />);

    expect(screen.getByText("模拟演示环境")).toBeInTheDocument();
    expect(screen.getByText(/任务、费用和版本为固定演示数据/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "成品与版本" })).toBeInTheDocument();
  });
});
