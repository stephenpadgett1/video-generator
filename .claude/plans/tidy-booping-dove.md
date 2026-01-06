# Environment Locking Implementation Plan

## Overview
Add `/api/lock-environment` endpoint parallel to character locking, enabling consistent environments across shots.

## Files to Modify
- `server.js` - Core implementation
- `CLAUDE.md` - Documentation

## Implementation Steps

### Step 1: Add `/api/lock-environment` endpoint (~line 2291 in server.js)

**Input:**
```json
{ "environment": { "id": "coffee_shop", "description": "Cozy cafe with exposed brick" }, "style": "..." }
```

**Output:**
```json
{ "environment_id": "...", "base_image_path": "...", "locked_description": "Industrial interior, exposed red brick, warm window light..." }
```

**Logic:**
1. Generate wide establishing shot via Imagen (no people, architectural focus)
2. Analyze with Gemini Pro - extract: materials, color palette, lighting character, spatial elements
3. Save image as `environment_{id}_base.png`
4. Return locked_description (25-40 words)

### Step 2: Modify `generateStructureInternal` (~line 1482)

Update Claude system prompt to also extract environments:
- Each environment gets: `id`, `description`, `primary` (boolean)
- Each shot gets: `environment` field (environment id)

### Step 3: Modify `execute-project` (~line 1911)

**3a.** Build `environmentMap` (parallel to characterMap)

**3b.** For each shot, build `environmentContext`:
```javascript
if (shot.environment && environmentMap[shot.environment]) {
  environmentContext = `ENVIRONMENT (must match exactly): ${env.locked_description}`;
}
```

**3c.** Combine with characterContext in `additionalContext`

**3d.** Reference image priority (character > environment by default):
```javascript
jobInput.referenceImagePath = referenceImagePath || environmentImagePath;
```

### Step 4: Update CLAUDE.md

Add Environment Locking section to docs.

## Key Design Decision: Reference Image Conflict

Veo only accepts ONE reference image. Strategy:
- Default: Character reference takes priority (harder to describe textually)
- Fallback: Environment reference if no character
- Environment consistency relies more on `locked_description` text

## Gemini Prompt for Environment Analysis

```
Extract immutable architectural/atmospheric features:
- Setting type (interior/exterior, architectural style)
- Materials and textures (brick, wood, concrete)
- Color palette (dominant, accent colors)
- Lighting character (natural/artificial, warm/cool)
- Key spatial elements (ceiling height, depth)

Exclude: moveable objects, weather, people.
Output: 25-40 words.
```

## Next Up (after this)
Wire `previousTakeDescription` for shot-to-shot continuity.
