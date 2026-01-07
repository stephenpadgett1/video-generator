# Plan: Fix Storm Drain Character Consistency

## Problem

First execution failed to inject locked character description into Veo prompts. The prompts just said "A person" with no appearance details.

**Root cause:** When calling `/api/execute-project`, I put the locked description in the `description` field instead of `locked_description`. The server only checks for `char.locked_description` at line 2679.

## Fix

Re-execute the project with correct character structure:

```json
{
  "id": "person_1",
  "description": "Mid-30s person in casual clothing - jeans and a light sweater, sneakers, medium-length brown hair, carrying a small shoulder bag",
  "locked_description": "A light-skinned woman in her 30s with short, wavy dark brown hair and an average build wears a cream-colored knit sweater, cuffed medium-wash blue jeans, and black low-top sneakers. She carries a small, olive green crossbody bag.",
  "base_image_path": "/generated-images/character_person_1_base.png",
  "locked": true
}
```

## Steps

1. Re-call `/api/execute-project` with the **same project** but correct character structure
2. Poll for job completion
3. Re-assemble with new video files
4. Review for character consistency

## Files

- Project JSON: `data/projects/a_person_walking_down_a_quiet__1767756819003.json`
- Locked character image: `generated-images/character_person_1_base.png`
- Output: `data/exports/storm_drain_reveal.mp4` (will be overwritten)
