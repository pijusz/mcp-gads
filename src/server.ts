import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import {
  isExtendedToolsEnabledFromProcessEnv,
  isMutationsEnabledFromProcessEnv,
} from "./config/env.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gads",
    version: pkg.version,
  });

  registerAllTools(server, {
    GOOGLE_ADS_ENABLE_MUTATIONS: isMutationsEnabledFromProcessEnv() ? "true" : "false",
    GOOGLE_ADS_ENABLE_EXTENDED_TOOLS: isExtendedToolsEnabledFromProcessEnv()
      ? "true"
      : "false",
  });

  return server;
}
