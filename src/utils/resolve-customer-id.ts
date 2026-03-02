import { getEnv } from "../config/env.js";

export function resolveCustomerId(provided?: string): string {
  const id = provided || getEnv().GOOGLE_ADS_CUSTOMER_ID;
  if (!id) {
    throw new Error(
      "customer_id is required. Either pass it as a parameter or set GOOGLE_ADS_CUSTOMER_ID environment variable.",
    );
  }
  return id;
}
