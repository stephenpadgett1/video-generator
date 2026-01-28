#!/usr/bin/env npx tsx
/**
 * CLI to edit/inpaint an image using Imagen
 *
 * Usage:
 *   npx tsx scripts/edit-image.ts <source-image> "prompt" [--mask=mask.png] [--mode=inpaint-insert] [--output=filename.png]
 */

import { editImage } from "../mcp/video-generator/src/clients/imagen.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args[0] === "--help") {
    console.log("Usage: npx tsx scripts/edit-image.ts <source-image> <prompt> [options]");
    console.log();
    console.log("Options:");
    console.log("  --mask=<path>        Mask image (white = edit area)");
    console.log("  --mode=<mode>        Edit mode: inpaint-insert (default), inpaint-remove, outpaint");
    console.log("  --output=<filename>  Output filename (saved to generated-images/)");
    console.log();
    console.log("Example:");
    console.log('  npx tsx scripts/edit-image.ts baseline.png "Add a red wooden mannequin seated at the table" --output=with-mannequin.png');
    process.exit(0);
  }

  // Parse arguments
  let sourceImagePath = "";
  let prompt = "";
  let maskPath: string | undefined;
  let editMode: "inpaint-insert" | "inpaint-remove" | "outpaint" = "inpaint-insert";
  let outputFilename: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--mask=")) {
      maskPath = arg.split("=", 2)[1];
    } else if (arg.startsWith("--mode=")) {
      editMode = arg.split("=", 2)[1] as typeof editMode;
    } else if (arg.startsWith("--output=")) {
      outputFilename = arg.split("=", 2)[1];
    } else if (!arg.startsWith("--")) {
      if (!sourceImagePath) {
        sourceImagePath = arg;
      } else {
        prompt = arg;
      }
    }
  }

  if (!sourceImagePath || !prompt) {
    console.error("Error: Source image and prompt are required");
    process.exit(1);
  }

  console.log("Editing image...");
  console.log(`  Source: ${sourceImagePath}`);
  console.log(`  Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);
  console.log(`  Mode: ${editMode}`);
  if (maskPath) console.log(`  Mask: ${maskPath}`);
  if (outputFilename) console.log(`  Output: ${outputFilename}`);

  try {
    const result = await editImage({
      sourceImagePath,
      prompt,
      maskPath,
      editMode,
      outputFilename,
    });

    console.log();
    console.log("Edit successful!");
    console.log(`  File: ${result.path}`);
    console.log(`  Model: ${result.model}`);
  } catch (error) {
    console.error("Edit failed:", error);
    process.exit(1);
  }
}

main();
