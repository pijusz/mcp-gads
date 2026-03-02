import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import {
  generateKeywordIdeas as apiGenerateKeywordIdeas,
  generateKeywordHistoricalMetrics,
  searchGoogleAds,
} from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";

export function registerKeywordTools(server: McpServer) {
  server.tool(
    "generate_keyword_ideas",
    "Generate keyword ideas using Google Ads Keyword Planner. Returns search volume estimates and keyword suggestions based on seed keywords.",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      keywords: z
        .string()
        .describe(
          "Comma-separated seed keywords, e.g. 'running shoes, marathon training'",
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
    async ({ customer_id, keywords, language_id, country_id, page_size }) => {
      const seedKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const payload = {
        keywordSeed: { keywords: seedKeywords },
        language: `languageConstants/${language_id}`,
        geoTargetConstants: [`geoTargetConstants/${country_id}`],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        pageSize: Math.min(page_size, 50),
      };

      const data = await apiGenerateKeywordIdeas(customer_id, payload);
      const results = (data.results ?? []) as Record<string, any>[];

      if (!results.length) {
        return {
          content: [
            { type: "text", text: "No keyword ideas found for the given seeds." },
          ],
        };
      }

      const lines = [
        `Keyword Ideas for: ${seedKeywords.join(", ")}`,
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

  server.tool(
    "get_keyword_volumes",
    "Get historical search volume metrics for specific keywords. Returns exact volume data (unlike generate_keyword_ideas which suggests related keywords).",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      keywords: z.string().describe("Comma-separated keywords to get exact volumes for"),
      language_id: z.string().default("1000").describe("Language criterion ID"),
      country_id: z.string().describe("Geo target criterion ID (2840=US, 2826=UK, etc.)"),
    },
    async ({ customer_id, keywords, language_id, country_id }) => {
      const keywordList = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const payload = {
        keywords: keywordList,
        language: `languageConstants/${language_id}`,
        geoTargetConstants: [`geoTargetConstants/${country_id}`],
        keywordPlanNetwork: "GOOGLE_SEARCH",
      };

      const data = await generateKeywordHistoricalMetrics(customer_id, payload);
      const results = (data.results ?? []) as Record<string, any>[];

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

  server.tool(
    "get_quality_scores",
    "Get keyword quality scores with component breakdown (expected CTR, ad relevance, landing page experience).",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: filter to a specific campaign ID"),
    },
    async ({ customer_id, campaign_id }) => {
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
        LIMIT 100
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

  server.tool(
    "get_search_terms",
    "Get actual search queries that triggered your ads (search term report). Shows what users are really searching for.",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z
        .string()
        .regex(/^\d+$/, "Must be a numeric ID")
        .optional()
        .describe("Optional: filter to a specific campaign ID"),
    },
    async ({ customer_id, days, campaign_id }) => {
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
        LIMIT 100
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
}
