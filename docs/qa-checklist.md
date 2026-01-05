# Video Generation QA Checklist

Manual quality assurance checkpoints for validating video generation at pre-generation and post-generation stages.

---

## Pre-Generation Checks

### 1. Structural Integrity

- [ ] Project has `project_id`, `concept`, `duration`, `arc`, `shots[]`
- [ ] All shots have: `shot_id`, `role`, `energy`, `tension`, `mood`, `duration_target`, `position`
- [ ] `energy` and `tension` values are in range 0.0-1.0
- [ ] `position` values progress from 0.0 to 1.0 across shots
- [ ] Shot `duration_target` values sum to approximately project `duration`
- [ ] All `characters[]` IDs referenced in shots exist in `project.characters`
- [ ] All `environment` IDs referenced in shots exist in `project.environments`

### 2. Narrative Coherence

**Arc Shape Validation:**

| Arc Type | Expected Energy Pattern |
|----------|------------------------|
| `linear-build` | Steadily increases start → end |
| `tension-release` | Peaks around 60-70%, then drops |
| `wave` | Oscillates with 2-3 peaks |
| `flat-punctuate` | Low baseline with 1-2 sharp spikes |
| `bookend` | High at start/end, lower in middle |

- [ ] Energy curve matches declared arc type
- [ ] Tension is **independent** from energy (not identical values)
- [ ] Mood transitions feel motivated (no jarring jumps without narrative reason)
- [ ] Shot roles match position:
  - `establish` → early shots (position < 0.2)
  - `resolve` → late shots (position > 0.8)
  - `punctuate` → at energy/tension peaks

### 3. Veo Feasibility

**Red Flags (likely to fail or look bad):**

- [ ] No VFX-heavy descriptions: neon, hologram, glowing, laser, particle effects
- [ ] No complex physics: water splashing, fire, smoke, explosions, cloth simulation
- [ ] No abstract concepts without visual anchors ("the feeling of loss")
- [ ] Character descriptions are concrete (clothing, hair, build) not abstract
- [ ] Environment descriptions are architectural/atmospheric, not magical

**Character Consistency:**

- [ ] Characters appearing in 2+ shots should be locked
- [ ] Locked character descriptions are 30-50 words with immutable features
- [ ] Locked environments maintain consistent lighting/time of day

### 4. Audio Alignment

- [ ] If `include_vo: true`, all narrative shots have `vo.text`
- [ ] VO `timing` values are valid: "start", "middle", "end"
- [ ] VO text length appropriate for shot duration (~150 words/min speaking)
- [ ] Mood-appropriate voice selection (not comedic voice for tragic scene)

### 5. Production Rules

**If using preset:**

| Preset | Camera | Lighting | Location |
|--------|--------|----------|----------|
| `stage_play` | Locked, front-row | Theatrical spotlight | Single |
| `documentary` | Observational, minimal | Natural | Multiple OK |
| `music_video` | Dynamic | Saturated/stylized | Fragmented |
| `noir` | Character POV | High contrast, shadows | Single preferred |

- [ ] All shots follow declared production style
- [ ] No contradictions (e.g., stage_play with multiple locations)

---

## Post-Generation Checks

### 6. Video Output Validation

- [ ] All Veo jobs completed successfully (no `error` status)
- [ ] Video files exist at expected paths
- [ ] Actual video durations close to `duration_target` (±1 second)
- [ ] No corrupt or unplayable video files

### 7. Visual Coherence

- [ ] Characters look consistent across shots (if locked)
- [ ] Environment maintains continuity (lighting, weather, time of day)
- [ ] Camera movement follows production style rules
- [ ] No obvious generation artifacts (melting faces, extra limbs)

### 8. Transition Quality

**Expected transitions based on tension:**

| Transition | Condition |
|------------|-----------|
| Crossfade (0.5s) | High→low tension drop (cathartic release) |
| Black insert (0.5s) | Low→high tension rise (breath before impact) |
| Hard cut | Sustained high tension |
| Short crossfade (0.25s) | Small energy change |

- [ ] Transitions match tension/energy dynamics
- [ ] No jarring cuts that break narrative flow
- [ ] Pacing feels appropriate for the arc

### 9. Audio Integration

- [ ] VO audio synced to correct shots
- [ ] VO timing matches specified position (start/middle/end)
- [ ] Music/ambient layers don't overpower VO
- [ ] Volume levels balanced across the video

### 10. Emotional Impact

- [ ] Overall mood matches concept intent
- [ ] Arc delivers expected emotional journey
- [ ] Climax/resolution feels earned (not abrupt)
- [ ] Pacing sustains engagement throughout

---

## Quick Reference: Valid Values

**Arc Types:** `linear-build`, `tension-release`, `wave`, `flat-punctuate`, `bookend`

**Moods:** `hopeful`, `melancholic`, `tense`, `peaceful`, `unsettling`, `triumphant`, `intimate`, `desolate`, `mysterious`, `urgent`, `contemplative`, `chaotic`, `bittersweet`, `whimsical`, `ominous`, `serene`

**Roles:** `establish`, `emphasize`, `transition`, `punctuate`, `reveal`, `resolve`

**Production Presets:** `stage_play`, `documentary`, `music_video`, `noir`

---

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| 🔴 Critical | Will cause generation failure or unwatchable output | Must fix before generation |
| 🟡 Warning | May produce suboptimal results | Review and consider fixing |
| 🟢 Note | Minor improvement opportunity | Optional enhancement |
