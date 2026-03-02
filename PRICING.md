# Video Generation Pricing Reference

Last updated: 2026-03-01

## Veo Video Generation (Vertex AI)

| Model ID | $/sec | 4s clip | 6s clip | 8s clip | Audio | Resolution | Notes |
|----------|-------|---------|---------|---------|-------|------------|-------|
| `veo-3.1-generate-preview` | $0.40 | $1.60 | $2.40 | $3.20 | Native | 720p/1080p/4K | Best quality, current default |
| `veo-3.1-fast-generate-preview` | $0.15 | $0.60 | $0.90 | $1.20 | Native | 720p/1080p/4K | **Draft model** — 62% cheaper |
| `veo-3.1-fast-generate-preview` (no audio) | $0.10 | $0.40 | $0.60 | $0.80 | No | 720p/1080p/4K | Cheapest option |
| `veo-2.0-generate-001` | $0.50 | $2.00 | $3.00 | $4.00 | No | Up to 1080p | Legacy, no audio |

Stable model IDs (use `-001` suffix for production, `-preview` for latest):
- `veo-3.1-generate-001` / `veo-3.1-generate-preview`
- `veo-3.1-fast-generate-001` / `veo-3.1-fast-generate-preview`

## Imagen Image Generation (Vertex AI)

| Model | $/image | Notes |
|-------|---------|-------|
| `imagen-3.0-generate-002` | ~$0.04 | Standard quality |
| `imagen-4.0-generate-001` | ~$0.06 | Best quality |

Used for: character lock reference images, first/last frame generation, environment references.

## ElevenLabs Audio

| Service | Cost | Notes |
|---------|------|-------|
| TTS | ~$0.30/1K chars | Varies by plan |
| Music generation | ~$0.05/sec | Short clips only |
| Sound effects | ~$0.02/sec | |

## Cost Estimation Formula

### Per-Shot Cost

```
draft_cost = num_drafts × duration × $0.15    (Veo 3.1 Fast)
final_cost = 1 × duration × $0.40             (Veo 3.1)
frame_cost = num_reference_images × $0.04      (Imagen, if needed)
shot_total = draft_cost + final_cost + frame_cost
```

### Project Cost Estimate

```
video_cost    = num_shots × avg_shot_cost
audio_cost    = total_tts_chars / 1000 × $0.30 + music_seconds × $0.05
image_cost    = (num_characters + num_environments) × $0.04
────────────────────────────────────────────────────
total         = video_cost + audio_cost + image_cost
```

### Example Projects

| Project Type | Shots | Duration | Drafts/Shot | Est. Cost |
|-------------|-------|----------|-------------|-----------|
| Short (30s) | 4 | 8s each | 2 | ~$10-14 |
| Medium (60s) | 8 | 8s each | 2 | ~$22-28 |
| Long (2min) | 16 | 8s each | 2 | ~$44-56 |
| Long (2min, no drafts) | 16 | 8s each | 0 (3 finals) | ~$102-154 |

*Estimates include ~15-25% buffer for retries, reference images, and audio.*

## Draft-Then-Final Strategy

### How It Works

1. **Draft pass**: Generate with `veo-3.1-fast` ($0.15/sec) to preview compositions
2. **Review**: Pick drafts that work (composition, movement, framing)
3. **Final pass**: Re-generate with `veo-3.1` ($0.40/sec) using same seed OR extracted frames

### Seed Replay (Preferred)

The Veo API supports a `seed` parameter (uint32, range 0–4,294,967,295). Same seed + same prompt + same parameters = deterministic output. **Cross-model seed compatibility (Fast→Standard) needs testing** — may produce similar but not identical results.

### Frame Constraint (Fallback)

If seed replay doesn't transfer across models:
1. Extract first frame from good draft via `extract_frame`
2. Optionally extract last frame too
3. Re-generate with full model using those as `referenceImagePath` / `lastFramePath`
4. The expensive model adds quality while following the same visual structure

### API Parameters Not Yet Implemented

| Parameter | Type | Purpose |
|-----------|------|---------|
| `seed` | uint32 | Deterministic generation |
| `generateAudio` | boolean | Enable/disable native audio |
| `resolution` | string | "720p", "1080p", "4k" |

These need to be added to `mcp/video-generator/src/clients/veo.ts`.

## Sources

- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Veo API Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Veo 3 Pricing Updates (Google Blog)](https://developers.googleblog.com/veo-3-and-veo-3-fast-new-pricing-new-configurations-and-better-resolution/)
- [CostGoat Veo Calculator](https://costgoat.com/pricing/google-veo)
