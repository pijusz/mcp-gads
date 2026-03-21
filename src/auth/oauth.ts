import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { getEnv } from "../config/env.js";
import { log } from "../utils/logger.js";

const _SCOPES = ["https://www.googleapis.com/auth/adwords"];

/** Derive companion token path from a credentials path (case-insensitive .json). */
export function deriveTokenPath(credPath: string): string {
  if (/\.json$/i.test(credPath)) {
    return credPath.replace(/\.json$/i, "_token.json");
  }
  return `${credPath}_token.json`;
}

interface TokenData {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expiry_date?: number;
}

interface ClientConfig {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

let _client: OAuth2Client | null = null;

export async function getOAuthClient(): Promise<OAuth2Client> {
  if (_client) {
    // Check if token needs refresh
    const creds = _client.credentials;
    if (creds.expiry_date && creds.expiry_date < Date.now() + 60_000) {
      log.info("Refreshing expired OAuth token");
      await _client.refreshAccessToken();
    }
    return _client;
  }

  const env = getEnv();
  const credPath = env.GOOGLE_ADS_CREDENTIALS_PATH;
  const raw = await readFile(credPath, "utf-8");
  const data = JSON.parse(raw);

  if (data.installed || data.web) {
    // This is a client config — we need an existing refresh token or interactive auth
    const config = (data as ClientConfig).installed ?? (data as ClientConfig).web;
    if (!config) {
      throw new Error(`Credentials file at ${credPath} is missing OAuth client config.`);
    }
    _client = new OAuth2Client(config.client_id, config.client_secret);

    // Look for a token file next to the credentials
    const tokenPath = deriveTokenPath(credPath);
    try {
      const tokenRaw = await readFile(tokenPath, "utf-8");
      const token: TokenData = JSON.parse(tokenRaw);
      _client.setCredentials({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type ?? "Bearer",
        expiry_date: token.expiry_date,
      });
      log.info("Loaded OAuth token from", tokenPath);
    } catch {
      throw new Error(
        `No token file found at ${tokenPath}. Run 'mcp-gads setup' to authenticate.`,
      );
    }
  } else if (data.refresh_token) {
    // This is a saved token with embedded client info
    _client = new OAuth2Client(data.client_id, data.client_secret);
    _client.setCredentials({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type ?? "Bearer",
      expiry_date: data.expiry_date,
    });
    log.info("Loaded OAuth credentials from", credPath);
  } else {
    throw new Error(
      `Credentials file at ${credPath} is not a valid OAuth client config or token file.`,
    );
  }

  // Ensure token is valid
  const creds = _client.credentials;
  if (!creds.access_token || (creds.expiry_date && creds.expiry_date < Date.now())) {
    if (creds.refresh_token) {
      log.info("Refreshing OAuth token");
      const res = await _client.refreshAccessToken();
      _client.setCredentials(res.credentials);
      // Persist refreshed token
      await saveToken(credPath, res.credentials);
    } else {
      throw new Error(
        "OAuth token expired and no refresh token available. Run 'mcp-gads setup'.",
      );
    }
  }

  return _client;
}

async function saveToken(credPath: string, credentials: object) {
  try {
    const tokenPath = deriveTokenPath(credPath);
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, JSON.stringify(credentials, null, 2));
    log.info("Saved refreshed token to", tokenPath);
  } catch (e) {
    log.warn("Could not save refreshed token:", e);
  }
}

export async function getOAuthAccessToken(): Promise<string> {
  const client = await getOAuthClient();
  const token = client.credentials.access_token;
  if (!token) throw new Error("No access token available");
  return token;
}
