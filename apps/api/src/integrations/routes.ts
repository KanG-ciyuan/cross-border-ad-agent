import { Hono } from "hono";
import { getAuthenticatedUser } from "../auth/session";
import type { Env } from "../env";
import { DEFAULT_SEEDANCE_MODEL } from "../providers/seedance";
import { DEFAULT_MINIMAX_MODEL } from "../providers/minimax";

export function createIntegrationRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get("/seedance", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json({ error: { code: "UNAUTHENTICATED" } }, 401);

    return context.json({
      configured: Boolean(context.env.ARK_API_KEY?.trim()),
      model: context.env.SEEDANCE_MODEL_ID?.trim() || DEFAULT_SEEDANCE_MODEL
    });
  });

  routes.get("/video-generation", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json({ error: { code: "UNAUTHENTICATED" } }, 401);

    const minimax = {
      configured: Boolean(context.env.MINIMAX_API_KEY?.trim()),
      model: context.env.MINIMAX_MODEL_ID?.trim() || DEFAULT_MINIMAX_MODEL
    };
    const seedance = {
      configured: Boolean(context.env.ARK_API_KEY?.trim()),
      model: context.env.SEEDANCE_MODEL_ID?.trim() || DEFAULT_SEEDANCE_MODEL
    };
    const selectedProvider = context.env.VIDEO_GENERATION_PROVIDER ?? "minimax";
    const selected = selectedProvider === "minimax" ? minimax : seedance;
    return context.json({
      selectedProvider,
      ...selected,
      providers: { minimax, seedance }
    });
  });

  return routes;
}
