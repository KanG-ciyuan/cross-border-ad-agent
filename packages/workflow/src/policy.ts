import type { TaskGoal } from "@ad-agent/contracts";

export type GenerationDenialReason =
  | "EDIT_ONLY_GENERATION_FORBIDDEN"
  | "REFERENCE_APPROVAL_REQUIRED"
  | "STORYBOARD_APPROVAL_REQUIRED"
  | "COST_APPROVAL_REQUIRED"
  | "RISK_APPROVAL_REQUIRED"
  | "COST_LIMIT_EXCEEDED";

export interface GenerationGateInput {
  goal: TaskGoal;
  referenceApproved: boolean;
  storyboardApproved: boolean;
  costApproved: boolean;
  riskApproved: boolean;
  estimatedFen: number;
  limitFen: number;
}

export type GenerationDecision =
  | { allowed: true }
  | { allowed: false; reason: GenerationDenialReason };

export function evaluateGeneration(input: GenerationGateInput): GenerationDecision {
  if (input.goal === "edit_only") {
    return { allowed: false, reason: "EDIT_ONLY_GENERATION_FORBIDDEN" };
  }
  if (!input.referenceApproved) {
    return { allowed: false, reason: "REFERENCE_APPROVAL_REQUIRED" };
  }
  if (!input.storyboardApproved) {
    return { allowed: false, reason: "STORYBOARD_APPROVAL_REQUIRED" };
  }
  if (!input.costApproved) {
    return { allowed: false, reason: "COST_APPROVAL_REQUIRED" };
  }
  if (!input.riskApproved) {
    return { allowed: false, reason: "RISK_APPROVAL_REQUIRED" };
  }
  if (input.estimatedFen > input.limitFen) {
    return { allowed: false, reason: "COST_LIMIT_EXCEEDED" };
  }
  return { allowed: true };
}

export function canRunGeneration(input: GenerationGateInput): boolean {
  return evaluateGeneration(input).allowed;
}

export function nextAttempt(input: {
  attempts: number;
  maxAutomaticAttempts: number;
}): { action: "pause_for_human" } | { action: "retry_failed_unit"; attempt: number } {
  if (!Number.isInteger(input.attempts) || input.attempts < 0) {
    throw new Error("INVALID_ATTEMPT_COUNT");
  }
  if (!Number.isInteger(input.maxAutomaticAttempts) || input.maxAutomaticAttempts < 1) {
    throw new Error("INVALID_RETRY_LIMIT");
  }
  if (input.attempts >= input.maxAutomaticAttempts) {
    return { action: "pause_for_human" };
  }
  return { action: "retry_failed_unit", attempt: input.attempts + 1 };
}
