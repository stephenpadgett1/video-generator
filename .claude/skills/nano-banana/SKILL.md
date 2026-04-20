---
name: nano-banana
description: Generate images via Gemini 3 Pro Image (Nano Banana Pro) with optional reference images for style / character / environment anchoring. Use when consistency across shots matters — establishing a set plate, locking a character's look, or producing an environment reference that downstream Veo shots will use.
allowed-tools: Read, Bash
---

# Nano Banana (image generation with reference anchoring)

Nano Banana Pro (`gemini-3-pro-image-preview`) is Google's highest-quality image model — 4K output, reasoning, and genuine multimodal input. Giving it reference images alongside the prompt is the single most effective technique we have for visual consistency across shots.

The MCP server's `generate_image` tool is text-only for Gemini models. This skill's `tools/nano-banana.cjs` exposes the full multimodal path.

## When to use

- **Establishing a new environment** — generate a master "set plate" from a frame of an existing shot. Downstream Veo generations use the plate as `firstFramePath` to stay in the same world.
- **Character consistency** — pass a reference headshot / full-body shot and prompt the character in a new pose or setting.
- **Style anchoring** — pass 1–2 reference stills from the target look and have Nano Banana match the rendering (palette, film grain, lighting quality).
- **Environment variation** — keep a location consistent but change staging, lighting mood, or time of day.

**Don't use for:** one-off images where consistency doesn't matter (use the MCP `generate_image` tool). Edits to an existing image (use `edit_image`). Video generation (use `submit_veo_generation`).

## Quick start

```bash
# Text-only
node tools/nano-banana.cjs --prompt="A weathered metal bucket on a wooden plank floor, warm amber light, painterly."

# With a single reference image for style anchoring
node tools/nano-banana.cjs \
  --prompt="Same backstage space as reference, but empty. Remove all people. Keep the lighting, palette, ropes, and floor texture." \
  --ref=data/workspace/banner_janitor_intro_4s.png \
  --output=data/workspace/scene3_plate.png

# Multiple references (style + character, or two environment angles)
node tools/nano-banana.cjs \
  --prompt="The janitor from ref 1 standing in the backstage from ref 2, holding a mop." \
  --ref=generated-images/janitor_ref.png \
  --ref=data/workspace/scene3_plate.png \
  --output=data/workspace/scene3_janitor_placed.png
```

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--prompt=TEXT` | — | Prompt text (required; or use `--prompt-file`). |
| `--prompt-file=PATH` | — | Read prompt from a file (for long prompts). |
| `--ref=PATH` | — | Reference image. Repeat for multiple. Order matters — earlier references are encountered first. |
| `--aspect=W:H` | `9:16` | Aspect ratio. Supported: 1:1, 9:16, 16:9, 3:4, 4:3, 2:3, 3:2, 4:5, 5:4, 21:9. |
| `--model=pro\|flash` | `pro` | `pro` = Nano Banana Pro (4K, global endpoint). `flash` = Nano Banana Flash (1024px, faster, regional). |
| `--output=PATH` | `generated-images/nb_<ts>.png` | Output file. Creates parent dir if needed. |
| `--temperature=N` | `1.0` | Sampling temperature. Lower (0.3–0.7) for tighter adherence to refs; higher (1.2+) for more variation. |
| `--json` | — | Emit JSON result to stdout. |

## Prompt patterns that work

### "Match this style, change the subject"

```
ref: /tmp/scene1_frame.png
prompt: "Same rendering style and palette as the reference — warm amber Edison-bulb lighting, deep chiaroscuro, painterly film-grain, wooden plank floor. Change: a quiet empty hallway in the same backstage, no characters."
```

### "Same character, new pose / setting"

```
ref: /tmp/janitor_headshot.png
prompt: "The same man from the reference, now seen from behind, walking away down a dim corridor. Same clothing, same cap, same build."
```

### "Combine two references"

```
ref: /tmp/character.png
ref: /tmp/environment.png
prompt: "Place the character from the first reference into the environment from the second. Preserve the lighting and palette of the second reference."
```

## Tips from experience

- **Always name what to preserve.** "Same lighting, same palette, same era" beats hoping the model infers it.
- **Put references before the prompt text in effect, even though the tool flags are a simple list.** The script pushes references into `parts` before the text, which the Gemini API interprets as "here's the visual context, now the instructions."
- **The model writes "notes" in its response.** The stderr banner prints these — useful to see how the model interpreted the task. If it misread your intent, rephrase.
- **Iterate fast.** First generation often misses. Keep previous outputs alongside and tweak the prompt. For set plates, budget 2–4 regenerations before the plate is approved.
- **For 4K plates used as Veo references, Nano Banana Pro is worth the latency.** For scratch concepting, use `--model=flash`.

## Auth

Uses the service account at `data/config.json → veoServiceAccountPath` (same as the MCP). JWT signing is done via `node:crypto` — zero npm dependencies. Override with `--service-account=PATH` if needed.

## Known limitations

- **Gemini returns one image per call.** For variations, run the script multiple times (optionally with temperature > 1.0).
- **No inpainting / masking.** Use `edit_image` (MCP, Imagen 3 capability) for mask-based edits on an existing image.
- **Global endpoint for Pro.** Latency is a bit higher than the regional Flash model.
