# Feature: Project Persistence with Job Tracking

## Problem
After generating a project and executing it, there's no way to retrieve the complete state (project + generated video paths) later. Users must manually reconstruct shot-to-video mappings by inferring from job timestamps.

## Solution Overview
1. Auto-save projects when generated/executed
2. Store job IDs in project shots when executed
3. New `GET /api/projects/:id` endpoint that returns project with resolved video paths

## Data Flow (New)
```
generate-project-from-structure → Auto-saves project to data/projects/
execute-project → Updates project with job_ids per shot
[jobs complete in background]
GET /api/projects/:id → Returns project with video paths merged from jobs
/api/assemble → Can accept project_id, auto-constructs shots payload
```

## Implementation

### 1. Modify `/api/generate-project-from-structure` (server.js ~line 1686)

After generating project, auto-save it:
```javascript
// After project is built (around line 1686)
const projectPath = path.join(__dirname, 'data', 'projects', `${project.project_id}.json`);
fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
console.log(`Project saved: ${project.project_id}`);
```

### 2. Modify `/api/execute-project` (server.js ~line 1860)

Store job_id in each shot, then save updated project:
```javascript
// In the jobs loop, after creating job (around line 1858)
shot.job_id = job.id;  // Add job_id to shot

// After all jobs submitted (around line 1870)
const projectPath = path.join(__dirname, 'data', 'projects', `${project.project_id}.json`);
fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
```

### 3. Add `GET /api/projects/:id` endpoint (new, after line ~138)

```javascript
app.get('/api/projects/:id', (req, res) => {
  const projectPath = path.join(__dirname, 'data', 'projects', `${req.params.id}.json`);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const jobs = loadJobs();

  // Merge job results into shots
  for (const shot of project.shots) {
    if (shot.job_id) {
      const job = jobs.find(j => j.id === shot.job_id);
      if (job) {
        shot.job_status = job.status;
        if (job.status === 'complete' && job.result) {
          shot.video_path = job.result.path;
          shot.video_duration = job.result.duration;
        } else if (job.status === 'error') {
          shot.job_error = job.error;
        }
      }
    }
  }

  // Add overall status
  const allComplete = project.shots.every(s => s.job_status === 'complete');
  const anyError = project.shots.some(s => s.job_status === 'error');
  project.status = anyError ? 'error' : allComplete ? 'complete' : 'processing';

  res.json(project);
});
```

### 4. Add `GET /api/projects` endpoint (list all projects)

```javascript
app.get('/api/projects', (req, res) => {
  const projectsDir = path.join(__dirname, 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    const project = JSON.parse(fs.readFileSync(path.join(projectsDir, f), 'utf8'));
    return {
      project_id: project.project_id,
      concept: project.concept,
      duration: project.duration,
      shot_count: project.shots?.length || 0
    };
  });

  res.json(projects);
});
```

### 5. Enhance `/api/assemble` to accept project_id (optional)

Add support for `project_id` parameter that auto-constructs shots AND auto-includes VO:
```javascript
// At start of /api/assemble handler (after line 2057)
let { shots, project_id, voice_id, audioLayers = [], ... } = req.body;

if (project_id && !shots) {
  const projectPath = path.join(__dirname, 'data', 'projects', `${project_id}.json`);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const jobs = loadJobs();

  // Build shots from project
  let runningTime = 0;
  shots = [];

  for (const shot of project.shots) {
    const job = shot.job_id ? jobs.find(j => j.id === shot.job_id) : null;
    if (!job || job.status !== 'complete') {
      throw new Error(`Shot ${shot.shot_id} not ready: ${job?.status || 'no job'}`);
    }

    shots.push({
      videoPath: job.result.path,
      energy: shot.energy
    });

    // Auto-generate VO audioLayer if shot has vo.text and voice_id provided
    if (shot.vo?.text && voice_id) {
      const shotDuration = job.result.duration || shot.duration_target;
      let startTime = runningTime;

      // Adjust based on vo.timing
      if (shot.vo.timing === 'middle') {
        startTime += shotDuration * 0.25;
      } else if (shot.vo.timing === 'end') {
        startTime += shotDuration * 0.5;
      }

      audioLayers.push({
        type: 'vo',
        text: shot.vo.text,
        voice_id: voice_id,
        volume: 1,
        startTime: startTime
      });
    }

    runningTime += job.result.duration || shot.duration_target;
  }
}
```

**Usage:** Pass `voice_id` with `project_id` to auto-generate VO from project's shot.vo fields. Any explicit `audioLayers` are merged with auto-generated ones.

## File Changes Summary

| File | Changes |
|------|---------|
| `server.js` | Add GET `/api/projects/:id`, GET `/api/projects`, modify `/api/generate-project-from-structure` to auto-save, modify `/api/execute-project` to store job_ids, enhance `/api/assemble` for project_id |

## API Response Examples

**GET /api/projects/red_balloon_123**
```json
{
  "project_id": "red_balloon_123",
  "concept": "a red balloon escaping into the sky",
  "status": "complete",
  "shots": [
    {
      "shot_id": "shot_1",
      "description": "...",
      "energy": 0.3,
      "job_id": "job_xxx",
      "job_status": "complete",
      "video_path": "/video/veo_xxx.mp4",
      "video_duration": 4
    }
  ]
}
```

**POST /api/assemble with project_id**
```json
{
  "project_id": "red_balloon_123",
  "voice_id": "abc123",
  "outputFilename": "red_balloon_final.mp4"
}
```
- `voice_id` triggers auto-generation of VO from project's shot.vo fields
- Can still pass explicit `audioLayers` to add music or override VO
