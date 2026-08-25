import { Hono } from "hono";
import { createAuthRoutes } from "./auth/routes";
import type { Env } from "./env";
import { createTaskRoutes } from "./tasks/routes";
import { createUploadRoutes } from "./uploads/routes";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/tasks", createTaskRoutes());
  app.route("/api/tasks", createUploadRoutes());
  return app;
}

export default createApp();
