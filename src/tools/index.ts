import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../config/env.js";
import { log } from "../utils/logger.js";
import { registerAccountTools } from "./accounts.js";
import { registerAdTools } from "./ads.js";
import { registerAssetTools } from "./assets.js";
import { registerCampaignTools } from "./campaigns.js";
import { registerGeoTools } from "./geo.js";
import { registerInsightTools } from "./insights.js";
import { registerKeywordTools } from "./keywords.js";
import { registerMutationTools } from "./mutations.js";
import { registerQueryTools } from "./queries.js";

export function registerAllTools(
  server: McpServer,
  env: Pick<Env, "GOOGLE_ADS_ENABLE_MUTATIONS">,
): void {
  registerAccountTools(server);
  registerQueryTools(server);
  registerCampaignTools(server);
  registerAdTools(server);
  registerAssetTools(server);
  registerKeywordTools(server);
  registerGeoTools(server);
  registerInsightTools(server);

  if (env.GOOGLE_ADS_ENABLE_MUTATIONS === "true") {
    registerMutationTools(server);
    log.info("Mutation tools enabled");
  }
}
