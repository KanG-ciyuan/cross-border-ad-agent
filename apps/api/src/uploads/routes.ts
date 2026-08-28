import { Hono } from "hono";
import type { Env } from "../env";
import { getAuthenticatedUser, isSameOrigin } from "../auth/session";
import { TaskRepository } from "../tasks/repository";

// Raw uploads are retained only for deployments that explicitly configure object storage.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const allowedTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"
]);

function error(code: string, message: string) {
  return { error: { code, message, retryable: false } };
}

function hasSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (type === "video/mp4" || type === "video/quicktime") return new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
  return false;
}

function normalizeFilename(filename: string): string {
  const basename = filename.normalize("NFKC").split(/[\\/]/).at(-1) ?? "upload";
  return basename.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").trim().slice(0, 120) || "upload";
}

function decodeFilename(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function createUploadRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/:taskId/assets/:assetId", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const assets = await new TaskRepository(context.env.DB).listAssetsForTask(
      context.req.param("taskId"), user.id
    );
    const asset = assets.find((candidate) => candidate.id === context.req.param("assetId"));
    if (!asset || !["rendered_video", "product_image"].includes(asset.kind)) {
      return context.json(error("NOT_FOUND", "Asset not found"), 404);
    }
    if (!context.env.MEDIA) {
      return context.json(error("STORAGE_NOT_CONFIGURED", "Cloud asset storage is not configured"), 503);
    }
    const object = await context.env.MEDIA.get(asset.objectKey);
    if (!object) return context.json(error("NOT_FOUND", "Asset not found"), 404);
    const fallback = asset.originalFilename.replace(/[^A-Za-z0-9._-]/g, "_");
    const disposition = context.req.query("download") === "1" ? "attachment" : "inline";
    return new Response(object.body, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(asset.originalFilename)}`,
        "Cache-Control": "private, no-store"
      }
    });
  });

  routes.post("/:taskId/assets", async (context) => {
    if (!isSameOrigin(context.req.raw)) return context.json(error("FORBIDDEN", "Request denied"), 403);
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    if (!context.env.MEDIA) {
      return context.json(error("STORAGE_NOT_CONFIGURED", "Cloud asset storage is not configured"), 503);
    }
    const lengthHeader = context.req.header("Content-Length") ?? context.req.header("X-File-Size");
    if (!lengthHeader) return context.json(error("LENGTH_REQUIRED", "Content-Length or X-File-Size is required"), 411);
    const declaredLength = Number(lengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
      return context.json(error("INVALID_INPUT", "Content-Length is invalid"), 400);
    }
    if (declaredLength > MAX_FILE_BYTES) return context.json(error("FILE_TOO_LARGE", "File exceeds 25 MB"), 413);

    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);

    const mimeType = context.req.header("Content-Type")?.split(";", 1)[0]?.trim() ?? "";
    const filename = context.req.header("X-Filename");
    const source = context.req.raw.body;
    if (!filename || !source) return context.json(error("INVALID_INPUT", "Raw file body and X-Filename are required"), 400);
    if (!allowedTypes.has(mimeType)) {
      return context.json(error("UNSUPPORTED_MEDIA_TYPE", "Media type is not supported"), 415);
    }
    const [inspectionStream, uploadStream] = source.tee();
    const reader = inspectionStream.getReader();
    const first = await reader.read();
    await reader.cancel();
    const header = first.value?.slice(0, 16) ?? new Uint8Array();
    if (!hasSignature(mimeType, header)) return context.json(error("UNSUPPORTED_MEDIA_TYPE", "Media type is not supported"), 415);

    const assetId = `ast_${crypto.randomUUID()}`;
    const objectKey = `assets/${crypto.randomUUID()}`;
    let receivedBytes = 0;
    const countedStream = uploadStream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > declaredLength || receivedBytes > MAX_FILE_BYTES) throw new Error("UPLOAD_LENGTH_MISMATCH");
        controller.enqueue(chunk);
      }
    }));
    try {
      const fixedLength = new FixedLengthStream(declaredLength);
      await Promise.all([
        countedStream.pipeTo(fixedLength.writable),
        context.env.MEDIA.put(objectKey, fixedLength.readable, {
          httpMetadata: { contentType: mimeType }, customMetadata: { assetId }
        })
      ]);
    } catch {
      await context.env.MEDIA.delete(objectKey);
      return context.json(error("INVALID_INPUT", "Upload length does not match Content-Length"), 400);
    }
    if (receivedBytes !== declaredLength) {
      await context.env.MEDIA.delete(objectKey);
      return context.json(error("INVALID_INPUT", "Upload length does not match Content-Length"), 400);
    }
    try {
      await repository.saveAsset({
        id: assetId, taskId: task.id, companyId: user.companyId,
        kind: mimeType.startsWith("image/") ? "product_image" : "source_video",
        objectKey, originalFilename: normalizeFilename(decodeFilename(filename)), mimeType,
        sizeBytes: declaredLength, origin: "user_upload", metadata: {}, createdAt: Date.now()
      });
      if (task.status === "draft" || task.status === "needs_material") {
        await repository.updateTaskStatus(task.id, user.id, "uploaded", Date.now());
      }
    } catch (failure) {
      await context.env.MEDIA.delete(objectKey);
      throw failure;
    }
    return context.json({ asset: { id: assetId } }, 201);
  });

  return routes;
}
