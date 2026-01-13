# Core Workflow

## MCP Tools

The video pipeline uses MCP (Model Context Protocol) tools. All tools are available via the `video-generator` MCP server.

### Structure & Execution

| Tool | Input | Output |
|------|-------|--------|
| `generate_structure` | concept, duration, arc, style, production_style?, include_vo? | { characters, environments, shots } |
| `lock_character` | character, style | { character_id, base_image_path, locked_description } |
| `lock_environment` | environment, style | { environment_id, base_image_path, locked_description } |
| `execute_project` | project, style, aspectRatio | { jobs: [{ job_id, veo_prompt }] } |

### Job Management

| Tool | Input | Output |
|------|-------|--------|
| `create_job` | type, prompt, options | { job_id, status } |
| `get_job` | jobId | { job_id, status, result? } |
| `list_jobs` | limit?, status? | { jobs: [...] } |

### Analysis

| Tool | Input | Output |
|------|-------|--------|
| `transcribe` | videoPath | { segments, words, full_text, duration } |
| `analyze_dialogue_clip` | videoPath, expectedDialogue | { trim, validation } |
| `analyze_clip_unified` | videoPath, context? | { scenes, audio, anomalies, recommendations } |
| `analyze_audio_timeline` | videoPath | { speech_segments, silences } |
| `analyze_video_gemini` | videoPath, prompt | { analysis } |

### Audio

| Tool | Input | Output |
|------|-------|--------|
| `get_voices` | - | { voices: [...] } |
| `generate_tts` | voice_id, text, mood?, tension?, energy? | { path, filename } |
| `generate_music` | prompt/lyrics/mood, duration_seconds | { path, filename, duration } |
| `compute_audio_profile` | mood?, tension?, energy? | { voice_profile, music_profile } |

### Editing

| Tool | Input | Output |
|------|-------|--------|
| `edit_start` | job_id, project_id?, shot_id? | { edit_dir, manifest } |
| `edit_trim` | job_id, trim_start?, trim_end?, precise? | { variation } |
| `edit_speed` | job_id, speed, base_variation? | { variation } |
| `edit_select` | job_id, variation_id | { manifest } |
| `edit_auto_analyze` | job_id, apply_suggestions?, context? | { analysis, variation? } |

### Assembly

| Tool | Input | Output |
|------|-------|--------|
| `assemble_video` | shots/project_id, audioLayers?, textOverlays? | { path, duration, shotCount } |
| `extract_frame` | videoPath, timestamp | { path } |

### Validation

| Tool | Input | Output |
|------|-------|--------|
| `validate_project` | project, validators? | { valid, issues, warnings } |
| `validate_project_by_id` | project_id | { valid, issues, warnings } |
| `get_validation_constants` | - | { arcs, moods, roles, production_styles } |

## Character/Environment Locking

Generates reference image + extracts immutable features (30-50 words including clothing, physical traits). Locked descriptions are injected verbatim into Veo prompts.

**IMPORTANT: Correct usage when calling `execute_project`:**

After calling `lock_character`, you receive:
```json
{
  "character_id": "person_1",
  "base_image_path": "/generated-images/character_person_1_base.png",
  "locked_description": "A light-skinned woman in her 30s with short, wavy dark brown hair..."
}
```

When building the project for execute_project, the character object **must** include `locked_description` as a separate field:

```json
{
  "characters": [{
    "id": "person_1",
    "description": "Original description...",
    "locked_description": "A light-skinned woman in her 30s with short, wavy dark brown hair...",
    "base_image_path": "generated-images/character_person_1_base.png",
    "locked": true
  }]
}
```

The tool checks for `char.locked_description` specifically (not `description`). If you only set `locked: true` without the `locked_description` field, the description will NOT be injected into Veo prompts.
