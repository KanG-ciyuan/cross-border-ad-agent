import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersionsPage } from "./VersionsPage";

describe("VersionsPage", () => {
  it("renders the current task versions and RMB cost instead of demo rows", async () => {
    const review = vi.fn();
    render(<VersionsPage taskTitle="FreshClean 清洁剂" status="pending_content_review" costFen={1800}
      versions={[
        { id: "ver_2", versionNumber: 2, renderReceipt: { status: "completed" }, createdAt: 2 },
        { id: "ver_1", versionNumber: 1, renderReceipt: null, createdAt: 1 }
      ]} onReview={review} />);

    expect(screen.getByText(/FreshClean 清洁剂.*保留每次生成/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /V2.*¥18\.00/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /V1.*分析计划/ })).toBeInTheDocument();
    expect(screen.queryByText("¥13.10")).not.toBeInTheDocument();
  });
});
