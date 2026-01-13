# Session Log: MCP Conversion & Repo Restructure (2026-01-13)

## Accomplishments

### 1. Repository Restructure (Phase 1) ✓
- Created `.claude/rules/` with 7 modular documentation files
- Slimmed `CLAUDE.md` from 628 → 32 lines (index only)
- Added `.claude/settings.json` for team permissions
- Added `.claude/settings.local.json` to `.gitignore`

### 2. Claude Code Skills (Phase 2) ✓
Created 3 auto-triggered Skills in `.claude/skills/`:
- `analyze-clip` - Unified clip analysis (black frames, freeze, dialogue)
- `produce-video` - End-to-end production pipeline
- `edit-clip` - Trim/speed variations

All Skills use `context: fork` for isolated execution.

### 3. Native MCP Server Foundation (Phase 3A) ✓
Created `mcp/video-generator/` with:
- TypeScript + MCP SDK + Zod setup
- 5 initial tools: `get_config`, `save_config`, `list_projects`, `get_project`, `save_project`
- Server compiles and runs on stdio transport

### 4. Core Tools (Phase 3B) ✓
Implemented all Phase 3B tools:

**API Clients Created:**
- `src/clients/google-auth.ts` - JWT service account auth for Vertex AI
- `src/clients/claude.ts` - Claude API client
- `src/clients/veo.ts` - Veo video generation (submit, poll, download)
- `src/clients/gemini.ts` - Gemini image/video analysis
- `src/clients/imagen.ts` - Imagen 3.0 image generation

**Services Created:**
- `src/services/jobs.ts` - Job queue management (create, poll, wait)
- `src/services/generation.ts` - Structure, prompts, frame decomposition
- `src/services/locking.ts` - Character/environment locking with Gemini analysis
- `src/services/execution.ts` - Full project execution orchestration

**Tools Implemented (14 total):**

| Category | Tools |
|----------|-------|
| Jobs (3) | `create_job`, `get_job`, `list_jobs` |
| Generation (8) | `generate_structure`, `generate_veo_prompt`, `generate_frame_prompts`, `breakdown_shot`, `submit_veo_generation`, `check_veo_status`, `generate_image`, `analyze_image` |
| Locking (2) | `lock_character`, `lock_environment` |
| Execution (1) | `execute_project` |

### 5. Audio, Analysis & Editing Tools (Phase 3C) ✓
Implemented all Phase 3C tools:

**API Clients Created:**
- `src/clients/elevenlabs.ts` - TTS and music generation with voice caching

**Services Created:**
- `src/services/audio.ts` - Mood-aware voice/music profile computation
- `src/services/analysis.ts` - Transcription, timeline analysis, unified clip analysis
- `src/services/editing.ts` - Edit session management, trim/speed variations

**Tools Implemented (18 total):**

| Category | Tools |
|----------|-------|
| Audio (5) | `get_voices`, `get_cached_voices`, `generate_tts`, `generate_music`, `compute_audio_profile` |
| Analysis (5) | `transcribe`, `analyze_audio_timeline`, `analyze_dialogue_clip`, `analyze_clip_unified`, `analyze_video_gemini` |
| Editing (8) | `edit_start`, `edit_trim`, `edit_speed`, `edit_select`, `edit_store_analysis`, `edit_auto_analyze`, `get_edit_manifest`, `list_edits` |

### 6. Assembly & Validation Tools (Phase 3D) ✓
Implemented all Phase 3D tools:

**Services Created:**
- `src/services/assembly.ts` - Video concatenation, transitions, audio mixing
- `src/services/projects.ts` - Project loading and type definitions
- `src/services/validation.ts` - Full validator suite (structure, narrative, feasibility, audio, transitions, production, dialogue)

**Tools Implemented (5 total):**

| Category | Tools |
|----------|-------|
| Assembly (2) | `assemble_video`, `extract_frame` |
| Validation (3) | `validate_project`, `validate_project_by_id`, `get_validation_constants` |

### 7. Migration to MCP-Only Architecture (Phase 3E) ✓
Removed Express HTTP server and migrated to MCP-only:

**Removed:**
- `server.js` (161KB Express server with ~50 HTTP endpoints)
- `routes/*.js` (6 route files)
- Helper scripts: `analyze-clips.js`, `audio-rules.js`, `dialogue-splitter.js`, `validators.js`
- Old MCP files: `mcp/server.ts`, `mcp/README.md`

**Updated:**
- `.mcp.json` - Added video-generator MCP server
- `package.json` - Removed Express dependencies, updated scripts
- `CLAUDE.md` - Updated for MCP architecture
- Skills - Updated to use MCP tools instead of curl
- Documentation - Updated core-workflow.md, editing-system.md

**Net change:** -8953 lines deleted, +278 lines added

## Complete Tool Inventory

**Total: ~45 MCP tools**

| Phase | Category | Count | Tools |
|-------|----------|-------|-------|
| 3A | Config | 2 | `get_config`, `save_config` |
| 3A | Projects | 3 | `list_projects`, `get_project`, `save_project` |
| 3B | Jobs | 3 | `create_job`, `get_job`, `list_jobs` |
| 3B | Generation | 8 | `generate_structure`, `generate_veo_prompt`, `generate_frame_prompts`, `breakdown_shot`, `submit_veo_generation`, `check_veo_status`, `generate_image`, `analyze_image` |
| 3B | Locking | 2 | `lock_character`, `lock_environment` |
| 3B | Execution | 1 | `execute_project` |
| 3C | Audio | 5 | `get_voices`, `get_cached_voices`, `generate_tts`, `generate_music`, `compute_audio_profile` |
| 3C | Analysis | 5 | `transcribe`, `analyze_audio_timeline`, `analyze_dialogue_clip`, `analyze_clip_unified`, `analyze_video_gemini` |
| 3C | Editing | 8 | `edit_start`, `edit_trim`, `edit_speed`, `edit_select`, `edit_store_analysis`, `edit_auto_analyze`, `get_edit_manifest`, `list_edits` |
| 3D | Assembly | 2 | `assemble_video`, `extract_frame` |
| 3D | Validation | 3 | `validate_project`, `validate_project_by_id`, `get_validation_constants` |

## Architecture Reference

```
mcp/video-generator/
├── src/
│   ├── server.ts           # MCP entry point
│   ├── tools/              # Tool definitions (11 files)
│   ├── clients/            # API clients (6 files)
│   ├── services/           # Business logic (10 files)
│   └── utils/              # Utilities (2 files)
├── package.json
└── tsconfig.json
```

## Testing the MCP Server

```bash
cd mcp/video-generator
npm install
npm run build

# Test with inspector
npx @modelcontextprotocol/inspector node dist/server.js
```

## Session State
- All phases (3A-3E) complete
- Express server removed
- MCP-only architecture in place
- ~45 tools available via video-generator MCP server
- Ready for production testing

---

## Session 2: Sagittarius Video Editing (2026-01-13)

### Accomplishments

Successfully completed editing and assembly of the "Sagittarius: Why Choose?" video using the MCP tools and manual FFmpeg commands.

**Final video:** `data/exports/sagittarius_final.mp4` (33.0s)

**Edit decisions made:**
| Clip | Source | Edit Applied |
|------|--------|--------------|
| 1 | sagittarius_1_new.mp4 | Full (8s) |
| 2 | sagittarius_2.mp4 | Cut arrow flight (2.5s-4.6s removed) → 5.96s |
| 3 | Additional_targets_magically.mp4 | Trimmed to 2s-5s (targets materializing) → 3s |
| 4 | sagittarius_multiple_firing.mp4 | Trimmed from 6.624s start → 1.38s |
| 5 | sagittarius_multiple_targets.mp4 | Trimmed 1.5s off end → 6.5s |
| 6 | sagittarius_why_choose.mp4 | Trimmed to 2.58s-6.29s → 3.71s |
| 7 | sagittarius_end.mp4 | Reversed + trimmed both ends → 4.38s |

**Techniques used:**
- Gemini video analysis (`analyze_video_gemini`) to find edit points (arrow release/impact, target materialization)
- FFmpeg reverse filter for dramatic outro
- Debug overlay annotations for review iterations
- Higher quality final encode (preset slow, crf 20, 192k audio)

**Bug fix committed:**
- Added `-pix_fmt yuv420p` to crossfade and text overlay FFmpeg commands in assembly.ts for better compatibility

### Output Files
- `data/exports/sagittarius_final.mp4` - Clean final video (33s)
- `data/exports/sagittarius_v5.mp4` - Working version
- `data/exports/sagittarius_v5_debug.mp4` - Debug annotated version
- `build_v5.sh` - Assembly script (not committed, local workflow)

### Social Copy
**Title:** Sagittarius: Why Choose? ♐🎯

**Description:**
> Why choose one target when you can hit them all? That's Sagittarius energy. ♐🏹
>
> 🤖 Made with AI:
> Video generated by Google Veo 3.1
> Directed & edited by Claude (Anthropic)

---

## Session 3: Clip Metadata System (2026-01-13)

### Accomplishments

Implemented a comprehensive clip metadata extraction and search system for the 278+ clips in `data/video/`.

**New MCP Tools (7 total):**

| Tool | Purpose |
|------|---------|
| `extract_clip_metadata` | Extract technical/audio/visual data + keyframes for description |
| `complete_clip_metadata` | Save frame descriptions and finalize metadata |
| `get_clip_metadata` | Load existing metadata by clip ID |
| `search_clips` | Full-text search in transcriptions/descriptions with filters |
| `rebuild_clip_index` | Regenerate search index from all metadata files |
| `batch_extract_metadata` | Process multiple clips in a directory |
| `list_clip_metadata` | List all clips with existing metadata |

**Files Created:**
- `mcp/video-generator/src/services/clip-metadata.ts` - Core extraction service (~700 lines)
- `mcp/video-generator/src/tools/clip-metadata.ts` - MCP tool definitions
- `docs/clip-metadata/clips.json` - Metadata storage (git-tracked)

**Files Modified:**
- `mcp/video-generator/src/server.ts` - Register clip metadata tools
- `mcp/video-generator/src/utils/paths.ts` - Add CLIP_METADATA_DIR paths

**Metadata Schema:**
```typescript
{
  clip_id: string;           // Filename without extension
  technical: { duration, resolution, framerate, codecs, ... },
  audio: { transcription, silences, speech_segments, ... },
  visual: { scene_changes, black_frames, freeze_frames, ... },
  frames: { descriptions: [{ timestamp, description, context }], overall_summary },
  provenance: { job_id, project_id, shot_id, veo_prompt },
  tags: string[]             // Auto-generated for search
}
```

**Workflow:**
1. Call `extract_clip_metadata(videoPath)` - runs FFprobe, Whisper, FFmpeg detection, extracts frames
2. View returned frame paths with Read tool
3. Generate descriptions for each frame
4. Call `complete_clip_metadata(clipId, descriptions)` to save

**Progress:** ✓ Complete
- All 282 clips have full metadata with frame descriptions
- Face detection and character clustering implemented
- 45 characters auto-detected across clips

### Session State
- Clip metadata system fully operational
- build_v5.sh is a local workflow script (not committed)

---

## Session 4: Face Detection & Character Clustering (2026-01-13)

### Accomplishments

Implemented face detection and character clustering to automatically identify recurring characters across clips.

**New MCP Tools (8 total):**

| Tool | Purpose |
|------|---------|
| `detect_faces_in_clip` | Detect faces and compute embeddings for a single clip |
| `batch_detect_faces` | Process multiple clips for face detection |
| `cluster_characters` | Group faces into character clusters using DBSCAN |
| `list_characters` | List all detected characters with occurrence counts |
| `get_character` | Get detailed info about a character including clips |
| `update_character` | Add name, description, tags to a character |
| `search_clips_by_character` | Find all clips containing a specific character |
| `find_character_by_image` | Match a face image to known characters |

**New MCP Tools for Frame Descriptions (2 total):**

| Tool | Purpose |
|------|---------|
| `describe_clip_frames` | Generate frame descriptions via Claude Vision API |
| `batch_describe_frames` | Process multiple clips with rate limiting |

**Files Created:**
- `mcp/video-generator/src/services/face-detection.ts` - Face detection service calling Python
- `mcp/video-generator/src/services/character-clustering.ts` - DBSCAN clustering + character management
- `mcp/video-generator/src/tools/face-detection.ts` - MCP tool definitions
- `scripts/face-detection/detect_faces.py` - Python script using face_recognition library
- `scripts/face-detection/requirements.txt` - Python dependencies
- `docs/clip-metadata/characters.json` - Character database

**Results:**
- 282 clips processed for metadata extraction
- Face detection completed on clips with extracted frames
- 45 unique characters identified via clustering
- Characters linked to clips in metadata

### Session State
- Clip metadata system complete with frame descriptions
- Face detection and character clustering operational
- Ready for character-based video production workflows
