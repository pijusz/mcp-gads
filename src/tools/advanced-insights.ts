import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { readTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerAdvancedInsightTools(server: McpServer) {
  readTool(
    server,
    "get_account_summary",
    "Quick account dashboard: total metrics + top 5 campaigns by spend.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);

      const [totals, topCampaigns] = await Promise.all([
        searchGoogleAds(
          customer_id,
          `SELECT
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.average_cpc
          FROM customer
          WHERE ${dateFilter}`,
        ),
        searchGoogleAds(
          customer_id,
          `SELECT
            campaign.name,
            campaign.status,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
          FROM campaign
          WHERE ${dateFilter}
          ORDER BY metrics.cost_micros DESC
          LIMIT 5`,
        ),
      ]);

      const lines: string[] = [
        `Account Summary for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
        "=".repeat(80),
      ];

      if (totals.results?.length) {
        lines.push(
          "",
          "Account Totals:",
          formatTable(totals.results as Record<string, unknown>[]),
        );
      }

      if (topCampaigns.results?.length) {
        lines.push(
          "",
          "Top 5 Campaigns by Spend:",
          formatTable(topCampaigns.results as Record<string, unknown>[]),
        );
      }

      if (!totals.results?.length && !topCampaigns.results?.length) {
        return {
          content: [{ type: "text", text: "No account data found for this period." }],
        };
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_impression_share",
    "Get competitive position metrics: impression share, top/absolute top IS, and lost IS (budget & rank).",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z.string().optional().describe("Filter to a specific campaign ID"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const campaignFilter = args.campaign_id
        ? `AND campaign.id = ${args.campaign_id}`
        : "";
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          metrics.search_impression_share,
          metrics.search_top_impression_share,
          metrics.search_absolute_top_impression_share,
          metrics.search_budget_lost_impression_share,
          metrics.search_rank_lost_impression_share
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status = 'ENABLED'
          ${campaignFilter}
        ORDER BY metrics.search_impression_share ASC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No impression share data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Impression Share for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_ad_schedule_performance",
    "Performance breakdown by hour of day or day of week.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      breakdown: z
        .enum(["day_of_week", "hour"])
        .default("day_of_week")
        .describe("Segment by day_of_week or hour"),
      campaign_id: z.string().optional().describe("Filter to a specific campaign ID"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const campaignFilter = args.campaign_id
        ? `AND campaign.id = ${args.campaign_id}`
        : "";
      const segment =
        args.breakdown === "hour" ? "segments.hour" : "segments.day_of_week";
      const query = `
        SELECT
          ${segment},
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status = 'ENABLED'
          ${campaignFilter}
        ORDER BY ${segment}
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No schedule data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Performance by ${args.breakdown === "hour" ? "Hour" : "Day of Week"} for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_audience_performance",
    "Performance breakdown by age range and gender demographics.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z.string().optional().describe("Filter to a specific campaign ID"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const campaignFilter = args.campaign_id
        ? `AND campaign.id = ${args.campaign_id}`
        : "";

      const [ageData, genderData] = await Promise.all([
        searchGoogleAds(
          customer_id,
          `SELECT
            ad_group_criterion.age_range.type,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions
          FROM age_range_view
          WHERE ${dateFilter}
            ${campaignFilter}
          ORDER BY metrics.impressions DESC`,
        ),
        searchGoogleAds(
          customer_id,
          `SELECT
            ad_group_criterion.gender.type,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions
          FROM gender_view
          WHERE ${dateFilter}
            ${campaignFilter}
          ORDER BY metrics.impressions DESC`,
        ),
      ]);

      const sections: string[] = [
        `Audience Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
        "=".repeat(80),
      ];

      if (ageData.results?.length) {
        sections.push(
          "",
          "By Age Range:",
          formatTable(ageData.results as Record<string, unknown>[]),
        );
      }
      if (genderData.results?.length) {
        sections.push(
          "",
          "By Gender:",
          formatTable(genderData.results as Record<string, unknown>[]),
        );
      }

      if (!ageData.results?.length && !genderData.results?.length) {
        return { content: [{ type: "text", text: "No audience data found." }] };
      }

      return { content: [{ type: "text", text: sections.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_landing_page_performance",
    "Landing page URLs with performance metrics.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const query = `
        SELECT
          landing_page_view.unexpanded_final_url,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.cost_micros,
          metrics.conversions
        FROM landing_page_view
        WHERE ${dateFilter}
        ORDER BY metrics.clicks DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No landing page data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Landing Page Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_placement_performance",
    "Where Display and Performance Max ads appeared (websites, apps, YouTube channels).",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
      campaign_id: z.string().optional().describe("Filter to a specific campaign ID"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const campaignFilter = args.campaign_id
        ? `AND campaign.id = ${args.campaign_id}`
        : "";

      const [detailData, pmaxData] = await Promise.all([
        searchGoogleAds(
          customer_id,
          `SELECT
            detail_placement_view.display_name,
            detail_placement_view.placement_type,
            detail_placement_view.target_url,
            campaign.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
          FROM detail_placement_view
          WHERE ${dateFilter}
            ${campaignFilter}
          ORDER BY metrics.impressions DESC
          LIMIT 50`,
        ).catch(() => ({ results: [] })),
        searchGoogleAds(
          customer_id,
          `SELECT
            performance_max_placement_view.display_name,
            performance_max_placement_view.placement_type,
            performance_max_placement_view.target_url,
            metrics.impressions
          FROM performance_max_placement_view
          LIMIT 50`,
        ).catch(() => ({ results: [] })),
      ]);

      const sections: string[] = [
        `Placement Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
        "=".repeat(80),
      ];

      if (detailData.results?.length) {
        sections.push(
          "",
          "Display Placements:",
          formatTable(detailData.results as Record<string, unknown>[]),
        );
      }
      if (pmaxData.results?.length) {
        sections.push(
          "",
          "Performance Max Placements:",
          formatTable(pmaxData.results as Record<string, unknown>[]),
        );
      }

      if (!detailData.results?.length && !pmaxData.results?.length) {
        return { content: [{ type: "text", text: "No placement data found." }] };
      }

      return { content: [{ type: "text", text: sections.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_asset_group_performance",
    "Performance Max asset group metrics including ad strength and status.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const query = `
        SELECT
          asset_group.id,
          asset_group.name,
          asset_group.status,
          asset_group.primary_status,
          asset_group.ad_strength,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value
        FROM asset_group
        WHERE ${dateFilter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No asset group data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Asset Group Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  readTool(
    server,
    "get_video_performance",
    "YouTube and video ad performance metrics including view rates and quartile completion.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const query = `
        SELECT
          video.id,
          video.title,
          video.duration_millis,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.video_quartile_p25_rate,
          metrics.video_quartile_p50_rate,
          metrics.video_quartile_p75_rate,
          metrics.video_quartile_p100_rate
        FROM video
        WHERE ${dateFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No video data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Video Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
