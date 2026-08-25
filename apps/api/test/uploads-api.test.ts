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
  SESSION_PEPPER: "test-only-pepper",
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
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
  return new Request(`${origin}/api/tasks/tsk_upload01/assets`, {
    method: "POST",
    headers: { Cookie: `ad_session=${token}`, Origin: origin, "Content-Type": file.type,
      "Content-Length": String(file.size), "X-Filename": encodeURIComponent(filename) },
    body: file.stream()
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
    const detail = await createApp().fetch(new Request(`${origin}/api/tasks/tsk_upload01`, {
      headers: { Cookie: `ad_session=${token}` }
    }), bindings);
    const detailBody = (await detail.json()) as { assets: Array<Record<string, unknown>> };
    expect(detailBody.assets[0]).not.toHaveProperty("objectKey");
    expect(detailBody.assets[0]).not.toHaveProperty("companyId");
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

  it("rejects raw requests over the 25 MB streaming-upload limit before reading", async () => {
    const response = await createApp().fetch(
      new Request(`${origin}/api/tasks/tsk_upload01/assets`, {
        method: "POST",
        headers: {
          Cookie: `ad_session=${token}`,
          Origin: origin,
          "Content-Type": "video/mp4",
          "X-Filename": "large.mp4",
          "Content-Length": String(25 * 1024 * 1024 + 1)
        },
        body: "--test--"
      }),
      bindings
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "FILE_TOO_LARGE" } });
  });

  it("rejects raw uploads without a declared total length", async () => {
    const response = await createApp().fetch(new Request(`${origin}/api/tasks/tsk_upload01/assets`, {
      method: "POST", headers: { Cookie: `ad_session=${token}`, Origin: origin,
        "Content-Type": "image/jpeg", "X-Filename": "front.jpg" },
      body: new Uint8Array([0xff, 0xd8, 0xff])
    }), bindings);
    expect(response.status).toBe(411);
  });

  it("streams an authenticated rendered video as a download", async () => {
    const repository = new TaskRepository(env.DB);
    await repository.saveAsset({
      id: "ast_output01", taskId: "tsk_upload01", companyId: "cmp_acme",
      kind: "rendered_video", objectKey: "outputs/output.mp4", originalFilename: "ad-v2.mp4",
      mimeType: "video/mp4", sizeBytes: 12, origin: "derived", metadata: {}, createdAt: Date.now()
    });
    const bytes = new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112, 109, 112, 52, 50]);
    await env.MEDIA.put("outputs/output.mp4", bytes);

    const response = await createApp().fetch(new Request(
      `${origin}/api/tasks/tsk_upload01/assets/ast_output01?download=1`,
      { headers: { Cookie: `ad_session=${token}` } }
    ), bindings);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Disposition")).toContain('filename="ad-v2.mp4"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
