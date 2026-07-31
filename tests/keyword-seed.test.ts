import { describe, expect, test } from "bun:test";
import { buildKeywordSeed } from "../src/tools/keywords.js";

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
