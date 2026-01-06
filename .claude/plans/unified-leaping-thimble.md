# Plan: Add /api/execute-project Endpoint

## Overview
New endpoint that takes a project and kicks off video generation for all shots, returning job IDs immediately.

## Input Options
**Option 1: Full project**
```json
{
  "project": { ... },
  "style": "cinematic, bold colors"
}
```

**Option 2: Shorthand (generate + execute)**
```json
{
  "concept": "a red balloon escaping into the sky",
  "duration": 12,
  "arc": "linear-build",
  "style": "cinematic, bold colors"
}
```

## Output
```json
{
  "project_id": "...",
  "jobs": [
    { "shot_id": "shot_1", "job_id": "job_xxx", "duration_target": 4 },
    { "shot_id": "shot_2", "job_id": "job_yyy", "duration_target": 4 }
  ]
}
```

## Implementation

### 1. Endpoint structure
```javascript
app.post('/api/execute-project', async (req, res) => {
  const { project, concept, duration, arc, style } = req.body;

  // If no project, generate one from concept/duration/arc
  let projectData = project;
  if (!projectData && concept) {
    // Call generateProjectFromStructure internally
  }

  // For each shot, generate Veo prompt and submit job
  const jobs = [];
  for (const shot of projectData.shots) {
    const veoPrompt = await generateVeoPrompt(shot.description, shot.duration_target, style);
    const job = await submitVeoJob(veoPrompt, shot.duration_target);
    jobs.push({ shot_id: shot.shot_id, job_id: job.id, duration_target: shot.duration_target });
  }

  res.json({ project_id: projectData.project_id, jobs });
});
```

### 2. Reuse existing functions
Need to extract/reuse:
- `generateProjectFromStructure` logic (already have `generateStructureInternal`)
- `generate-veo-prompt` logic → extract to `generateVeoPromptInternal()`
- Job queue submission → use existing `createJob()` function

### 3. Internal function for Veo prompt generation
Extract from `/api/generate-veo-prompt`:
```javascript
async function generateVeoPromptInternal(description, durationSeconds, style, claudeKey) {
  // Build system prompt + user message
  // Call Claude API
  // Return veoPrompt string
}
```

### 4. Job submission
Use existing job queue system:
```javascript
const job = createJob('veo-generate', {
  prompt: veoPrompt,
  durationSeconds: shot.duration_target,
  aspectRatio: '9:16'
});
```

## Files to Modify
- `server.js`:
  - Extract `generateVeoPromptInternal()` from `/api/generate-veo-prompt`
  - Add `/api/execute-project` endpoint (~50 lines)

## Validation
- Require either `project` or `concept` (not both empty)
- Validate project has shots array
- Return 400 if Claude API key not configured
