/**
 * Example agent demonstrating Claude Agent SDK usage.
 *
 * Run with: npm run example
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - npm install in this directory
 */

import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const client = new Anthropic();

  // Example: Simple agent query
  console.log("Querying agent...\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: "What are the key components of a video generation pipeline?"
      }
    ]
  });

  // Print the response
  for (const block of response.content) {
    if (block.type === "text") {
      console.log(block.text);
    }
  }
}

main().catch(console.error);
