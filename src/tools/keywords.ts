import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import {
  generateKeywordIdeas as apiGenerateKeywordIdeas,
  generateKeywordHistoricalMetrics,
  searchGoogleAds,
} from "../services/google-ads-api.js";
import type { KeywordIdeaResult, KeywordVolumeResult } from "../types.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { readTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

const MAX_ROWS = 10000;

const limitParam = z
  .number()
  .default(100)
  .describe(
    `Maximum rows to return (1-${MAX_ROWS}). Raise it to reach the long tail — e.g. when cross-referencing against Search Console data. Large values produce large responses`,
  );

/** Guards the LIMIT clause: this value is interpolated into the query string. */
export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_ROWS);
}

/**
 * Picks the GenerateKeywordIdeas seed variant from the caller's inputs.
 *
 * The API accepts exactly one seed, and there is no keyword+site combination —
 * hence the mutual exclusivity checks rather than merging whatever was passed.
 */
export function buildKeywordSeed(input: {
  keywords?: string;
  seed_domain?: string;
  seed_url?: string;
}): { seed: Record<string, unknown>; label: string } {
  const { seed_domain, seed_url } = input;
  const seedKeywords = (input.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (seed_domain) {
    if (seedKeywords.length || seed_url) {
      throw new Error(
        "seed_domain cannot be combined with keywords or seed_url — the Keyword Planner API has no keyword+site seed. Use seed_domain alone.",
      );
    }
    return { seed: { siteSeed: { site: seed_domain } }, label: `site ${seed_domain}` };
  }

  if (seed_url && seedKeywords.length) {
    return {
      seed: { keywordAndUrlSeed: { keywords: seedKeywords, url: seed_url } },
      label: `${seedKeywords.join(", ")} + ${seed_url}`,
    };
  }

  if (seed_url) {
    return { seed: { urlSeed: { url: seed_url } }, label: `url ${seed_url}` };
  }

  if (seedKeywords.length) {
    return {
      seed: { keywordSeed: { keywords: seedKeywords } },
      label: seedKeywords.join(", "),
    };
  }

  throw new Error("Provide at least one of: keywords, seed_domain, or seed_url.");
}

export function registerKeywordTools(server: McpServer) {
  readTool(
    server,
    "generate_keyword_ideas",
    "Generate keyword ideas using Google Ads Keyword Planner. Seed from keywords, a domain (seed_domain), or a page URL (seed_url). Domain and URL seeds work on sites you do not own — Google returns public information only — which makes this the supported way to research a competitor's keyword surface. Note it reports the keywords Google associates with that site, not proof the advertiser is bidding on them.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      keywords: z
        .string()
        .optional()
        .describe(
          "Comma-separated seed keywords, e.g. 'running shoes, marathon training'",
        ),
      seed_domain: z
        .string()
        .optional()
        .describe(
          "Domain to seed ideas from, e.g. 'competitor.com'. Covers the whole site. Cannot be combined with keywords or seed_url",
        ),
      seed_url: z
        .string()
        .optional()
        .describe(
          "Specific page URL to crawl for ideas. Can be combined with keywords. Returns nothing if the page is not crawlable — prefer seed_domain for whole-site research",
        ),
      language_id: z
        .string()
        .default("1000")
        .describe("Language criterion ID (1000=English, 1001=French, 1009=German)"),
      country_id: z
        .string()
        .describe(
          "Geo target criterion ID (2840=US, 2826=UK, 2276=Germany, 2250=France)",
        ),
      page_size: z
        .number()
        .default(20)
        .describe("Number of keyword ideas to return (max 50)"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { keywords, seed_domain, seed_url, language_id, country_id, page_size } =
        args;
      const { seed, label } = buildKeywordSeed({ keywords, seed_domain, seed_url });

      const payload = {
        ...seed,
        language: `languageConstants/${language_id}`,
        geoTargetConstants: [`geoTargetConstants/${country_id}`],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        pageSize: Math.min(page_size, 50),
      };

      const data = await apiGenerateKeywordIdeas(customer_id, payload);
      const results = (data.results ?? []) as KeywordIdeaResult[];

      if (!results.length) {
        return {
          content: [
            { type: "text", text: "No keyword ideas found for the given seeds." },
          ],
        };
      }

      const lines = [
        `Keyword Ideas for: ${label}`,
        "=".repeat(90),
        `${"Keyword".padEnd(45)} ${"Avg Monthly".padStart(20)} ${"Competition".padStart(12)} ${"Low Bid".padStart(8)} ${"High Bid".padStart(8)}`,
        "-".repeat(90),
      ];

      for (const r of results) {
        const text = r.text ?? "N/A";
        const m = r.keywordIdeaMetrics ?? {};
        const avg = String(m.avgMonthlySearches ?? "N/A");
        const comp = m.competition ?? "N/A";
        const lo = m.lowTopOfPageBidMicros
          ? `$${(Number(m.lowTopOfPageBidMicros) / 1e6).toFixed(2)}`
          : "N/A";
        const hi = m.highTopOfPageBidMicros
          ? `$${(Number(m.highTopOfPageBidMicros) / 1e6).toFixed(2)}`
          : "N/A";
        lines.push(
          `${text.padEnd(45)} ${avg.padStart(20)} ${comp.padStart(12)} ${lo.padStart(8)} ${hi.padStart(8)}`,
        );
      }

      lines.push("-".repeat(90));
      lines.push(`Total ideas: ${results.length}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_keyword_volumes",
    "Get historical search volume metrics for specific keywords. Returns exact volume data (unlike generate_keyword_ideas which suggests related keywords).",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      keywords: z.string().describe("Comma-separated keywords to get exact volumes for"),
      language_id: z.string().default("1000").describe("Language criterion ID"),
      country_id: z.string().describe("Geo target criterion ID (2840=US, 2826=UK, etc.)"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { keywords, language_id, country_id } = args;
      const keywordList = keywords
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);

      const payload = {
        keywords: keywordList,
        language: `languageConstants/${language_id}`,
        geoTargetConstants: [`geoTargetConstants/${country_id}`],
        keywordPlanNetwork: "GOOGLE_SEARCH",
      };

      const data = await generateKeywordHistoricalMetrics(customer_id, payload);
      const results = (data.results ?? []) as KeywordVolumeResult[];

      if (!results.length) {
        return { content: [{ type: "text", text: "No volume data found." }] };
      }

      const lines = [
        "Keyword Volume Data",
        "=".repeat(90),
        `${"Keyword".padEnd(45)} ${"Avg Monthly".padStart(20)} ${"Competition".padStart(12)} ${"Low Bid".padStart(8)} ${"High Bid".padStart(8)}`,
        "-".repeat(90),
      ];

      for (const r of results) {
        const text = r.text ?? "N/A";
        const m = r.keywordMetrics ?? {};
        const avg = String(m.avgMonthlySearches ?? "N/A");
        const comp = m.competition ?? "N/A";
        const lo = m.lowTopOfPageBidMicros
          ? `$${(Number(m.lowTopOfPageBidMicros) / 1e6).toFixed(2)}`
          : "N/A";
        const hi = m.highTopOfPageBidMicros
          ? `$${(Number(m.highTopOfPageBidMicros) / 1e6).toFixed(2)}`
          : "N/A";
        lines.push(
          `${text.padEnd(45)} ${avg.padStart(20)} ${comp.padStart(12)} ${lo.padStart(8)} ${hi.padStart(8)}`,
        );
      }

      lines.push("-".repeat(90));
      lines.push(`Total keywords: ${results.length}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_quality_scores",
    "Get keyword quality scores with component breakdown (expected CTR, ad relevance, landing page experience).",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: filter to a specific campaign ID"),
      limit: limitParam,
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { campaign_id } = args;
      const limit = clampLimit(args.limit);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const query = `
        SELECT
          campaign.name,
          ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group_criterion.quality_info.quality_score,
          ad_group_criterion.quality_info.creative_quality_score,
          ad_group_criterion.quality_info.search_predicted_ctr,
          ad_group_criterion.quality_info.post_click_quality_score,
          metrics.impressions,
          metrics.clicks
        FROM keyword_view
        WHERE ad_group_criterion.status = 'ENABLED'
          ${campaignFilter}
        ORDER BY ad_group_criterion.quality_info.quality_score ASC
        LIMIT ${limit}
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No keyword quality score data found." }],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Keyword Quality Scores for ${formatCustomerId(customer_id)}`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_search_terms",
    "Get actual search queries that triggered your ads (search term report). Shows what users are really searching for.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: filter to a specific campaign ID"),
      limit: limitParam,
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days, campaign_id } = args;
      const limit = clampLimit(args.limit);
      const dateFilter = buildDateFilter(days);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const query = `
        SELECT
          search_term_view.search_term,
          search_term_view.status,
          campaign.name,
          ad_group.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM search_term_view
        WHERE ${dateFilter}
          ${campaignFilter}
        ORDER BY metrics.impressions DESC
        LIMIT ${limit}
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No search term data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Search Terms for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_search_term_insights",
    [
      "Search demand categories for a campaign — the only way to see what Performance Max and Demand Gen campaigns actually matched, since those never appear in get_search_terms.",
      "Called with just campaign_id it returns categories with a bucketed monthly search_volume for each.",
      "Pass category_id (an id from a previous call) to drill into the individual search terms inside one category; search volume is not available at that level.",
    ].join(" "),
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .describe(
          "Campaign ID. Required — the API only serves this report one campaign at a time",
        ),
      category_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe(
          "Drill into one category's individual search terms. Use an id returned by a previous call without this argument",
        ),
      days: z.number().default(30).describe("Number of days to look back"),
      limit: limitParam,
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { campaign_id, category_id, days } = args;
      const limit = clampLimit(args.limit);
      const dateFilter = buildDateFilter(days);
      const campaignFilter = `AND campaign_search_term_insight.campaign_id = ${campaign_id}`;

      if (category_id) {
        // segments.search_term forbids ORDER BY and LIMIT, and must be selected
        // alongside segments.search_subcategory — so sort and trim client-side.
        const query = `
          SELECT
            segments.search_term,
            segments.search_subcategory,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
          FROM campaign_search_term_insight
          WHERE ${dateFilter}
            ${campaignFilter}
            AND campaign_search_term_insight.id = ${category_id}
        `;
        const data = await searchGoogleAds(customer_id, query);
        const rows = (data.results ?? []) as Record<string, unknown>[];
        if (!rows.length) {
          return {
            content: [{ type: "text", text: "No search terms found in that category." }],
          };
        }
        const impressions = (r: Record<string, unknown>) =>
          Number((r.metrics as { impressions?: string })?.impressions ?? 0);
        const sorted = [...rows].sort((a, b) => impressions(b) - impressions(a));
        const shown = sorted.slice(0, limit);
        const text = formatTable(
          shown,
          `Search Terms in Category ${category_id} — campaign ${campaign_id} (last ${days} days)`,
        );
        const note =
          sorted.length > shown.length
            ? `\n\nShowing top ${shown.length} of ${sorted.length} terms by impressions. Raise limit to see more.`
            : "";
        return { content: [{ type: "text", text: text + note }] };
      }

      const query = `
        SELECT
          campaign_search_term_insight.id,
          campaign_search_term_insight.category_label,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.conversions_value,
          metrics.search_volume
        FROM campaign_search_term_insight
        WHERE ${dateFilter}
          ${campaignFilter}
        ORDER BY metrics.impressions DESC
        LIMIT ${limit}
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [
            {
              type: "text",
              text: "No search term insights found. This report covers Search, Shopping, Performance Max and Demand Gen campaigns, and data starts from March 2023.",
            },
          ],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Search Demand Categories for campaign ${campaign_id} (last ${days} days)`,
      );
      return {
        content: [
          {
            type: "text",
            text: `${text}\n\nAn empty category label is the uncategorised bucket. Pass category_id with one of the ids above to see the individual search terms behind a category.`,
          },
        ],
      };
    },
  );

  readTool(
    server,
    "get_paid_organic_search_terms",
    "Compare paid and organic performance for the same search queries. Shows ad clicks next to Search Console organic clicks per query, so you can spot terms you already rank for organically and may be overpaying to advertise on. Requires the Google Ads account to be linked to Search Console.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: filter to a specific campaign ID"),
      limit: limitParam,
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days, campaign_id } = args;
      const limit = clampLimit(args.limit);
      const dateFilter = buildDateFilter(days);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const query = `
        SELECT
          paid_organic_search_term_view.search_term,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.organic_impressions,
          metrics.organic_clicks,
          metrics.combined_clicks,
          metrics.combined_clicks_per_query,
          metrics.ctr,
          metrics.average_cpc
        FROM paid_organic_search_term_view
        WHERE ${dateFilter}
          ${campaignFilter}
        ORDER BY metrics.combined_clicks DESC
        LIMIT ${limit}
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [
            {
              type: "text",
              text: "No paid & organic data found. This report needs the Google Ads account linked to Search Console — check Tools > Linked accounts > Search Console in the Google Ads UI. It also only covers Search campaigns.",
            },
          ],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Paid & Organic Search Terms for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
