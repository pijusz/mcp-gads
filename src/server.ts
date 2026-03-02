import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEnv } from "./config/env.js";
import { VERSION } from "./index.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gads",
    version: VERSION,
  });

  const env = getEnv();
  registerAllTools(server, env);

  return server;
}
