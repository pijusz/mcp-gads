import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
/** Set when the credentials file itself holds the token (embedded client_id/secret). */
let _embeddedToken: Record<string, unknown> | null = null;

let _initPromise: Promise<OAuth2Client> | null = null;
let _refreshPromise: Promise<unknown> | null = null;

export async function getOAuthClient(): Promise<OAuth2Client> {
  // Concurrent tool calls must share one initialization (and one token refresh).
  if (_initPromise) {
    await _initPromise;
  } else if (!_client) {
    _initPromise = initOAuthClient();
    try {
      return await _initPromise;
    } catch (e) {
      _client = null;
      throw e;
    } finally {
      _initPromise = null;
    }
  }
  if (_client) {
    // Check if token needs refresh
    const creds = _client.credentials;
    if (creds.expiry_date && creds.expiry_date < Date.now() + 60_000) {
      if (!_refreshPromise) {
        log.info("Refreshing expired OAuth token");
        _refreshPromise = _client.refreshAccessToken().finally(() => {
          _refreshPromise = null;
        });
      }
      await _refreshPromise;
    }
    return _client;
  }
  return getOAuthClient();
}

async function initOAuthClient(): Promise<OAuth2Client> {
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
    _embeddedToken = data;
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
      _embeddedToken = await saveToken(credPath, res.credentials, _embeddedToken);
    } else {
      throw new Error(
        "OAuth token expired and no refresh token available. Run 'mcp-gads setup'.",
      );
    }
  }

  return _client;
}

/**
 * Persist a refreshed token. If the credentials file embeds the token (`embedded` set), merge
 * into that file; otherwise write the companion `*_token.json`. Returns the new embedded data.
 */
export async function saveToken(
  credPath: string,
  credentials: object,
  embedded: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  try {
    if (embedded) {
      // Token lives in the credentials file itself: merge the refreshed token back into it
      // (keeping client_id/client_secret) instead of writing a companion file that is never read.
      const merged = { ...embedded, ...credentials };
      const tmp = `${credPath}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 });
      await rename(tmp, credPath);
      log.info("Saved refreshed token to", credPath);
      return merged;
    }
    const tokenPath = deriveTokenPath(credPath);
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    log.info("Saved refreshed token to", tokenPath);
  } catch (e) {
    log.warn("Could not save refreshed token:", e);
  }
  return embedded;
}

export async function getOAuthAccessToken(): Promise<string> {
  const client = await getOAuthClient();
  const token = client.credentials.access_token;
  if (!token) throw new Error("No access token available");
  return token;
}
