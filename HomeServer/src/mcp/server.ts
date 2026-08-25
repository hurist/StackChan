import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { homeStatusTool } from "./tools/home-status.js";

export function createMcpServer() {
  const config = loadConfig();
  const server = new McpServer({
    name: config.name,
    version: "0.1.0"
  });

  server.registerTool(
    homeStatusTool.name,
    {
      title: homeStatusTool.title,
      description: homeStatusTool.description,
      inputSchema: homeStatusTool.inputSchema,
      outputSchema: homeStatusTool.outputSchema
    },
    homeStatusTool.handler
  );

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startMcpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
