# Plan: Add lightweight job queue to Express server

## Overview
Add a simple job system with JSON file persistence for background Veo generation polling.

## Target File
`C:\Projects\video-generator\server.js`

## Job Structure
```javascript
{
  id: string,           // UUID or timestamp-based
  type: string,         // 'veo-generate' | 'imagen-generate'
  status: string,       // 'pending' | 'processing' | 'complete' | 'error'
  input: object,        // Original request params
  result: object|null,  // Result when complete
  error: string|null,   // Error message if failed
  createdAt: string,    // ISO timestamp
  updatedAt: string     // ISO timestamp
}
```

## Implementation

### 1. Job persistence helpers (near top of file, after loadConfig)

```javascript
const JOBS_PATH = path.join(__dirname, 'jobs.json');

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_PATH)) {
      return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading jobs:', err);
  }
  return [];
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2));
}

function updateJob(jobId, updates) {
  const jobs = loadJobs();
  const index = jobs.findIndex(j => j.id === jobId);
  if (index !== -1) {
    jobs[index] = { ...jobs[index], ...updates, updatedAt: new Date().toISOString() };
    saveJobs(jobs);
    return jobs[index];
  }
  return null;
}
```

### 2. Background Veo polling function

```javascript
async function pollVeoJob(jobId, operationName) {
  const config = loadConfig();
  const POLL_INTERVAL = 10000; // 10 seconds

  const poll = async () => {
    try {
      const { accessToken, projectId } = await getVeoAccessToken(config);

      const response = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:fetchPredictOperation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ operationName })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        updateJob(jobId, { status: 'error', error: `Poll failed: ${error}` });
        return;
      }

      const data = await response.json();

      if (data.done) {
        if (data.error) {
          updateJob(jobId, { status: 'error', error: data.error.message });
        } else {
          // Extract video URI from response
          const videoUri = data.response?.videos?.[0]?.uri;
          updateJob(jobId, {
            status: 'complete',
            result: { operationName, videoUri, response: data.response }
          });
        }
      } else {
        // Continue polling
        setTimeout(poll, POLL_INTERVAL);
      }
    } catch (err) {
      updateJob(jobId, { status: 'error', error: err.message });
    }
  };

  // Start polling
  setTimeout(poll, POLL_INTERVAL);
}
```

### 3. Endpoints

```javascript
// POST /api/jobs - Create a new job
app.post('/api/jobs', async (req, res) => {
  const { type, input } = req.body;

  if (!type || !input) {
    return res.status(400).json({ error: 'type and input are required' });
  }

  if (!['veo-generate', 'imagen-generate'].includes(type)) {
    return res.status(400).json({ error: 'Unsupported job type' });
  }

  const job = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    type,
    status: 'pending',
    input,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const jobs = loadJobs();
  jobs.unshift(job); // Add to front
  saveJobs(jobs);

  // Start processing based on type
  if (type === 'veo-generate') {
    // Immediately start Veo generation
    processVeoJob(job.id, input);
  } else if (type === 'imagen-generate') {
    processImagenJob(job.id, input);
  }

  res.json({ jobId: job.id });
});

// GET /api/jobs/:id - Get job by ID
app.get('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// GET /api/jobs - Get recent jobs
app.get('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  const limit = parseInt(req.query.limit) || 50;
  res.json(jobs.slice(0, limit));
});
```

### 4. Job processors

```javascript
async function processVeoJob(jobId, input) {
  updateJob(jobId, { status: 'processing' });
  const config = loadConfig();

  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);

    // Build request (reuse existing logic)
    const { prompt, aspectRatio = '9:16', durationSeconds = 8, referenceImagePath, lastFramePath } = input;

    // ... (same logic as /api/veo/generate for building instance)

    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning`,
      { /* ... */ }
    );

    if (!response.ok) {
      const error = await response.text();
      updateJob(jobId, { status: 'error', error });
      return;
    }

    const data = await response.json();
    const operationName = data.name;

    updateJob(jobId, { result: { operationName } });

    // Start background polling
    pollVeoJob(jobId, operationName);
  } catch (err) {
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

async function processImagenJob(jobId, input) {
  updateJob(jobId, { status: 'processing' });

  try {
    // Call existing /api/generate-image logic internally
    // ... (reuse Imagen generation code)

    updateJob(jobId, { status: 'complete', result: { imagePath, imageUrl } });
  } catch (err) {
    updateJob(jobId, { status: 'error', error: err.message });
  }
}
```

## Location in server.js
- Job helpers: After `loadConfig/saveConfig` (~line 40)
- Endpoints: After static routes, before Veo endpoints (~line 178)
- Poll/process functions: After job helpers
