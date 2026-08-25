import { Hono } from "hono";
import { createAuthRoutes } from "./auth/routes";
import type { Env } from "./env";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/auth", createAuthRoutes());
  return app;
}

export default createApp();
