import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mutateResource } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { writeTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerMutationTools(server: McpServer) {
  writeTool(
    server,
    "update_campaign_status",
    "⚠️ WRITE OPERATION: Pause or enable a campaign. This modifies your Google Ads account.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      campaign_id: z.string().describe("The campaign ID to update"),
      status: z.enum(["ENABLED", "PAUSED"]).describe("New status for the campaign"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { campaign_id, status } = args;
      const cid = formatCustomerId(customer_id);
      const resourceName = `customers/${cid}/campaigns/${campaign_id}`;
      const operations = [
        {
          updateMask: "status",
          update: { resourceName, status },
        },
      ];

      await mutateResource(customer_id, "campaigns", operations);
      return {
        content: [
          { type: "text", text: `Campaign ${campaign_id} status updated to ${status}` },
        ],
      };
    },
  );

  writeTool(
    server,
    "update_ad_group_status",
    "⚠️ WRITE OPERATION: Pause or enable an ad group. This modifies your Google Ads account.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      ad_group_id: z.string().describe("The ad group ID to update"),
      status: z.enum(["ENABLED", "PAUSED"]).describe("New status for the ad group"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { ad_group_id, status } = args;
      const cid = formatCustomerId(customer_id);
      const resourceName = `customers/${cid}/adGroups/${ad_group_id}`;
      const operations = [
        {
          updateMask: "status",
          update: { resourceName, status },
        },
      ];

      await mutateResource(customer_id, "adGroups", operations);
      return {
        content: [
          { type: "text", text: `Ad group ${ad_group_id} status updated to ${status}` },
        ],
      };
    },
  );

  writeTool(
    server,
    "update_ad_status",
    "⚠️ WRITE OPERATION: Pause or enable an ad. This modifies your Google Ads account.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      ad_group_id: z.string().describe("The ad group ID containing the ad"),
      ad_id: z.string().describe("The ad ID to update"),
      status: z.enum(["ENABLED", "PAUSED"]).describe("New status for the ad"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { ad_group_id, ad_id, status } = args;
      const cid = formatCustomerId(customer_id);
      const resourceName = `customers/${cid}/adGroupAds/${ad_group_id}~${ad_id}`;
      const operations = [
        {
          updateMask: "status",
          update: { resourceName, status },
        },
      ];

      await mutateResource(customer_id, "adGroupAds", operations);
      return {
        content: [
          {
            type: "text",
            text: `Ad ${ad_id} in ad group ${ad_group_id} status updated to ${status}`,
          },
        ],
      };
    },
  );

  writeTool(
    server,
    "update_campaign_budget",
    "⚠️ WRITE OPERATION: Change the daily budget amount for a campaign. Amount is in micros (1,000,000 = 1 unit of currency). This modifies your Google Ads account.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      budget_id: z.string().describe("The campaign budget resource ID"),
      amount_micros: z
        .number()
        .describe("New daily budget amount in micros (e.g. 5000000 = $5.00)"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { budget_id, amount_micros } = args;
      const cid = formatCustomerId(customer_id);
      const resourceName = `customers/${cid}/campaignBudgets/${budget_id}`;
      const operations = [
        {
          updateMask: "amount_micros",
          update: { resourceName, amountMicros: String(amount_micros) },
        },
      ];

      await mutateResource(customer_id, "campaignBudgets", operations);
      return {
        content: [
          {
            type: "text",
            text: `Campaign budget ${budget_id} updated to ${amount_micros} micros ($${(amount_micros / 1e6).toFixed(2)})`,
          },
        ],
      };
    },
  );

  writeTool(
    server,
    "add_negative_keywords",
    "⚠️ WRITE OPERATION: Add negative keywords to a campaign to prevent ads from showing for those search terms. This modifies your Google Ads account.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
      campaign_id: z.string().describe("The campaign ID to add negative keywords to"),
      keywords: z.string().describe("Comma-separated negative keywords to add"),
      match_type: z
        .enum(["EXACT", "PHRASE", "BROAD"])
        .default("BROAD")
        .describe("Match type for negative keywords"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const { campaign_id, keywords, match_type } = args;
      const cid = formatCustomerId(customer_id);
      const keywordList = keywords
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);

      const operations = keywordList.map((keyword: string) => ({
        create: {
          campaign: `customers/${cid}/campaigns/${campaign_id}`,
          negative: true,
          criterion: {
            keyword: {
              text: keyword,
              matchType: match_type,
            },
          },
        },
      }));

      await mutateResource(customer_id, "campaignCriteria", operations);
      return {
        content: [
          {
            type: "text",
            text: `Added ${keywordList.length} negative keyword(s) to campaign ${campaign_id}: ${keywordList.join(", ")}`,
          },
        ],
      };
    },
  );
}
