import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationPage } from "./ConfirmationPage";
import { ReviewPage } from "./ReviewPage";

describe("ConfirmationPage", () => {
  it("keeps source metadata outside reference images and blocks generation until all confirmations", async () => {
    const generate = vi.fn();
    const { container } = render(<ConfirmationPage taskTitle="FreshClean 清洁剂" estimatedFen={1800} limitFen={4500} onGenerate={generate} onBack={() => undefined} />);

    expect(screen.getByText(/FreshClean 清洁剂/)).toBeInTheDocument();
    expect(screen.getByText("¥18.00")).toBeInTheDocument();
    expect(screen.getAllByText("生成候选")).toHaveLength(2);
    for (const image of screen.getAllByRole("img")) {
      expect(image.getAttribute("alt")).not.toMatch(/生成候选|AI|推测/);
      expect(image.getAttribute("src")).not.toMatch(/generated|ai|inferred/i);
    }
    expect(container.querySelector(".reference-image .source-badge")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "确认并生成初版" }));
    expect(screen.getByText("请完成全部四项确认")).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("ReviewPage", () => {
  it("retries one shot without replacing successful shots and keeps final approval separate", async () => {
    const retryShot = vi.fn();
    const approveContent = vi.fn();
    const approveFinal = vi.fn();
    render(
      <ReviewPage
        taskTitle="FreshClean 清洁剂"
        versionNumber={2}
        onRetryShot={retryShot}
        onApproveContent={approveContent}
        onApproveFinal={approveFinal}
      />
    );

    expect(screen.getAllByText(/FreshClean 清洁剂/)).toHaveLength(2);
    expect(screen.getByText(/FreshClean 清洁剂.*V2/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "重新生成镜头 3" }));
    expect(retryShot).toHaveBeenCalledWith(3);
    expect(screen.getByText("镜头 2 已通过")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最终批准" })).toBeDisabled();

    for (const checkbox of screen.getAllByRole("checkbox")) await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "通过内容审核" }));
    expect(approveContent).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "最终批准" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "最终批准" }));
    expect(approveFinal).toHaveBeenCalledOnce();
  });

  it("waits for content approval before enabling final approval", async () => {
    let finishApproval: (() => void) | undefined;
    const approveContent = vi.fn(() => new Promise<void>((resolve) => { finishApproval = resolve; }));
    render(<ReviewPage onRetryShot={() => undefined} onApproveContent={approveContent} onApproveFinal={() => undefined} />);
    for (const checkbox of screen.getAllByRole("checkbox")) await userEvent.click(checkbox);

    await userEvent.click(screen.getByRole("button", { name: "通过内容审核" }));

    expect(screen.getByRole("button", { name: "正在提交审核" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "最终批准" })).toBeDisabled();
    finishApproval?.();
    expect(await screen.findByRole("button", { name: "最终批准" })).toBeEnabled();
  });
});
