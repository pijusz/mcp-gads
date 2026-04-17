import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.js";
import { listAccessibleCustomers, searchGoogleAds } from "../services/google-ads-api.js";
import { formatCustomerId } from "../utils/customer-id.js";
import { readTool } from "../utils/register-tool.js";
import { resolveCustomerId } from "../utils/resolve-customer-id.js";

export function registerAccountTools(server: McpServer) {
  readTool(
    server,
    "list_accounts",
    "Lists all accessible Google Ads accounts. Run this first to discover account IDs.",
    {},
    async () => {
      const customerIds = await listAccessibleCustomers();
      if (customerIds.length === 0) {
        return { content: [{ type: "text", text: "No accessible accounts found." }] };
      }

      const lines = ["Accessible Google Ads Accounts:", "-".repeat(50)];
      for (const id of customerIds) {
        lines.push(`Account ID: ${formatCustomerId(id)}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  readTool(
    server,
    "get_account_currency",
    "Get the currency code for a Google Ads account. Run this before analyzing cost data.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const query = `SELECT customer.id, customer.currency_code FROM customer LIMIT 1`;
      const data = await searchGoogleAds(customer_id, query);
      const customer = data.results?.[0]?.customer as Record<string, string> | undefined;
      const currency = customer?.currencyCode ?? "unknown";
      const cid = formatCustomerId(customer_id);
      return {
        content: [{ type: "text", text: `Account ${cid} uses currency: ${currency}` }],
      };
    },
  );

  readTool(
    server,
    "get_account_hierarchy",
    "Get the MCC account tree showing manager-client relationships via customer_client resource.",
    {
      customer_id: z
        .string()
        .optional()
        .describe("Manager (MCC) account ID. Defaults to GOOGLE_ADS_CUSTOMER_ID env var"),
    },
    async (args) => {
      const customer_id = resolveCustomerId(args.customer_id);
      const query = `
        SELECT
          customer_client.client_customer,
          customer_client.level,
          customer_client.manager,
          customer_client.descriptive_name,
          customer_client.currency_code,
          customer_client.id,
          customer_client.status
        FROM customer_client
        ORDER BY customer_client.level, customer_client.descriptive_name
      `;
      const data = await searchGoogleAds(customer_id, query, {
        loginCustomerId: customer_id,
      });
      if (!data.results?.length) {
        return {
          content: [{ type: "text", text: "No sub-accounts found under this MCC." }],
        };
      }
      const text = formatTable(
        data.results,
        `Account Hierarchy for ${formatCustomerId(customer_id)}`,
      );
      return { content: [{ type: "text", text }] };
    },
  );
}
