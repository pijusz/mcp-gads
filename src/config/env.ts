import { existsSync, readFileSync } from "node:fs";
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
  GOOGLE_ADS_ENABLE_EXTENDED_TOOLS: z.enum(["true", "false"]).default("false"),
  GOOGLE_ADS_API_VERSION: z.string().default("v23"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;
let _dotenvLoaded = false;

function loadDotEnvIfPresent(): void {
  if (_dotenvLoaded) return;
  _dotenvLoaded = true;

  const envFile = process.env.GOOGLE_ADS_ENV_FILE || ".env";
  if (!existsSync(envFile)) return;

  let text: string;
  try {
    text = readFileSync(envFile, "utf-8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    let value = withoutExport.slice(eq + 1).trim();
    const hasQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (hasQuotes && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function formatEnvError(err: z.ZodError): string {
  const lines = err.issues.map((issue) => {
    const key = issue.path.join(".") || "unknown";
    return `- ${key}: ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join("\n")}`;
}

export function loadEnv(): Env {
  if (_env) return _env;
  loadDotEnvIfPresent();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error));
  }
  _env = parsed.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) return loadEnv();
  return _env;
}

export function isMutationsEnabledFromProcessEnv(): boolean {
  return process.env.GOOGLE_ADS_ENABLE_MUTATIONS === "true";
}

export function isExtendedToolsEnabledFromProcessEnv(): boolean {
  return process.env.GOOGLE_ADS_ENABLE_EXTENDED_TOOLS === "true";
}
