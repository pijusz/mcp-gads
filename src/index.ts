#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json";
import { deriveTokenPath } from "./auth/oauth.js";
import { loadEnv } from "./config/env.js";
import { createServer } from "./server.js";
import { log } from "./utils/logger.js";

export const VERSION = pkg.version;

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`mcp-gads v${VERSION}`);
  process.exit(0);
}

if (process.argv[2] === "setup") {
  await import("./auth/setup.js");
  process.exit(0);
}

try {
  loadEnv();
} catch (err) {
  log.error("Environment validation failed:", (err as Error).message);
  process.exit(1);
}

await validateCredentials();

const server = createServer();
const transport = new StdioServerTransport();

log.info(`Starting mcp-gads v${VERSION} on stdio`);
await server.connect(transport);

checkForUpdates();

async function validateCredentials() {
  const env = loadEnv();
  const credPath = env.GOOGLE_ADS_CREDENTIALS_PATH;

  let raw: string;
  try {
    raw = await readFile(credPath, "utf-8");
  } catch {
    log.error(`Credentials file not found: ${credPath}`);
    log.error("Download your OAuth client JSON from Google Cloud Console");
    log.error("and set GOOGLE_ADS_CREDENTIALS_PATH to its path.");
    process.exit(1);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    log.error(`Credentials file is not valid JSON: ${credPath}`);
    process.exit(1);
  }

  if (env.GOOGLE_ADS_AUTH_TYPE === "oauth") {
    const isClientConfig = !!(
      (data as { installed?: unknown }).installed || (data as { web?: unknown }).web
    );
    const isTokenFile = !!(data as { refresh_token?: unknown }).refresh_token;

    if (isClientConfig) {
      const tokenPath = deriveTokenPath(credPath);
      try {
        await readFile(tokenPath, "utf-8");
      } catch {
        log.error(`OAuth token file not found: ${tokenPath}`);
        log.error("Run 'mcp-gads setup' to complete authorization.");
        process.exit(1);
      }
    } else if (!isTokenFile) {
      log.error(
        `Credentials file is not a valid OAuth client config or token: ${credPath}`,
      );
      process.exit(1);
    }
  }
}

function checkForUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  fetch("https://api.github.com/repos/pijusz/mcp-gads/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
    signal: controller.signal,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { tag_name?: string } | null) => {
      if (!data?.tag_name) return;
      const latest = data.tag_name.replace(/^v/, "");
      if (latest !== VERSION) {
        log.warn(
          `v${latest} available (current: v${VERSION}). Download: https://github.com/pijusz/mcp-gads/releases/latest`,
        );
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}
