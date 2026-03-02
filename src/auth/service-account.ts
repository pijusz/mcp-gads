import { GoogleAuth } from "google-auth-library";
import { getEnv } from "../config/env.js";
import { log } from "../utils/logger.js";

const SCOPES = ["https://www.googleapis.com/auth/adwords"];

let _auth: GoogleAuth | null = null;

export async function getServiceAccountAccessToken(): Promise<string> {
  const env = getEnv();

  if (!_auth) {
    _auth = new GoogleAuth({
      keyFile: env.GOOGLE_ADS_CREDENTIALS_PATH,
      scopes: SCOPES,
      clientOptions: env.GOOGLE_ADS_IMPERSONATION_EMAIL
        ? { subject: env.GOOGLE_ADS_IMPERSONATION_EMAIL }
        : undefined,
    });
    log.info("Initialized service account auth from", env.GOOGLE_ADS_CREDENTIALS_PATH);
  }

  const client = await _auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = typeof tokenRes === "string" ? tokenRes : tokenRes?.token;
  if (!token) throw new Error("Failed to get service account access token");
  return token;
}
