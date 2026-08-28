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

  routes.get("/product-vision", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json({ error: { code: "UNAUTHENTICATED" } }, 401);

    const configured = Boolean(
      context.env.PRODUCT_VISION_PROVIDER === "openai_compatible" &&
      context.env.PRODUCT_VISION_API_KEY?.trim() &&
      context.env.PRODUCT_VISION_BASE_URL?.trim() &&
      context.env.PRODUCT_VISION_MODEL_ID?.trim()
    );
    return context.json({
      configured,
      provider: context.env.PRODUCT_VISION_PROVIDER ?? "openai_compatible",
      model: context.env.PRODUCT_VISION_MODEL_ID?.trim() || "未配置"
    });
  });

  return routes;
}
