import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../config/env.js";
import { log } from "../utils/logger.js";
import { registerAccountTools } from "./accounts.js";
import { registerAdGroupTools } from "./ad-groups.js";
import { registerAdTools } from "./ads.js";
import { registerAdvancedInsightTools } from "./advanced-insights.js";
import { registerAssetTools } from "./assets.js";
import { registerCampaignTools } from "./campaigns.js";
import { registerConversionTools } from "./conversions.js";
import { registerGeoTools } from "./geo.js";
import { registerInsightTools } from "./insights.js";
import { registerKeywordTools } from "./keywords.js";
import { registerLabelTools } from "./labels.js";
import { registerMutationTools } from "./mutations.js";
import { registerQueryTools } from "./queries.js";

export function registerAllTools(
  server: McpServer,
  env: Pick<Env, "GOOGLE_ADS_ENABLE_MUTATIONS" | "GOOGLE_ADS_ENABLE_EXTENDED_TOOLS">,
): void {
  registerAccountTools(server);
  registerQueryTools(server);
  registerCampaignTools(server);
  registerAdTools(server);
  registerAssetTools(server);
  registerKeywordTools(server);
  registerGeoTools(server);
  registerInsightTools(server);

  if (env.GOOGLE_ADS_ENABLE_EXTENDED_TOOLS === "true") {
    registerAdGroupTools(server);
    registerConversionTools(server);
    registerAdvancedInsightTools(server);
    registerLabelTools(server);
    log.info("Extended tools enabled");
  }

  if (env.GOOGLE_ADS_ENABLE_MUTATIONS === "true") {
    registerMutationTools(server);
    log.info("Mutation tools enabled");
  }
}
