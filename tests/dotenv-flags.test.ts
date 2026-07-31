import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Regression test: tool registration reads the mutation flag before loadEnv()
 * runs, so a flag set only in .env used to be invisible and write tools were
 * silently not registered.
 */
describe("mutation flag from .env", () => {
  const origEnv = { ...process.env };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-gads-env-"));
  });

  afterEach(() => {
    process.env = { ...origEnv };
    rmSync(dir, { recursive: true, force: true });
  });

  // Bust the module cache so the internal _dotenvLoaded guard resets per test.
  async function freshEnvModule() {
    const mod = `../src/config/env.js?t=${Math.random()}`;
    return (await import(mod)) as typeof import("../src/config/env.js");
  }

  test("is picked up when set only in the .env file", async () => {
    const envFile = join(dir, "flags.env");
    writeFileSync(envFile, "GOOGLE_ADS_ENABLE_MUTATIONS=true\n");
    process.env.GOOGLE_ADS_ENV_FILE = envFile;
    delete process.env.GOOGLE_ADS_ENABLE_MUTATIONS;

    const { isMutationsEnabled } = await freshEnvModule();
    expect(isMutationsEnabled()).toBe(true);
  });

  test("defaults to false when absent everywhere", async () => {
    const envFile = join(dir, "empty.env");
    writeFileSync(envFile, "# nothing here\n");
    process.env.GOOGLE_ADS_ENV_FILE = envFile;
    delete process.env.GOOGLE_ADS_ENABLE_MUTATIONS;

    const { isMutationsEnabled } = await freshEnvModule();
    expect(isMutationsEnabled()).toBe(false);
  });

  test("process env wins over the .env file", async () => {
    const envFile = join(dir, "conflict.env");
    writeFileSync(envFile, "GOOGLE_ADS_ENABLE_MUTATIONS=true\n");
    process.env.GOOGLE_ADS_ENV_FILE = envFile;
    process.env.GOOGLE_ADS_ENABLE_MUTATIONS = "false";

    const { isMutationsEnabled } = await freshEnvModule();
    expect(isMutationsEnabled()).toBe(false);
  });
});
