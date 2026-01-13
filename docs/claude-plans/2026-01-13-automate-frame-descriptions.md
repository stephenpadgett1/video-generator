# Plan: Automate Frame Descriptions via Claude Vision API ✓ COMPLETE

## Goal
Automate frame descriptions for 213 pending clips by calling Claude API (Opus 4.5) with vision support, replacing the manual "view frames → write descriptions" workflow.

**Status:** Implemented and executed. All 282 clips now have frame descriptions via `describe_clip_frames` and `batch_describe_frames` tools.

## Files to Modify

### 1. `mcp/video-generator/src/clients/claude.ts`
Add vision support and rate limiting:
- New types: `ImageContent`, `TextContent`, `ContentBlock`, `ClaudeMultimodalMessage`
- New function: `callClaudeVision()` - handles multimodal messages with base64 images
- New function: `loadImageAsBase64()` - reads PNG/JPEG and returns content block
- Rate limiting: exponential backoff (1.5s, 3s, 6s...) with 429 handling
- Model: `claude-opus-4-5-20251101`

### 2. `mcp/video-generator/src/services/clip-metadata.ts`
Add frame description function:
- New function: `describeClipFrames(clipId, options)`
  - Loads partial metadata from `/data/temp/partial_{clipId}.json`
  - Reads frame PNGs as base64
  - Builds prompt with clip context (duration, transcription, scene changes)
  - Calls `callClaudeVision()` with all frames in single request
  - Returns `{ descriptions[], overallSummary }`

### 3. `mcp/video-generator/src/tools/clip-metadata.ts`
Add two new MCP tools:

**`describe_clip_frames`** - Single clip
- Input: `clipId`, `model?`, `autoComplete?`
- Calls `describeClipFrames()`, optionally auto-completes metadata
- Returns descriptions for review or confirmation of completion

**`batch_describe_frames`** - All pending clips
- Input: `limit?`, `project_id?`, `autoComplete?`, `delayBetweenClips?`, `dryRun?`
- Iterates pending clips with rate limiting (2s delay between clips)
- Progress reporting and error handling per clip

## Implementation Details

### Claude API Request Format
```typescript
messages: [{
  role: "user",
  content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
    { type: "text", text: "Analyze these frames..." }
  ]
}]
```

### Prompt Structure
Include clip context to help Claude:
- Duration, aspect ratio, has_speech flag
- Transcription (if available)
- Scene change timestamps
- Frame positions (timestamp + context like "start", "middle", "end")

Request JSON response:
```json
{
  "descriptions": [{ "timestamp": 0.1, "description": "...", "context": "start" }],
  "overall_summary": "..."
}
```

### Rate Limiting
- Between clips: 2 second delay (configurable)
- On 429 error: exponential backoff starting at 1.5s, max 60s, 5 retries
- On other errors: log and continue to next clip

## Verification

1. **Build MCP server:**
   ```bash
   cd mcp/video-generator && npm run build
   ```

2. **Test single clip:**
   ```
   Call describe_clip_frames with clipId="jan7_shot_2_coffee_sprocket"
   ```

3. **Test dry run:**
   ```
   Call batch_describe_frames with dryRun=true, limit=10
   ```

4. **Process batch:**
   ```
   Call batch_describe_frames with limit=10, autoComplete=true
   ```

5. **Verify metadata saved:**
   ```
   Call get_clip_metadata for processed clips
   ```

## Estimates
- 213 clips × ~3-10 frames each
- ~2 seconds per clip (API + processing + delay)
- Total time: ~7-10 minutes for all clips
- Cost: ~$5-10 API usage (Opus 4.5 vision)
