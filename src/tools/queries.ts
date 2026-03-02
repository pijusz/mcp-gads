import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatCsv, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";

export function registerQueryTools(server: McpServer) {
  server.tool(
    "execute_gaql_query",
    "Execute a custom GAQL query and return results as a table. Use this for any ad-hoc Google Ads Query Language query.",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      query: z.string().describe("Valid GAQL query string"),
    },
    async ({ customer_id, query }) => {
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No results found for the query." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Query Results for Account ${formatCustomerId(customer_id)}`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "run_gaql",
    `Execute any GAQL query with output format options (table, json, csv). The most powerful tool for custom Google Ads data queries.

EXAMPLE QUERIES:
  Campaign metrics:  SELECT campaign.name, metrics.clicks, metrics.impressions, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_7_DAYS
  Ad group perf:     SELECT ad_group.name, metrics.conversions, metrics.cost_micros, campaign.name FROM ad_group WHERE metrics.clicks > 100
  Keyword analysis:  SELECT keyword.text, metrics.ctr FROM keyword_view ORDER BY metrics.impressions DESC

Note: Cost values are in micros (1,000,000 = 1 unit of currency).`,
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      query: z.string().describe("Valid GAQL query string"),
      format: z.enum(["table", "json", "csv"]).default("table").describe("Output format"),
    },
    async ({ customer_id, query, format }) => {
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No results found for the query." }] };
      }

      const results = data.results as Record<string, unknown>[];
      let text: string;

      switch (format) {
        case "json":
          text = JSON.stringify(data, null, 2);
          break;
        case "csv":
          text = formatCsv(results);
          break;
        default:
          text = formatTable(
            results,
            `Query Results for Account ${formatCustomerId(customer_id)}`,
          );
      }

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "list_resources",
    "List valid Google Ads API resources that can be used in GAQL FROM clauses.",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
    },
    async ({ customer_id }) => {
      const query = `
        SELECT google_ads_field.name, google_ads_field.category, google_ads_field.data_type
        FROM google_ads_field
        WHERE google_ads_field.category = 'RESOURCE'
        ORDER BY google_ads_field.name
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No resources found." }] };
      }
      const text = formatTable(data.results as Record<string, unknown>[]);
      return { content: [{ type: "text", text }] };
    },
  );
}
