#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configTools } from "./tools/config.js";
import { projectsTools } from "./tools/projects.js";
import { jobsTools } from "./tools/jobs.js";
import { generationTools } from "./tools/generation.js";
import { lockingTools } from "./tools/locking.js";
import { executionTools } from "./tools/execution.js";
import { audioTools } from "./tools/audio.js";
import { analysisTools } from "./tools/analysis.js";
import { editingTools } from "./tools/editing.js";

// Create MCP server
const server = new McpServer({
  name: "video-generator",
  version: "1.0.0",
});

// Tool definition type
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}

// Helper to register tools from a tools object
function registerTools(tools: Record<string, ToolDef>) {
  for (const tool of Object.values(tools)) {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
  }
}

// Register all tool categories
// Phase 3A: Core tools
registerTools(configTools as unknown as Record<string, ToolDef>);
registerTools(projectsTools as unknown as Record<string, ToolDef>);

// Phase 3B: Jobs, generation, locking, execution
registerTools(jobsTools as unknown as Record<string, ToolDef>);
registerTools(generationTools as unknown as Record<string, ToolDef>);
registerTools(lockingTools as unknown as Record<string, ToolDef>);
registerTools(executionTools as unknown as Record<string, ToolDef>);

// Phase 3C: Audio, analysis, editing
registerTools(audioTools as unknown as Record<string, ToolDef>);
registerTools(analysisTools as unknown as Record<string, ToolDef>);
registerTools(editingTools as unknown as Record<string, ToolDef>);

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
