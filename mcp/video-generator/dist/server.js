#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { configTools } from "./tools/config.js";
import { projectsTools } from "./tools/projects.js";
// Create MCP server
const server = new McpServer({
    name: "video-generator",
    version: "1.0.0",
});
// Register config tools
for (const [name, tool] of Object.entries(configTools)) {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
}
// Register project tools
for (const [name, tool] of Object.entries(projectsTools)) {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
}
// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Video Generator MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map