#!/usr/bin/env bun
import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
/**
 * Interactive credential setup helper.
 * Run with: bun run setup
 *
 * Opens browser for Google OAuth consent, catches the callback,
 * and saves the refresh token to disk.
 */
import { OAuth2Client } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/adwords"];
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

async function main() {
  console.log("\n  mcp-gads — Credential Setup\n");

  const credPath = process.argv[3] ?? process.env.GOOGLE_ADS_CREDENTIALS_PATH ?? "./credentials.json";
  const absPath = resolve(credPath);

  let clientId: string;
  let clientSecret: string;

  try {
    const raw = await readFile(absPath, "utf-8");
    const data = JSON.parse(raw);
    const config = data.installed ?? data.web;
    if (config) {
      clientId = config.client_id;
      clientSecret = config.client_secret;
      console.log(`  Using client config from: ${absPath}`);
    } else {
      throw new Error("not a client config");
    }
  } catch {
    clientId = process.env.GOOGLE_ADS_CLIENT_ID ?? "";
    clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET ?? "";

    if (!clientId || !clientSecret) {
      console.error(
        "  Error: Could not find OAuth client config.\n" +
          "  Either place a credentials.json with 'installed' config,\n" +
          "  or set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET env vars.\n",
      );
      process.exit(1);
    }
    console.log("  Using client ID/secret from environment variables");
  }

  const oauthClient = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log(`\n  Opening browser for authorization...\n`);
  console.log(`  If it doesn't open automatically, visit:\n  ${authUrl}\n`);

  // Try to open browser (exec handles cmd.exe builtins like "start" on Windows)
  const openCmd =
    process.platform === "darwin"
      ? `open ${JSON.stringify(authUrl)}`
      : process.platform === "win32"
        ? `start "" ${JSON.stringify(authUrl)}`
        : `xdg-open ${JSON.stringify(authUrl)}`;

  try {
    exec(openCmd);
  } catch {}

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === "/callback") {
        const authCode = url.searchParams.get("code");
        if (authCode) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authorization successful!</h2><p>You can close this tab.</p></body></html>",
          );
          server.close();
          resolve(authCode);
        } else {
          const error = url.searchParams.get("error") ?? "No code received";
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h2>Error: ${error}</h2></body></html>`);
          server.close();
          reject(new Error(error));
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`  Waiting for callback on port ${REDIRECT_PORT}...`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, 5 * 60_000);
  });

  console.log("  Exchanging authorization code for tokens...");
  const { tokens } = await oauthClient.getToken(code);

  const tokenPath = absPath.replace(/\.json$/i, "_token.json");
  if (tokenPath === absPath) {
    console.error("  Error: Credentials path must end with .json");
    process.exit(1);
  }
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type ?? "Bearer",
    expiry_date: tokens.expiry_date,
    client_id: clientId,
    client_secret: clientSecret,
  };

  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(tokenData, null, 2));

  console.log(`\n  Token saved to: ${tokenPath}`);
  console.log(`\n  Setup complete! You can now run: bun run dev\n`);
}

try {
  await main();
} catch (err) {
  console.error("  Setup failed:", (err as Error).message);
  process.exit(1);
}
