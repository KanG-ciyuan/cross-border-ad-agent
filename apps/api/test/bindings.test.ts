import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";

const validBindings = {
  DB: {} as D1Database,
  MEDIA: {} as R2Bucket,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  D1_DATABASE_NAME: "ad-agent-test-db",
  R2_BUCKET_NAME: "ad-agent-test-media"
};

function requestWith(bindings: Record<string, unknown>) {
  return createApp().fetch(new Request("https://ads.example.test/not-found"), bindings);
}

describe("Worker binding boundary", () => {
  for (const binding of ["DB", "MEDIA", "SESSION_PEPPER", "APP_ENV"] as const) {
    it(`refuses requests when ${binding} is missing`, async () => {
      const bindings: Record<string, unknown> = { ...validBindings };
      delete bindings[binding];

      const response = await requestWith(bindings);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_WORKER_BINDINGS" }
      });
    });
  }

  for (const binding of ["D1_DATABASE_NAME", "R2_BUCKET_NAME"] as const) {
    it(`refuses non-production requests when ${binding} is missing`, async () => {
      const bindings: Record<string, unknown> = { ...validBindings };
      delete bindings[binding];

      const response = await requestWith(bindings);

      expect(response.status).toBe(500);
    });
  }

  it.each(["", "development", "prod", "staging"])(
    "refuses the non-explicit APP_ENV value %j",
    async (APP_ENV) => {
      const response = await requestWith({ ...validBindings, APP_ENV });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_WORKER_BINDINGS" }
      });
    }
  );

  it.each(["local", "test", "preview", "production"] as const)(
    "accepts the explicit APP_ENV value %s",
    async (APP_ENV) => {
      const response = await requestWith({ ...validBindings, APP_ENV });

      expect(response.status).toBe(404);
    }
  );

  it.each(["local", "test", "preview"] as const)(
    "refuses a production-named D1 target in %s",
    async (APP_ENV) => {
      const response = await requestWith({
        ...validBindings,
        APP_ENV,
        D1_DATABASE_NAME: "ad-agent-production-db"
      });

      expect(response.status).toBe(500);
    }
  );

  it.each(["local", "test", "preview"] as const)(
    "refuses a production-named R2 target in %s",
    async (APP_ENV) => {
      const response = await requestWith({
        ...validBindings,
        APP_ENV,
        R2_BUCKET_NAME: "ad-agent-prod-media"
      });

      expect(response.status).toBe(500);
    }
  );
});
