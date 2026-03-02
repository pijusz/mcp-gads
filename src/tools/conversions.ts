import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerConversionTools(server: McpServer) {
  server.tool(
    "get_conversion_actions",
    "List conversion actions with their settings and recent performance metrics.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const dateFilter = buildDateFilter(args.days);
      const query = `
        SELECT
          conversion_action.id,
          conversion_action.name,
          conversion_action.type,
          conversion_action.status,
          conversion_action.category,
          conversion_action.counting_type,
          conversion_action.primary_for_goal,
          metrics.all_conversions,
          metrics.all_conversions_value
        FROM conversion_action
        WHERE ${dateFilter}
        ORDER BY metrics.all_conversions DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No conversion actions found." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Conversion Actions for ${formatCustomerId(customer_id)} (last ${args.days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
