import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerInsightTools(server: McpServer) {
  server.tool(
    "get_recommendations",
    "Get Google's AI-powered optimization recommendations for the account (bid adjustments, keyword suggestions, budget changes, etc.).",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const query = `
        SELECT
          recommendation.type,
          recommendation.impact.base_metrics.impressions,
          recommendation.impact.base_metrics.clicks,
          recommendation.impact.base_metrics.cost_micros,
          recommendation.impact.potential_metrics.impressions,
          recommendation.impact.potential_metrics.clicks,
          recommendation.impact.potential_metrics.cost_micros,
          recommendation.campaign,
          recommendation.dismissed
        FROM recommendation
        WHERE recommendation.dismissed = FALSE
        ORDER BY recommendation.type
        LIMIT 50
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [
            { type: "text", text: "No active recommendations found for this account." },
          ],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Recommendations for ${formatCustomerId(customer_id)}`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "get_change_history",
    "Get recent account changes (campaign updates, bid changes, ad modifications, etc.) from the change_event resource.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(7).describe("Number of days to look back (max 30)"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { days } = args;
      const clampedDays = Math.min(days, 30);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - clampedDays);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const query = `
        SELECT
          change_event.change_date_time,
          change_event.change_resource_type,
          change_event.change_resource_name,
          change_event.client_type,
          change_event.user_email,
          change_event.resource_change_operation,
          campaign.name
        FROM change_event
        WHERE change_event.change_date_time >= '${fmt(start)}' AND change_event.change_date_time <= '${fmt(end)}'
        ORDER BY change_event.change_date_time DESC
        LIMIT 100
      `;

      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No change history found for this period." }],
        };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Change History for ${formatCustomerId(customer_id)} (last ${clampedDays} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
