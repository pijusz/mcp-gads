import { getAuthHeaders } from "../auth/index.js";
import { getEnv } from "../config/env.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { log } from "../utils/logger.js";

const BASE = "https://googleads.googleapis.com";

interface FetchWithRetryOpts extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

async function fetchWithRetry(
  url: string,
  { retries = 2, retryDelay = 1000, timeout = 30_000, ...init }: FetchWithRetryOpts = {},
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      // Retry on 429 / 5xx
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const delay = retryDelay * 2 ** attempt;
        log.warn(
          `HTTP ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await sleep(delay);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        const delay = retryDelay * 2 ** attempt;
        log.warn(
          `Fetch error — retrying in ${delay}ms (attempt ${attempt + 1}/${retries}):`,
          (err as Error).message,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface SearchResult {
  results?: Record<string, unknown>[];
  totalResultsCount?: string;
  fieldMask?: string;
  nextPageToken?: string;
}

export async function searchGoogleAds(
  customerId: string,
  query: string,
): Promise<SearchResult> {
  const env = getEnv();
  const headers = await getAuthHeaders();
  const cid = formatCustomerId(customerId);
  const url = `${BASE}/${env.GOOGLE_ADS_API_VERSION}/customers/${cid}/googleAds:search`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<SearchResult>;
}

export async function listAccessibleCustomers(): Promise<string[]> {
  const env = getEnv();
  const headers = await getAuthHeaders();
  const url = `${BASE}/${env.GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`;

  const res = await fetchWithRetry(url, { method: "GET", headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { resourceNames?: string[] };
  return (data.resourceNames ?? []).map((rn) => rn.split("/").pop()!);
}

export async function generateKeywordIdeas(
  customerId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const env = getEnv();
  const headers = await getAuthHeaders();
  const cid = formatCustomerId(customerId);
  const url = `${BASE}/${env.GOOGLE_ADS_API_VERSION}/customers/${cid}:generateKeywordIdeas`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keyword Ideas API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

export async function generateKeywordHistoricalMetrics(
  customerId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const env = getEnv();
  const headers = await getAuthHeaders();
  const cid = formatCustomerId(customerId);
  const url = `${BASE}/${env.GOOGLE_ADS_API_VERSION}/customers/${cid}:generateKeywordHistoricalMetrics`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keyword Metrics API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

export async function mutateResource(
  customerId: string,
  resource: string,
  operations: Record<string, unknown>[],
): Promise<Record<string, unknown>> {
  const env = getEnv();
  const headers = await getAuthHeaders();
  const cid = formatCustomerId(customerId);
  const url = `${BASE}/${env.GOOGLE_ADS_API_VERSION}/customers/${cid}/${resource}:mutate`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ operations }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mutate API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetchWithRetry(imageUrl, { retries: 1 });

  if (!res.ok) {
    throw new Error(`Image download failed (${res.status})`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
