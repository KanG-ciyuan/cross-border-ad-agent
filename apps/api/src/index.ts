import { Hono } from "hono";
import { createAuthRoutes } from "./auth/routes";
import { hasValidWorkerBindings, type Env } from "./env";
import { createTaskRoutes } from "./tasks/routes";
import { createUploadRoutes } from "./uploads/routes";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", async (context, next) => {
    if (!hasValidWorkerBindings(context.env)) {
      return context.json({ error: { code: "INVALID_WORKER_BINDINGS" } }, 500);
    }
    await next();
  });
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/tasks", createTaskRoutes());
  app.route("/api/tasks", createUploadRoutes());
  return app;
}

export default createApp();
