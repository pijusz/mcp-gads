import { describe, expect, test } from "bun:test";
import { buildKeywordSeed, clampLimit } from "../src/tools/keywords.js";

describe("clampLimit", () => {
  test("passes through valid values", () => {
    expect(clampLimit(100)).toBe(100);
    expect(clampLimit(2500)).toBe(2500);
  });

  test("clamps to the 1..10000 range", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-50)).toBe(1);
    expect(clampLimit(99999)).toBe(10000);
  });

  test("truncates fractional values", () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  test("falls back to 100 for non-finite input", () => {
    expect(clampLimit(Number.NaN)).toBe(100);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(100);
    expect(clampLimit(Number.NEGATIVE_INFINITY)).toBe(100);
  });

  test("always yields an integer safe to interpolate", () => {
    for (const v of [1, 3.7, -2, 1e9, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isInteger(clampLimit(v))).toBe(true);
    }
  });
});

describe("buildKeywordSeed", () => {
  test("keywords produce a keywordSeed", () => {
    const { seed, label } = buildKeywordSeed({ keywords: "running shoes, marathon" });
    expect(seed).toEqual({ keywordSeed: { keywords: ["running shoes", "marathon"] } });
    expect(label).toBe("running shoes, marathon");
  });

  test("trims and drops empty keywords", () => {
    const { seed } = buildKeywordSeed({ keywords: " a , , b ,, " });
    expect(seed).toEqual({ keywordSeed: { keywords: ["a", "b"] } });
  });

  test("seed_domain produces a siteSeed", () => {
    const { seed, label } = buildKeywordSeed({ seed_domain: "competitor.com" });
    expect(seed).toEqual({ siteSeed: { site: "competitor.com" } });
    expect(label).toBe("site competitor.com");
  });

  test("seed_url alone produces a urlSeed", () => {
    const { seed } = buildKeywordSeed({ seed_url: "https://example.com/pricing" });
    expect(seed).toEqual({ urlSeed: { url: "https://example.com/pricing" } });
  });

  test("keywords plus seed_url produce a keywordAndUrlSeed", () => {
    const { seed } = buildKeywordSeed({
      keywords: "pricing",
      seed_url: "https://example.com/pricing",
    });
    expect(seed).toEqual({
      keywordAndUrlSeed: {
        keywords: ["pricing"],
        url: "https://example.com/pricing",
      },
    });
  });

  test("seed_domain cannot be combined with keywords", () => {
    expect(() =>
      buildKeywordSeed({ keywords: "shoes", seed_domain: "competitor.com" }),
    ).toThrow(/cannot be combined/);
  });

  test("seed_domain cannot be combined with seed_url", () => {
    expect(() =>
      buildKeywordSeed({
        seed_domain: "competitor.com",
        seed_url: "https://competitor.com/x",
      }),
    ).toThrow(/cannot be combined/);
  });

  test("whitespace-only keywords are treated as absent", () => {
    expect(() => buildKeywordSeed({ keywords: " , , " })).toThrow(/at least one of/);
  });

  test("no seed at all is rejected", () => {
    expect(() => buildKeywordSeed({})).toThrow(/at least one of/);
  });
});
