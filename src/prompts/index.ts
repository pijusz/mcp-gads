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
                "1. Google Ads — paid side.",
                `   Call get_search_terms with days=${window} and a high limit (start at 2000) so you reach the long tail, not just the top spenders.`,
                "   Separately, list Performance Max and Demand Gen campaigns and call get_search_term_insights for each. Their queries never appear in get_search_terms, so skipping this can hide most of the account's volume.",
                "",
                "2. Search Console — organic side.",
                "   If a Search Console MCP server is connected, call its search_analytics tool for the same window, dimension 'query', with a row limit of at least 5000. Ask for clicks, impressions and average position.",
                "   If no such server is available, say so plainly and continue with the paid side alone rather than guessing at organic data.",
                "",
                "3. Join on the query string. Normalise case and trim whitespace before matching, and note that Google's own paid/organic report matches near-variants that plain string comparison will miss — so treat the overlap as a floor, not an exact figure.",
                "",
                "4. Report three groups, each sorted by cost descending:",
                "   a. Paying while ranking well — terms with ad spend where the organic position is 3 or better. Show cost, ad clicks, organic clicks and position. These are the candidates for reducing bids.",
                "   b. Paying with no organic presence — meaningful spend and no organic data for the term. These are content gaps, already priced by your own bid data.",
                "   c. Ranking well with no ads — strong organic positions you are not bidding on, in case a competitor is.",
                "",
                "5. Total the spend in group (a) so the size of the opportunity is explicit.",
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
