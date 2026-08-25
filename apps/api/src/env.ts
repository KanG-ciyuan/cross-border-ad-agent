export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_ENV: "local" | "test" | "preview" | "production";
  SESSION_PEPPER: string;
  ARK_API_KEY?: string;
  SEEDANCE_MODEL_ID?: string;
  MINIMAX_API_KEY?: string;
  MINIMAX_MODEL_ID?: string;
  VIDEO_GENERATION_PROVIDER?: "minimax" | "seedance";
  DECLARED_D1_DATABASE_NAME: string;
  DECLARED_R2_BUCKET_NAME: string;
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
    typeof candidate.DECLARED_D1_DATABASE_NAME === "string" &&
    candidate.DECLARED_D1_DATABASE_NAME.trim().length > 0 &&
    typeof candidate.DECLARED_R2_BUCKET_NAME === "string" &&
    candidate.DECLARED_R2_BUCKET_NAME.trim().length > 0;

  if (!hasRequiredBindings) return false;
  if (candidate.VIDEO_GENERATION_PROVIDER !== undefined &&
    candidate.VIDEO_GENERATION_PROVIDER !== "minimax" &&
    candidate.VIDEO_GENERATION_PROVIDER !== "seedance") return false;
  if (candidate.APP_ENV === "production") return true;

  // These labels are fail-fast configuration metadata, not cloud identity proof.
  return ![
    candidate.DECLARED_D1_DATABASE_NAME,
    candidate.DECLARED_R2_BUCKET_NAME
  ].some(
    (name) =>
      typeof name === "string" &&
      /(^|[-_.])prod(?:uction)?($|[-_.])/i.test(name)
  );
}
