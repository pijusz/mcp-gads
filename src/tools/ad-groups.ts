import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { readTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerAdGroupTools(server: McpServer) {
  readTool(
    server,
    "get_ad_group_performance",
    "Get ad group performance metrics. Optionally filter by campaign ID.",
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
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group.type,
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.average_cpc
        FROM ad_group
        WHERE ${dateFilter}
          ${campaignFilter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No ad group data found for this period." }],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Ad Group Performance for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
