#!/usr/bin/env npx tsx
/**
 * Simple CLI to generate an image using Imagen
 *
 * Usage:
 *   npx tsx scripts/generate-image.ts "your prompt here" [--output=filename.png] [--aspect=16:9]
 */

import { generateImage } from "../mcp/video-generator/src/clients/imagen.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log("Usage: npx tsx scripts/generate-image.ts <prompt> [--output=filename.png] [--aspect=16:9]");
    console.log();
    console.log("Options:");
    console.log("  --output=<filename>  Output filename (saved to generated-images/)");
    console.log("  --aspect=<ratio>     Aspect ratio (default: 16:9)");
    console.log("  --model=<model>      Model to use (default: imagen-3.0-generate-002)");
    console.log();
    console.log("Example:");
    console.log('  npx tsx scripts/generate-image.ts "A cat sitting on a table" --output=cat.png');
    process.exit(0);
  }

  // Parse arguments
  let prompt = "";
  let outputFilename: string | undefined;
  let aspectRatio = "16:9";
  let model: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--output=")) {
      outputFilename = arg.split("=", 2)[1];
    } else if (arg.startsWith("--aspect=")) {
      aspectRatio = arg.split("=", 2)[1];
    } else if (arg.startsWith("--model=")) {
      model = arg.split("=", 2)[1];
    } else if (!arg.startsWith("--")) {
      prompt = arg;
    }
  }

  if (!prompt) {
    console.error("Error: No prompt provided");
    process.exit(1);
  }

  console.log("Generating image...");
  console.log(`  Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);
  console.log(`  Aspect: ${aspectRatio}`);
  if (outputFilename) console.log(`  Output: ${outputFilename}`);

  try {
    const result = await generateImage({
      prompt,
      aspectRatio,
      outputFilename,
      model: model as any,
    });

    console.log();
    console.log("Generated successfully!");
    console.log(`  File: ${result.path}`);
    console.log(`  Model: ${result.model}`);
  } catch (error) {
    console.error("Generation failed:", error);
    process.exit(1);
  }
}

main();
