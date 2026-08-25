import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRouter, canUseDemoBypass } from "./router";

describe("AppRouter", () => {
  it("allows the public demo query only in Vite development", () => {
    expect(canUseDemoBypass("?demo=1", true)).toBe(true);
    expect(canUseDemoBypass("?demo=1", false)).toBe(false);
    expect(canUseDemoBypass("?demo=0", true)).toBe(false);
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
