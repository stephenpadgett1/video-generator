# Clip Metadata Extraction System

## Goal
Extract and store searchable metadata for all 278 clips in `data/video/`, using Whisper, FFmpeg, and Claude visual descriptions (no Gemini).

## Storage
- Location: `docs/clip-metadata/clips/{clip_id}.json`
- Index: `docs/clip-metadata/index.json`
- One JSON file per clip for incremental updates and clean git diffs

## Schema (per clip)
```typescript
{
  clip_id: string;           // Filename without extension
  filename: string;
  path: string;              // Relative from project root

  technical: {               // From ffprobe
    duration, resolution, aspect_ratio, framerate,
    codec_video, codec_audio, has_audio, file_size_bytes, created_at
  },

  audio: {                   // From Whisper + FFmpeg silencedetect
    transcription: { full_text, words[], word_count } | null,
    silences[], speech_segments[], has_speech, speech_coverage
  },

  visual: {                  // From FFmpeg detectors
    scene_changes[], black_frames[], freeze_frames[],
    total_scenes, has_discontinuities
  },

  frames: {                  // From Claude viewing extracted PNGs
    sampled_at: number[],
    descriptions: [{ timestamp, description, context }],
    overall_summary: string
  },

  provenance: {              // Resolved from jobs.json / filename patterns
    job_id, project_id, shot_id, veo_prompt
  },

  tags: string[],            // Auto-generated for search
  extraction: { version, extracted_at, errors[] }
}
```

## New MCP Tools
| Tool | Purpose |
|------|---------|
| `extract_clip_metadata` | Single clip: ffprobe + Whisper + FFmpeg detection + frame extraction |
| `complete_clip_metadata` | Save descriptions after Claude views frames |
| `batch_extract_metadata` | Process directory, skip existing |
| `get_clip_metadata` | Load existing metadata |
| `search_clips` | Query by text/duration/speech/tags |
| `rebuild_clip_index` | Regenerate search index |

## Frame Sampling Strategy
- Default: 3 frames (0.1s, middle, duration-0.1s)
- Adaptive: If scene_changes or black_frames detected, sample both sides (±0.1s)
- Cap at 10 frames max per clip

## Workflow
1. Call `extract_clip_metadata(videoPath)` - extracts technical/audio/visual data + frames
2. Tool returns partial metadata + frame paths
3. Claude views each frame PNG with Read tool
4. Claude generates descriptions
5. Call `complete_clip_metadata(clip_id, descriptions)` to finalize JSON

For batch: process sequentially (Whisper rate limits), frame descriptions in second pass.

## Files to Create
- `mcp/video-generator/src/services/clip-metadata.ts` - Core extraction logic
- `mcp/video-generator/src/tools/clip-metadata.ts` - MCP tool definitions
- `docs/clip-metadata/` - Output directory (create if needed)

## Files to Modify
- `mcp/video-generator/src/server.ts` - Register new tools
- `mcp/video-generator/src/utils/paths.ts` - Add CLIP_METADATA_DIR constant

## Reused Existing Functions
- `analyzeClipUnified()` from analysis.ts - scene/black/freeze detection
- `transcribe()` from analysis.ts - Whisper integration
- `extractFrame()` from assembly.ts - PNG extraction
- `getVideoDuration()` from analysis.ts

## Verification
1. Build MCP server: `cd mcp/video-generator && npm run build`
2. Test single clip: Call `extract_clip_metadata` on one video
3. View generated frames, provide descriptions
4. Call `complete_clip_metadata` to save
5. Verify JSON created in `docs/clip-metadata/clips/`
6. Test `search_clips` query
7. Run batch on all 278 clips
