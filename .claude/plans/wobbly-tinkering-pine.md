# Plan: Optimize build_sequence AI Calls

## Summary
Add two optimizations to reduce sequential AI calls in `build_sequence`:
1. Parallelize gap prompt generation with `Promise.all()`
2. Add a slot count limit with warning

## File to Modify
- `mcp/veo-clips-mcp/src/server.ts` (build_sequence tool, ~lines 995-1150)

## Implementation

### 1. Add Slot Count Limit (lines ~1005)
Add constant and early check:
```typescript
const MAX_SLOTS = 12;  // Limit to prevent excessive API calls

const totalSlots = moods.length * clipsPerMood;
if (totalSlots > MAX_SLOTS) {
  warnings.push(`Slot count ${totalSlots} exceeds limit of ${MAX_SLOTS}. Request will be truncated.`);
}
```

Truncate the loop to respect the limit (or return early with error).

### 2. Parallelize Gap Prompt Generation (lines ~1094-1128)
Replace sequential loop:
```typescript
// OLD: Sequential
for (const gapIdx of gapIndices) {
  const prompt = await generateVeoPrompt(...);
  gaps.push({ ... });
}
```

With parallel execution:
```typescript
// NEW: Parallel
const gapPromises = gapIndices.map(async (gapIdx) => {
  const slot = filledSlots[gapIdx];

  // Find neighbor clips...
  let prevClip: Clip | null = null;
  let nextClip: Clip | null = null;
  // ... neighbor finding logic ...

  const prompt = await generateVeoPrompt(slot.requirements, prevClip, nextClip);

  return {
    slotId: slot.id,
    slotLabel: slot.label,
    prompt,
    priority: "high" as const
  };
});

const gaps: Gap[] = await Promise.all(gapPromises);
```

## Expected Impact
- Gap prompts generated in parallel (N calls → ~1 round trip)
- Max 12 slots prevents runaway API usage (12 selection calls max)
- Total worst case: 12 sequential + parallel gap calls

## Notes
- MAX_SLOTS=12 is reasonable (allows 4 moods × 3 clips or 6 moods × 2 clips)
- Could make limit configurable via env var if needed
