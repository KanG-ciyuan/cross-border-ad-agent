import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";
import {
  generateSessionToken,
  hashSessionToken,
  verifyPassword
} from "./password";
import { AuthRepository } from "./repository";
import {
  getAuthenticatedUser,
  isSameOrigin,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS
} from "./session";

const INVALID_CREDENTIALS = { error: { code: "INVALID_CREDENTIALS" } } as const;

function publicUser(user: { id: string; email: string; companyId: string }) {
  return { id: user.id, email: user.email, companyId: user.companyId };
}

export function createAuthRoutes() {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/login", async (context) => {
    if (!isSameOrigin(context.req.raw)) {
      return context.json({ error: { code: "CROSS_ORIGIN_REQUEST" } }, 403);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(INVALID_CREDENTIALS, 401);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>).email !== "string" ||
      typeof (body as Record<string, unknown>).password !== "string"
    ) {
      return context.json(INVALID_CREDENTIALS, 401);
    }

    const { email, password } = body as { email: string; password: string };
    const repository = new AuthRepository(context.env.DB);
    const user = await repository.findUserByEmail(email);
    const valid = user
      ? await verifyPassword(password, context.env.SESSION_PEPPER, {
          hash: user.passwordHash,
          salt: user.passwordSalt,
          iterations: user.passwordIterations
        })
      : false;
    if (!user || !valid || user.disabledAt !== null) {
      return context.json(INVALID_CREDENTIALS, 401);
    }

    const token = generateSessionToken();
    const now = Date.now();
    await repository.createSession({
      id: `ses_${crypto.randomUUID()}`,
      userId: user.id,
      tokenHash: await hashSessionToken(token),
      createdAt: now,
      expiresAt: now + SESSION_TTL_SECONDS * 1_000
    });
    setCookie(context, SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      secure: context.env.APP_ENV === "production",
      sameSite: "Lax",
      maxAge: SESSION_TTL_SECONDS
    });

    return context.json({ user: publicUser(user) });
  });

  routes.post("/logout", async (context) => {
    if (!isSameOrigin(context.req.raw)) {
      return context.json({ error: { code: "CROSS_ORIGIN_REQUEST" } }, 403);
    }
    const token = getCookie(context, SESSION_COOKIE);
    if (token) {
      await new AuthRepository(context.env.DB).deleteSessionByTokenHash(
        await hashSessionToken(token)
      );
    }
    deleteCookie(context, SESSION_COOKIE, {
      path: "/",
      secure: context.env.APP_ENV === "production"
    });
    return context.json({ ok: true });
  });

  routes.get("/me", async (context) => {
    const user = await getAuthenticatedUser(context);
    if (!user) return context.json({ error: { code: "UNAUTHENTICATED" } }, 401);
    return context.json({ user: publicUser(user) });
  });

  return routes;
}
