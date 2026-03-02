import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerCampaignTools(server: McpServer) {
  server.tool(
    "get_campaign_performance",
    `Get campaign performance metrics for the specified time period.

RECOMMENDED WORKFLOW:
1. First run list_accounts() to get available account IDs
2. Then run get_account_currency() to see what currency the account uses
3. Finally run this command to get campaign performance

Note: Cost values are in micros (1,000,000 = 1 unit of currency).`,
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z
        .number()
        .default(30)
        .describe("Number of days to look back (7, 14, 30, 90, etc.)"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days } = args;
      const dateFilter = buildDateFilter(days);
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.average_cpc
        FROM campaign
        WHERE ${dateFilter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No campaign data found for this period." }],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Campaign Performance for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "get_budget_utilization",
    "Get campaign budget amounts vs actual spend to see budget utilization. Shows whether campaigns are limited by budget.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days } = args;
      const dateFilter = buildDateFilter(days);
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign_budget.amount_micros,
          campaign_budget.total_amount_micros,
          campaign_budget.status,
          campaign_budget.type,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks
        FROM campaign
        WHERE ${dateFilter}
          AND campaign.status = 'ENABLED'
        ORDER BY metrics.cost_micros DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No budget data found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Budget Utilization for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
