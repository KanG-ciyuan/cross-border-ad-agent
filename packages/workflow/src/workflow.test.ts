import { describe, expect, it } from "vitest";

import {
  canRunGeneration,
  evaluateGeneration,
  nextAttempt,
  transition
} from "./index";

describe("generation policy", () => {
  it("requires reference approval before generation", () => {
    expect(canRunGeneration({
      goal: "complete_creation",
      referenceApproved: false,
      storyboardApproved: true,
      costApproved: true,
      riskApproved: true,
      estimatedFen: 1_800,
      limitFen: 4_500
    })).toBe(false);
  });

  it("never permits generation for edit-only tasks", () => {
    expect(evaluateGeneration({
      goal: "edit_only",
      referenceApproved: true,
      storyboardApproved: true,
      costApproved: true,
      riskApproved: true,
      estimatedFen: 0,
      limitFen: 4_500
    })).toEqual({
      allowed: false,
      reason: "EDIT_ONLY_GENERATION_FORBIDDEN"
    });
  });

  it("rejects generation above the approved cost limit", () => {
    expect(evaluateGeneration({
      goal: "complete_creation",
      referenceApproved: true,
      storyboardApproved: true,
      costApproved: true,
      riskApproved: true,
      estimatedFen: 4_501,
      limitFen: 4_500
    })).toEqual({
      allowed: false,
      reason: "COST_LIMIT_EXCEEDED"
    });
  });

  it("permits generation after every gate passes", () => {
    expect(canRunGeneration({
      goal: "complete_creation",
      referenceApproved: true,
      storyboardApproved: true,
      costApproved: true,
      riskApproved: true,
      estimatedFen: 3_200,
      limitFen: 4_500
    })).toBe(true);
  });
});

describe("retry policy", () => {
  it("stops retrying after two automatic attempts", () => {
    expect(nextAttempt({ attempts: 2, maxAutomaticAttempts: 2 })).toEqual({
      action: "pause_for_human"
    });
  });

  it("only retries the failed unit before the limit", () => {
    expect(nextAttempt({ attempts: 1, maxAutomaticAttempts: 2 })).toEqual({
      action: "retry_failed_unit",
      attempt: 2
    });
  });
});

describe("task state transitions", () => {
  it("requires plan approval before preview rendering", () => {
    expect(() => transition("analyzing", "start_preview" as never)).toThrow(
      "INVALID_TRANSITION"
    );
    expect(transition("analyzing", "analysis_ready")).toBe(
      "awaiting_plan_approval"
    );
    expect(
      transition("awaiting_plan_approval" as never, "approve_plan" as never)
    ).toBe("previewing");
  });

  it("moves a completed preview into human review", () => {
    expect(transition("previewing" as never, "preview_complete" as never)).toBe(
      "awaiting_preview_review"
    );
  });

  it("keeps rejected previews in a revision loop", () => {
    expect(
      transition("awaiting_preview_review" as never, "request_revision" as never)
    ).toBe("revision_requested");
    expect(
      transition("revision_requested" as never, "submit_revision" as never)
    ).toBe("awaiting_plan_approval");
  });

  it("does not skip final approval", () => {
    expect(() => transition("pending_content_review", "approve_final")).toThrow(
      "INVALID_TRANSITION"
    );
  });

  it("moves through content and final approval separately", () => {
    expect(transition("pending_content_review", "approve_content")).toBe(
      "pending_final_approval"
    );
    expect(transition("pending_final_approval", "approve_final")).toBe(
      "approved"
    );
  });

  it("allows a failed render to be retried without restarting analysis", () => {
    expect(transition("rendering", "render_failed")).toBe("failed_retryable");
    expect(transition("failed_retryable", "retry_render")).toBe("ready_to_render");
  });

  it("allows cancellation before final approval but not after approval", () => {
    expect(transition("analyzing", "cancel")).toBe("cancelled");
    expect(() => transition("approved", "cancel")).toThrow("INVALID_TRANSITION");
  });
});
