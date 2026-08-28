import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/auth/password";
import { AuthRepository } from "../src/auth/repository";
import { createApp } from "../src/index";

const origin = "https://ads.example.test";
const token = "integration-status-session";
const baseBindings = {
  DB: env.DB,
  MEDIA: env.MEDIA,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
};

describe("integration status API", () => {
  beforeEach(async () => {
    const auth = new AuthRepository(env.DB);
    await auth.createUser({
      id: "usr_integrations",
      companyId: "cmp_acme",
      email: "integrations@example.com",
      passwordHash: "unused-hash",
      passwordSalt: "unused-salt",
      passwordIterations: 1,
      createdAt: Date.now()
    });
    await auth.createSession({
      id: "ses_integrations",
      userId: "usr_integrations",
      tokenHash: await hashSessionToken(token),
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000
    });
  });

  function request(path = "seedance", authenticated = true) {
    return new Request(`${origin}/api/integrations/${path}`, authenticated ? {
      headers: { Cookie: `ad_session=${token}` }
    } : undefined);
  }

  it("reports Seedance as unconfigured without making the Worker invalid", async () => {
    const response = await createApp().fetch(request(), baseBindings);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: false,
      model: "doubao-seedance-2-5-260628"
    });
  });

  it("reports only configuration state and never returns the API key", async () => {
    const response = await createApp().fetch(request(), {
      ...baseBindings,
      ARK_API_KEY: "test-only-ark-key",
      SEEDANCE_MODEL_ID: "doubao-seedance-2-5-260628"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ configured: true, model: "doubao-seedance-2-5-260628" });
    expect(JSON.stringify(body)).not.toContain("test-only-ark-key");
  });

  it("requires an authenticated company member", async () => {
    const response = await createApp().fetch(request("seedance", false), baseBindings);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  it("selects MiniMax H3 by default without requiring a key to start locally", async () => {
    const response = await createApp().fetch(request("video-generation"), baseBindings);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      selectedProvider: "minimax",
      configured: false,
      model: "MiniMax-H3",
      providers: {
        minimax: { configured: false, model: "MiniMax-H3" },
        seedance: { configured: false, model: "doubao-seedance-2-5-260628" }
      }
    });
  });

  it("reports the selected MiniMax provider as configured without exposing its key", async () => {
    const response = await createApp().fetch(request("video-generation"), {
      ...baseBindings,
      VIDEO_GENERATION_PROVIDER: "minimax" as const,
      MINIMAX_API_KEY: "test-only-minimax-key",
      MINIMAX_MODEL_ID: "MiniMax-H3"
    });
    const body = await response.json();

    expect(body).toMatchObject({ selectedProvider: "minimax", configured: true, model: "MiniMax-H3" });
    expect(JSON.stringify(body)).not.toContain("test-only-minimax-key");
  });

  it("reports product vision configuration without exposing its key or gateway", async () => {
    const response = await createApp().fetch(request("product-vision"), {
      ...baseBindings,
      PRODUCT_VISION_PROVIDER: "openai_compatible" as const,
      PRODUCT_VISION_API_KEY: "test-only-vision-key",
      PRODUCT_VISION_BASE_URL: "https://gateway.example.test/v1",
      PRODUCT_VISION_MODEL_ID: "vision-model"
    });
    const body = await response.json();

    expect(body).toEqual({ configured: true, provider: "openai_compatible", model: "vision-model" });
    expect(JSON.stringify(body)).not.toContain("test-only-vision-key");
    expect(JSON.stringify(body)).not.toContain("gateway.example.test");
  });
});
