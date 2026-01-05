/**
 * Test agent using Claude Agent SDK
 * Verifies SDK setup and tool access
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  console.log("Testing Agent SDK...\n");

  for await (const message of query({
    prompt: "Read the CLAUDE.md file and tell me what video generation system this project uses.",
    options: {
      allowedTools: ["Read", "Glob"],
      settingSources: ["project"],
      cwd: "C:\\Projects\\video-generator",
      maxTurns: 5
    }
  })) {
    if (message.type === "system" && message.subtype === "init") {
      console.log(`Tools available: ${message.tools?.length || 0}`);
    }

    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if ("text" in block && block.text) {
          console.log(block.text);
        }
      }
    }

    if (message.type === "result") {
      console.log(`\n--- Result: ${message.subtype} ---`);
      if (message.subtype === "success") {
        console.log(`Cost: $${message.total_cost_usd?.toFixed(4) || 0}`);
        console.log(`Turns: ${message.num_turns || 0}`);
      }
    }
  }
}

main().catch(console.error);
