import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../env";
import { hashSessionToken } from "./password";
import { AuthRepository, type AuthorizedUser } from "./repository";

export const SESSION_COOKIE = "ad_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function getAuthenticatedUser(
  context: Context<{ Bindings: Env }>
): Promise<AuthorizedUser | null> {
  const token = getCookie(context, SESSION_COOKIE);
  if (!token) return null;

  const repository = new AuthRepository(context.env.DB);
  const session = await repository.findActiveSession(
    await hashSessionToken(token),
    Date.now()
  );
  if (!session) return null;
  return repository.findUserById(session.userId);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}
