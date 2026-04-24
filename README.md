# Video Generator

AI video production workflow centered on Claude Code skills plus a small collection of ffmpeg / Python tools. Day-to-day work is driving Veo 3.1 (animation), Gemini 3 Pro Image / "Nano Banana" (still frames), and ElevenLabs (voice + SFX) through an MCP server, with the skills below handling the editing, QA, and assembly steps around them.

## Pipeline

A typical shot:

1. **Plate + character lock** — generate a canonical set plate and character reference with `nano-banana`.
2. **Book-end frames** — for each clip, generate a first-frame and last-frame via `nano-banana`, run `frame-qa` to catch prop-state / pose issues before spending Veo credits.
3. **Veo generation** — submit the clip via the `book-end` skill (or iterate cheaply on Fast via `veo-draft`).
4. **QA** — `clip-qa` scans the result with Claude vision for glitches that ffmpeg metrics miss (materializing props, ghost limbs, flicker).
5. **Normalize / splice / overlay** — `normalize-clip` strips embedded letterbox, `splice` finds imperceptible joins between back-to-back generations, `text-reveal` and `caption-box` add overlays.
6. **Upscale** — `upscale` runs Real-ESRGAN to 4K for final exports.

## Skills

Claude Code skills live in `.claude/skills/`. Each has a `SKILL.md` spec; Claude invokes them automatically when relevant.

### Generation
| Skill | Purpose |
|-------|---------|
| `nano-banana` | Generate images via Gemini 3 Pro Image with reference anchoring. Primary tool for plates, character refs, and book-end frames. |
| `book-end` | Generate a Veo clip as an animation between two nano-banana poster frames. Default for any shot where continuity drift would be visible. |
| `veo-draft` | Cost-aware draft-then-quality workflow: iterate prompts on Fast, commit the approved shot to Quality. |
| `frame-edit` | Frame-surgery workflow for continuity gags (vanishing props, object swaps) — extract, edit, then continue from the edited frame. |

### QA
| Skill | Purpose |
|-------|---------|
| `clip-qa` | Post-Veo visual-anomaly scan using Claude vision (materializing props, ghost limbs, flicker). |
| `analyze-clip` | Ffmpeg + Whisper based analysis (black frames, freeze frames, dialogue/audio timing). |

Book-end also runs `tools/frame-qa.py` on each frame pair before Veo submission to catch prop-position deltas, endpoint clustering, and distinctness issues.

### Editing & assembly
| Skill | Purpose |
|-------|---------|
| `normalize-clip` | Detect and strip embedded letterbox/pillarbox bars so mixed-source clips splice cleanly. |
| `splice` | Find and execute imperceptible cuts between two clips, with optional geometric alignment. |
| `edit-clip` | Trim / speed variations on a clip (tracked in `data/edits/`). |
| `text-reveal` | Animated ASS subtitle overlays (vertical wipe reveal). |
| `caption-box` | Social-media caption overlays (white box, black text, hard pop-in/out). |
| `upscale` | Real-ESRGAN video upscale to 4K on Apple Silicon. |

### Workflow
| Skill | Purpose |
|-------|---------|
| `produce-video` | End-to-end production driver, concept → final. |
| `archive-workspace` | Move a finished project from `data/workspace/<slug>/` into `data/workspace-archive/<slug>/`. |

## Tools

Standalone scripts under `tools/` that the skills wrap:

| Tool | Notes |
|------|-------|
| `tools/nano-banana.cjs` | Gemini 3 Pro Image CLI with reference image support. |
| `tools/frame-qa.py` | Book-end frame pair validator. |
| `tools/clip-qa.py` | Claude-vision visual anomaly scanner. |
| `tools/normalize-clip.cjs` | Letterbox detection + removal. |
| `tools/splice.cjs` + `tools/splice_align.py` | Seamless-join finder with geometric alignment. |
| `tools/text-reveal.cjs` | ASS-based top-down text reveal. |
| `tools/caption-box.cjs` | ffmpeg `drawtext` caption renderer. |
| `tools/upscale.py` | Real-ESRGAN 4K upscaler. |
| `tools/gcp/` | GCS and log helpers for the Veo pipeline. |

## Workspace convention

Each project gets its own folder under `data/workspace/<slug>/` with:

```
refs/     # plates, character locks, reference imagery
frames/   # book-end poster frames (firstFramePath / lastFramePath)
clips/    # Veo outputs and intermediate edits
final/    # assembled / captioned / upscaled deliverables
scratch/  # throwaway experiments
```

Archiving preserves that structure under `data/workspace-archive/<slug>/`. Briefs for in-flight and historical projects live under `briefs/`.

## MCP server

All generation and analysis primitives are exposed as MCP tools. The server lives in `mcp/video-generator/` and is wired up via `.mcp.json`. See `CLAUDE.md` and the rules files under `.claude/rules/` for the full tool inventory.

```bash
cd mcp/video-generator && npm install && npm run build
```

## Setup

- Node 18+, Python 3.10+, ffmpeg on `PATH`
- For upscale: `pip install realesrgan-ncnn-py`
- Credentials (loaded from `data/config.json`, which is gitignored):
  - Anthropic API key
  - ElevenLabs API key
  - GCP service account JSON with Vertex AI access (for Veo + Nano Banana)

## License

MIT
