import { getEnv } from "../config/env.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { getOAuthAccessToken } from "./oauth.js";
import { getServiceAccountAccessToken } from "./service-account.js";

export async function getAccessToken(): Promise<string> {
  const env = getEnv();
  if (env.GOOGLE_ADS_AUTH_TYPE === "service_account") {
    return getServiceAccountAccessToken();
  }
  return getOAuthAccessToken();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const env = getEnv();
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };

  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = formatCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  }

  return headers;
}
