import { afterEach, describe, expect, it, vi } from "vitest";
import { createTask, getSession, listTasks, uploadAsset } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("returns null for an unauthenticated session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(getSession()).resolves.toBeNull();
  });

  it("loads persisted tasks with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ tasks: [{ id: "tsk_real0001" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listTasks()).resolves.toEqual([{ id: "tsk_real0001" }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("creates a task through the API instead of local demo state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ task: { id: "tsk_real0002" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createTask({ goal: "edit_only", market: "ID", platform: "tiktok", allowedOperations: ["trim"] });
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" }));
  });

  it("uploads a raw file with MIME type and encoded filename metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ asset: { id: "ast_real0001" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "产品 正面.jpg", { type: "image/jpeg" });
    await uploadAsset("tsk_real0002", file);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/tsk_real0002/assets", expect.objectContaining({
      method: "POST", body: file,
      headers: expect.objectContaining({ "Content-Type": "image/jpeg", "X-File-Size": String(file.size), "X-Filename": encodeURIComponent(file.name) })
    }));
  });
});
