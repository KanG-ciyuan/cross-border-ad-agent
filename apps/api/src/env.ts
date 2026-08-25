export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_ENV: "local" | "test" | "preview" | "production";
  SESSION_PEPPER: string;
}
