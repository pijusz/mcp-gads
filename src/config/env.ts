import { z } from "zod";

const envSchema = z.object({
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1, "GOOGLE_ADS_DEVELOPER_TOKEN is required"),
  GOOGLE_ADS_CREDENTIALS_PATH: z
    .string()
    .min(1, "GOOGLE_ADS_CREDENTIALS_PATH is required"),
  GOOGLE_ADS_AUTH_TYPE: z.enum(["oauth", "service_account"]).default("oauth"),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().default(""),
  GOOGLE_ADS_CUSTOMER_ID: z.string().default(""),
  GOOGLE_ADS_IMPERSONATION_EMAIL: z.string().default(""),
  GOOGLE_ADS_ENABLE_MUTATIONS: z.enum(["true", "false"]).default("false"),
  GOOGLE_ADS_API_VERSION: z.string().default("v23"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}

export function getEnv(): Env {
  if (!_env) return loadEnv();
  return _env;
}
