/**
 * Extract nested fields from a Google Ads API result row.
 * e.g. { campaign: { id: "1", name: "foo" }, metrics: { clicks: "10" } }
 * → [["campaign.id","1"], ["campaign.name","foo"], ["metrics.clicks","10"]]
 */
export function extractFields(row: Record<string, unknown>): [string, string][] {
  const pairs: [string, string][] = [];

  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        pairs.push([`${key}.${subKey}`, stringify(subVal)]);
      }
    } else {
      pairs.push([key, stringify(value)]);
    }
  }

  return pairs;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Format query results as an aligned table.
 */
export function formatTable(results: Record<string, unknown>[], title?: string): string {
  if (results.length === 0) return "No results found.";

  const fieldSet = new Map<string, number>();
  for (const row of results) {
    for (const [key, val] of extractFields(row)) {
      const cur = fieldSet.get(key) ?? key.length;
      fieldSet.set(key, Math.max(cur, val.length));
    }
  }

  const fields = [...fieldSet.keys()];
  const widths = new Map(
    fields.map((f) => [f, Math.max(fieldSet.get(f) ?? f.length, f.length)]),
  );
  const getWidth = (field: string) => widths.get(field) ?? field.length;

  const lines: string[] = [];
  if (title) {
    lines.push(title);
    lines.push("-".repeat(80));
  }

  lines.push(fields.map((f) => f.padEnd(getWidth(f))).join(" | "));
  lines.push(fields.map((f) => "-".repeat(getWidth(f))).join("-+-"));

  for (const row of results) {
    const pairs = new Map(extractFields(row));
    lines.push(fields.map((f) => (pairs.get(f) ?? "").padEnd(getWidth(f))).join(" | "));
  }

  return lines.join("\n");
}

/**
 * Format query results as CSV.
 */
export function formatCsv(results: Record<string, unknown>[]): string {
  if (results.length === 0) return "";

  const fieldSet = new Set<string>();
  for (const row of results) {
    for (const [key] of extractFields(row)) fieldSet.add(key);
  }
  const fields = [...fieldSet];

  const lines: string[] = [fields.join(",")];
  for (const row of results) {
    const pairs = new Map(extractFields(row));
    lines.push(fields.map((f) => csvEscape(pairs.get(f) ?? "")).join(","));
  }

  return lines.join("\n");
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Build a GAQL date filter.
 * Validates standard DURING values, falls back to BETWEEN for non-standard day counts.
 */
const STANDARD_DURING = new Set([7, 14, 30, 90]);

export function buildDateFilter(days: number): string {
  if (STANDARD_DURING.has(days)) {
    return `segments.date DURING LAST_${days}_DAYS`;
  }
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `segments.date BETWEEN '${fmt(start)}' AND '${fmt(end)}'`;
}
