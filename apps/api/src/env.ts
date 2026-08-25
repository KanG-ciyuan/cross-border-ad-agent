export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_ENV: "local" | "test" | "preview" | "production";
  SESSION_PEPPER: string;
  D1_DATABASE_NAME: string;
  R2_BUCKET_NAME: string;
}

const appEnvironments = new Set<Env["APP_ENV"]>([
  "local",
  "test",
  "preview",
  "production"
]);

export function hasValidWorkerBindings(bindings: unknown): bindings is Env {
  if (!bindings || typeof bindings !== "object") return false;

  const candidate = bindings as Partial<Record<keyof Env, unknown>>;
  const hasRequiredBindings =
    candidate.DB !== undefined &&
    candidate.DB !== null &&
    candidate.MEDIA !== undefined &&
    candidate.MEDIA !== null &&
    typeof candidate.SESSION_PEPPER === "string" &&
    candidate.SESSION_PEPPER.trim().length > 0 &&
    typeof candidate.APP_ENV === "string" &&
    appEnvironments.has(candidate.APP_ENV as Env["APP_ENV"]) &&
    typeof candidate.D1_DATABASE_NAME === "string" &&
    candidate.D1_DATABASE_NAME.trim().length > 0 &&
    typeof candidate.R2_BUCKET_NAME === "string" &&
    candidate.R2_BUCKET_NAME.trim().length > 0;

  if (!hasRequiredBindings) return false;
  if (candidate.APP_ENV === "production") return true;

  return ![candidate.D1_DATABASE_NAME, candidate.R2_BUCKET_NAME].some(
    (name) =>
      typeof name === "string" &&
      /(^|[-_.])prod(?:uction)?($|[-_.])/i.test(name)
  );
}
