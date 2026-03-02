import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import { getEnv } from "./config/env.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gads",
    version: pkg.version,
  });

  const env = getEnv();
  registerAllTools(server, env);

  return server;
}
