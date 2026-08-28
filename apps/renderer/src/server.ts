import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeClipWindow,
  normalizeVideoClip,
  probeVideo,
  renderFinalVideo,
  RendererError,
  requireSupportedVideoType,
  parseRenderManifest
} from "./ffmpeg-renderer.ts";
import { renderTextPpm } from "./bitmap-text.ts";

async function webRequest(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return new Request("http://127.0.0.1/render", {
    method: request.method,
    headers,
    body: Readable.toWeb(request) as ReadableStream,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

async function handleRender(request: IncomingMessage) {
  const form = await (await webRequest(request)).formData();
  const manifest = parseRenderManifest(form.get("manifest"));
  const workspace = await mkdtemp(join(tmpdir(), "adflow-render-"));
  try {
    const normalizedInputs: string[] = [];
    const normalizedDurations: number[] = [];
    for (let index = 0; index < manifest.clips.length; index += 1) {
      const clip = manifest.clips[index]!;
      const upload = form.get(clip.field);
      if (!(upload instanceof Blob)) throw new RendererError("MATERIAL_REQUIRED");
      const extension = requireSupportedVideoType(clip.mimeType);
      const sourcePath = join(workspace, `source-${index}${extension}`);
      const normalizedPath = join(workspace, `normalized-${index}.mp4`);
      await writeFile(sourcePath, new Uint8Array(await upload.arrayBuffer()), { mode: 0o600 });
      const inspection = await probeVideo(sourcePath);
      const window = normalizeClipWindow(clip, inspection.durationMs);
      await normalizeVideoClip({
        inputPath: sourcePath,
        outputPath: normalizedPath,
        ...window,
        width: manifest.output.width,
        height: manifest.output.height,
        fps: manifest.output.fps,
        fit: clip.fit ?? manifest.output.fit ?? manifest.fit,
        hasAudio: inspection.hasAudio && !manifest.muteOriginalAudio
      });
      normalizedInputs.push(normalizedPath);
      normalizedDurations.push(window.durationSeconds);
    }
    const titleOverlay = join(workspace, "title.ppm");
    const captionOverlay = join(workspace, "caption.ppm");
    const ctaOverlay = join(workspace, "cta.ppm");
    await Promise.all([
      writeFile(titleOverlay, renderTextPpm({ text: manifest.title, width: 760, height: 86, scale: 6 })),
      writeFile(captionOverlay, renderTextPpm({ text: manifest.caption, width: 820, height: 142, scale: 5 })),
      writeFile(ctaOverlay, renderTextPpm({ text: manifest.cta, width: 650, height: 100, scale: 6 }))
    ]);
    const outputPath = join(workspace, "output.mp4");
    await renderFinalVideo({
      normalizedInputs,
      normalizedDurations,
      outputPath,
      ...manifest.output,
      titleOverlay,
      captionOverlay,
      ctaOverlay
    });
    return await readFile(outputPath);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

const port = Number(process.env.RENDERER_PORT ?? "8790");
const host = process.env.RENDERER_HOST ?? "127.0.0.1";
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}');
    return;
  }
  if (request.method !== "POST" || request.url !== "/render") {
    response.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"NOT_FOUND"}');
    return;
  }
  try {
    const output = await handleRender(request);
    response.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": String(output.byteLength),
      "Cache-Control": "no-store"
    }).end(output);
  } catch (failure) {
    const code = failure instanceof RendererError ? failure.code : "RENDERER_FAILED";
    response.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: code }));
  }
});

server.listen(port, host, () => {
  console.log(`AdFlow renderer ready on http://${host}:${port}`);
});
