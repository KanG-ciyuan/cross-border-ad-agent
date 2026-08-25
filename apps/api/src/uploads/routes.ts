import { Hono } from "hono";
import type { Env } from "../env";
import { getAuthenticatedUser, isSameOrigin } from "../auth/session";
import { TaskRepository } from "../tasks/repository";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
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

export function createUploadRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/:taskId/assets", async (context) => {
    if (!isSameOrigin(context.req.raw)) return context.json(error("FORBIDDEN", "Request denied"), 403);
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json(error("AUTH_REQUIRED", "Authentication required"), 401);
    const declaredLength = Number(context.req.header("Content-Length") ?? 0);
    if (declaredLength > MAX_FILE_BYTES) return context.json(error("FILE_TOO_LARGE", "File exceeds 100 MB"), 413);

    const repository = new TaskRepository(context.env.DB);
    const task = await repository.getTaskForUser(context.req.param("taskId"), user.id);
    if (!task) return context.json(error("NOT_FOUND", "Task not found"), 404);

    let body: Record<string, string | File>;
    try {
      body = await context.req.parseBody();
    } catch {
      return context.json(error("INVALID_INPUT", "Multipart form is invalid"), 400);
    }
    const file = body.file;
    if (!(file instanceof File)) return context.json(error("INVALID_INPUT", "A file is required"), 400);
    if (file.size > MAX_FILE_BYTES) return context.json(error("FILE_TOO_LARGE", "File exceeds 100 MB"), 413);
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!allowedTypes.has(file.type) || !hasSignature(file.type, header)) {
      return context.json(error("UNSUPPORTED_MEDIA_TYPE", "Media type is not supported"), 415);
    }

    const assetId = `ast_${crypto.randomUUID()}`;
    const objectKey = `assets/${crypto.randomUUID()}`;
    await context.env.MEDIA.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { assetId }
    });
    try {
      await repository.saveAsset({
        id: assetId, taskId: task.id, companyId: user.companyId,
        kind: file.type.startsWith("image/") ? "product_image" : "source_video",
        objectKey, originalFilename: normalizeFilename(file.name), mimeType: file.type,
        sizeBytes: file.size, origin: "user_upload", metadata: {}, createdAt: Date.now()
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
