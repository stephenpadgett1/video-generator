---
name: frame-edit
description: Frame-surgery workflow for object continuity gags. Extract a handoff frame from a clip, edit it to change state (remove / add / modify an object), then use the edited frame as the reference for a continuation Veo generation. Use for disappearance/appearance gags, object duplication, or any mid-scene state change that Veo won't reliably produce in a single pass.
allowed-tools: Read, Bash, mcp__video-generator__extract_frame, mcp__video-generator__edit_image, mcp__video-generator__analyze_image, mcp__video-generator__submit_veo_generation, mcp__video-generator__check_veo_status
---

# Frame Edit

Veo strongly preserves object continuity within a single generation — it is trained *against* objects appearing or disappearing mid-shot. To create continuity-violating gags (vanishing props, duplicated objects, mid-scene changes), generate **two clips with a frame surgery in between**: the first clip ends with the pre-change state, the second clip starts with the post-change state, and the splice hides the cut.

The lynchpin of this workflow is editing the handoff frame. That's what this skill orchestrates.

## The workflow

```
[Clip A: pre-change state]
        │
        ▼ extract handoff frame (at or near A's end)
        │
        ▼ edit_image: remove / add / modify objects
        │
        ▼ submit_veo_generation with the edited frame as referenceImagePath
        │
[Clip B: post-change state]
        │
        ▼ splice A + B (normalize-clip first if bars differ)
        │
[Final seamless gag]
```

## Step-by-step

### 1. Identify the handoff point in clip A

Pick a frame where the viewer's eye is NOT on the object being changed. The splice needs to hide the discontinuity. Good candidates:

- The character's body is occluding the object.
- The character is mid-turn and the camera follows them away from the object.
- A close-up moment where the object is off-frame.

If no such frame exists in clip A, regenerate A with staging that creates one (the brief's "turns away to position the bucket" is written specifically to enable this).

### 2. Extract the frame

```
Tool: extract_frame
Args: {
  "videoPath": "data/workspace/shotA.mp4",
  "timestamp": 7.5
}
```

Returns a path to a PNG. Save the timestamp — you'll need it for the splice `cut_a`.

### 3. Edit the frame

```
Tool: edit_image
Args: {
  "sourceImagePath": "<path from step 2>",
  "prompt": "<see prompt recipes below>",
  "editMode": "inpaint-remove" | "inpaint-insert" | "outpaint"
}
```

**Prompt recipes** (Imagen 3 capability model responds well to these patterns):

| Task | Edit mode | Prompt pattern |
|---|---|---|
| Remove mop from wall | `inpaint-remove` | `"Remove the mop leaning against the wall. Reconstruct the bare wall texture where it stood."` |
| Duplicate bucket 3× | `inpaint-insert` | `"Add two more identical buckets lined up next to the existing bucket on the floor. Same size, same style, same lighting."` |
| Change an object's state | `inpaint-insert` | `"Replace the closed door with the same door, but now open, with darkness beyond."` |
| Extend frame | `outpaint` | `"Extend the scene to the left, continuing the same warehouse wall and floor."` |

**Tips:**
- Be explicit about *what to preserve*. "Reconstruct the bare wall" is better than just "remove the mop" — the model needs to know what fills the gap.
- Reference existing lighting/texture. "Same lighting" and "continuing the same texture" help consistency.
- For duplicates, describe placement spatially. "Lined up next to" or "arranged in a row to the right" is more reliable than "arrange three buckets neatly."
- If the first edit result is off, iterate on the prompt. Imagen is prompt-sensitive.

**When prompt-only fails:** provide a mask. Create a simple black/white PNG where white indicates the region to edit, pass it as `maskPath`. A rough rectangle around the mop is usually enough for removal; a specific location for insertion.

### 4. Review — iterate if needed

Use `analyze_image` or read the edited frame directly to confirm:
- Did the target object get removed / added correctly?
- Is the background reconstruction plausible?
- Does the edit blend with lighting and perspective?

If not, adjust the prompt and re-edit. Keep previous versions for comparison.

### 5. Generate clip B from the edited frame

```
Tool: submit_veo_generation
Args: {
  "prompt": "The janitor turns back, sees the empty wall, does a subtle double-take, brows knit in confusion, shrugs. Static camera. [production style notes]",
  "referenceImagePath": "<path to edited frame>",
  "aspectRatio": "9:16",
  "durationSeconds": 8
}
```

**Veo prompt guidance:**
- The reference image IS the starting state. Don't describe it again; describe what changes or happens next.
- Veo 3.1 respects reference images well, but if the subsequent action is implausible (e.g., character faces away from where the reference shows), the model may drift.
- For ultra-tight continuity, also supply `lastFramePath` (the target end frame) — forces Veo to arrive at a known state.

Poll with `check_veo_status` until complete.

### 6. QA the generated clip

Because continuation shots anchor to a reference frame that depicts a deliberate state change, Veo sometimes "overcorrects" and re-introduces the removed object partway through, or generates a different glitch at the boundary. Scan B with `clip-qa` before splicing:

```bash
python3 tools/clip-qa.py clipB.mp4 --context-file=/tmp/shotB_prompt.txt --fail-on=high
```

If the tool flags a materialization of the just-removed object (common failure mode for inpaint-remove handoffs), either:
- Trim the clip to the clean range and splice against the trimmed version, or
- Re-draft with a more explicit negative prompt ("no mop appears in this shot — the wall is permanently bare"), or
- Regenerate with a more definitive edit (mask-based remove instead of prompt-only).

### 7. Splice

```
node tools/splice.cjs analyze clipA.mp4 clipB.mp4 --align --json-out=/tmp/splice.json
node tools/splice.cjs render clipA.mp4 clipB.mp4 out.mp4 --from-analyze=/tmp/splice.json --cut-a=<timestamp from step 1>
```

If A and B have different bar widths (mixed sources), normalize first:

```
node tools/normalize-clip.cjs clipB.mp4 clipB_norm.mp4
```

## Known limitations

- **Imagen auto-inference on prompt-only removal is unreliable for small or ambiguous objects.** Adjacent props, shadows, or repetitive elements may not get picked correctly. Use a mask when precision matters.
- **Inserted objects lose character consistency.** If you need the same bucket replicated 3×, Imagen's insertion will approximate but not copy. For pixel-perfect duplication, use a compositing approach (extract the bucket as a sprite, duplicate at specific coordinates). Not built yet — we'll add a tool when it comes up.
- **Lighting drift.** Edits may not perfectly match the source's lighting, especially with strong directional light. Keep iterating, or accept subtle mismatch (usually masked by video motion).
- **Reference-image → Veo handoff.** Veo uses the reference as the first frame but its interpretation of subsequent action is independent. If Veo "re-adds" the removed object in frame 2, the prompt needs to specify the state explicitly (e.g., "empty wall behind him").

## Mop-bucket gag as worked example

For the Hellzapoppin' #4 loading dock brief, scene 3:

**Gag 1 (mop vanishes):**
1. Generate Clip A: janitor places mop against wall, then turns fully to face the bucket (body occludes the wall area).
2. Extract frame from A at the moment the janitor is fully turned away (~t=6.5s on an 8s clip, tweak as needed).
3. Edit frame: `editMode=inpaint-remove`, prompt `"Remove the mop leaning against the wall. Reconstruct the bare wall with the same peeling paint texture."`
4. Generate Clip B with edited frame as reference; prompt: `"The janitor turns back from the bucket, looks at the wall where the mop was, does a brief double-take, glances around, shrugs, goes back to his work. Wall is bare."`
5. Splice A (up to the turn) + B with `--align` to smooth any minor geometry drift.

**Gag 2 (one bucket becomes three):**
1. Use end of Gag 1's B clip (or regenerate): janitor is back at the bucket.
2. Extract handoff frame at a moment the janitor is looking away from the bucket.
3. Edit: `editMode=inpaint-insert`, prompt `"Add two more identical buckets lined up to the right of the existing bucket. Same size, same weathered metal, same lighting."`
4. Generate Clip C with edited frame as reference; prompt: `"Janitor looks back at the floor, sees three buckets where there was one, freezes, stares, shakes his head with resigned exasperation, steps around them to continue working."`
5. Splice.

The curtain-hem detail at frame edges is a *different* problem (subtle overlay, not a state change) — defer to a compositing skill when we build it.
