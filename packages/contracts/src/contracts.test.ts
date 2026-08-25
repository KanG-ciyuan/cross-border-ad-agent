import { describe, expect, it } from "vitest";

import { EditPlanV1, TaskCreateInput } from "./index";

describe("TaskCreateInput", () => {
  it("accepts an edit-only task without product generation options", () => {
    const task = TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      editInstructions: "Keep the product-use sequence and cut to 9:16.",
      allowedOperations: ["trim", "concat", "captions"]
    });

    expect(task.goal).toBe("edit_only");
    if (task.goal !== "edit_only") {
      throw new Error("Expected an edit-only task");
    }
    expect(task.editInstructions).toBe("Keep the product-use sequence and cut to 9:16.");
  });

  it.each(["", " ".repeat(4), "x".repeat(1_001)])(
    "rejects empty or oversized edit instructions",
    (editInstructions) => {
      expect(() => TaskCreateInput.parse({
        goal: "edit_only",
        market: "ID",
        platform: "tiktok",
        editInstructions,
        allowedOperations: ["trim"]
      })).toThrow();
    }
  );

  it.each([
    { referenceGeneration: ["three_view"] },
    { generatedShotBriefs: ["Create a product reveal"] },
    { approvedClaims: ["Fast cleaning"] }
  ])("rejects generation or new-copy fields in edit-only mode", (forbidden) => {
    expect(() => TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      editInstructions: "Use only the supplied footage.",
      allowedOperations: ["trim"],
      ...forbidden
    })).toThrow();
  });

  it("accepts complete creation with product facts and reference choices", () => {
    const task = TaskCreateInput.parse({
      goal: "complete_creation",
      inputMode: "product_images",
      market: "ID",
      platform: "tiktok",
      product: {
        name: "KLIN Kitchen Cleaner",
        category: "kitchen_cleaner",
        facts: ["500 ml", "For kitchen grease surfaces"],
        approvedClaims: ["Helps soften kitchen grease"],
        prohibitedClaims: ["100% disinfects", "food grade"],
        usage: "Spray, wait briefly, then wipe"
      },
      referenceGeneration: ["three_view", "nine_grid"]
    });

    expect(task.goal).toBe("complete_creation");
    if (task.goal !== "complete_creation") {
      throw new Error("Expected a complete-creation task");
    }
    expect(task.referenceGeneration).toEqual(["three_view", "nine_grid"]);
  });
});

describe("EditPlanV1", () => {
  const validPlan = {
    version: "edit_plan.v1",
    taskId: "tsk_12345678",
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      language: "id-ID"
    },
    tracks: [{
      id: "trk_12345678",
      type: "video",
      clips: [{
        id: "clp_12345678",
        assetId: "ast_12345678",
        startMs: 0,
        endMs: 1_000,
        origin: "uploaded"
      }]
    }],
    cost: {
      currency: "CNY",
      estimatedFen: 1_800,
      limitFen: 4_500
    }
  } as const;

  it("accepts asset identifiers and integer Chinese fen", () => {
    expect(EditPlanV1.parse(validPlan).cost.estimatedFen).toBe(1_800);
  });

  it.each([
    { sourcePath: "/tmp/run.sh" },
    { command: "ffmpeg -i secret.mp4 output.mp4" },
    { executable: "/bin/sh" }
  ])("rejects arbitrary execution and filesystem fields", (unsafeField) => {
    const unsafe = structuredClone(validPlan) as Record<string, unknown>;
    const tracks = unsafe.tracks as Array<{ clips: Array<Record<string, unknown>> }>;
    Object.assign(tracks[0]!.clips[0]!, unsafeField);

    expect(() => EditPlanV1.parse(unsafe)).toThrow();
  });

  it("rejects clips whose end is not after the start", () => {
    const invalid = structuredClone(validPlan) as unknown as {
      tracks: Array<{ clips: Array<{ endMs: number }> }>;
    };
    const firstTrack = invalid.tracks[0];
    const firstClip = firstTrack?.clips[0];
    if (!firstClip) {
      throw new Error("Expected the fixture to contain one clip");
    }
    firstClip.endMs = 0;

    expect(() => EditPlanV1.parse(invalid)).toThrow();
  });

  it("rejects non-integer money", () => {
    const invalid = structuredClone(validPlan) as unknown as {
      cost: { estimatedFen: number };
    };
    invalid.cost.estimatedFen = 18.5;

    expect(() => EditPlanV1.parse(invalid)).toThrow();
  });
});
