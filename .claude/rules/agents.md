# Claude Agents

TypeScript agents for specialized workflows. Uses Claude Agent SDK for context-aware reasoning.

```bash
cd src/agents && npm install
```

## video-producer-v2.ts (Recommended)

End-to-end video production with full project context. Reads CLAUDE.md to understand Veo limitations.

```bash
npx tsx video-producer-v2.ts                              # Process next idea
npx tsx video-producer-v2.ts idea.txt                     # Specific file
npx tsx video-producer-v2.ts --instructions "Be minimal"  # With guidance
```

## video-producer.ts (Legacy)

Original agent without Agent SDK context. Still works but doesn't read CLAUDE.md.

## Other Agents

- `project-reviewer.ts` - Critique producer decisions (structure, feasibility)
- `concept-reviewer.ts` - Review raw concepts before production
- `system-refiner.ts` - Autonomous optimization of interpretation prompts
- `clip-validator.ts` - Automated clip validation using ffprobe
- `cut-point-analyzer.ts` - Find optimal trim points in generated clips
- `clip-editor.ts` - Auto-create trimmed variations from analysis

```bash
npx tsx project-reviewer.ts                    # Review most recent project
npx tsx system-refiner.ts                      # Run optimization cycle
npx tsx system-refiner.ts --hints "improve feasibility"
npx tsx clip-validator.ts project.json         # Validate generated clips
npx tsx cut-point-analyzer.ts project.json     # Find trim points
npx tsx clip-editor.ts project.json            # Create edit variations
```

## Clip Validator

Runs automated checks on generated video clips and writes structured annotations to project JSON:

```bash
npx tsx clip-validator.ts data/projects/my_project.json
npx tsx clip-validator.ts --project-id my_project
npx tsx clip-validator.ts project.json --visual   # Generate annotated video
```

**Checks performed:**
| Check | Category | Severity |
|-------|----------|----------|
| Video file exists | completeness | error |
| Duration matches target ±0.5s | timing | info/warning |
| Has audio track | audio | warning |
| Audio not silent (dialogue shots) | audio | warning |
| Resolution/aspect ratio | visual | info |

**Output:** Annotations are saved to the project JSON for other agents to consume. Exit code 1 if any errors block assembly.

**Visual mode (`--visual`):** Assembles all clips into a single video with annotations overlaid:
- Top-left: Shot ID, take number, agent name
- Bottom: Validation results color-coded (green=OK, yellow=WARN, red=ERR)
- Output: `data/exports/{project_id}_validated.mp4`

## Cut Point Analyzer

Analyzes generated video clips using audio timeline (ffmpeg + Whisper) to recommend optimal trim points. Detects dead time at start/end, internal pauses, and dialogue issues.

```bash
npx tsx cut-point-analyzer.ts project.json              # Analyze all clips
npx tsx cut-point-analyzer.ts --project-id my_project   # By project ID
npx tsx cut-point-analyzer.ts project.json --shot shot_3  # Specific shot
npx tsx cut-point-analyzer.ts project.json --dry-run    # Don't save annotations
```

**Issues detected:**
| Issue Type | Description |
|------------|-------------|
| `late_action` | Speech/action starts late, dead time at start |
| `dead_time` | Speech/action ends early, static frames at end |
| `other` | Internal pauses, missing dialogue words |

**How it works:** Calls `/api/audio-timeline` which combines ffmpeg silencedetect with Whisper transcription. FFmpeg provides accurate pause detection (Whisper compresses silence gaps). Returns trim recommendations based on speech segment boundaries.

## Unified Clip Analysis

Comprehensive analysis combining visual scene detection, audio analysis, and prompt context to make intelligent editing decisions.

**Endpoint:** `POST /api/analyze-clip-unified`

```bash
curl -X POST http://localhost:3000/api/analyze-clip-unified \
  -H "Content-Type: application/json" \
  -d '{"videoPath": "my_clip.mp4", "context": {"dialogue": [...]}}'
```

**Analysis signals:**
| Signal | Source | Purpose |
|--------|--------|---------|
| Scene changes | ffmpeg `select='gt(scene,0.4)'` | Visual discontinuities |
| Black frames | ffmpeg `blackdetect` | Fades, cuts, dead regions |
| Freeze frames | ffmpeg `freezedetect` | Static frames, AI artifacts |
| Speech segments | Whisper + silence detection | Audio activity |
| Silences | ffmpeg silencedetect | Natural cut points |
| Context match | Prompt/dialogue comparison | Validate generated content |

**Options:**
```json
{
  "options": {
    "sceneThreshold": 0.4,
    "blackPixThreshold": 0.98,
    "blackMinDuration": 0.1,
    "freezeNoise": 0.001,
    "freezeMinDuration": 0.5,
    "skipTranscription": false
  }
}
```

**Correlations detected:**
- `scene_change_at_silence` - Natural cut point (high confidence)
- `scene_matches_speech_boundary` - Audio/visual alignment

**Anomalies detected:**
| Type | Trigger | Severity |
|------|---------|----------|
| `scene_change_mid_word` | Scene change during speech | warning |
| `entrance_with_speech` | Scene + speech in first 0.5s | warning |
| `dead_time_detected` | No activity at clip end | info |
| `visual_glitch` | 3+ scene changes in 0.5s | warning |
| `dialogue_mismatch` | <50% word match | warning |
| `long_freeze_frame` | Freeze >1s detected | warning |
| `freeze_during_speech` | Visual freeze during speech | warning |
| `black_frame_at_start` | Black frame at clip start | info |
| `black_frame_at_end` | Black frame at clip end | info |

**Response includes:**
- `scenes.changes[]` - Timestamps of visual scene changes
- `visual_detection.black_frames[]` - Black frame regions with start/end/duration
- `visual_detection.freeze_frames[]` - Frozen frame regions
- `visual_detection.summary` - Totals and flags for black/freeze detection
- `audio.speech_segments[]` - Where speech occurs
- `reconciled.correlations[]` - Audio/visual alignment patterns
- `reconciled.anomalies[]` - Problems detected
- `reconciled.edit_suggestions[]` - Recommended actions (includes `trim_out_freeze` for long freezes)
- `summary.recommended_action` - 'use_as_is', 'trim', 'review', or 'regenerate'
- `summary.trim_recommendation` - Suggested trim points (prioritizes black frames as cut points)

**Auto-analyze with edit:** `POST /api/edit/auto-analyze`
```json
{
  "job_id": "job_123",
  "apply_suggestions": true,
  "context": { "dialogue": [...] }
}
```
Runs unified analysis and optionally creates trim variation automatically.

## Clip Editor

Reads cut-point-analyzer annotations and automatically creates trimmed variations. Works with the edit system to produce rendered video files.

```bash
npx tsx clip-editor.ts project.json              # Create trim variations
npx tsx clip-editor.ts --project-id my_project   # By project ID
npx tsx clip-editor.ts project.json --shot shot_3  # Specific shot
npx tsx clip-editor.ts project.json --auto-approve  # Also select variations
npx tsx clip-editor.ts project.json --dry-run    # Preview without changes
```

**Workflow:**
1. Reads cut-point-analyzer annotations from project JSON
2. For clips with trim recommendations, creates edit folder via `/api/edit/start`
3. Creates trimmed variation via `/api/edit/trim`
4. Optionally auto-approves the variation for assembly

## QA Framework

Multi-layer testing system for validating video generation projects.

### Programmatic Validators

```javascript
const { validateProject } = require('./validators');
const result = validateProject(project);
// Returns: { valid, structure, narrative, feasibility, audio, transitions, production, dialogue, summary }
```

Individual validators:
- `validateProjectStructure()` - Fields, types, references
- `validateNarrativeArc()` - Energy curve matches arc type
- `validateVeoFeasibility()` - Flag VFX risk keywords
- `validateAudioSettings()` - VO timing and coverage
- `validateTransitions()` - Tension-aware transition logic
- `validateProductionRules()` - Preset consistency
- `validateDialogue()` - Speaker references, timing, overlap detection

### API Endpoints

```
POST /api/validate-project
  { project }                      # Full validation
  { project, validators: ["structure", "feasibility"] }  # Selective

GET /api/validate-project/:id      # Validate by project ID
```

### QA Reviewer Agent

AI-powered review using Agent SDK:

```bash
npx tsx qa-reviewer.ts project.json              # Pre-generation review
npx tsx qa-reviewer.ts project.json --video dir  # Post-generation review
npx tsx qa-reviewer.ts --project-id abc123       # Review by ID
```

Returns structured scores (0-1): structural, narrative, feasibility, audio, visual, emotional

### Reference

See `docs/qa-checklist.md` for manual QA reference.
