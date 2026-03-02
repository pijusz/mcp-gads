import { describe, expect, test } from "bun:test";
import {
  buildDateFilter,
  extractFields,
  formatCsv,
  formatTable,
} from "../src/services/format";

describe("extractFields", () => {
  test("flattens nested objects", () => {
    const row = { campaign: { id: "1", name: "foo" }, metrics: { clicks: "10" } };
    const result = extractFields(row);
    expect(result).toEqual([
      ["campaign.id", "1"],
      ["campaign.name", "foo"],
      ["metrics.clicks", "10"],
    ]);
  });

  test("handles top-level scalars", () => {
    const row = { total: 42 };
    const result = extractFields(row);
    expect(result).toEqual([["total", "42"]]);
  });

  test("handles arrays as JSON", () => {
    const row = { urls: ["a", "b"] };
    const result = extractFields(row);
    expect(result).toEqual([["urls", '["a","b"]']]);
  });
});

describe("formatTable", () => {
  test("returns 'No results found.' for empty array", () => {
    expect(formatTable([])).toBe("No results found.");
  });

  test("formats rows with aligned columns", () => {
    const rows = [
      { campaign: { name: "Alpha" }, metrics: { clicks: "100" } },
      { campaign: { name: "Beta" }, metrics: { clicks: "5" } },
    ];
    const table = formatTable(rows);
    expect(table).toContain("campaign.name");
    expect(table).toContain("metrics.clicks");
    expect(table).toContain("Alpha");
    expect(table).toContain("Beta");
  });
});

describe("formatCsv", () => {
  test("returns empty string for empty array", () => {
    expect(formatCsv([])).toBe("");
  });

  test("produces CSV with header and rows", () => {
    const rows = [{ campaign: { name: "A" }, metrics: { clicks: "1" } }];
    const csv = formatCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("campaign.name,metrics.clicks");
    expect(lines[1]).toBe("A,1");
  });

  test("escapes commas in values", () => {
    const rows = [{ campaign: { name: "Hello, World" } }];
    const csv = formatCsv(rows);
    expect(csv).toContain('"Hello, World"');
  });
});

describe("buildDateFilter", () => {
  test("uses DURING for standard values", () => {
    expect(buildDateFilter(7)).toBe("segments.date DURING LAST_7_DAYS");
    expect(buildDateFilter(30)).toBe("segments.date DURING LAST_30_DAYS");
  });

  test("uses BETWEEN for non-standard values", () => {
    const result = buildDateFilter(15);
    expect(result).toMatch(
      /segments\.date BETWEEN '\d{4}-\d{2}-\d{2}' AND '\d{4}-\d{2}-\d{2}'/,
    );
  });
});
