import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildDateFilter, formatTable } from "../services/format.js";
import { searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";

export function registerAdTools(server: McpServer) {
  server.tool(
    "get_ad_performance",
    `Get ad-level performance metrics for the specified time period.

RECOMMENDED WORKFLOW:
1. First run list_accounts() to get available account IDs
2. Then run get_account_currency() to see what currency the account uses
3. Finally run this command to get ad performance

Note: Cost values are in micros (1,000,000 = 1 unit of currency).`,
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
      days: z.number().default(30).describe("Number of days to look back"),
    },
    async ({ customer_id, days }) => {
      const dateFilter = buildDateFilter(days);
      const query = `
        SELECT
          ad_group_ad.ad.id,
          ad_group_ad.ad.name,
          ad_group_ad.status,
          campaign.name,
          ad_group.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM ad_group_ad
        WHERE ${dateFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No ad data found for this period." }] };
      }
      const text = formatTable(
        data.results as Record<string, unknown>[],
        `Ad Performance for ${formatCustomerId(customer_id)} (last ${days} days)`,
      );
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "get_ad_creatives",
    "Get ad creative details including RSA headlines, descriptions, and final URLs. Great for creative audits.",
    {
      customer_id: z.string().describe("Google Ads customer ID (10 digits, no dashes)"),
    },
    async ({ customer_id }) => {
      const query = `
        SELECT
          ad_group_ad.ad.id,
          ad_group_ad.ad.name,
          ad_group_ad.ad.type,
          ad_group_ad.ad.final_urls,
          ad_group_ad.status,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group.name,
          campaign.name
        FROM ad_group_ad
        WHERE ad_group_ad.status != 'REMOVED'
        ORDER BY campaign.name, ad_group.name
        LIMIT 50
      `;
      const data = await searchGoogleAds(customer_id, query);
      if (!data.results?.length) {
        return { content: [{ type: "text", text: "No ad creatives found." }] };
      }

      const lines = [`Ad Creatives for ${formatCustomerId(customer_id)}`, "=".repeat(80)];

      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i] as Record<string, any>;
        const ad = result.adGroupAd?.ad ?? {};
        const adGroup = result.adGroup ?? {};
        const campaign = result.campaign ?? {};

        lines.push(`\n${i + 1}. Campaign: ${campaign.name ?? "N/A"}`);
        lines.push(`   Ad Group: ${adGroup.name ?? "N/A"}`);
        lines.push(`   Ad ID: ${ad.id ?? "N/A"}`);
        lines.push(`   Status: ${result.adGroupAd?.status ?? "N/A"}`);
        lines.push(`   Type: ${ad.type ?? "N/A"}`);

        const rsa = ad.responsiveSearchAd;
        if (rsa) {
          if (rsa.headlines?.length) {
            lines.push("   Headlines:");
            for (const h of rsa.headlines) lines.push(`     - ${h.text ?? "N/A"}`);
          }
          if (rsa.descriptions?.length) {
            lines.push("   Descriptions:");
            for (const d of rsa.descriptions) lines.push(`     - ${d.text ?? "N/A"}`);
          }
        }

        const urls = ad.finalUrls;
        if (urls?.length) lines.push(`   Final URLs: ${urls.join(", ")}`);
        lines.push("-".repeat(80));
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
