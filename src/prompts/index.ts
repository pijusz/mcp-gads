import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Prompts, not tools.
 *
 * The paid/organic gap analysis spans two servers, and an MCP server cannot
 * call another one — so this cannot be a tool without smuggling Search Console
 * credentials into this server. A prompt is the honest primitive: the client
 * already has both servers connected, so it hands the model a plan that uses
 * whichever of them are available.
 */
export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "paid_organic_gap",
    {
      title: "Paid vs organic gap analysis",
      description:
        "Cross-reference Google Ads spend against Search Console organic rankings to find terms you pay for but already rank well on, and terms you pay well for with no organic presence. Works best with the mcp-gsc server also connected.",
      argsSchema: {
        days: z.string().optional().describe("Lookback window in days (default 30)"),
        campaign_id: z
          .string()
          .optional()
          .describe("Optional: restrict the Ads side to one campaign"),
      },
    },
    ({ days, campaign_id }) => {
      const window = days ?? "30";
      const scope = campaign_id
        ? `Restrict the Ads side to campaign ${campaign_id}.`
        : "Cover the whole account on the Ads side.";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Run a paid vs organic gap analysis over the last ${window} days. ${scope}`,
                "",
                "1. Google Ads — Search campaigns.",
                `   Call get_search_terms with days=${window} and a high limit (start at 2000) so you reach the long tail, not just the top spenders. These rows carry cost.`,
                "",
                "2. Google Ads — Performance Max and Demand Gen.",
                "   List those campaigns and call get_search_term_insights for each, then drill into the larger categories with category_id. Their queries never appear in get_search_terms, so skipping this can hide most of the account's volume.",
                "   Important: this report has no cost metric at any level — only impressions, clicks, conversions and conversions value. Do not invent or estimate a cost for these terms.",
                "",
                "3. Search Console — organic side.",
                "   If a Search Console MCP server is connected, call its search_analytics tool for the same window with dimension 'query'.",
                "   row_limit is capped at 25000 per call. If you need more, or the response reports more total rows than it returned, paginate with start_row in steps of your row_limit (0, then 5000, then 10000, …) until you have what you need.",
                "   If no such server is available, say so plainly and continue with the paid side alone rather than guessing at organic data.",
                "",
                "4. Join on the query string. Normalise case and trim whitespace before matching, and note that Google's own paid/organic report matches near-variants that plain string comparison will miss — so treat the overlap as a floor, not an exact figure.",
                "",
                "5. Report the Search results first, each group sorted by cost descending:",
                "   a. Paying while ranking well — terms with ad spend where the organic position is 3 or better. Show cost, ad clicks, organic clicks and position. These are the candidates for reducing bids.",
                "   b. Paying with no organic presence — meaningful spend and no organic data for the term. These are content gaps, already priced by your own bid data.",
                "   c. Ranking well with no ads — strong organic positions you are not bidding on, in case a competitor is.",
                "   Total the spend in group (a) so the size of the opportunity is explicit.",
                "",
                "6. Report Performance Max / Demand Gen overlap in a separate section, sorted by impressions or clicks, and state plainly that cost is unavailable per term for these campaign types. Do not fold them into the group (a) spend total — that total covers Search only, and say so.",
                "",
                "Be careful not to overstate this: ranking organically does not mean the ad is wasted, since ads and organic listings can both be clicked and removing an ad often does not recover all its clicks. Present it as a list worth reviewing, not as guaranteed savings.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
