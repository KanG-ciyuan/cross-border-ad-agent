import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("Vite development proxy", () => {
  it("preserves the browser host for API same-origin checks", () => {
    const proxy = (config as { server?: { proxy?: Record<string, unknown> } }).server?.proxy?.["/api"];

    expect(proxy).toEqual(expect.objectContaining({
      target: "http://localhost:8787",
      changeOrigin: false
    }));
  });
});
