import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatCsv, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerQueryTools(server: McpServer) {
  server.tool(
    "execute_gaql_query",
    "Execute a custom GAQL query and return results as a table. Use this for any ad-hoc Google Ads Query Language query.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      query: z.string().describe("Valid GAQL query string"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { query } = args;
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
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      query: z.string().describe("Valid GAQL query string"),
      format: z.enum(["table", "json", "csv"]).default("table").describe("Output format"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { query, format } = args;
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
    "get_gaql_help",
    "Get a GAQL (Google Ads Query Language) reference guide with syntax, common resources, date filters, and example queries. Call this before writing custom GAQL queries.",
    {},
    async () => {
      const text = `# GAQL Quick Reference

## Syntax
SELECT <fields> FROM <resource> [WHERE <conditions>] [ORDER BY <field> [ASC|DESC]] [LIMIT <n>]

## Common Resources (FROM clause)
campaign              — campaign settings, status, bidding
ad_group              — ad groups within campaigns
ad_group_ad           — individual ads and their content
keyword_view          — keyword performance (read-only view)
ad_group_criterion    — targeting criteria (keywords, audiences)
campaign_budget       — budget settings and spend
asset                 — creative assets (images, text, video)
campaign_asset        — assets linked to campaigns (has metrics)
ad_group_asset        — assets linked to ad groups (has metrics)
geographic_view       — performance by location
search_term_view      — actual search queries triggering ads
recommendation        — Google's optimization suggestions
change_event          — account change history (special date filter, see below)
customer              — account-level settings
customer_client       — MCC sub-accounts (manager accounts only)

## Key Fields
### Metrics (require date filter)
metrics.impressions, metrics.clicks, metrics.ctr,
metrics.cost_micros (divide by 1,000,000 for currency units),
metrics.conversions, metrics.conversions_value,
metrics.average_cpc, metrics.average_cpm

### Segments
segments.date, segments.device, segments.ad_network_type,
segments.click_type, segments.conversion_action

## Date Filters
Standard:  WHERE segments.date DURING LAST_7_DAYS
           WHERE segments.date DURING LAST_14_DAYS
           WHERE segments.date DURING LAST_30_DAYS
           WHERE segments.date DURING LAST_90_DAYS
Custom:    WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31'
Today:     WHERE segments.date DURING TODAY
Yesterday: WHERE segments.date DURING YESTERDAY

## Special: change_event
change_event does NOT use segments.date. Use:
WHERE change_event.change_date_time >= '2025-01-01' AND change_event.change_date_time <= '2025-01-31'
Max 30-day window. LIMIT is required (max 10,000).

## Example Queries

### Campaign performance last 7 days
SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC

### Top keywords by clicks
SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
  metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc
FROM keyword_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.clicks DESC LIMIT 50

### Ad creatives with headlines
SELECT ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.ad.final_urls, metrics.impressions, metrics.clicks
FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'

### Search terms triggering ads
SELECT search_term_view.search_term, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros
FROM search_term_view WHERE segments.date DURING LAST_14_DAYS ORDER BY metrics.impressions DESC LIMIT 100

### Budget utilization
SELECT campaign.name, campaign_budget.amount_micros, metrics.cost_micros
FROM campaign WHERE segments.date DURING LAST_30_DAYS

### Geographic performance
SELECT geographic_view.country_criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros
FROM geographic_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC

## Rules
- Cost/budget values are in micros: divide by 1,000,000 for currency units
- Metrics require a date filter (WHERE segments.date ...)
- No pageSize parameter — API returns up to 10,000 rows per page
- Use LIMIT to cap results
- String enums are uppercase: 'ENABLED', 'PAUSED', 'RESPONSIVE_SEARCH_AD'
- IDs are numeric strings without dashes`;

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "list_resources",
    "List valid Google Ads API resources that can be used in GAQL FROM clauses.",
    {
      customer_id: z.string().optional().describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
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
