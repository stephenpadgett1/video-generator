# Song Timeline Analysis Feature

Add an `analyze_song` MCP tool that extracts lyrics (via Whisper) and audio onset times (via librosa) into a unified timeline.

## Requirements
- Extract lyrics with word-level timestamps using existing Whisper transcription
- Detect audio onsets (when sounds/notes start) using librosa
- Combine into a unified timeline with sections (loud/quiet)
- No additional API calls - only local processing (existing Whisper API is allowed)

## Files to Create

### 1. Python Script: `scripts/song-analysis/onset_detection.py`
Accepts JSON via stdin, outputs JSON via stdout (same pattern as face-detection).

```python
# Input: {"audio_path": "/path/to/song.mp3", "options": {...}}
# Output: {"onsets": [...], "energy_curve": [...], "duration": 180.5}
```

Uses librosa for:
- `librosa.onset.onset_detect()` - timestamps where sounds start
- `librosa.onset.onset_strength()` - relative strength of each onset
- `librosa.feature.rms()` - energy curve for section detection

### 2. Dependencies: `scripts/song-analysis/requirements.txt`
```
librosa>=0.10.0
numpy>=1.24.0
soundfile>=0.12.0
```

### 3. Service: `mcp/video-generator/src/services/song-analysis.ts`
- Calls Python script via stdin/stdout (copy `runPythonScript` pattern from `face-detection.ts:219-255`)
- Calls existing `transcribe()` from `analysis.ts` for lyrics
- Merges onsets + lyrics + energy-based sections into unified timeline
- Exports `analyzeSong(audioPath, options)`

### 4. MCP Tool: `mcp/video-generator/src/tools/song-analysis.ts`
```typescript
analyze_song: {
  audioPath: string,           // Required: path to audio/video file
  skipLyrics?: boolean,        // Skip Whisper (for instrumentals)
  onsetThreshold?: number,     // Sensitivity (0-1, default 0.5)
  energyThreshold?: number     // Section detection (0-1, default 0.3)
}
```

## Files to Modify

### 1. `mcp/video-generator/src/utils/paths.ts`
Add:
```typescript
export const SONG_ANALYSIS_SCRIPT = path.join(SCRIPTS_DIR, "song-analysis/onset_detection.py");
```

### 2. `mcp/video-generator/src/server.ts`
Add:
```typescript
import { songAnalysisTools } from "./tools/song-analysis.js";
// ...
registerTools(songAnalysisTools as unknown as Record<string, ToolDef>);
```

## Output Format

```json
{
  "timeline": [
    { "time": 0.0, "type": "section_start", "description": "quiet section begins" },
    { "time": 0.5, "type": "onset", "strength": 0.85 },
    { "time": 2.3, "type": "lyric", "text": "Hello", "end": 2.8 },
    { "time": 2.5, "type": "onset", "strength": 0.91 }
  ],
  "lyrics": {
    "words": [{ "word": "Hello", "start": 2.3, "end": 2.8 }],
    "full_text": "Hello world..."
  },
  "onsets": [
    { "time": 0.5, "strength": 0.85 },
    { "time": 2.5, "strength": 0.91 }
  ],
  "energy_curve": [
    { "time": 0.0, "rms": 0.12 },
    { "time": 0.1, "rms": 0.45 }
  ],
  "summary": {
    "duration": 180.5,
    "lyric_count": 42,
    "onset_count": 156,
    "sections": [
      { "start": 0.0, "end": 15.2, "type": "quiet" },
      { "start": 15.2, "end": 180.5, "type": "loud" }
    ]
  }
}
```

## Implementation Notes

### Windows Compatibility
The existing `runPythonScript` uses `python3`. On Windows, use `python`:
```typescript
const pythonCmd = process.platform === "win32" ? "python" : "python3";
```

### Onset Filtering
Only include onsets with strength >= 0.2 in the timeline (filter weak detections).

### Section Detection
Detect sections by thresholding the RMS energy curve:
- `rms >= threshold` → loud section
- `rms < threshold` → quiet section
- Merge adjacent segments of same type

## Verification

1. Install Python dependencies:
   ```bash
   cd scripts/song-analysis
   pip install -r requirements.txt
   ```

2. Build MCP server:
   ```bash
   cd mcp/video-generator && npm run build
   ```

3. Test with a song file:
   - Use `analyze_song` MCP tool with a test audio file
   - Verify onsets are detected at note/beat boundaries
   - Verify lyrics are extracted with timestamps
   - Verify sections are labeled correctly

4. Test edge cases:
   - Instrumental track (skipLyrics: true)
   - Speech-only audio (few onsets expected)
   - Different audio formats (mp3, wav, m4a)
