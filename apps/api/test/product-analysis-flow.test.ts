import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "../src/auth/password";
import { AuthRepository } from "../src/auth/repository";
import { createApp } from "../src/index";
import { TaskRepository } from "../src/tasks/repository";

const origin = "https://ads.example.test";
const token = "product-analysis-session";
const modelOutput = {
  quality: { score: 0.82, decision: "usable_with_enhancement", issues: [] },
  factCandidates: [{
    field: "capacity", value: "500 ml", certainty: "observed",
    confidence: 0.95, evidence: "正面标签"
  }],
  immutableConstraints: ["保持白绿瓶身"],
  missingFacts: ["背标文字"],
  recommendation: { action: "enhance", reason: "小字需要增强" }
};

const bindings = {
  DB: env.DB,
  MEDIA: env.MEDIA,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  PRODUCT_VISION_PROVIDER: "openai_compatible" as const,
  PRODUCT_VISION_API_KEY: "test-vision-key",
  PRODUCT_VISION_BASE_URL: "https://gateway.example.test/v1",
  PRODUCT_VISION_MODEL_ID: "vision-model",
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
};

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `ad_session=${token}`);
  if (init.method && init.method !== "GET") headers.set("Origin", origin);
  return new Request(`${origin}${path}`, { ...init, headers });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    id: "resp_test", object: "response", created: 1, model: "vision-model",
    output: [{
      id: "msg_test", type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", annotations: [], text: JSON.stringify(modelOutput) }]
    }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
  })));
  const auth = new AuthRepository(env.DB);
  await auth.createUser({
    id: "usr_product", companyId: "cmp_acme", email: "product@example.com",
    passwordHash: "unused", passwordSalt: "unused", passwordIterations: 1, createdAt: Date.now()
  });
  await auth.createSession({
    id: "ses_product", userId: "usr_product", tokenHash: await hashSessionToken(token),
    createdAt: Date.now(), expiresAt: Date.now() + 60_000
  });
  const repository = new TaskRepository(env.DB);
  await repository.createTask({
    id: "tsk_product01", userId: "usr_product", companyId: "cmp_acme", title: "Kitchen Cleaner",
    goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok",
    status: "uploaded", allowedOperations: ["transitions"], referenceGeneration: ["three_view"],
    aiVideoEnabled: true, createdAt: Date.now(), input: {
      goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok",
      product: { name: "Kitchen Cleaner", category: "cleaner", facts: ["500 ml"], approvedClaims: [], prohibitedClaims: [], usage: "Spray and wipe" },
      referenceGeneration: ["three_view"]
    }
  });
  await repository.saveAsset({
    id: "ast_product01", taskId: "tsk_product01", companyId: "cmp_acme", kind: "product_image",
    objectKey: "assets/product01", originalFilename: "front.png", mimeType: "image/png",
    sizeBytes: 4, origin: "user_upload", metadata: {}, createdAt: Date.now()
  });
  await env.MEDIA.put("assets/product01", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
});

describe("product image analysis flow", () => {
  it("analyzes an image directly without R2 or a persisted asset", async () => {
    await new TaskRepository(env.DB).createTask({
      id: "tsk_direct01", userId: "usr_product", companyId: "cmp_acme", title: "Direct product",
      goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok",
      status: "draft", allowedOperations: ["transitions"], referenceGeneration: ["three_view"],
      aiVideoEnabled: true, createdAt: Date.now(), input: {
        goal: "complete_creation", inputMode: "product_images", market: "ID", platform: "tiktok",
        product: { name: "Direct product", category: "cleaner", facts: ["500 ml"], approvedClaims: [], prohibitedClaims: [], usage: "Spray and wipe" },
        referenceGeneration: ["three_view"]
      }
    });
    const { MEDIA: _media, DECLARED_R2_BUCKET_NAME: _bucket, ...storageFreeBindings } = bindings;
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await createApp().fetch(request("/api/tasks/tsk_direct01/product-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-File-Size": String(image.byteLength),
        "X-Filename": "front.png",
        "Idempotency-Key": "analyze-direct-1"
      },
      body: image
    }), storageFreeBindings);

    expect(response.status).toBe(202);
    expect(await new TaskRepository(env.DB).listAssetsForTask("tsk_direct01", "usr_product")).toEqual([]);
    expect(await new TaskRepository(env.DB).getLatestProductAnalysis("tsk_direct01", "usr_product")).toMatchObject({
      sourceAssetId: expect.stringMatching(/^ast_[A-Za-z0-9-]{8,}$/),
      versionNumber: 1,
      analysis: { version: "product_analysis.v1", requiresHumanConfirmation: true }
    });
  });

  it("runs the real vision skill, versions its output, and waits for product-facts approval", async () => {
    const response = await createApp().fetch(request("/api/tasks/tsk_product01/product-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "analyze-product-1" },
      body: JSON.stringify({ assetId: "ast_product01" })
    }), bindings);

    expect(response.status).toBe(202);
    const repository = new TaskRepository(env.DB);
    expect(await repository.getLatestProductAnalysis("tsk_product01", "usr_product")).toMatchObject({
      sourceAssetId: "ast_product01", versionNumber: 1,
      analysis: { version: "product_analysis.v1", requiresHumanConfirmation: true }
    });
    expect((await repository.getTaskForUser("tsk_product01", "usr_product"))?.status).toBe("awaiting_generation_approval");
  });

  it("returns and stores a safe upstream diagnostic without leaking response content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("upstream private details", { status: 404 })
    ));

    const response = await createApp().fetch(request("/api/tasks/tsk_product01/product-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "analyze-product-failure" },
      body: JSON.stringify({ assetId: "ast_product01" })
    }), bindings);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "PRODUCT_VISION_UPSTREAM_RESPONSES_404_CHAT_404",
        message: "视觉模型接口返回 HTTP 404，请检查模型和接口兼容性",
        retryable: true
      }
    });
    const attempt = (await new TaskRepository(env.DB)
      .listStepAttempts("tsk_product01", "usr_product"))[0];
    expect(attempt?.errorCode).toBe("PRODUCT_VISION_UPSTREAM_RESPONSES_404_CHAT_404");
  });
});
