# Plan: Video Generator Quality of Life Improvements

## Overview

Small improvements to reduce friction in common video production workflows, based on today's editing session.

## Improvements

### 1. Aspect Ratio Filter in `search_clips`

**Problem:** When looking for 9:16 clips for social media video, I had to manually check each character's clips. Several promising characters (Detective Shaw, Rosa) turned out to only have 16:9 clips.

**Solution:** Add `aspect_ratio` filter to `search_clips` tool.

**File:** `mcp/video-generator/src/tools/clip-metadata.ts`

**Changes:**
- Add `aspect_ratio` parameter (optional, enum: "16:9", "9:16", "1:1")
- Filter results by `metadata.technical.aspect_ratio`

**Usage:**
```
search_clips({ has_speech: true, aspect_ratio: "9:16" })
```

---

### 2. Title Card Generation Tool

**Problem:** Creating title and credits cards requires writing raw FFmpeg commands with complex drawtext filters. Did this twice today.

**Solution:** Add `generate_title_card` MCP tool.

**File:** `mcp/video-generator/src/tools/assembly.ts` (or new file)

**Parameters:**
- `title` (required): Main title text
- `subtitle` (optional): Secondary text
- `duration` (default: 2): Duration in seconds
- `aspectRatio` (default: "9:16"): Output aspect ratio
- `style` (optional): "minimal" | "centered" | "credits"
- `lines` (optional): Array of {text, size, color} for custom multi-line layouts

**Output:** Path to generated MP4 with silent audio track (ready for concat)

**Usage:**
```
generate_title_card({
  title: "in motion.",
  subtitle: "three strangers, one question",
  duration: 2,
  aspectRatio: "9:16"
})
```

---

### 3. Character Names in Search Results

**Problem:** `search_clips_by_character` returns `char_021` but we named her "Hiro". Have to call `get_character` separately to see the name.

**Solution:** Include character name in search results.

**File:** `mcp/video-generator/src/services/character-clustering.ts`

**Changes:**
- In `searchClipsByCharacter`, load character data and include `name` field in response
- Response becomes: `{ character_id, character_name, clip_count, clip_ids }`

---

## Implementation Order

1. **Aspect ratio filter** - Highest impact, simplest change
2. **Title card tool** - Medium complexity, high reuse value
3. **Character names** - Nice to have, low effort

## Verification

1. Build MCP server: `cd mcp/video-generator && npm run build`
2. Test aspect ratio filter: `search_clips({ aspect_ratio: "9:16", limit: 5 })`
3. Test title card: `generate_title_card({ title: "Test", duration: 2 })`
4. Test character search: `search_clips_by_character({ characterId: "char_021" })`

## Files to Modify

| File | Change |
|------|--------|
| `mcp/video-generator/src/tools/clip-metadata.ts` | Add aspect_ratio param to search_clips |
| `mcp/video-generator/src/services/clip-metadata.ts` | Filter by aspect ratio |
| `mcp/video-generator/src/tools/assembly.ts` | Add generate_title_card tool |
| `mcp/video-generator/src/services/assembly.ts` | Title card generation logic |
| `mcp/video-generator/src/services/character-clustering.ts` | Include name in search results |
