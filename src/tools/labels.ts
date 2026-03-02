import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerLabelTools(server: McpServer) {
  server.tool(
    "get_labels",
    "List labels and their assignments to campaigns or ad groups.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      type: z
        .enum(["all", "campaign", "ad_group"])
        .default("all")
        .describe("Type of label assignments to retrieve"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const sections: string[] = [];

      if (args.type === "all" || args.type === "campaign") {
        const query = `
          SELECT
            label.id,
            label.name,
            campaign.id,
            campaign.name
          FROM campaign_label
          ORDER BY label.name
          LIMIT 100
        `;
        const data = await searchGoogleAds(customer_id, query);
        if (data.results?.length) {
          sections.push(
            formatTable(
              data.results as Record<string, unknown>[],
              "Campaign Labels",
            ),
          );
        }
      }

      if (args.type === "all" || args.type === "ad_group") {
        const query = `
          SELECT
            label.id,
            label.name,
            ad_group.id,
            ad_group.name,
            campaign.name
          FROM ad_group_label
          ORDER BY label.name
          LIMIT 100
        `;
        const data = await searchGoogleAds(customer_id, query);
        if (data.results?.length) {
          sections.push(
            formatTable(
              data.results as Record<string, unknown>[],
              "Ad Group Labels",
            ),
          );
        }
      }

      if (args.type === "all") {
        const query = `
          SELECT
            label.id,
            label.name,
            label.status
          FROM label
          ORDER BY label.name
          LIMIT 100
        `;
        const data = await searchGoogleAds(customer_id, query);
        if (data.results?.length) {
          sections.push(
            formatTable(
              data.results as Record<string, unknown>[],
              "All Labels",
            ),
          );
        }
      }

      if (sections.length === 0) {
        return {
          content: [{ type: "text", text: `No labels found for ${formatCustomerId(customer_id)}.` }],
        };
      }

      return { content: [{ type: "text", text: sections.join("\n\n") }] };
    },
  );
}
