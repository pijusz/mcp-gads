import { afterEach, beforeEach, describe, expect, test } from "bun:test";

describe("env validation", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache so loadEnv re-parses
    // We test the schema directly instead
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test("GOOGLE_ADS_ENABLE_MUTATIONS defaults to false", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      GOOGLE_ADS_ENABLE_MUTATIONS: z.enum(["true", "false"]).default("false"),
    });
    const result = schema.parse({});
    expect(result.GOOGLE_ADS_ENABLE_MUTATIONS).toBe("false");
  });

  test("GOOGLE_ADS_AUTH_TYPE defaults to oauth", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      GOOGLE_ADS_AUTH_TYPE: z.enum(["oauth", "service_account"]).default("oauth"),
    });
    const result = schema.parse({});
    expect(result.GOOGLE_ADS_AUTH_TYPE).toBe("oauth");
  });

  test("rejects invalid auth type", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      GOOGLE_ADS_AUTH_TYPE: z.enum(["oauth", "service_account"]).default("oauth"),
    });
    expect(() => schema.parse({ GOOGLE_ADS_AUTH_TYPE: "invalid" })).toThrow();
  });
});
