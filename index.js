#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolDefinitions } from "./tools.js";

const server = new McpServer(
  {
    name: "agenteyes-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * @param {unknown} err
 * @returns {string}
 */
function formatToolError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return `Error: ${message.replace(/\s+/g, " ").trim()}`;
}

for (const tool of toolDefinitions) {
  server.registerTool(tool.name, tool.config, async (args) => {
    try {
      return await tool.handler(args);
    } catch (err) {
      return {
        content: [{ type: "text", text: formatToolError(err) }],
        isError: true,
      };
    }
  });
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
