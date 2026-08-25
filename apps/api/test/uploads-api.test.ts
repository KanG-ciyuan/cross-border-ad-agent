import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/auth/password";
import { AuthRepository } from "../src/auth/repository";
import { TaskRepository } from "../src/tasks/repository";
import { createApp } from "../src/index";

const origin = "https://ads.example.test";
const token = "upload-api-session";
const bindings = {
  DB: env.DB,
  MEDIA: env.MEDIA,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper"
};

async function seedTask() {
  const auth = new AuthRepository(env.DB);
  await auth.createUser({
    id: "usr_upload",
    companyId: "cmp_acme",
    email: "upload@example.com",
    passwordHash: "unused",
    passwordSalt: "unused",
    passwordIterations: 1,
    createdAt: Date.now()
  });
  await auth.createSession({
    id: "ses_upload",
    userId: "usr_upload",
    tokenHash: await hashSessionToken(token),
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });
  await new TaskRepository(env.DB).createTask({
    id: "tsk_upload01",
    userId: "usr_upload",
    companyId: "cmp_acme",
    title: "Upload test",
    goal: "edit_only",
    inputMode: "video",
    market: "ID",
    platform: "tiktok",
    status: "draft",
    allowedOperations: ["trim"],
    aiVideoEnabled: false,
    createdAt: Date.now()
  });
}

function uploadRequest(file: File, filename = file.name) {
  const form = new FormData();
  form.set("file", file, filename);
  return new Request(`${origin}/api/tasks/tsk_upload01/assets`, {
    method: "POST",
    headers: { Cookie: `ad_session=${token}`, Origin: origin },
    body: form
  });
}

describe("asset upload API", () => {
  beforeEach(seedTask);

  it("stores an accepted image in R2 under an opaque key and normalizes its filename", async () => {
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      "../产品 正面?.jpg",
      { type: "image/jpeg" }
    );
    const response = await createApp().fetch(uploadRequest(jpeg), bindings);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { asset: { id: string } };
    expect(body.asset.id).toMatch(/^ast_[A-Za-z0-9-]{8,}$/);
    const assets = await new TaskRepository(env.DB).listAssetsForTask(
      "tsk_upload01",
      "usr_upload"
    );
    expect(assets[0]?.originalFilename).toBe("产品 正面_.jpg");
    expect(assets[0]?.objectKey).not.toContain("产品");
    expect(await env.MEDIA.get(assets[0]!.objectKey)).not.toBeNull();
  });

  it("rejects unsupported MIME types and mismatched media signatures", async () => {
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    const fakeJpeg = new File(["not-a-jpeg"], "fake.jpg", { type: "image/jpeg" });

    for (const file of [text, fakeJpeg]) {
      const response = await createApp().fetch(uploadRequest(file), bindings);
      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({
        error: { code: "UNSUPPORTED_MEDIA_TYPE" }
      });
    }
  });

  it("rejects requests over the 100 MB per-file limit before buffering", async () => {
    const response = await createApp().fetch(
      new Request(`${origin}/api/tasks/tsk_upload01/assets`, {
        method: "POST",
        headers: {
          Cookie: `ad_session=${token}`,
          Origin: origin,
          "Content-Type": "multipart/form-data; boundary=test",
          "Content-Length": String(100 * 1024 * 1024 + 1)
        },
        body: "--test--"
      }),
      bindings
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "FILE_TOO_LARGE" } });
  });
});
