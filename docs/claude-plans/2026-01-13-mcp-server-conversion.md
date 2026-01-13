# Plan: Native MCP Server Conversion (Phase 3)

## Status

- **Phase 1** (DONE): Organizational restructure
- **Phase 2** (DONE): Add Skills
- **Phase 3** (NOW): Convert Express server → Native MCP

## Scope

**Full conversion**: All 50 HTTP endpoints → MCP tools
**Architecture**: MCP only (replace Express entirely)

## Current State

- `server.js`: 4383 lines, 36 inline endpoints
- `routes/*.js`: 6 modules with 14 additional endpoints
- Existing MCP: `mcp/veo-clips-mcp/` (clip library search - keep as separate server)

---

## New Architecture

```
mcp/video-generator/
├── src/
│   ├── server.ts              # MCP server entry point
│   ├── tools/                  # Tool definitions (grouped by category)
│   │   ├── config.ts          # get_config, save_config
│   │   ├── projects.ts        # project CRUD operations
│   │   ├── jobs.ts            # job queue management
│   │   ├── generation.ts      # veo, imagen, structure generation
│   │   ├── claude.ts          # claude API, prompt generation
│   │   ├── audio.ts           # elevenlabs TTS, music
│   │   ├── analysis.ts        # clip analysis, transcription
│   │   ├── editing.ts         # trim, speed, variations
│   │   ├── assembly.ts        # video assembly
│   │   └── validation.ts      # project validation
│   ├── clients/               # External API clients
│   │   ├── veo.ts             # Vertex AI Veo client
│   │   ├── claude.ts          # Anthropic Claude client
│   │   ├── gemini.ts          # Google Gemini client
│   │   ├── elevenlabs.ts      # ElevenLabs TTS/Music client
│   │   └── imagen.ts          # Imagen 3.0 client
│   ├── services/              # Business logic
│   │   ├── project-store.ts   # Project persistence
│   │   ├── job-queue.ts       # Job management
│   │   ├── ffmpeg.ts          # FFmpeg operations
│   │   └── audio-rules.ts     # Mood-aware audio settings
│   └── utils/
│       ├── config.ts          # Config loading
│       └── paths.ts           # File path utilities
├── package.json
└── tsconfig.json
```

---

## Tool Categories (50 tools)

### Config (2 tools)
- `get_config` - Load current configuration
- `save_config` - Update configuration

### Projects (5 tools)
- `get_project` - Get current project
- `save_project` - Save project to file
- `delete_project` - Clear current project
- `list_projects` - List all projects
- `get_project_by_id` - Load specific project

### Jobs (3 tools)
- `create_job` - Create new generation job
- `get_job` - Poll job status
- `list_jobs` - List jobs with filtering

### Generation (7 tools)
- `generate_structure` - Generate shot structure from concept
- `generate_project` - Full project from concept
- `generate_veo_prompt` - Create Veo prompt from shot
- `generate_frame_prompts` - First/last frame prompts
- `breakdown_shot` - Split shot into multi-take
- `submit_veo_generation` - Submit to Veo
- `generate_image` - Generate image via Imagen

### Claude (1 tool)
- `call_claude` - Direct Claude API call

### Locking (2 tools)
- `lock_character` - Lock character appearance
- `lock_environment` - Lock environment

### Execution (1 tool)
- `execute_project` - Main orchestrator

### Audio (5 tools)
- `get_voices` - Fetch ElevenLabs voices
- `get_cached_voices` - Get cached voices
- `generate_tts` - Text-to-speech
- `generate_music` - Music generation
- `compute_audio_profile` - Mood-based settings

### Analysis (6 tools)
- `transcribe` - Whisper transcription
- `analyze_audio_timeline` - Audio analysis
- `analyze_dialogue_clip` - Dialogue validation
- `analyze_clip_unified` - Comprehensive analysis
- `analyze_video_gemini` - Gemini video analysis
- `analyze_cut_points` - Trim recommendations

### Editing (7 tools)
- `edit_start` - Initialize edit folder
- `edit_trim` - Create trim variation
- `edit_speed` - Create speed variation
- `edit_select` - Select for assembly
- `edit_analysis` - Store analysis
- `edit_auto_analyze` - Auto-analyze + trim
- `get_edit_manifest` - Get edit state
- `list_edits` - List all edits

### Assembly (1 tool)
- `assemble_video` - Combine clips into final video

### Validation (2 tools)
- `validate_project` - Validate project structure
- `validate_project_by_id` - Validate by ID

### Utilities (2 tools)
- `extract_frame` - Extract frame from video
- `check_veo_status` - Poll Veo operation

---

## Implementation Phases

### Phase A: Foundation (THIS SESSION)
1. Create `mcp/video-generator/` directory structure
2. Set up package.json + tsconfig.json
3. Create basic server.ts with MCP SDK
4. Extract config utilities
5. Create 2-3 simple tools (get_config, save_config, list_projects)
6. Verify server starts and tools respond

### Phase B: Core Tools (FUTURE)
Config + Projects + Jobs + Generation tools

### Phase C: Audio + Analysis (FUTURE)
ElevenLabs + Transcription + Analysis tools

### Phase D: Assembly + Validation (FUTURE)
Assembly + Validation tools

### Phase E: Cleanup (FUTURE)
Remove Express, update docs

---

## Key Extraction Targets

From `server.js`, extract:

| Lines | Content | Target |
|-------|---------|--------|
| 1-50 | Imports, paths | `utils/paths.ts` |
| 51-200 | Audio rules | `services/audio-rules.ts` |
| 200-400 | Claude API | `clients/claude.ts` |
| 400-600 | ElevenLabs | `clients/elevenlabs.ts` |
| 600-900 | Veo/Vertex | `clients/veo.ts` |
| 900-1100 | Imagen | `clients/imagen.ts` |
| 1100-1400 | Gemini | `clients/gemini.ts` |
| 1400-2000 | Project/Job logic | `services/project-store.ts`, `services/job-queue.ts` |
| 2000-3000 | Execute project | `services/executor.ts` |
| 3000-4000 | Assembly | `services/assembler.ts` |
| 4000-4383 | FFmpeg utils | `services/ffmpeg.ts` |

---

## MCP Tool Pattern

```typescript
// tools/generation.ts
import { z } from "zod";
import { veoClient } from "../clients/veo";

export const generationTools = {
  submit_veo_generation: {
    title: "Submit Veo Generation",
    description: "Submit video generation request to Veo 3.1",
    inputSchema: {
      prompt: z.string().describe("Video generation prompt"),
      aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
      duration: z.number().optional().default(8),
      referenceImage: z.string().optional(),
      lastFrameImage: z.string().optional(),
    },
    handler: async (args) => {
      const result = await veoClient.generate(args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  },
  // ... more tools
};
```

---

## This Session: Files to Create

| File | Purpose |
|------|---------|
| `mcp/video-generator/package.json` | MCP SDK + Zod dependencies |
| `mcp/video-generator/tsconfig.json` | TypeScript ES2022, Node16 |
| `mcp/video-generator/src/server.ts` | MCP entry point with tool registration |
| `mcp/video-generator/src/utils/config.ts` | Config loading utilities |
| `mcp/video-generator/src/utils/paths.ts` | Path constants |
| `mcp/video-generator/src/tools/config.ts` | get_config, save_config tools |
| `mcp/video-generator/src/tools/projects.ts` | list_projects tool |

## Future Sessions: Additional Files

| File | Purpose |
|------|---------|
| `mcp/video-generator/src/tools/*.ts` | Remaining tool categories |
| `mcp/video-generator/src/clients/*.ts` | API client modules |
| `mcp/video-generator/src/services/*.ts` | Business logic services |
| `.mcp.json` | Update to include new server |

---

## Migration Strategy

1. **Parallel development**: Build MCP server while Express runs
2. **Tool-by-tool migration**: Test each tool against Express endpoint
3. **Skills update**: Update Skills to call MCP tools (not curl)
4. **Cutover**: Remove Express, update .mcp.json
5. **Cleanup**: Delete server.js, routes/

---

## This Session: Verification

1. `cd mcp/video-generator && npm install` - Dependencies install
2. `npm run build` - TypeScript compiles without errors
3. `npm run dev` - Server starts on stdio
4. Test with inspector: `npx @modelcontextprotocol/inspector node dist/server.js`
5. Verify tools respond:
   - `get_config` returns current config
   - `save_config` updates config file
   - `list_projects` returns project list

## Future: Full Verification

1. Test all 50 tools
2. Test full workflow: generate → execute → assemble
3. Update .mcp.json and test with Claude Code
4. Remove Express server
