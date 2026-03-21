import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerGeoTools(server: McpServer) {
  server.tool(
    "get_geographic_performance",
    "Get campaign performance broken down by geographic location (country, region, city).",
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
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days, campaign_id } = args;
      const dateFilter = buildDateFilter(days);
      const campaignFilter = campaign_id ? `AND campaign.id = ${campaign_id}` : "";
      const query = `
        SELECT
          campaign.name,
          geographic_view.country_criterion_id,
          geographic_view.location_type,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr
        FROM geographic_view
        WHERE ${dateFilter}
          ${campaignFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 100
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No geographic performance data found." }],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Geographic Performance for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "get_device_performance",
    "Get campaign performance broken down by device type (desktop, mobile, tablet).",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days } = args;
      const dateFilter = buildDateFilter(days);
      const query = `
        SELECT
          campaign.name,
          campaign.status,
          segments.device,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.ctr,
          metrics.average_cpc
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status = 'ENABLED'
        ORDER BY campaign.name, segments.device
        LIMIT 200
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No device performance data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Device Performance for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
