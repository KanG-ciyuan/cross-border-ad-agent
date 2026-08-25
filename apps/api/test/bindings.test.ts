import { parse, type ParseError } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";
// @ts-expect-error Vite loads the configuration source for JSONC parsing in tests.
import wranglerConfigSource from "../wrangler.jsonc?raw";

interface ResourceEnvironment {
  vars: Record<string, string>;
  d1_databases: Array<{
    binding: string;
    database_name: string;
    database_id?: string;
    preview_database_id?: string;
  }>;
  r2_buckets: Array<{
    binding: string;
    bucket_name: string;
    preview_bucket_name?: string;
  }>;
}

interface WranglerConfig extends ResourceEnvironment {
  assets?: {
    directory?: string;
    binding?: string;
    not_found_handling?: string;
    run_worker_first?: string[] | boolean;
  };
  env: { preview: ResourceEnvironment };
}

const parseErrors: ParseError[] = [];
const wranglerConfig = parse(wranglerConfigSource, parseErrors) as WranglerConfig;
const previewD1IdPlaceholder = "preview-d1-id-requires-fresh-approval";

const validBindings = {
  DB: {} as D1Database,
  MEDIA: {} as R2Bucket,
  APP_ENV: "test" as const,
  SESSION_PEPPER: "test-only-pepper",
  DECLARED_D1_DATABASE_NAME: "ad-agent-test-db",
  DECLARED_R2_BUCKET_NAME: "ad-agent-test-media"
};

function requestWith(bindings: Record<string, unknown>) {
  return createApp().fetch(new Request("https://ads.example.test/not-found"), bindings);
}

describe("Worker binding boundary", () => {
  for (const binding of ["DB", "MEDIA", "SESSION_PEPPER", "APP_ENV"] as const) {
    it(`refuses requests when ${binding} is missing`, async () => {
      const bindings: Record<string, unknown> = { ...validBindings };
      delete bindings[binding];

      const response = await requestWith(bindings);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_WORKER_BINDINGS" }
      });
    });
  }

  for (const binding of [
    "DECLARED_D1_DATABASE_NAME",
    "DECLARED_R2_BUCKET_NAME"
  ] as const) {
    it(`refuses requests when declared metadata ${binding} is missing`, async () => {
      const bindings: Record<string, unknown> = { ...validBindings };
      delete bindings[binding];

      const response = await requestWith(bindings);

      expect(response.status).toBe(500);
    });
  }

  it.each(["", "development", "prod", "staging"])(
    "refuses the non-explicit APP_ENV value %j",
    async (APP_ENV) => {
      const response = await requestWith({ ...validBindings, APP_ENV });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_WORKER_BINDINGS" }
      });
    }
  );

  it.each(["local", "test", "preview", "production"] as const)(
    "accepts the explicit APP_ENV value %s",
    async (APP_ENV) => {
      const response = await requestWith({ ...validBindings, APP_ENV });

      expect(response.status).toBe(404);
    }
  );

  it("rejects an unknown video-generation provider", async () => {
    const response = await requestWith({
      ...validBindings,
      VIDEO_GENERATION_PROVIDER: "unknown-provider"
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "INVALID_WORKER_BINDINGS" } });
  });

  it.each(["local", "test", "preview"] as const)(
    "refuses production-named D1 declaration metadata in %s",
    async (APP_ENV) => {
      const response = await requestWith({
        ...validBindings,
        APP_ENV,
        DECLARED_D1_DATABASE_NAME: "ad-agent-production-db"
      });

      expect(response.status).toBe(500);
    }
  );

  it.each(["local", "test", "preview"] as const)(
    "refuses production-named R2 declaration metadata in %s",
    async (APP_ENV) => {
      const response = await requestWith({
        ...validBindings,
        APP_ENV,
        DECLARED_R2_BUCKET_NAME: "ad-agent-prod-media"
      });

      expect(response.status).toBe(500);
    }
  );
});

function expectIsolatedResourceDeclarations(
  environment: ResourceEnvironment,
  APP_ENV: "local" | "test" | "preview"
) {
  expect(environment.vars.APP_ENV).toBe(APP_ENV);

  const database = environment.d1_databases.find(({ binding }) => binding === "DB");
  const bucket = environment.r2_buckets.find(({ binding }) => binding === "MEDIA");
  expect(database).toBeDefined();
  expect(bucket).toBeDefined();
  expect(environment.vars.DECLARED_D1_DATABASE_NAME).toBe(database?.database_name);
  expect(environment.vars.DECLARED_R2_BUCKET_NAME).toBe(bucket?.bucket_name);

  const resourceIdentifiers = [
    database?.database_name,
    database?.database_id,
    database?.preview_database_id,
    bucket?.bucket_name,
    bucket?.preview_bucket_name
  ].filter((value): value is string => typeof value === "string");
  for (const identifier of resourceIdentifiers) {
    expect(identifier).not.toMatch(/(^|[-_.])prod(?:uction)?($|[-_.])/i);
  }
}

describe("Wrangler resource isolation", () => {
  it("parses the JSONC configuration without errors", () => {
    expect(parseErrors).toEqual([]);
  });

  it("ties local and preview guard labels to their declared D1 and R2 resources", () => {
    expectIsolatedResourceDeclarations(wranglerConfig, "local");
    expectIsolatedResourceDeclarations(wranglerConfig.env.preview, "preview");
  });

  it.each(["local", "test", "preview"] as const)(
    "rejects a production resource declaration behind safe %s labels",
    (APP_ENV) => {
      const environment = structuredClone(wranglerConfig.env.preview);
      environment.vars.APP_ENV = APP_ENV;
      environment.d1_databases[0]!.database_name = `ad-agent-${APP_ENV}-db`;
      environment.vars.DECLARED_D1_DATABASE_NAME = `ad-agent-${APP_ENV}-db`;
      environment.r2_buckets[0]!.bucket_name = `ad-agent-${APP_ENV}-media`;
      environment.vars.DECLARED_R2_BUCKET_NAME = `ad-agent-${APP_ENV}-media`;
      environment.d1_databases[0]!.database_id = "production-database-id";

      expect(() => expectIsolatedResourceDeclarations(environment, APP_ENV)).toThrow();
    }
  );

  it("keeps the committed preview D1 ID as a non-resource approval sentinel", () => {
    expect(wranglerConfig.env.preview.d1_databases[0]?.database_id).toBe(
      previewD1IdPlaceholder
    );
  });

  it("serves the built SPA while routing API requests through the Worker first", () => {
    expect(wranglerConfig.assets).toEqual({
      directory: "../web/dist",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api", "/api/*"]
    });
  });
});
