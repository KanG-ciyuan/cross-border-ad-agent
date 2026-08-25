import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRepository } from "../src/auth/repository";
import { derivePasswordRecord, hashSessionToken } from "../src/auth/password";
import { createApp } from "../src/index";

const origin = "https://ads.example.test";
const testEnv = {
  DB: env.DB,
  MEDIA: {} as R2Bucket,
  APP_ENV: "production" as const,
  SESSION_PEPPER: "test-only-pepper-not-a-real-secret",
  DECLARED_D1_DATABASE_NAME: "ad-agent-production-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-production-media"
};
const previewEnv = {
  ...testEnv,
  APP_ENV: "preview" as const,
  DECLARED_D1_DATABASE_NAME: "ad-agent-preview-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-preview-media"
};
const password = "Test-only-password-42";

async function seedAuthorizedUser() {
  const credentials = await derivePasswordRecord(password, testEnv.SESSION_PEPPER, {
    iterations: 1_000,
    salt: new Uint8Array(16).fill(7)
  });
  await new AuthRepository(env.DB).createUser({
    id: "usr_owner",
    companyId: "cmp_acme",
    email: "owner@example.com",
    passwordHash: credentials.hash,
    passwordSalt: credentials.salt,
    passwordIterations: credentials.iterations,
    createdAt: Date.now()
  });
}

function request(path: string, init?: RequestInit) {
  return new Request(`${origin}${path}`, init);
}

describe("invite-only authentication", () => {
  beforeEach(seedAuthorizedUser);

  it("logs in an authorized user and stores only the session-token hash", async () => {
    const app = createApp();
    const response = await app.fetch(
      request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: "OWNER@example.com", password })
      }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: "usr_owner", email: "owner@example.com", companyId: "cmp_acme" }
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");

    const rawToken = /ad_session=([^;]+)/.exec(cookie)?.[1];
    expect(rawToken).toBeTruthy();
    const stored = await env.DB.prepare("SELECT token_hash FROM sessions").first<{
      token_hash: string;
    }>();
    expect(stored?.token_hash).toBe(await hashSessionToken(rawToken!));
    expect(stored?.token_hash).not.toBe(rawToken);
  });

  it("returns the same generic failure for an unknown email and a wrong password", async () => {
    const app = createApp();
    const attempt = async (email: string, submittedPassword: string) => {
      const response = await app.fetch(
        request("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email, password: submittedPassword })
        }),
        testEnv
      );
      return { status: response.status, body: await response.json() };
    };

    expect(await attempt("missing@example.com", password)).toEqual(
      await attempt("owner@example.com", "wrong-test-password")
    );
  });

  it("sets a Secure session cookie when logging into preview", async () => {
    const response = await createApp().fetch(
      request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: "owner@example.com", password })
      }),
      previewEnv
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("expires preview sessions with a Secure cookie", async () => {
    const response = await createApp().fetch(
      request("/api/auth/logout", {
        method: "POST",
        headers: { Origin: origin }
      }),
      previewEnv
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("has no public registration, password-reset, or user-list route", async () => {
    const app = createApp();

    for (const path of ["/api/auth/register", "/api/auth/reset-password", "/api/users"]) {
      const response = await app.fetch(
        request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: "{}"
        }),
        testEnv
      );
      expect(response.status).toBe(404);
    }
  });

  it("rejects expired sessions", async () => {
    const repository = new AuthRepository(env.DB);
    const token = "expired-test-token";
    await repository.createSession({
      id: "ses_expired",
      userId: "usr_owner",
      tokenHash: await hashSessionToken(token),
      createdAt: 1,
      expiresAt: 2
    });

    const response = await createApp().fetch(
      request("/api/auth/me", { headers: { Cookie: `ad_session=${token}` } }),
      testEnv
    );

    expect(response.status).toBe(401);
  });

  it("rejects cross-origin authentication mutations", async () => {
    const response = await createApp().fetch(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://untrusted.example"
        },
        body: JSON.stringify({ email: "owner@example.com", password })
      }),
      testEnv
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "CROSS_ORIGIN_REQUEST" } });
  });

  it("does not log submitted credentials or derived values", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await createApp().fetch(
      request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: "owner@example.com", password })
      }),
      testEnv
    );

    const output = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(output).toBe("");
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
