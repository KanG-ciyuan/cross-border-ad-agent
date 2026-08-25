import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppRouter } from "./router";

describe("AppRouter", () => {
  it("opens the matching task review after generation approval", async () => {
    window.history.pushState({}, "", "/tasks/tsk_demo0001/confirm?demo=1");
    render(<AppRouter />);

    for (const checkbox of screen.getAllByRole("checkbox")) await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "确认并生成初版" }));

    expect(await screen.findByRole("heading", { name: "审核广告初版" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/tasks/tsk_demo0001/review");
  });
});
