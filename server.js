const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { computeVoiceSettings, computeMusicProfile, computeAudioProfile } = require('./audio-rules');
const { generateTakePlan, estimateDialogueDuration, getSplitSummary } = require('./dialogue-splitter');
const transcribeRoutes = require('./routes/transcribe');
const analyzeDialogueRoutes = require('./routes/analyze-dialogue');
const audioTimelineRoutes = require('./routes/audio-timeline');
const editRoutes = require('./routes/edit');
const unifiedAnalysisRoutes = require('./routes/unified-analysis');
const musicRoutes = require('./routes/music');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '200mb' }));  // Large limit for base64 videos
app.use(express.static('public'));

// Config storage (simple file-based for now)
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const PROJECTS_PATH = path.join(__dirname, 'data', 'projects');
const EDITS_PATH = path.join(__dirname, 'data', 'edits');
const ELEVENLABS_VOICES_CACHE_PATH = path.join(__dirname, 'data', 'elevenlabs-voices.json');

// Helper: Get video path for a job, checking for edited variations first
function getVideoPathForJob(jobId, originalPath) {
  try {
    const editManifest = path.join(EDITS_PATH, jobId, 'manifest.json');
    if (fs.existsSync(editManifest)) {
      const manifest = JSON.parse(fs.readFileSync(editManifest, 'utf8'));
      if (manifest.selected && manifest.status === 'approved') {
        const variation = manifest.variations.find(v => v.id === manifest.selected);
        if (variation) {
          const editedPath = path.join(EDITS_PATH, jobId, variation.filename);
          if (fs.existsSync(editedPath)) {
            console.log(`Using edited variation ${variation.id} for job ${jobId}`);
            return editedPath;
          }
        }
      }
    }
  } catch (err) {
    // Fall through to original
  }
  return originalPath;
}

// Ensure data directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(PROJECTS_PATH)) {
  fs.mkdirSync(PROJECTS_PATH);
}

// Load/save config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  return {};
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ============ Job Queue ============

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

/**
 * Wait for a job to complete by polling its status
 * @param {string} jobId - Job ID to wait for
 * @param {number} pollInterval - Milliseconds between polls (default 2000)
 * @param {number} timeout - Max milliseconds to wait (default 300000 = 5 min)
 * @returns {Promise<Object>} Completed job object with result
 */
async function waitForJobComplete(jobId, pollInterval = 2000, timeout = 300000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    if (job.status === 'complete') {
      return job;
    }
    
    if (job.status === 'error') {
      throw new Error(`Job ${jobId} failed: ${job.error}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Job ${jobId} timed out after ${timeout}ms`);
}

/**
 * Extract the last frame from a video file
 * @param {string} videoPath - Path to video file (relative to data/)
 * @returns {Promise<string>} Path to extracted frame image
 */
async function extractLastFrame(videoPath) {
  const videoFullPath = path.join(__dirname, 'data', videoPath.replace(/^\//, ''));
  
  if (!fs.existsSync(videoFullPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }
  
  const duration = getVideoDuration(videoFullPath);
  const timestamp = Math.max(0, duration - 0.1);
  
  const imagesDir = path.join(__dirname, 'generated-images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `frame_last_${Date.now()}_${randomId}.png`;
  const filepath = path.join(imagesDir, filename);
  
  const ffmpegCmd = `ffmpeg -y -ss ${timestamp} -i "${videoFullPath}" -vframes 1 "${filepath}"`;
  console.log(`Extracting last frame: ${ffmpegCmd}`);
  execSync(ffmpegCmd, { stdio: 'pipe' });
  
  return filepath;
}

// ============ ElevenLabs Voice Cache ============

function loadVoicesCache() {
  try {
    if (fs.existsSync(ELEVENLABS_VOICES_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(ELEVENLABS_VOICES_CACHE_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading voices cache:', err);
  }
  return null;
}

function saveVoicesCache(voices) {
  const cache = {
    fetchedAt: new Date().toISOString(),
    voices: voices
  };
  fs.writeFileSync(ELEVENLABS_VOICES_CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

// ============ Config Routes ============

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const config = { ...loadConfig(), ...req.body };
  saveConfig(config);
  res.json({ success: true });
});

// ============ Project Routes ============

app.get('/api/project', (req, res) => {
  const config = loadConfig();
  if (config.currentProject) {
    const projectPath = path.join(PROJECTS_PATH, `${config.currentProject}.json`);
    if (fs.existsSync(projectPath)) {
      res.json(JSON.parse(fs.readFileSync(projectPath, 'utf8')));
      return;
    }
  }
  res.json(null);
});

app.post('/api/project', (req, res) => {
  const project = req.body;
  const projectPath = path.join(PROJECTS_PATH, `${project.project_id}.json`);
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
  
  const config = loadConfig();
  config.currentProject = project.project_id;
  saveConfig(config);
  
  res.json({ success: true });
});

app.delete('/api/project', (req, res) => {
  const config = loadConfig();
  config.currentProject = null;
  saveConfig(config);
  res.json({ success: true });
});

// Get all projects (list)
app.get('/api/projects', (req, res) => {
  if (!fs.existsSync(PROJECTS_PATH)) {
    return res.json([]);
  }

  const files = fs.readdirSync(PROJECTS_PATH).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    try {
      const project = JSON.parse(fs.readFileSync(path.join(PROJECTS_PATH, f), 'utf8'));
      return {
        project_id: project.project_id,
        concept: project.concept,
        duration: project.duration,
        shot_count: project.shots?.length || 0
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  res.json(projects);
});

// Get project by ID with resolved video paths
app.get('/api/projects/:id', (req, res) => {
  const projectPath = path.join(PROJECTS_PATH, `${req.params.id}.json`);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  const jobs = loadJobs();

  // Merge job results into shots
  for (const shot of project.shots || []) {
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
  const allComplete = (project.shots || []).every(s => s.job_status === 'complete');
  const anyError = (project.shots || []).some(s => s.job_status === 'error');
  const anyProcessing = (project.shots || []).some(s => s.job_id && !s.job_status);
  project.status = anyError ? 'error' : allComplete ? 'complete' : anyProcessing ? 'processing' : 'pending';

  res.json(project);
});

// ============ ElevenLabs Proxy ============

app.get('/api/elevenlabs/voices', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }

  const count = parseInt(req.query.count) || 5;

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json({ voices: data.voices.slice(0, count) });
  } catch (err) {
    console.error('ElevenLabs voices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cached voices endpoint - returns locally cached voice metadata
app.get('/api/elevenlabs/voices/cached', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const count = parseInt(req.query.count) || 5;
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Check existing cache
  const cache = loadVoicesCache();

  if (cache && !forceRefresh) {
    const cacheAge = Date.now() - new Date(cache.fetchedAt).getTime();
    if (cacheAge < maxAgeMs) {
      return res.json({ ...cache, voices: cache.voices.slice(0, count) });
    }
  }

  // Cache is stale/missing/forced - fetch fresh data
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No ElevenLabs API key configured' });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      // On error, return stale cache if available
      if (cache) {
        console.warn('ElevenLabs API error, returning stale cache');
        return res.json({ ...cache, voices: cache.voices.slice(0, count), stale: true });
      }
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const newCache = saveVoicesCache(data.voices);
    res.json({ ...newCache, voices: newCache.voices.slice(0, count) });
  } catch (err) {
    // On network error, return stale cache if available
    if (cache) {
      console.warn('Network error, returning stale cache:', err.message);
      return res.json({ ...cache, voices: cache.voices.slice(0, count), stale: true });
    }
    console.error('ElevenLabs voices cache error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/elevenlabs/tts', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }

  const {
    voice_id,
    text,
    model_id = 'eleven_turbo_v2_5',
    filename: customFilename,
    // New: mood-aware voice modulation
    mood,
    tension,
    energy,
    voice_settings: customVoiceSettings
  } = req.body;

  if (!voice_id || !text) {
    return res.status(400).json({ error: 'voice_id and text are required' });
  }

  // Compute voice settings: custom > mood-based > defaults
  let voiceSettings = { stability: 0.5, similarity_boost: 0.75 };
  let computedProfile = null;
  let speedFactor = 1.0;

  if (customVoiceSettings) {
    voiceSettings = customVoiceSettings;
  } else if (mood) {
    computedProfile = computeVoiceSettings({ mood, tension, energy });
    voiceSettings = {
      stability: computedProfile.stability,
      similarity_boost: computedProfile.similarity_boost
    };
    speedFactor = computedProfile.speed_factor;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id,
        voice_settings: voiceSettings
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const audioBuffer = await response.arrayBuffer();

    // Ensure tts directory exists
    const audioDir = path.join(__dirname, 'data', 'audio', 'tts');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Save audio file (ensure .mp3 extension)
    let filename = customFilename || `tts_${Date.now()}.mp3`;
    if (customFilename && !customFilename.endsWith('.mp3')) {
      filename = `${customFilename}.mp3`;
    }
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, Buffer.from(audioBuffer));

    // Apply speed adjustment via ffmpeg atempo if needed
    let speedApplied = false;
    if (speedFactor !== 1.0) {
      try {
        const tempPath = filepath.replace('.mp3', '_temp.mp3');
        // ffmpeg atempo range is 0.5-2.0
        const clampedSpeed = Math.max(0.5, Math.min(2.0, speedFactor));
        execSync(`ffmpeg -y -i "${filepath}" -filter:a "atempo=${clampedSpeed}" "${tempPath}"`, { stdio: 'pipe' });
        fs.unlinkSync(filepath);
        fs.renameSync(tempPath, filepath);
        speedApplied = true;
      } catch (ffmpegErr) {
        console.error('ffmpeg atempo error:', ffmpegErr.message);
        // Continue with original file if ffmpeg fails
      }
    }

    res.json({
      success: true,
      filename,
      path: `/audio/tts/${filename}`,
      voice_settings_used: voiceSettings,
      speed_factor: speedApplied ? speedFactor : 1.0,
      mood_profile: computedProfile
    });
  } catch (err) {
    console.error('ElevenLabs TTS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test audio profile - generates TTS with mood-based voice modulation
app.post('/api/test-audio-profile', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No ElevenLabs API key configured' });
  }

  const {
    text = 'The moment stretches, suspended between what was and what will be.',
    mood = 'contemplative',
    tension = 0.5,
    energy = 0.5,
    voice_id
  } = req.body;

  if (!voice_id) {
    return res.status(400).json({ error: 'voice_id is required' });
  }

  // Compute profiles
  const voiceProfile = computeVoiceSettings({ mood, tension, energy });
  const musicProfile = computeMusicProfile({ mood, tension, energy });

  // Generate TTS with computed settings
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: voiceProfile.stability,
          similarity_boost: voiceProfile.similarity_boost
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const audioBuffer = await response.arrayBuffer();

    // Save audio file
    const audioDir = path.join(__dirname, 'data', 'audio', 'tts');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const filename = `test_${mood}_t${tension}_e${energy}_${Date.now()}.mp3`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, Buffer.from(audioBuffer));

    // Apply speed adjustment if needed
    let speedApplied = false;
    if (voiceProfile.speed_factor !== 1.0) {
      try {
        const tempPath = filepath.replace('.mp3', '_temp.mp3');
        const clampedSpeed = Math.max(0.5, Math.min(2.0, voiceProfile.speed_factor));
        execSync(`ffmpeg -y -i "${filepath}" -filter:a "atempo=${clampedSpeed}" "${tempPath}"`, { stdio: 'pipe' });
        fs.unlinkSync(filepath);
        fs.renameSync(tempPath, filepath);
        speedApplied = true;
      } catch (ffmpegErr) {
        console.error('ffmpeg atempo error:', ffmpegErr.message);
      }
    }

    res.json({
      success: true,
      audio_path: `/audio/tts/${filename}`,
      input: { text, mood, tension, energy },
      voice_profile: voiceProfile,
      music_profile: musicProfile,
      speed_applied: speedApplied
    });
  } catch (err) {
    console.error('Test audio profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Compute audio profiles without generating audio
app.post('/api/compute-audio-profile', (req, res) => {
  const { shots } = req.body;

  if (!shots || !Array.isArray(shots)) {
    return res.status(400).json({ error: 'shots array is required' });
  }

  const profiles = shots.map(shot => ({
    shot_id: shot.shot_id || shot.id,
    voice: computeVoiceSettings(shot),
    music: computeMusicProfile(shot)
  }));

  res.json({ profiles });
});

// Serve audio files
app.use('/audio', express.static(path.join(__dirname, 'data', 'audio')));

// Serve video files
app.use('/video', express.static(path.join(__dirname, 'data', 'video')));

// Serve generated images
app.use('/generated-images', express.static(path.join(__dirname, 'generated-images')));

// ============ Job Queue Routes ============

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
  jobs.unshift(job);
  saveJobs(jobs);

  // Start processing based on type
  if (type === 'veo-generate') {
    processVeoJob(job.id, input);
  } else if (type === 'imagen-generate') {
    processImagenJob(job.id, input);
  }

  res.json({ jobId: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.get('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  const limit = parseInt(req.query.limit) || 50;
  res.json(jobs.slice(0, limit));
});

// ============ Veo (Vertex AI) Proxy ============

// Helper to get OAuth2 access token from service account
async function getVeoAccessToken(config) {
  if (!config.veoServiceAccountPath) {
    throw new Error('No service account path configured');
  }
  
  const serviceAccount = JSON.parse(fs.readFileSync(config.veoServiceAccountPath, 'utf8'));
  
  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const jwt = require('jsonwebtoken');
  
  const token = jwt.sign(
    {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform'
    },
    serviceAccount.private_key,
    { algorithm: 'RS256' }
  );
  
  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  
  const data = await response.json();
  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

// Background polling for Veo jobs
async function pollVeoJob(jobId, operationName) {
  const POLL_INTERVAL = 10000; // 10 seconds

  const poll = async () => {
    try {
      const config = loadConfig();
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
        console.error(`Veo job ${jobId} poll error:`, error);
        updateJob(jobId, { status: 'error', error: `Poll failed: ${error}` });
        return;
      }

      const data = await response.json();
      console.log(`Veo job ${jobId} poll:`, data.done ? 'DONE' : 'pending');

      if (data.done) {
        if (data.error) {
          updateJob(jobId, { status: 'error', error: data.error.message });
        } else {
          const video = data.response?.videos?.[0];
          const base64Data = video?.bytesBase64Encoded;
          const videoUri = video?.uri;

          if (base64Data) {
            // Save base64 video data directly
            try {
              console.log(`Veo job ${jobId} generation complete, received base64 video data`);

              const buffer = Buffer.from(base64Data, 'base64');
              const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
              console.log(`Veo job ${jobId} decoded base64 data: ${fileSizeMB} MB`);

              // Save to video directory
              const videoDir = path.join(__dirname, 'data', 'video');
              if (!fs.existsSync(videoDir)) {
                console.log(`Veo job ${jobId} creating video directory:`, videoDir);
                fs.mkdirSync(videoDir, { recursive: true });
              }

              const filename = `veo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`;
              const filepath = path.join(videoDir, filename);

              console.log(`Veo job ${jobId} writing video to:`, filepath);
              fs.writeFileSync(filepath, buffer);
              console.log(`Veo job ${jobId} file written successfully`);

              // Get duration using ffprobe
              console.log(`Veo job ${jobId} detecting video duration with ffprobe...`);
              const duration = getVideoDuration(filepath);

              if (duration) {
                console.log(`Veo job ${jobId} video duration: ${duration}s`);
              } else {
                console.warn(`Veo job ${jobId} could not detect video duration`);
              }

              console.log(`Veo job ${jobId} complete: ${filename} (${fileSizeMB} MB, ${duration || 'unknown'}s)`);

              updateJob(jobId, {
                status: 'complete',
                result: { operationName, filename, path: `/video/${filename}`, duration }
              });
            } catch (saveErr) {
              console.error(`Veo job ${jobId} save error:`, saveErr.message);
              console.error(`Veo job ${jobId} save stack:`, saveErr.stack);
              updateJob(jobId, { status: 'error', error: `Save error: ${saveErr.message}` });
            }
          } else if (videoUri) {
            // Download and save the video file from URI
            try {
              console.log(`Veo job ${jobId} generation complete, video URI:`, videoUri);

              let downloadUrl = videoUri;
              if (videoUri.startsWith('gs://')) {
                const gcsPath = videoUri.replace('gs://', '');
                downloadUrl = `https://storage.googleapis.com/${gcsPath}`;
                console.log(`Veo job ${jobId} converted GCS URI to HTTPS:`, downloadUrl);
              }

              console.log(`Veo job ${jobId} starting download...`);
              const downloadStartTime = Date.now();

              const videoResponse = await fetch(downloadUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });

              console.log(`Veo job ${jobId} download response: status=${videoResponse.status}, content-type=${videoResponse.headers.get('content-type')}, content-length=${videoResponse.headers.get('content-length')}`);

              if (!videoResponse.ok) {
                const error = await videoResponse.text();
                console.error(`Veo job ${jobId} download failed with status ${videoResponse.status}:`, error);
                updateJob(jobId, { status: 'error', error: `Download failed (${videoResponse.status}): ${error}` });
                return;
              }

              const videoBuffer = await videoResponse.arrayBuffer();
              const downloadDuration = ((Date.now() - downloadStartTime) / 1000).toFixed(2);
              const fileSizeMB = (videoBuffer.byteLength / (1024 * 1024)).toFixed(2);
              console.log(`Veo job ${jobId} download complete: ${fileSizeMB} MB in ${downloadDuration}s`);

              // Save to video directory
              const videoDir = path.join(__dirname, 'data', 'video');
              if (!fs.existsSync(videoDir)) {
                console.log(`Veo job ${jobId} creating video directory:`, videoDir);
                fs.mkdirSync(videoDir, { recursive: true });
              }

              const filename = `veo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`;
              const filepath = path.join(videoDir, filename);

              console.log(`Veo job ${jobId} writing video to:`, filepath);
              fs.writeFileSync(filepath, Buffer.from(videoBuffer));
              console.log(`Veo job ${jobId} file written successfully`);

              // Get duration using ffprobe
              console.log(`Veo job ${jobId} detecting video duration with ffprobe...`);
              const duration = getVideoDuration(filepath);

              if (duration) {
                console.log(`Veo job ${jobId} video duration: ${duration}s`);
              } else {
                console.warn(`Veo job ${jobId} could not detect video duration`);
              }

              console.log(`Veo job ${jobId} complete: ${filename} (${fileSizeMB} MB, ${duration || 'unknown'}s)`);

              updateJob(jobId, {
                status: 'complete',
                result: { operationName, filename, path: `/video/${filename}`, duration }
              });
            } catch (downloadErr) {
              console.error(`Veo job ${jobId} download error:`, downloadErr.message);
              console.error(`Veo job ${jobId} download stack:`, downloadErr.stack);
              updateJob(jobId, { status: 'error', error: `Download error: ${downloadErr.message}` });
            }
          } else {
            console.error(`Veo job ${jobId} completed but no video data in response:`, JSON.stringify(data.response, null, 2));
            updateJob(jobId, {
              status: 'error',
              error: 'No video data in response'
            });
          }
        }
      } else {
        setTimeout(poll, POLL_INTERVAL);
      }
    } catch (err) {
      console.error(`Veo job ${jobId} poll error:`, err);
      updateJob(jobId, { status: 'error', error: err.message });
    }
  };

  setTimeout(poll, POLL_INTERVAL);
}

// Process Veo generation job
async function processVeoJob(jobId, input) {
  updateJob(jobId, { status: 'processing' });

  try {
    const config = loadConfig();
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { prompt, aspectRatio = '9:16', durationSeconds = 8, referenceImagePath, lastFramePath } = input;

    const dur = parseInt(durationSeconds) || 8;
    const validDuration = dur <= 5 ? 4 : dur <= 7 ? 6 : 8;

    let firstFrameBase64 = null;
    if (referenceImagePath) {
      const imagePath = path.isAbsolute(referenceImagePath) ? referenceImagePath : path.join(__dirname, referenceImagePath);
      if (fs.existsSync(imagePath)) {
        firstFrameBase64 = fs.readFileSync(imagePath).toString('base64');
      }
    }

    let lastFrameBase64 = null;
    if (lastFramePath) {
      const imagePath = path.isAbsolute(lastFramePath) ? lastFramePath : path.join(__dirname, lastFramePath);
      if (fs.existsSync(imagePath)) {
        lastFrameBase64 = fs.readFileSync(imagePath).toString('base64');
      }
    }

    const instance = { prompt };
    if (firstFrameBase64) {
      instance.image = { bytesBase64Encoded: firstFrameBase64, mimeType: 'image/png' };
    }
    if (lastFrameBase64) {
      instance.lastFrame = { bytesBase64Encoded: lastFrameBase64, mimeType: 'image/png' };
    }

    const requestBody = {
      instances: [instance],
      parameters: { aspectRatio, durationSeconds: validDuration }
    };

    console.log(`Veo job ${jobId} starting generation...`);

    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      updateJob(jobId, { status: 'error', error });
      return;
    }

    const data = await response.json();
    const operationName = data.name;
    console.log(`Veo job ${jobId} operation started:`, operationName);

    updateJob(jobId, { result: { operationName } });
    pollVeoJob(jobId, operationName);
  } catch (err) {
    console.error(`Veo job ${jobId} error:`, err);
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// Process Imagen generation job
async function processImagenJob(jobId, input) {
  updateJob(jobId, { status: 'processing' });

  try {
    const config = loadConfig();
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { prompt, aspectRatio = '9:16' } = input;

    const requestBody = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio }
    };

    console.log(`Imagen job ${jobId} starting generation...`);

    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      updateJob(jobId, { status: 'error', error });
      return;
    }

    const data = await response.json();
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;

    if (!base64) {
      updateJob(jobId, { status: 'error', error: 'No image data in response' });
      return;
    }

    const imagesDir = path.join(__dirname, 'generated-images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `frame_${timestamp}_${randomId}.png`;
    const filepath = path.join(imagesDir, filename);

    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    console.log(`Imagen job ${jobId} saved:`, filepath);

    updateJob(jobId, {
      status: 'complete',
      result: { imagePath: filepath, imageUrl: `/generated-images/${filename}` }
    });
  } catch (err) {
    console.error(`Imagen job ${jobId} error:`, err);
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

app.post('/api/veo/generate', async (req, res) => {
  const config = loadConfig();

  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { prompt, aspectRatio = '9:16', durationSeconds = 8, referenceImageBase64, lastFrameBase64, referenceImagePath, lastFramePath } = req.body;

    // Veo 3.1 only supports 4, 6, or 8 seconds - snap to nearest valid value
    const dur = parseInt(durationSeconds) || 8;
    const validDuration = dur <= 5 ? 4 : dur <= 7 ? 6 : 8;

    // Resolve first frame: prefer base64, fallback to reading from path
    let firstFrameBase64 = referenceImageBase64;
    if (!firstFrameBase64 && referenceImagePath) {
      const imagePath = path.isAbsolute(referenceImagePath) ? referenceImagePath : path.join(__dirname, referenceImagePath);
      if (fs.existsSync(imagePath)) {
        firstFrameBase64 = fs.readFileSync(imagePath).toString('base64');
        console.log('Read first frame from:', imagePath);
      }
    }

    // Resolve last frame: prefer base64, fallback to reading from path
    let finalLastFrameBase64 = lastFrameBase64;
    if (!finalLastFrameBase64 && lastFramePath) {
      const imagePath = path.isAbsolute(lastFramePath) ? lastFramePath : path.join(__dirname, lastFramePath);
      if (fs.existsSync(imagePath)) {
        finalLastFrameBase64 = fs.readFileSync(imagePath).toString('base64');
        console.log('Read last frame from:', imagePath);
      }
    }

    const instance = {
      prompt: prompt
    };

    // Add reference image if provided (first frame for image-to-video)
    if (firstFrameBase64) {
      instance.image = {
        bytesBase64Encoded: firstFrameBase64,
        mimeType: 'image/png'
      };
    }

    // Add last frame if provided (for bookending generated video)
    if (finalLastFrameBase64) {
      instance.lastFrame = {
        bytesBase64Encoded: finalLastFrameBase64,
        mimeType: 'image/png'
      };
    }

    // Log which frames are being used
    if (firstFrameBase64 && finalLastFrameBase64) {
      console.log('Using first + last frame for generation');
    } else if (firstFrameBase64) {
      console.log('Using first frame for generation');
    } else if (finalLastFrameBase64) {
      console.log('Using last frame for generation');
    }
    
    const requestBody = {
      instances: [instance],
      parameters: {
        aspectRatio: aspectRatio,
        durationSeconds: validDuration
      }
    };
    
    console.log('Veo request:', JSON.stringify({ ...requestBody, instances: [{ ...instance, image: instance.image ? '[BASE64_IMAGE]' : undefined, lastFrame: instance.lastFrame ? '[BASE64_IMAGE]' : undefined }] }, null, 2));
    console.log('Project ID:', projectId);

    // Use Vertex AI endpoint
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Veo generate error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    console.log('Veo generation started:', data.name);
    res.json(data);
  } catch (err) {
    console.error('Veo generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/veo/status', async (req, res) => {
  const config = loadConfig();
  
  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { operationName } = req.body;
    
    console.log('Checking status for:', operationName);

    // Vertex AI uses fetchPredictOperation as a POST with operationName in body
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:fetchPredictOperation`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          operationName: operationName
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Status check error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    console.log('Status response:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) {
    console.error('Veo status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to get video duration using ffprobe
function getVideoDuration(filepath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(result.trim());
  } catch (err) {
    console.error('ffprobe error:', err.message);
    return null;
  }
}

app.post('/api/veo/save-base64', async (req, res) => {
  const { base64Data, filename } = req.body;

  try {
    // Save base64 video to file
    const videoDir = path.join(__dirname, 'data', 'video');
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    
    const finalFilename = filename || `veo_${Date.now()}.mp4`;
    const filepath = path.join(videoDir, finalFilename);
    
    // Decode base64 and write
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    // Get duration
    const duration = getVideoDuration(filepath);
    
    console.log('Saved video:', filepath, 'Size:', buffer.length, 'Duration:', duration);
    
    res.json({ 
      success: true, 
      filename: finalFilename,
      path: `/video/${finalFilename}`,
      duration: duration
    });
  } catch (err) {
    console.error('Veo save error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/veo/download', async (req, res) => {
  const config = loadConfig();
  const { videoUri, filename } = req.body;

  try {
    const { accessToken } = await getVeoAccessToken(config);
    
    // For GCS URIs, we need to convert to a download URL
    let downloadUrl = videoUri;
    
    // If it's a gs:// URI, convert to API URL
    if (videoUri.startsWith('gs://')) {
      const gcsPath = videoUri.replace('gs://', '');
      downloadUrl = `https://storage.googleapis.com/${gcsPath}`;
    }
    
    console.log('Downloading from:', downloadUrl);

    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Download error:', error);
      return res.status(response.status).json({ error });
    }

    const videoBuffer = await response.arrayBuffer();
    
    // Save to video directory
    const videoDir = path.join(__dirname, 'data', 'video');
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    
    const finalFilename = filename || `veo_${Date.now()}.mp4`;
    const filepath = path.join(videoDir, finalFilename);
    fs.writeFileSync(filepath, Buffer.from(videoBuffer));
    
    // Get duration
    const duration = getVideoDuration(filepath);
    
    res.json({ 
      success: true, 
      filename: finalFilename,
      path: `/video/${finalFilename}`,
      duration: duration
    });
  } catch (err) {
    console.error('Veo download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Claude API Proxy ============

app.post('/api/claude', async (req, res) => {
  const config = loadConfig();
  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.claudeKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-frame-prompts', async (req, res) => {
  const config = loadConfig();
  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  const { veoPrompt, shotContext } = req.body;
  if (!veoPrompt) {
    return res.status(400).json({ error: 'veoPrompt is required' });
  }

  const systemPrompt = `You are a cinematographer breaking down a video shot into its opening and closing frames for an AI image generator.

Given a video prompt describing action/motion, produce two image prompts:
1. FIRST FRAME: The scene at the moment before the main action begins. Establish setting, lighting, composition, and any subjects in their starting positions.
2. LAST FRAME: The scene at the moment after the main action completes. Show the end state, results of the action, final positions.

GUIDELINES:
- Remove all motion verbs (walking, moving, flying, etc.) - describe frozen moments
- Preserve: camera angle, lighting style, color palette, visual aesthetic
- Add compositional details appropriate for stills (depth of field, framing, negative space)
- Be specific about subject positions, poses, expressions
- Keep the same level of detail/style as the original prompt
- If the original prompt implies a transformation, first frame = before state, last frame = after state

OUTPUT FORMAT:
Return JSON only, no markdown:
{
  "firstFrame": "detailed image prompt for opening frame",
  "lastFrame": "detailed image prompt for closing frame",
  "notes": "brief explanation of the implied action/transformation between frames"
}`;

  const userMessage = `Video prompt: "${veoPrompt}"

${shotContext ? `Additional context: ${shotContext}` : ''}

Generate the first and last frame image prompts.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.claudeKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Frame prompts generation error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No response content from Claude' });
    }

    try {
      const cleaned = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (parseErr) {
      console.error('Failed to parse frame prompts response:', content);
      res.status(500).json({ error: 'Failed to parse response as JSON', raw: content });
    }
  } catch (err) {
    console.error('Frame prompts generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/breakdown-shot', async (req, res) => {
  const config = loadConfig();
  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  const { description, duration, firstFramePrompt, lastFramePrompt, context } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (!duration) {
    return res.status(400).json({ error: 'duration is required' });
  }

  const systemPrompt = `You are a cinematographer breaking down a shot into individual takes for AI video generation.

CONSTRAINTS:
- Regular generation durations: ONLY 4, 6, or 8 seconds (no other values)
- Extend: exactly 7 seconds (continues seamlessly from previous take)
- Total duration should approximately match target, but individual takes must use valid durations

TRANSITION TYPES:
- "first_frame": Use a generated still image as the starting point. More creative control over composition.
- "last_frame": Use a generated still image as the ending point. More creative control over composition.
- "extend": Continue directly from the previous take's video. Seamless motion, less compositional control.
- null: No transition (first take's transitionIn when no firstFramePrompt, last take's transitionOut when no lastFramePrompt)

For each take, provide:
1. Duration (4, 6, or 8 for regular; 7 for extend-based takes after the first)
2. A detailed Veo prompt describing the action, camera, lighting, style
3. transitionIn: How this take connects FROM the previous take
4. transitionOut: How this take connects TO the next take
5. transitionFrameHint: If using first_frame or last_frame transitions, describe what that frame should show

GUIDELINES:
- First take's transitionIn: "first_frame" if firstFramePrompt provided, else null
- Last take's transitionOut: "last_frame" if lastFramePrompt provided, else null
- Use "extend" for continuous motion within a shot (camera moves, subject actions continuing)
- Use "first_frame"/"last_frame" for beat changes, composition shifts, or when you need precise framing
- Each Veo prompt should be detailed and self-contained but maintain style/subject consistency
- Total durations should approximately match target duration

OUTPUT FORMAT:
Return JSON only, no markdown:
{
  "takes": [
    {
      "duration": 8,
      "veoPrompt": "detailed prompt...",
      "transitionIn": null,
      "transitionOut": "extend",
      "transitionFrameHint": null
    },
    {
      "duration": 7,
      "veoPrompt": "detailed prompt continuing the action...",
      "transitionIn": "extend",
      "transitionOut": "last_frame",
      "transitionFrameHint": "Description of the final frame composition"
    }
  ],
  "notes": "Brief explanation of breakdown choices"
}`;

  const userMessage = `Shot description: "${description}"
Target duration: ${duration} seconds
${firstFramePrompt ? `First frame prompt: ${firstFramePrompt}` : 'No first frame prompt provided'}
${lastFramePrompt ? `Last frame prompt: ${lastFramePrompt}` : 'No last frame prompt provided'}
${context ? `Context: ${context}` : ''}

Break this shot into takes.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.claudeKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Shot breakdown error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No response content from Claude' });
    }

    try {
      const cleaned = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      res.json(parsed);
    } catch (parseErr) {
      console.error('Failed to parse shot breakdown response:', content);
      res.status(500).json({ error: 'Failed to parse response as JSON', raw: content });
    }
  } catch (err) {
    console.error('Shot breakdown error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to analyze an image with Gemini Flash
async function analyzeImageWithGemini(imagePath, accessToken, projectId) {
  const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(__dirname, imagePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(fullPath);
  const imageBase64 = imageBuffer.toString('base64');
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType,
            data: imageBase64
          }
        },
        {
          text: 'Describe this image briefly (2-3 sentences). Focus on: subjects, composition, lighting, colors, mood. Be factual and specific.'
        }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192  // Gemini 2.5 Flash uses thinking tokens that count against this limit
    }
  };

  const response = await fetch(
    `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini image analysis failed: ${error}`);
  }

  const data = await response.json();
  console.log('Gemini image analysis response:', JSON.stringify(data, null, 2));

  // Concatenate all text parts (Gemini may return multiple parts)
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('');
  return text;
}

// Build explicit voice description from character info for Veo dialogue
function buildVoiceDescription(speaker, characterDesc, mood) {
  const genderHints = {
    'man': 'male', 'woman': 'female', 'boy': 'male young',
    'girl': 'female young', 'male': 'male', 'female': 'female'
  };

  let gender = '';
  const descLower = (characterDesc || '').toLowerCase();
  for (const [hint, g] of Object.entries(genderHints)) {
    if (descLower.includes(hint)) {
      gender = g;
      break;
    }
  }

  // Extract age if present (e.g., "40s", "30 year old")
  const ageMatch = characterDesc?.match(/(\d+)s?[\s-]*(year|old)?/i);
  const age = ageMatch ? `${ageMatch[1]}s` : '';

  // Map mood to voice quality
  const voiceQualities = {
    'tense': 'controlled, tight',
    'mysterious': 'measured, low',
    'ominous': 'deep, foreboding',
    'vulnerable': 'soft, wavering',
    'cheerful': 'warm, bright',
    'angry': 'sharp, forceful',
    'peaceful': 'calm, gentle',
    'melancholic': 'subdued, reflective',
    'hopeful': 'warm, optimistic',
    'urgent': 'quick, intense'
  };
  const quality = voiceQualities[mood] || 'natural';

  return [gender, age, quality].filter(Boolean).join(', ') || 'natural voice';
}

// Reusable function to generate Veo prompts from descriptions
async function generateVeoPromptInternal(description, durationSeconds, style, claudeKey, options = {}) {
  const {
    aspectRatio,
    firstFrameDescription,
    lastFrameDescription,
    previousTakeDescription,
    additionalContext,
    mood,
    productionRules,
    dialogue
  } = options;

  // Build production constraint prefix if rules are specified
  let productionConstraintGuidance = '';
  if (productionRules) {
    const constraintText = buildProductionConstraintText(productionRules);
    if (constraintText) {
      productionConstraintGuidance = `
PRODUCTION CONSTRAINTS (MUST RESPECT):
${constraintText}
These constraints are LOCKED and must be reflected in EVERY shot.`;
    }
  }

  // Build mood guidance if mood is specified
  let moodGuidance = '';
  if (mood && MOOD_VISUALS[mood]) {
    moodGuidance = `
MOOD ATMOSPHERE:
The emotional tone is "${mood}". Incorporate these visual qualities: ${MOOD_VISUALS[mood]}
Ensure lighting, color palette, and composition support this mood.`;
  }

  // Build dialogue guidance for Veo native speech generation
  let dialogueGuidance = '';
  if (dialogue && dialogue.length > 0) {
    const lines = dialogue.map(d => {
      const voiceDesc = buildVoiceDescription(d.speaker, d.voiceDescription, d.mood);
      return `- ${d.speaker.toUpperCase()} (${voiceDesc}): "${d.text}"`;
    }).join('\n');

    dialogueGuidance = `
DIALOGUE REQUIREMENTS:
The following lines MUST be spoken clearly on camera. Structure your prompt in TWO PARTS:

PART 1 - VISUAL SCENE:
- Describe camera, framing, lighting, atmosphere
- Character positioning and minimal blocking
- Do NOT describe speech or dialogue here
- Keep action simple during dialogue delivery

PART 2 - DIALOGUE (copy this section exactly at the end of your prompt):
---
DIALOGUE:
${lines}

VOICE DIRECTION: Close-mic'd, clear audio, minimal room reverb. Natural speaking pace.
---

CRITICAL: Include the DIALOGUE section exactly as shown above at the END of your prompt.`;
  }

  // Audio guidance - no background music, only diegetic sounds
  const audioGuidance = `
AUDIO REQUIREMENTS:
- NO background music or musical score
- Dialogue/speech: INCLUDE if specified in DIALOGUE section
- Sound effects: INCLUDE only sounds directly caused by on-screen action (footsteps, doors, ambient room tone, etc.)
- Keep audio naturalistic and diegetic (sounds that exist within the scene)
`;

    // Build dialogue structure instruction if dialogue is present
  const dialogueStructureNote = dialogue && dialogue.length > 0 ? `
IMPORTANT - DIALOGUE SHOT STRUCTURE:
This shot contains dialogue. You MUST structure your output as:
1. VISUAL DESCRIPTION (camera, lighting, character position - NO mention of speaking)
2. Then copy the DIALOGUE section exactly as provided in DIALOGUE REQUIREMENTS below

Keep visual action minimal during speech. The character should be relatively still while delivering lines.
` : '';

  const systemPrompt = `You are a cinematographer writing prompts for Veo, an AI video generator.
${dialogueStructureNote}
Given the action description and context, write a detailed video generation prompt that:
- Describes the motion/action clearly
- Specifies camera movement and angle
- Includes lighting and visual style that supports the mood
- If a starting frame is described, ensure the video begins from that visual state
- If an ending frame is described, guide the action toward that visual state
- Maintains consistency with any previous take context

CRITICAL - CHARACTER CONSISTENCY:
If a CHARACTER description is provided in CONTEXT, you MUST:
1. Start your prompt with the COMPLETE character description in the first sentence
2. Include ALL details verbatim: physical features, specific clothing colors/items, expression
3. Do NOT paraphrase or omit any character details - copy them exactly
4. Example: If context says "East Asian woman, 30s, shoulder-length black hair, white blouse, navy pants" your prompt MUST begin with those exact details
${moodGuidance}${productionConstraintGuidance}${dialogueGuidance}${audioGuidance}
Output only the prompt text, no JSON or explanation.`;

  let userMessage = `ACTION: ${description}`;
  if (durationSeconds) userMessage += `\nDURATION: ${durationSeconds} seconds`;
  if (aspectRatio) userMessage += `\nASPECT RATIO: ${aspectRatio}`;
  if (style) userMessage += `\nSTYLE: ${style}`;
  if (firstFrameDescription) userMessage += `\nSTARTING FRAME: ${firstFrameDescription}`;
  if (lastFrameDescription) userMessage += `\nENDING FRAME: ${lastFrameDescription}`;
  if (previousTakeDescription) userMessage += `\nPREVIOUS TAKE: ${previousTakeDescription}`;
  if (additionalContext) userMessage += `\nCONTEXT: ${additionalContext}`;
  userMessage += '\n\nWrite a Veo prompt for this take.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const veoPrompt = data.content?.[0]?.text;

  if (!veoPrompt) {
    throw new Error('No response from Claude');
  }

  return veoPrompt;
}

app.post('/api/generate-veo-prompt', async (req, res) => {
  const config = loadConfig();

  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  const {
    description,
    durationSeconds,
    aspectRatio,
    style,
    firstFrameDescription,
    lastFrameDescription,
    firstFrameImagePath,
    lastFrameImagePath,
    previousTakeDescription,
    additionalContext
  } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  try {
    let firstFrameAnalysis = null;
    let lastFrameAnalysis = null;
    let firstFrameDesc = firstFrameDescription;
    let lastFrameDesc = lastFrameDescription;

    // Analyze images with Gemini if paths provided but no descriptions
    if (firstFrameImagePath && !firstFrameDescription) {
      console.log('Analyzing first frame image:', firstFrameImagePath);
      const { accessToken, projectId } = await getVeoAccessToken(config);
      firstFrameAnalysis = await analyzeImageWithGemini(firstFrameImagePath, accessToken, projectId);
      firstFrameDesc = firstFrameAnalysis;
      console.log('First frame analysis:', firstFrameAnalysis);
    }

    if (lastFrameImagePath && !lastFrameDescription) {
      console.log('Analyzing last frame image:', lastFrameImagePath);
      const { accessToken, projectId } = await getVeoAccessToken(config);
      lastFrameAnalysis = await analyzeImageWithGemini(lastFrameImagePath, accessToken, projectId);
      lastFrameDesc = lastFrameAnalysis;
      console.log('Last frame analysis:', lastFrameAnalysis);
    }

    // Build Claude prompt
    const systemPrompt = `You are a cinematographer writing prompts for Veo, an AI video generator.

Given the action description and optional frame context, write a detailed video generation prompt that:
- Describes the motion/action clearly
- Specifies camera movement and angle
- Includes lighting and visual style
- If a starting frame is described, ensure the video begins from that visual state
- If an ending frame is described, guide the action toward that visual state
- Maintains consistency with any previous take context

Output only the prompt text, no JSON or explanation.`;

    let userMessage = `ACTION: ${description}`;
    if (durationSeconds) userMessage += `\nDURATION: ${durationSeconds} seconds`;
    if (aspectRatio) userMessage += `\nASPECT RATIO: ${aspectRatio}`;
    if (style) userMessage += `\nSTYLE: ${style}`;
    if (firstFrameDesc) userMessage += `\nSTARTING FRAME: ${firstFrameDesc}`;
    if (lastFrameDesc) userMessage += `\nENDING FRAME: ${lastFrameDesc}`;
    if (previousTakeDescription) userMessage += `\nPREVIOUS TAKE: ${previousTakeDescription}`;
    if (additionalContext) userMessage += `\nCONTEXT: ${additionalContext}`;
    userMessage += '\n\nWrite a Veo prompt for this take.';

    console.log('Generating Veo prompt with Claude...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.claudeKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const veoPrompt = data.content?.[0]?.text;

    if (!veoPrompt) {
      return res.status(500).json({ error: 'No response from Claude' });
    }

    console.log('Generated Veo prompt:', veoPrompt.substring(0, 100) + '...');

    const result = { veoPrompt };
    if (firstFrameAnalysis) result.firstFrameAnalysis = firstFrameAnalysis;
    if (lastFrameAnalysis) result.lastFrameAnalysis = lastFrameAnalysis;

    res.json(result);
  } catch (err) {
    console.error('Generate Veo prompt error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Arc type definitions for structure generation
const ARC_TYPES = {
  'linear-build': 'Steady increase in energy from start to finish',
  'tension-release': 'Build tension to a peak, then release',
  'wave': 'Oscillating energy with peaks and valleys',
  'flat-punctuate': 'Consistent baseline energy with sudden spikes',
  'bookend': 'Strong open and close with lower middle'
};

// Mood types for emotional coloring (separate from energy)
const MOOD_TYPES = [
  'hopeful', 'melancholic', 'tense', 'peaceful',
  'unsettling', 'triumphant', 'intimate', 'desolate',
  'mysterious', 'urgent', 'contemplative', 'chaotic',
  'bittersweet', 'whimsical', 'ominous', 'serene'
];

// Mood to visual atmosphere mapping for prompt generation
const MOOD_VISUALS = {
  'hopeful': 'warm golden light, soft focus, uplifting composition, gentle lens flare',
  'melancholic': 'muted desaturated colors, soft shadows, contemplative framing, overcast lighting',
  'tense': 'high contrast, tight claustrophobic framing, uneasy stillness, sharp shadows',
  'peaceful': 'soft diffused light, balanced composition, gentle movement, pastel tones',
  'unsettling': 'slightly off-center framing, unnatural color grading, lingering static shots, wrong angles',
  'triumphant': 'bright expansive lighting, low angle heroic framing, warm golden hour tones, dynamic composition',
  'intimate': 'shallow depth of field, close framing, warm skin tones, soft directional light',
  'desolate': 'cold blue-grey palette, empty negative space, distant framing, harsh flat lighting',
  'mysterious': 'deep shadows, selective lighting, obscured details, cool undertones with warm accents',
  'urgent': 'handheld energy, quick cuts implied, high saturation, dramatic side lighting',
  'contemplative': 'still camera, balanced symmetry, natural muted tones, even soft lighting',
  'chaotic': 'Dutch angles, high contrast, fragmented composition, mixed color temperatures',
  'bittersweet': 'warm tones with cool shadows, nostalgic soft focus, golden hour fading to blue',
  'whimsical': 'vibrant saturated colors, playful asymmetry, bright even lighting, fantastical elements',
  'ominous': 'deep blacks, silhouettes, underexposed backgrounds, cold color cast, looming compositions',
  'serene': 'soft pastel palette, wide calm compositions, diffused natural light, gentle gradients'
};

// Tension to camera/framing mapping
const TENSION_TO_CAMERA = {
  'very_low': 'wide establishing shots, plenty of headroom, relaxed symmetrical framing, static camera',
  'low': 'medium-wide shots, balanced framing, gentle movements, breathing room in composition',
  'medium': 'medium shots, standard framing, subtle push-ins or tracking, neutral headroom',
  'high': 'tighter framing, reduced headroom, slow deliberate push-ins, held moments before cuts',
  'very_high': 'extreme close-ups, claustrophobic framing, minimal headroom, lingering uncomfortable holds'
};

// Energy to camera movement mapping
const ENERGY_TO_MOVEMENT = {
  'very_low': 'locked-off static camera, no movement, tableau framing',
  'low': 'subtle drift, almost imperceptible dolly, gentle floating',
  'medium': 'smooth tracking, standard dolly or steadicam, purposeful movement',
  'high': 'dynamic tracking, energetic camera movement, motivated whip pans',
  'very_high': 'kinetic handheld, rapid movement, visceral unstable energy'
};

// Shot type vocabulary for different narrative functions
const SHOT_TYPES = {
  'establish': ['wide establishing shot', 'aerial view', 'slow reveal', 'environmental portrait'],
  'emphasize': ['medium close-up', 'insert detail shot', 'rack focus to subject', 'isolation framing'],
  'transition': ['match cut setup', 'movement through space', 'time-lapse compression', 'spatial bridge'],
  'punctuate': ['snap zoom', 'dramatic reveal', 'freeze moment', 'impact frame'],
  'reveal': ['slow push-in to reveal', 'pan to discover', 'focus pull revelation', 'perspective shift'],
  'resolve': ['pull back to wide', 'settling static frame', 'symmetrical closure', 'breath moment']
};

// Camera movements vocabulary
const CAMERA_MOVEMENTS = {
  'static': 'locked-off tripod, no movement',
  'dolly_in': 'smooth forward movement toward subject',
  'dolly_out': 'smooth backward movement away from subject',
  'tracking': 'lateral movement following action',
  'push_in': 'slow intentional move toward subject for emphasis',
  'pull_back': 'retreating movement for context or release',
  'orbit': 'circular movement around subject',
  'crane_up': 'vertical rise revealing scope',
  'crane_down': 'vertical descent into scene',
  'handheld': 'organic human movement, slight instability',
  'float': 'dreamy weightless drift'
};

// Helper to get tension category from 0-1 value
function getTensionCategory(tension) {
  if (tension <= 0.2) return 'very_low';
  if (tension <= 0.4) return 'low';
  if (tension <= 0.6) return 'medium';
  if (tension <= 0.8) return 'high';
  return 'very_high';
}

// Helper to get energy category from 0-1 value
function getEnergyCategory(energy) {
  if (energy <= 0.2) return 'very_low';
  if (energy <= 0.4) return 'low';
  if (energy <= 0.6) return 'medium';
  if (energy <= 0.8) return 'high';
  return 'very_high';
}

// Build cinematographic guidance for a shot
function buildCinematographyGuidance(shot) {
  const parts = [];

  if (shot.mood && MOOD_VISUALS[shot.mood]) {
    parts.push(`MOOD (${shot.mood}): ${MOOD_VISUALS[shot.mood]}`);
  }

  if (typeof shot.tension === 'number') {
    const tensionCat = getTensionCategory(shot.tension);
    parts.push(`TENSION (${shot.tension.toFixed(1)}): ${TENSION_TO_CAMERA[tensionCat]}`);
  }

  if (typeof shot.energy === 'number') {
    const energyCat = getEnergyCategory(shot.energy);
    parts.push(`ENERGY (${shot.energy.toFixed(1)}): ${ENERGY_TO_MOVEMENT[energyCat]}`);
  }

  if (shot.role && SHOT_TYPES[shot.role]) {
    parts.push(`SHOT OPTIONS: ${SHOT_TYPES[shot.role].join(', ')}`);
  }

  return parts.join('\n');
}

// Production style presets - common camera/visual/continuity constraint combinations
const PRODUCTION_PRESETS = {
  "stage_play": {
    camera: { perspective: "audience_front_row", movement: "locked", angle_consistency: true, framing: "proscenium" },
    visual: { lighting: "theatrical_spotlight", palette: "high_contrast" },
    continuity: { location: "single", time_flow: "real_time" }
  },
  "documentary": {
    camera: { perspective: "observational", movement: "minimal", framing: "natural" },
    visual: { lighting: "natural", texture: "film_grain" },
    continuity: { time_flow: "compressed" }
  },
  "music_video": {
    camera: { movement: "dynamic", framing: "cinematic" },
    visual: { palette: "saturated", lighting: "stylized" },
    continuity: { time_flow: "fragmented" }
  },
  "noir": {
    camera: { perspective: "character_pov", framing: "intimate" },
    visual: { palette: "monochrome", lighting: "noir", texture: "film_grain" },
    continuity: { time_flow: "elliptical" }
  }
};

// Build human-readable constraint text from production rules
function buildProductionConstraintText(rules) {
  if (!rules) return null;
  const parts = [];

  if (rules.camera) {
    const cam = [];
    if (rules.camera.perspective) cam.push(`${rules.camera.perspective} perspective`);
    if (rules.camera.movement) cam.push(`${rules.camera.movement} camera movement`);
    if (rules.camera.framing) cam.push(`${rules.camera.framing} framing`);
    if (rules.camera.angle_consistency) cam.push('consistent angle across all shots');
    if (cam.length) parts.push(`CAMERA: ${cam.join(', ')}`);
  }

  if (rules.visual) {
    const vis = [];
    if (rules.visual.lighting) vis.push(`${rules.visual.lighting} lighting`);
    if (rules.visual.palette) vis.push(`${rules.visual.palette} color palette`);
    if (rules.visual.texture) vis.push(`${rules.visual.texture} texture`);
    if (vis.length) parts.push(`VISUAL: ${vis.join(', ')}`);
  }

  if (rules.continuity) {
    const cont = [];
    if (rules.continuity.location === 'single') cont.push('single location throughout');
    if (rules.continuity.time_flow) cont.push(`${rules.continuity.time_flow} time flow`);
    if (rules.continuity.weather) cont.push(`${rules.continuity.weather} weather`);
    if (cont.length) parts.push(`CONTINUITY: ${cont.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

// Reusable function to generate shot structure
async function generateStructureInternal(concept, duration, arc, claudeKey, productionRules = null) {
  const arcDescription = ARC_TYPES[arc];

  // Build production rules section if provided
  const productionRulesSection = productionRules ? `
## Production Rules (MUST RESPECT)
These constraints apply to ALL shots in this piece:
${buildProductionConstraintText(productionRules)}

Design shots that work WITHIN these constraints. Do not suggest camera movements, locations, or visual styles that would violate them.
` : '';

  const systemPrompt = `You are a shot structure architect for short-form video. Your job is to divide a video concept into shots with appropriate roles and energy levels.

## Character Extraction
First, identify all characters in the concept:
- Characters are people or anthropomorphized entities with agency in the story
- Do NOT include inanimate objects, locations, or abstract concepts as characters
- If no characters are present, return an empty characters array

For each character, provide:
- id: snake_case identifier (e.g., "woman_1", "elderly_man", "young_boy", "robot_dog")
- description: visual appearance suitable for image generation (age, build, clothing, hair, distinguishing features)

## Environment Extraction
Identify all distinct environments/locations in the concept:
- Environments are physical spaces where action takes place
- Only include environments that will appear in multiple shots or need visual consistency
- If no specific environments are identifiable, return an empty environments array

For each environment, provide:
- id: snake_case identifier (e.g., "coffee_shop", "abandoned_warehouse", "moonlit_forest")
- description: architectural/atmospheric features (interior/exterior, materials, lighting, spatial characteristics)
- primary: boolean - true if this is the main location (only one should be primary)

## Role Vocabulary
- establish: Set the scene, introduce the subject
- emphasize: Highlight or intensify important elements
- transition: Bridge between ideas or moments
- punctuate: Create impact, a dramatic beat
- reveal: Unveil something new
- resolve: Conclude, bring closure

## Energy Scale (0-1) - Pace and Intensity
- 0.0-0.2: Very calm, still, quiet
- 0.2-0.4: Low energy, subtle movement
- 0.4-0.6: Moderate energy, active but controlled
- 0.6-0.8: High energy, dynamic
- 0.8-1.0: Peak intensity, maximum impact

## Tension Scale (0-1) - Anticipation and Suspense (SEPARATE from energy)
- 0.0-0.2: Resolved, no suspense, things have settled
- 0.2-0.4: Mild anticipation, something may happen
- 0.4-0.6: Building suspense, audience expects something
- 0.6-0.8: High tension, something MUST happen soon
- 0.8-1.0: Maximum suspense, the moment before release

Note: Tension and energy are INDEPENDENT. A shot can be:
- High energy + low tension (action scene after climax - exciting but resolved)
- Low energy + high tension (someone frozen in fear - still but suspenseful)
- High energy + high tension (chase leading to confrontation)
- Low energy + low tension (peaceful resolution)

## Mood Vocabulary - Emotional Color (choose one per shot)
hopeful, melancholic, tense, peaceful, unsettling, triumphant, intimate, desolate,
mysterious, urgent, contemplative, chaotic, bittersweet, whimsical, ominous, serene

## Arc Types
- linear-build: Start low, steadily increase energy to finish high
- tension-release: Build energy to a peak around 2/3 through, then drop for resolution
- wave: Oscillate between high and low energy, creating rhythm
- flat-punctuate: Maintain steady baseline with occasional sharp spikes
- bookend: Start and end strong, with lower energy in the middle
${productionRulesSection}
## Output Format
Return a JSON object with:
- concept: the original concept
- duration: total duration in seconds
- arc: the arc type used
- arc_description: human-readable arc description
- characters: array of character objects, each with:
  - id: snake_case identifier
  - description: visual appearance for image generation
- environments: array of environment objects, each with:
  - id: snake_case identifier
  - description: architectural/atmospheric features for image generation
  - primary: boolean (true for main location)
- shots: array of shot objects, each with:
  - shot_id: "shot_1", "shot_2", etc.
  - role: one of the role vocabulary terms
  - energy: 0-1 value for pace/intensity matching the arc shape
  - tension: 0-1 value for anticipation/suspense (independent of energy)
  - mood: one of the mood vocabulary terms for emotional color
  - duration_target: seconds for this shot (all shots should sum to total duration)
  - position: normalized position in the piece (0.0 = start, 1.0 = end)
  - characters: array of character IDs that appear in this shot (empty array if none)
  - environment: environment ID for this shot (null if no specific environment)

Aim for 3-6 shots depending on duration. Shorter pieces (under 15s) should have fewer shots.
Match the energy curve to the specified arc type.
Assign tension values that reflect narrative suspense (often peaks just before a reveal or climax).
Choose moods that support the emotional journey of the piece.
Assign roles that make narrative sense for the concept.

Return ONLY valid JSON, no explanation.`;

  const userMessage = `CONCEPT: ${concept}
DURATION: ${duration} seconds
ARC: ${arc} (${arcDescription})

Generate a shot structure for this piece.`;

  console.log('Generating structure with Claude...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Claude API error:', error);
    throw new Error(error);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('No response from Claude');
  }

  // Parse JSON response (handle potential markdown wrapping)
  const cleaned = content.replace(/```json|```/g, '').trim();
  const structure = JSON.parse(cleaned);

  console.log('Generated structure:', JSON.stringify(structure, null, 2));

  return structure;
}

app.post('/api/generate-structure', async (req, res) => {
  const config = loadConfig();

  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  const { concept, duration, arc = 'tension-release' } = req.body;

  if (!concept) {
    return res.status(400).json({ error: 'concept is required' });
  }

  if (!duration || typeof duration !== 'number' || duration <= 0) {
    return res.status(400).json({ error: 'duration is required and must be a positive number' });
  }

  if (!ARC_TYPES[arc]) {
    return res.status(400).json({
      error: `Invalid arc type. Must be one of: ${Object.keys(ARC_TYPES).join(', ')}`
    });
  }

  try {
    const structure = await generateStructureInternal(concept, duration, arc, config.claudeKey);
    res.json(structure);
  } catch (err) {
    console.error('Generate structure error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-project-from-structure', async (req, res) => {
  const config = loadConfig();

  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  const { concept, duration, arc = 'tension-release', style, include_vo, include_dialogue, production_style, production_rules } = req.body;

  if (!concept) {
    return res.status(400).json({ error: 'concept is required' });
  }

  if (!duration || typeof duration !== 'number' || duration <= 0) {
    return res.status(400).json({ error: 'duration is required and must be a positive number' });
  }

  if (!ARC_TYPES[arc]) {
    return res.status(400).json({
      error: `Invalid arc type. Must be one of: ${Object.keys(ARC_TYPES).join(', ')}`
    });
  }

  // Resolve production rules from preset or custom
  let resolvedProductionRules = production_rules || null;
  if (production_style && PRODUCTION_PRESETS[production_style]) {
    resolvedProductionRules = PRODUCTION_PRESETS[production_style];
  }

  try {
    // Step 1: Generate the structure
    console.log('Generating project structure...');
    const structure = await generateStructureInternal(concept, duration, arc, config.claudeKey, resolvedProductionRules);

    // Step 2: Generate descriptions for each shot
    console.log('Generating shot descriptions...');

    const cinematographyPreamble = `You are a DIRECTOR-CINEMATOGRAPHER for short-form video. You write descriptions that capture both WHAT HAPPENS (action, emotion) and HOW IT'S SHOT (camera, framing, movement).

Each shot comes with cinematographic guidance based on its mood, tension, and energy. USE THIS GUIDANCE to inform your visual choices.

Write descriptions that include:
1. THE ACTION: What characters do, their emotional state, the moment
2. THE SHOT: Camera position, framing (wide/medium/close), composition
3. THE MOVEMENT: Camera motion (static, push-in, tracking, etc.)
4. THE ATMOSPHERE: Lighting quality, color feeling, visual texture

Example description:
"Close-up on her weathered hands as they hesitate above the keyboard. Shallow depth of field isolates the trembling fingers against a soft blur of warm lamplight. The camera holds perfectly still - a breath of tension before action."`;

    let systemPrompt;
    if (include_dialogue) {
      // Multi-character dialogue mode
      systemPrompt = `${cinematographyPreamble}

Additionally, generate character DIALOGUE for conversation scenes:
- Analyze which shots involve character interaction - these get dialogue arrays
- Each dialogue line has: speaker (character_id), text, and optional mood override
- Timing will be auto-calculated at 150 WPM with 0.5s pauses - you don't need to specify it
- Make dialogue naturalistic and match character personalities
- Keep lines SHORT (5-15 words typical, max 25 words)
- Vary who speaks - back-and-forth exchanges feel natural
- "narrator" can be used for non-character VO when needed

For shots WITHOUT meaningful character interaction, you may either:
- Use vo: { text, timing: "start|middle|end" } for narrator-style VO
- Leave both dialogue and vo empty if the shot works without audio

Return a JSON array where each element is:
{
  "description": "...",
  "dialogue": [
    { "speaker": "character_id", "text": "Line of dialogue", "mood": "optional_mood_override" },
    { "speaker": "another_character", "text": "Response" }
  ]
}
or for narrator VO:
{ "description": "...", "vo": { "text": "...", "timing": "start|middle|end" } }
or for silent shots:
{ "description": "...", "dialogue": null, "vo": null }`;
    } else if (include_vo) {
      // Single narrator VO mode (legacy)
      systemPrompt = `${cinematographyPreamble}

Additionally, decide which shots should carry voiceover:
- NOT every shot needs VO - be selective based on narrative flow
- Good VO candidates: establish, reveal, resolve roles (moments of clarity)
- Poor VO candidates: high-energy punctuate shots, rapid action moments
- VO text should be sparse, evocative, and match the tone
- Timing: "start" (with shot), "middle" (mid-shot), or "end" (toward end)

Return a JSON array where each element is:
{ "description": "...", "vo": { "text": "...", "timing": "start|middle|end" } }
or for shots without VO:
{ "description": "...", "vo": null }`;
    } else {
      systemPrompt = `${cinematographyPreamble}

Return a JSON array of description strings, one for each shot in order.`;
    }

    // Build character context if characters exist
    const charactersContext = structure.characters && structure.characters.length > 0
      ? `\nCHARACTERS:\n${structure.characters.map(c => `- ${c.id}: ${c.description}`).join('\n')}\n`
      : '';

    // Build production constraints context if provided
    const productionConstraintText = buildProductionConstraintText(resolvedProductionRules);
    const productionContext = productionConstraintText
      ? `\nPRODUCTION CONSTRAINTS (apply to ALL shots - these are LOCKED):\n${productionConstraintText}\n`
      : '';

    const generateInstruction = include_dialogue
      ? 'a description and dialogue/VO decisions'
      : include_vo
        ? 'a description and VO decision'
        : 'a description';

    const returnFormatInstruction = include_dialogue
      ? 'Return a JSON array of objects with "description" (string), and either "dialogue" (array of {speaker, text, mood?}) for character interaction shots, or "vo" ({text, timing}) for narrator shots, or null for silent shots.'
      : include_vo
        ? 'Return a JSON array of objects, each with "description" (string) and "vo" (object with text/timing, or null).'
        : 'Return a JSON array of description strings, one for each shot in order.';

    let userMessage = `CONCEPT: ${concept}
STYLE: ${style || 'unspecified'}
ARC: ${arc} (${structure.arc_description})
${charactersContext}${productionContext}
Generate ${generateInstruction} for each of these shots:

${structure.shots.map((shot, i) => {
      const cinematographyGuidance = buildCinematographyGuidance(shot);
      return `${i + 1}. ${shot.shot_id}
   - Role: ${shot.role}
   - Energy: ${shot.energy}
   - Tension: ${shot.tension ?? 'unspecified'}
   - Mood: ${shot.mood ?? 'unspecified'}
   - Duration: ${shot.duration_target}s
   - Position: ${shot.position} (0=start, 1=end)
   - Characters: ${shot.characters && shot.characters.length > 0 ? shot.characters.join(', ') : 'none'}

   CINEMATOGRAPHY GUIDANCE:
   ${cinematographyGuidance || 'Use your judgment based on role and energy'}`;
    }).join('\n\n')}

${returnFormatInstruction}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.claudeKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return res.status(500).json({ error: 'No response from Claude for descriptions' });
    }

    // Parse response array
    const cleaned = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Step 3: Merge descriptions (and VO/dialogue if requested) into shots
    const shotsWithDescriptions = structure.shots.map((shot, i) => {
      const item = parsed[i];
      if (include_dialogue) {
        // Dialogue mode: { description, dialogue?, vo? }
        return {
          ...shot,
          description: item?.description || '',
          dialogue: item?.dialogue || null,
          vo: item?.vo || null
        };
      } else if (include_vo) {
        // Narrator VO mode: { description, vo }
        return {
          ...shot,
          description: item?.description || '',
          vo: item?.vo || null
        };
      } else {
        // Legacy format: string description
        return {
          ...shot,
          description: typeof item === 'string' ? item : (item?.description || '')
        };
      }
    });

    // Step 4: Auto-assign voices for dialogue (if include_dialogue)
    let voiceCasting = null;
    if (include_dialogue && structure.characters && structure.characters.length > 0) {
      console.log('Auto-assigning voices for dialogue...');
      try {
        // Get available voices from cache or API
        let availableVoices = [];
        const cache = loadElevenLabsCache();
        if (cache.voices && cache.voices.length > 0) {
          availableVoices = cache.voices;
        } else if (config.elevenLabsKey) {
          // Fetch voices if not cached
          const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': config.elevenLabsKey }
          });
          if (voicesResponse.ok) {
            const voicesData = await voicesResponse.json();
            availableVoices = voicesData.voices || [];
            updateElevenLabsCache({ voices: availableVoices });
          }
        }

        if (availableVoices.length > 0) {
          // Simple heuristic voice assignment based on character descriptions
          voiceCasting = {};
          const maleVoices = availableVoices.filter(v =>
            v.labels?.gender === 'male' || v.name?.toLowerCase().includes('male') ||
            ['adam', 'josh', 'sam', 'marcus', 'daniel', 'james', 'charlie', 'ethan', 'liam', 'george', 'callum', 'patrick', 'arnold', 'brian'].some(n => v.name?.toLowerCase().includes(n))
          );
          const femaleVoices = availableVoices.filter(v =>
            v.labels?.gender === 'female' || v.name?.toLowerCase().includes('female') ||
            ['rachel', 'domi', 'bella', 'elli', 'sarah', 'charlotte', 'alice', 'matilda', 'jessica', 'nicole', 'glinda', 'dorothy', 'emily', 'lily'].some(n => v.name?.toLowerCase().includes(n))
          );
          const neutralVoices = availableVoices.filter(v => !maleVoices.includes(v) && !femaleVoices.includes(v));

          let maleIdx = 0, femaleIdx = 0, neutralIdx = 0;

          for (const char of structure.characters) {
            const descLower = (char.description || '').toLowerCase();
            const isMale = /\b(man|male|boy|he|his|father|brother|uncle|grandfather|husband|son)\b/i.test(descLower);
            const isFemale = /\b(woman|female|girl|she|her|mother|sister|aunt|grandmother|wife|daughter)\b/i.test(descLower);

            let selectedVoice = null;
            if (isMale && maleVoices.length > 0) {
              selectedVoice = maleVoices[maleIdx % maleVoices.length];
              maleIdx++;
            } else if (isFemale && femaleVoices.length > 0) {
              selectedVoice = femaleVoices[femaleIdx % femaleVoices.length];
              femaleIdx++;
            } else if (neutralVoices.length > 0) {
              selectedVoice = neutralVoices[neutralIdx % neutralVoices.length];
              neutralIdx++;
            } else if (availableVoices.length > 0) {
              // Fallback to any voice
              selectedVoice = availableVoices[(maleIdx + femaleIdx + neutralIdx) % availableVoices.length];
            }

            if (selectedVoice) {
              voiceCasting[char.id] = selectedVoice.voice_id;
              console.log(`  ${char.id} → ${selectedVoice.name} (${selectedVoice.voice_id})`);
            }
          }

          // Add narrator voice if any shots have narrator dialogue
          const hasNarrator = shotsWithDescriptions.some(s =>
            s.dialogue?.some(d => d.speaker === 'narrator') || s.vo
          );
          if (hasNarrator && availableVoices.length > 0) {
            // Pick a neutral/documentary-style voice for narrator
            const narratorVoice = neutralVoices[0] || availableVoices[0];
            voiceCasting['narrator'] = narratorVoice.voice_id;
            console.log(`  narrator → ${narratorVoice.name} (${narratorVoice.voice_id})`);
          }
        }
      } catch (voiceErr) {
        console.warn('Voice auto-assignment failed:', voiceErr.message);
        // Continue without voice casting - assembly will use default
      }
    }

    // Generate project ID
    const slug = concept.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
    const projectId = `${slug}_${Date.now()}`;

    const project = {
      project_id: projectId,
      concept: structure.concept,
      duration: structure.duration,
      arc: structure.arc,
      arc_description: structure.arc_description,
      style: style || null,
      characters: structure.characters || [],
      environments: structure.environments || [],
      shots: shotsWithDescriptions,
      ...(voiceCasting && { voiceCasting })
    };

    console.log('Generated project:', JSON.stringify(project, null, 2));

    // Auto-save project to disk
    const projectPath = path.join(PROJECTS_PATH, `${project.project_id}.json`);
    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
    console.log(`Project saved: ${project.project_id}`);

    res.json(project);
  } catch (err) {
    console.error('Generate project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Execute a project - generates Veo prompts and submits jobs for all shots
app.post('/api/execute-project', async (req, res) => {
  const config = loadConfig();

  if (!config.claudeKey) {
    return res.status(400).json({ error: 'No Claude API key configured' });
  }

  if (!config.veoServiceAccountPath) {
    return res.status(400).json({ error: 'No Veo service account configured' });
  }

  const { project, concept, duration, arc = 'tension-release', style, aspectRatio = '9:16', production_style, production_rules } = req.body;

  // Validate input - need either project or concept
  if (!project && !concept) {
    return res.status(400).json({ error: 'Either project or concept is required' });
  }

  // Resolve production rules from preset, custom, or project
  let resolvedProductionRules = production_rules || null;
  if (production_style && PRODUCTION_PRESETS[production_style]) {
    resolvedProductionRules = PRODUCTION_PRESETS[production_style];
  }
  // If project has production_rules, use those
  if (project && project.production_rules) {
    resolvedProductionRules = project.production_rules;
  }

  try {
    let projectData = project;

    // If no project provided, generate one from concept/duration/arc
    if (!projectData && concept) {
      if (!duration || typeof duration !== 'number' || duration <= 0) {
        return res.status(400).json({ error: 'duration is required when using concept shorthand' });
      }

      if (!ARC_TYPES[arc]) {
        return res.status(400).json({
          error: `Invalid arc type. Must be one of: ${Object.keys(ARC_TYPES).join(', ')}`
        });
      }

      console.log('Generating project from concept...');

      // Generate structure
      const structure = await generateStructureInternal(concept, duration, arc, config.claudeKey, resolvedProductionRules);

      // Generate descriptions for each shot
      const systemPrompt = `You are a visual storyteller for short-form video. Your job is to write vivid, evocative descriptions of what the viewer sees and feels in each shot.

Write descriptions that are:
- Visual and sensory (what we see, the mood, the atmosphere)
- Appropriate to the shot's role and energy level
- Consistent with the overall concept and style
- NOT technical video prompts (avoid camera directions, aspect ratios, technical jargon)

Return a JSON array of descriptions in the same order as the shots provided.`;

      let userMessage = `CONCEPT: ${concept}
STYLE: ${style || 'unspecified'}
ARC: ${arc} (${structure.arc_description})

Generate a description for each of these shots:

${structure.shots.map((shot, i) => `${i + 1}. ${shot.shot_id}
   - Role: ${shot.role}
   - Energy: ${shot.energy}
   - Duration: ${shot.duration_target}s
   - Position: ${shot.position} (0=start, 1=end)`).join('\n\n')}

Return a JSON array of description strings, one for each shot in order.`;

      const descResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.claudeKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });

      if (!descResponse.ok) {
        const error = await descResponse.text();
        throw new Error(`Claude API error generating descriptions: ${error}`);
      }

      const descData = await descResponse.json();
      const content = descData.content?.[0]?.text;

      if (!content) {
        throw new Error('No response from Claude for descriptions');
      }

      const cleaned = content.replace(/```json|```/g, '').trim();
      const descriptions = JSON.parse(cleaned);

      const shotsWithDescriptions = structure.shots.map((shot, i) => ({
        ...shot,
        description: descriptions[i] || ''
      }));

      const slug = concept.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30);
      const projectId = `${slug}_${Date.now()}`;

      projectData = {
        project_id: projectId,
        concept: structure.concept,
        duration: structure.duration,
        arc: structure.arc,
        arc_description: structure.arc_description,
        style: style || null,
        shots: shotsWithDescriptions
      };

      console.log('Generated project from concept:', projectData.project_id);
    }

    // Validate project has shots
    if (!projectData.shots || !Array.isArray(projectData.shots) || projectData.shots.length === 0) {
      return res.status(400).json({ error: 'Project must have at least one shot' });
    }

    // Build character lookup map for locked characters
    const characterMap = {};
    if (projectData.characters && Array.isArray(projectData.characters)) {
      for (const char of projectData.characters) {
        characterMap[char.id] = char;
      }
      console.log('Character map built:', Object.keys(characterMap), 'Characters with base_image_path:',
        projectData.characters.filter(c => c.base_image_path).map(c => c.id));
    }

    // Build environment lookup map for locked environments
    const environmentMap = {};
    if (projectData.environments && Array.isArray(projectData.environments)) {
      for (const env of projectData.environments) {
        environmentMap[env.id] = env;
      }
      console.log('Environment map built:', Object.keys(environmentMap), 'Environments with base_image_path:',
        projectData.environments.filter(e => e.base_image_path).map(e => e.id));
    }

    // For each shot, generate Veo prompt and submit job
    const jobs = [];
    const projectStyle = projectData.style || style;

    for (const shot of projectData.shots) {
      if (!shot.description) {
        console.warn(`Shot ${shot.shot_id} has no description, skipping`);
        continue;
      }

      console.log(`Processing shot ${shot.shot_id}...`);

      // Build character context for this shot
      let characterContext = null;
      let referenceImagePath = null;

      if (shot.characters && Array.isArray(shot.characters) && shot.characters.length > 0) {
        const lockedDescriptions = [];
        for (const charId of shot.characters) {
          const char = characterMap[charId];
          if (char) {
            if (char.locked_description) {
              lockedDescriptions.push(`${charId}: ${char.locked_description}`);
            }
            // Use first available reference image
            if (!referenceImagePath && char.base_image_path) {
              referenceImagePath = char.base_image_path;
            }
          }
        }
        if (lockedDescriptions.length > 0) {
          characterContext = `CHARACTER APPEARANCE (must match exactly): ${lockedDescriptions.join('; ')}`;
        }
      }

      // Build environment context for this shot
      let environmentContext = null;
      let environmentImagePath = null;

      if (shot.environment && environmentMap[shot.environment]) {
        const env = environmentMap[shot.environment];
        if (env.locked_description) {
          environmentContext = `ENVIRONMENT (must match exactly): ${env.locked_description}`;
        }
        if (env.base_image_path) {
          environmentImagePath = env.base_image_path;
        }
      }

      // Combine character and environment context
      const additionalContextParts = [];
      if (characterContext) additionalContextParts.push(characterContext);
      if (environmentContext) additionalContextParts.push(environmentContext);
      const combinedContext = additionalContextParts.length > 0 ? additionalContextParts.join('\n\n') : null;

      // Check if shot needs splitting due to long dialogue
      const takePlan = generateTakePlan(shot);
      const finalReferenceImage = referenceImagePath || environmentImagePath;

      if (takePlan && takePlan.length > 1) {
        // Multi-take shot: process takes sequentially with frame chaining
        console.log(`Shot ${shot.shot_id} requires ${takePlan.length} takes (dialogue: ${estimateDialogueDuration(shot.dialogue).toFixed(1)}s)`);

        const takeJobIds = [];
        let prevVideoPath = null;

        for (let takeIndex = 0; takeIndex < takePlan.length; takeIndex++) {
          const take = takePlan[takeIndex];
          console.log(`  Processing take ${takeIndex + 1}/${takePlan.length}: ${take.dialogue_lines.length} lines, ${take.duration}s`);

          // Build dialogue context for this take's lines
          const takeDialogueContext = take.dialogue_lines.map(line => {
            const char = characterMap[line.speaker];
            const voiceDesc = char?.description || line.speaker;
            const lineMood = line.mood || shot.mood;
            return {
              speaker: line.speaker,
              text: line.text,
              mood: lineMood,
              voiceDescription: voiceDesc
            };
          });

          // Get reference frame: from previous take or original reference
          let takeReferenceImage = finalReferenceImage;
          if (prevVideoPath) {
            try {
              takeReferenceImage = await extractLastFrame(prevVideoPath);
              console.log(`  Using last frame from previous take: ${takeReferenceImage}`);
            } catch (err) {
              console.warn(`  Failed to extract last frame: ${err.message}, using original reference`);
            }
          }

          // Generate Veo prompt for this take
          const takePrompt = await generateVeoPromptInternal(
            take.action_hint,
            take.duration,
            projectStyle,
            config.claudeKey,
            {
              aspectRatio,
              additionalContext: combinedContext,
              mood: shot.mood,
              productionRules: resolvedProductionRules,
              dialogue: takeDialogueContext
            }
          );

          console.log(`  Generated take ${takeIndex + 1} prompt:`, takePrompt.substring(0, 60) + '...');

          // Create and submit job for this take
          const takeJobInput = {
            prompt: takePrompt,
            aspectRatio,
            durationSeconds: take.duration
          };

          if (takeReferenceImage) {
            takeJobInput.referenceImagePath = takeReferenceImage;
          }

          const takeJob = {
            id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            type: 'veo-generate',
            status: 'pending',
            input: takeJobInput,
            result: null,
            error: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const allJobs = loadJobs();
          allJobs.unshift(takeJob);
          saveJobs(allJobs);

          // Start processing
          processVeoJob(takeJob.id, takeJob.input);
          takeJobIds.push(takeJob.id);

          jobs.push({
            shot_id: shot.shot_id,
            take_index: takeIndex,
            job_id: takeJob.id,
            duration_target: take.duration,
            veo_prompt: takePrompt
          });

          // Wait for job to complete before next take (for frame chaining)
          if (takeIndex < takePlan.length - 1) {
            console.log(`  Waiting for take ${takeIndex + 1} to complete for frame chaining...`);
            try {
              const completedJob = await waitForJobComplete(takeJob.id);
              prevVideoPath = completedJob.result.path;
              console.log(`  Take ${takeIndex + 1} complete: ${prevVideoPath}`);
            } catch (err) {
              console.error(`  Take ${takeIndex + 1} failed: ${err.message}`);
              // Continue with next take using original reference
              prevVideoPath = null;
            }
          }
        }

        // Store all take job IDs on the shot
        shot.take_job_ids = takeJobIds;
        shot.job_id = takeJobIds[0]; // Keep backward compat with first take

      } else {
        // Single-take shot: use existing flow

        // Build dialogue context for Veo native speech generation
        let dialogueContext = null;
        if (shot.dialogue && Array.isArray(shot.dialogue) && shot.dialogue.length > 0) {
          dialogueContext = shot.dialogue.map(line => {
            const char = characterMap[line.speaker];
            const voiceDesc = char?.description || line.speaker;
            const lineMood = line.mood || shot.mood;
            return {
              speaker: line.speaker,
              text: line.text,
              mood: lineMood,
              voiceDescription: voiceDesc
            };
          });
          console.log(`Shot ${shot.shot_id} has ${dialogueContext.length} dialogue lines for Veo`);
        }

        // Generate Veo prompt from description
        const veoPrompt = await generateVeoPromptInternal(
          shot.description,
          shot.duration_target,
          projectStyle,
          config.claudeKey,
          {
            aspectRatio,
            additionalContext: combinedContext,
            mood: shot.mood,
            productionRules: resolvedProductionRules,
            dialogue: dialogueContext
          }
        );

        console.log(`Generated Veo prompt for ${shot.shot_id}:`, veoPrompt.substring(0, 80) + '...');

        // Create job for this shot
        const jobInput = {
          prompt: veoPrompt,
          aspectRatio,
          durationSeconds: shot.duration_target
        };

        if (finalReferenceImage) {
          jobInput.referenceImagePath = finalReferenceImage;
          const source = referenceImagePath ? 'character' : 'environment';
          console.log(`Using ${source} reference image for ${shot.shot_id}: ${finalReferenceImage}`);
        }

        const job = {
          id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          type: 'veo-generate',
          status: 'pending',
          input: jobInput,
          result: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const allJobs = loadJobs();
        allJobs.unshift(job);
        saveJobs(allJobs);

        // Start processing
        processVeoJob(job.id, job.input);

        // Store job_id in shot for persistence
        shot.job_id = job.id;

        jobs.push({
          shot_id: shot.shot_id,
          job_id: job.id,
          duration_target: shot.duration_target,
          veo_prompt: veoPrompt
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Save updated project with job_ids
    const projectPath = path.join(PROJECTS_PATH, `${projectData.project_id}.json`);
    fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
    console.log(`Project updated with job IDs: ${projectData.project_id}`);

    console.log(`Execute project complete: ${jobs.length} jobs created`);

    res.json({
      project_id: projectData.project_id,
      jobs
    });
  } catch (err) {
    console.error('Execute project error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-image', async (req, res) => {
  const config = loadConfig();

  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { prompt, aspectRatio = '9:16' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const requestBody = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio
      }
    };

    console.log('Imagen request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Imagen error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;

    if (!base64) {
      return res.status(500).json({ error: 'No image data in response' });
    }

    // Save to disk
    const imagesDir = path.join(__dirname, 'generated-images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const filename = `frame_${timestamp}_${randomId}.png`;
    const filepath = path.join(imagesDir, filename);

    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    console.log('Saved image to:', filepath);

    res.json({
      imagePath: filepath,
      imageUrl: `/generated-images/${filename}`
    });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Lock Character ============

app.post('/api/lock-character', async (req, res) => {
  const config = loadConfig();

  try {
    const { character, style } = req.body;

    // Validate input
    if (!character || !character.id || !character.description) {
      return res.status(400).json({
        error: 'character object with id and description is required'
      });
    }

    const { accessToken, projectId } = await getVeoAccessToken(config);

    // Step 1: Generate neutral full-body reference image via Imagen
    const imagenPrompt = `Full-body portrait of ${character.description}. Standing in a neutral pose, plain gray background, soft even lighting, facing camera, simple clothing.${style ? ' ' + style : ''}`;

    console.log('Generating character reference image:', imagenPrompt);

    const imagenResponse = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          instances: [{ prompt: imagenPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '9:16'
          }
        })
      }
    );

    if (!imagenResponse.ok) {
      const errorText = await imagenResponse.text();
      throw new Error(`Imagen API error: ${imagenResponse.status} - ${errorText}`);
    }

    const imagenData = await imagenResponse.json();
    const base64Image = imagenData.predictions?.[0]?.bytesBase64Encoded;

    if (!base64Image) {
      throw new Error('No image generated from Imagen');
    }

    // Step 2: Save image with character-specific filename
    const imagesDir = path.join(__dirname, 'generated-images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const filename = `character_${character.id}_base.png`;
    const filepath = path.join(imagesDir, filename);
    fs.writeFileSync(filepath, Buffer.from(base64Image, 'base64'));
    console.log('Saved character base image to:', filepath);

    // Step 3: Analyze with Gemini Pro to extract immutable visual features
    const geminiRequestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `Analyze this reference image of a character for video generation consistency. Extract ALL visual features that must stay identical across multiple video shots.

MUST INCLUDE:
- Physical: age, ethnicity/skin tone, gender, hair color/style/length, body build, facial features
- Clothing: exact garments, colors, patterns, fit (e.g., "white button-up blouse, dark navy pants")
- Appearance state: expression, pose, demeanor if distinctive

EXCLUDE: background, lighting, camera angle

Output format: A detailed sentence, 30-50 words. Be SPECIFIC about colors and clothing.
Example: "East Asian woman, late 20s, shoulder-length straight black hair, slim build, wearing a crisp white button-up blouse tucked into high-waisted dark navy trousers, calm neutral expression, standing upright with relaxed posture."`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };

    const geminiResponse = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(geminiRequestBody)
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    let lockedDescription = '';
    if (geminiData.candidates?.[0]?.content?.parts) {
      lockedDescription = geminiData.candidates[0].content.parts
        .map(p => p.text || '')
        .join('')
        .trim();
    }

    if (!lockedDescription) {
      throw new Error('Failed to extract character description from Gemini');
    }

    // Validate description has enough detail (at least 8 words)
    const wordCount = lockedDescription.split(/\s+/).length;
    if (wordCount < 8) {
      console.log(`Locked description too short (${wordCount} words), retrying with explicit prompt...`);

      const retryRequestBody = {
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image
              }
            },
            {
              text: `Describe this person's complete visual appearance for video consistency in 30-50 words.

You MUST include ALL of these details:
1. Ethnicity/skin tone and approximate age
2. Gender presentation
3. Hair color, style, and length
4. Body build
5. CLOTHING: specific garments with colors (e.g., "white blouse, dark pants")
6. Expression/demeanor if notable

Example: "East Asian woman, early 30s, shoulder-length black hair, slim build, wearing white button-up blouse and dark navy trousers, calm composed expression."`
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192
        }
      };

      const retryResponse = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(retryRequestBody)
        }
      );

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        if (retryData.candidates?.[0]?.content?.parts) {
          const retryDescription = retryData.candidates[0].content.parts
            .map(p => p.text || '')
            .join('')
            .trim();
          if (retryDescription && retryDescription.split(/\s+/).length >= 8) {
            lockedDescription = retryDescription;
            console.log('Retry successful, got longer description');
          }
        }
      }
    }

    console.log('Locked character description:', lockedDescription);

    res.json({
      character_id: character.id,
      base_image_path: `/generated-images/${filename}`,
      locked_description: lockedDescription
    });
  } catch (err) {
    console.error('Lock character error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Lock Environment ============

app.post('/api/lock-environment', async (req, res) => {
  const config = loadConfig();

  try {
    const { environment, style } = req.body;

    // Validate input
    if (!environment || !environment.id || !environment.description) {
      return res.status(400).json({
        error: 'environment object with id and description is required'
      });
    }

    const { accessToken, projectId } = await getVeoAccessToken(config);

    // Step 1: Generate wide establishing shot via Imagen (no people, architectural focus)
    const imagenPrompt = `Wide establishing shot of ${environment.description}. Empty scene with no people or characters visible. Focus on architecture, atmosphere, and spatial depth. Cinematic composition, dramatic lighting.${style ? ' ' + style : ''}`;

    console.log('Generating environment reference image:', imagenPrompt);

    const imagenResponse = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          instances: [{ prompt: imagenPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '16:9'  // Wide establishing shot
          }
        })
      }
    );

    if (!imagenResponse.ok) {
      const errorText = await imagenResponse.text();
      throw new Error(`Imagen API error: ${imagenResponse.status} - ${errorText}`);
    }

    const imagenData = await imagenResponse.json();
    const base64Image = imagenData.predictions?.[0]?.bytesBase64Encoded;

    if (!base64Image) {
      throw new Error('No image generated from Imagen');
    }

    // Step 2: Save image with environment-specific filename
    const imagesDir = path.join(__dirname, 'generated-images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const filename = `environment_${environment.id}_base.png`;
    const filepath = path.join(imagesDir, filename);
    fs.writeFileSync(filepath, Buffer.from(base64Image, 'base64'));
    console.log('Saved environment base image to:', filepath);

    // Step 3: Analyze with Gemini Pro to extract immutable architectural/atmospheric features
    const geminiRequestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `Analyze this reference image of an environment/location. Extract ONLY the immutable architectural and atmospheric features that must stay consistent across video shots.

Include:
- Setting type (interior/exterior, architectural style)
- Materials and textures (brick, wood, concrete, metal)
- Color palette (dominant and accent colors)
- Lighting character (natural/artificial, warm/cool, direction)
- Key spatial elements (ceiling height, depth, openings)

Exclude: moveable objects, weather conditions, people, vehicles, temporary items.

Output format: A single paragraph, 25-40 words. Example: "Industrial warehouse interior, exposed red brick walls, concrete floor, high vaulted ceiling with steel beams, warm amber light from tall windows, deep perspective."`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };

    const geminiResponse = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(geminiRequestBody)
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    let lockedDescription = '';
    if (geminiData.candidates?.[0]?.content?.parts) {
      lockedDescription = geminiData.candidates[0].content.parts
        .map(p => p.text || '')
        .join('')
        .trim();
    }

    if (!lockedDescription) {
      throw new Error('Failed to extract environment description from Gemini');
    }

    // Validate description has enough detail (at least 15 words for environments)
    const wordCount = lockedDescription.split(/\s+/).length;
    if (wordCount < 15) {
      console.log(`Locked description too short (${wordCount} words), retrying with explicit prompt...`);

      const retryRequestBody = {
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image
              }
            },
            {
              text: `Describe this environment/location in exactly one paragraph with 25-40 words.

You MUST include ALL of these details:
1. Interior or exterior setting
2. Architectural style (modern, industrial, rustic, etc.)
3. Main materials visible (wood, brick, concrete, glass, etc.)
4. Color palette (warm/cool, specific dominant colors)
5. Lighting quality (natural/artificial, bright/dim, warm/cool)
6. Spatial characteristics (ceiling height, depth, openness)

Do NOT mention people, weather, moveable objects, or temporary items.

Example: "Modern industrial loft interior, exposed red brick walls, polished concrete floors, 20-foot ceilings with black steel beams, floor-to-ceiling windows casting warm afternoon light, open floor plan with deep perspective."`
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192
        }
      };

      const retryResponse = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(retryRequestBody)
        }
      );

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        if (retryData.candidates?.[0]?.content?.parts) {
          const retryDescription = retryData.candidates[0].content.parts
            .map(p => p.text || '')
            .join('')
            .trim();
          if (retryDescription && retryDescription.split(/\s+/).length >= 15) {
            lockedDescription = retryDescription;
            console.log('Retry successful, got longer description');
          }
        }
      }
    }

    console.log('Locked environment description:', lockedDescription);

    res.json({
      environment_id: environment.id,
      base_image_path: `/generated-images/${filename}`,
      locked_description: lockedDescription
    });
  } catch (err) {
    console.error('Lock environment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Gemini Video Analysis ============

app.post('/api/gemini/analyze-video', async (req, res) => {
  const config = loadConfig();
  
  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { videoPath, originalPrompt } = req.body;
    
    // Read video file and convert to base64
    const fullPath = path.join(__dirname, 'data', videoPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    const videoBuffer = fs.readFileSync(fullPath);
    const videoBase64 = videoBuffer.toString('base64');
    
    console.log('Analyzing video:', fullPath, 'Size:', videoBuffer.length);
    
    let analysisPrompt;
    
    if (originalPrompt) {
      analysisPrompt = `Analyze this AI-generated video clip. Be concise (3-5 sentences per section).

ORIGINAL PROMPT GIVEN TO VIDEO GENERATOR:
"${originalPrompt}"

Provide:
1. WHAT'S IN THE VIDEO: Brief description of visuals, camera work, and audio (transcribe any speech)
2. PROMPT MATCH: How well does the video match the original prompt? Note any discrepancies or missing elements.
3. TECHNICAL NOTES: Any quality issues, artifacts, or problems to watch for in editing.`;
    } else {
      analysisPrompt = `Analyze this video clip. Be concise (3-5 sentences per section).

Provide:
1. VISUALS: What's shown, camera movement, lighting
2. AUDIO: Speech (transcribe it), music, sound effects
3. TECHNICAL: Any quality issues or artifacts`;
    }

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'video/mp4',
              data: videoBase64
            }
          },
          {
            text: analysisPrompt
          }
        ]
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192
      }
    };

    // Use Gemini 2.5 Flash via Vertex AI
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    
    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No description generated';
    
    console.log('Gemini analysis complete');
    res.json({ 
      description: text,
      model: 'gemini-2.5-flash',
      raw: data
    });
  } catch (err) {
    console.error('Gemini analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Analyze video for cut points (trim recommendations)
app.post('/api/gemini/analyze-cut-points', async (req, res) => {
  const config = loadConfig();

  try {
    const { accessToken, projectId } = await getVeoAccessToken(config);
    const { videoPath, shotContext } = req.body;

    // shotContext should include: role, description, duration_target, mood, energy, tension, dialogue (optional)
    if (!videoPath || !shotContext) {
      return res.status(400).json({ error: 'videoPath and shotContext are required' });
    }

    // Read video file and convert to base64
    const fullPath = path.join(__dirname, 'data', videoPath.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    const videoBuffer = fs.readFileSync(fullPath);
    const videoBase64 = videoBuffer.toString('base64');

    console.log('Analyzing cut points for:', fullPath);

    // Build contextual analysis prompt
    const dialogueInfo = shotContext.dialogue
      ? '\n- Dialogue: ' + shotContext.dialogue.map(d => '"' + d.text + '" (' + d.speaker + ')').join(', ')
      : '';

    const analysisPrompt = 'Analyze this video clip for CUT POINT OPTIMIZATION. The goal is to find the best trim points.\n\n' +
      'SHOT CONTEXT:\n' +
      '- Role: ' + (shotContext.role || 'unknown') + '\n' +
      '- Description: ' + (shotContext.description || 'No description') + '\n' +
      '- Target duration: ' + (shotContext.duration_target || 'unknown') + 's\n' +
      '- Mood: ' + (shotContext.mood || 'unknown') + ' | Energy: ' + (shotContext.energy || 'unknown') + ' | Tension: ' + (shotContext.tension || 'unknown') + dialogueInfo + '\n' +
      (shotContext.timing_hints ? '- Timing hints: ' + shotContext.timing_hints + '\n' : '') +
      '\nCOMMON VEO ISSUES TO DETECT:\n' +
      '1. "entrance_movement" - Character walks in, door opens, or stepping into frame when subject should already be in position\n' +
      '2. "dead_time" - Action completes early leaving static/redundant frames at the end\n' +
      '3. "late_action" - Key action happens later than expected, leaving dead time at the start\n' +
      '4. "rushed_action" - Action completes too quickly, with filler/holding at start or end\n' +
      '5. "discontinuity" - Visual glitch, jump cut, artifact, or quality drop\n\n' +
      'ANALYZE THE CLIP AND RESPOND WITH ONLY THIS JSON (no markdown, no explanation):\n' +
      '{\n' +
      '  "actual_action_start": <seconds when meaningful action actually starts>,\n' +
      '  "actual_action_end": <seconds when meaningful action actually ends>,\n' +
      '  "suggested_trim_start": <seconds to trim from beginning, 0 if none needed>,\n' +
      '  "suggested_trim_end": <seconds from start where clip should end, or null to use full clip>,\n' +
      '  "usable_duration": <resulting duration after suggested trims>,\n' +
      '  "issues_detected": [\n' +
      '    {\n' +
      '      "type": "<entrance_movement|dead_time|late_action|rushed_action|discontinuity|other>",\n' +
      '      "at_seconds": <timestamp where issue occurs>,\n' +
      '      "description": "<brief description>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "reasoning": "<1-2 sentences explaining the trim recommendation>",\n' +
      '  "confidence": "<high|medium|low>"\n' +
      '}';

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'video/mp4',
              data: videoBase64
            }
          },
          {
            text: analysisPrompt
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,  // Lower temp for more consistent JSON output
        maxOutputTokens: 8192
      }
    };

    const response = await fetch(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/' + projectId + '/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini error:', error);
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (handle potential markdown wrapping)
    let analysis;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON response:', text);
      return res.status(500).json({
        error: 'Failed to parse analysis response',
        raw_response: text
      });
    }

    console.log('Cut point analysis complete:', analysis.reasoning);
    res.json({
      analysis,
      model: 'gemini-2.5-flash',
      raw: data
    });
  } catch (err) {
    console.error('Cut point analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ============ Video Assembly ============

app.post('/api/assemble', async (req, res) => {
  let { shots, outputFilename, textOverlays = [], audioLayers = [], videoVolume = 1.0,
        musicTrack, musicVolume = 0.3, project_id, voice_id } = req.body;

  // shots should be array of: { videoPath, trimStart?, trimEnd?, energy? }
  // Energy-based transitions when energy values are provided:
  //   - Drop >= 0.4: insert 0.5s black before lower-energy shot
  //   - Rise >= 0.4: hard cut with 0.1s trimmed from outgoing shot
  //   - Change < 0.2: 0.25s crossfade dissolve
  // textOverlays (optional): array of { text, startTime, duration, position? }
  //   - position: "top", "center", or "bottom" (default "bottom")
  // audioLayers (optional): array of { type, path?, text?, voice_id?, model_id?, volume, startTime }
  //   - type: "music", "vo", "sfx", "ambient" (label only, all mixed same way)
  //   - path: path to existing audio file
  //   - OR text + voice_id: generate VO on the fly (voice_id required with text)
  //   - model_id: optional TTS model (default: eleven_turbo_v2_5)
  //   - volume: 0.0-1.0
  //   - startTime: seconds from start of assembled video
  // videoVolume (optional): 0.0-1.0, default 1.0 - controls video's native audio level
  // musicTrack/musicVolume (deprecated): backward compat, converted to audioLayer
  // project_id (optional): Load shots from saved project, auto-generates VO if voice_id also provided
  // voice_id (optional): Used with project_id to auto-generate VO from project shot.vo fields

  // If project_id provided, load project and build shots + VO layers
  if (project_id && !shots) {
    const projectPath = path.join(PROJECTS_PATH, `${project_id}.json`);
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const jobs = loadJobs();

    // Use voiceCasting.narrator as fallback for voice_id if not explicitly provided
    if (!voice_id && project.voiceCasting?.narrator) {
      voice_id = project.voiceCasting.narrator;
      console.log(`Using narrator voice from project voiceCasting: ${voice_id}`);
    }

    // Build shots from project
    let runningTime = 0;
    shots = [];

    for (const shot of project.shots || []) {
      // Check for multi-take shots
      if (shot.take_job_ids && Array.isArray(shot.take_job_ids) && shot.take_job_ids.length > 1) {
        // Multi-take shot: add all takes in sequence with hard cuts
        console.log(`Shot ${shot.shot_id} has ${shot.take_job_ids.length} takes`);

        for (let takeIdx = 0; takeIdx < shot.take_job_ids.length; takeIdx++) {
          const takeJobId = shot.take_job_ids[takeIdx];
          const job = jobs.find(j => j.id === takeJobId);

          if (!job || job.status !== 'complete') {
            return res.status(400).json({
              error: `Take ${takeIdx + 1} of shot ${shot.shot_id} not ready: ${job?.status || 'no job'}`
            });
          }

          shots.push({
            videoPath: getVideoPathForJob(takeJobId, job.result.path),
            energy: shot.energy,
            tension: shot.tension,
            // Hard cut between takes of same shot (they should be continuous)
            skipTransition: takeIdx > 0
          });

          runningTime += job.result.duration || 4;
        }

        // For multi-take shots, VO timing is relative to total shot duration
        if (shot.vo?.text && voice_id) {
          const totalDuration = shot.take_job_ids.reduce((sum, jobId) => {
            const job = jobs.find(j => j.id === jobId);
            return sum + (job?.result?.duration || 4);
          }, 0);

          let startTime = runningTime - totalDuration; // Start of this shot
          if (shot.vo.timing === 'middle') {
            startTime += totalDuration * 0.25;
          } else if (shot.vo.timing === 'end') {
            startTime += totalDuration * 0.5;
          }

          audioLayers.push({
            type: 'vo',
            text: shot.vo.text,
            voice_id: voice_id,
            volume: 1,
            startTime: startTime
          });
        }

        // Skip dialogue for multi-take shots (Veo handles it)
        if (shot.dialogue && shot.dialogue.length > 0) {
          console.log(`Skipping ElevenLabs for multi-take shot ${shot.shot_id} - using Veo native dialogue`);
        }

      } else {
        // Single-take shot: use existing flow
        const job = shot.job_id ? jobs.find(j => j.id === shot.job_id) : null;
        if (!job || job.status !== 'complete') {
          return res.status(400).json({
            error: `Shot ${shot.shot_id} not ready: ${job?.status || 'no job'}`
          });
        }

        shots.push({
          videoPath: getVideoPathForJob(shot.job_id, job.result.path),
          energy: shot.energy,
          tension: shot.tension
        });

        // Auto-generate VO audioLayer if shot has vo.text and voice_id provided
        if (shot.vo?.text && voice_id) {
          const shotDuration = job.result.duration || shot.duration_target || 4;
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

        // Skip dialogue array - Veo generates native audio with lip sync
        // ElevenLabs TTS is only used for 'vo' (narration), not character dialogue
        if (shot.dialogue && Array.isArray(shot.dialogue) && shot.dialogue.length > 0) {
          console.log(`Skipping ElevenLabs for shot ${shot.shot_id} - using Veo native dialogue (${shot.dialogue.length} lines)`);
        }

        runningTime += job.result.duration || shot.duration_target || 4;
      }
    }

    console.log(`Loaded project ${project_id}: ${shots.length} shots, ${audioLayers.length} audio layers`);
  }

  if (!shots || shots.length === 0) {
    return res.status(400).json({ error: 'No shots provided' });
  }

  // Validate each shot has videoPath
  for (let i = 0; i < shots.length; i++) {
    if (!shots[i].videoPath) {
      return res.status(400).json({ error: `Shot ${i} is missing required videoPath` });
    }
  }

  try {
    const outputDir = path.join(__dirname, 'data', 'exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const finalFilename = outputFilename || `assembled_${timestamp}.mp4`;
    const outputPath = path.join(outputDir, finalFilename);
    
    // Create a temp directory for intermediate files
    const tempDir = path.join(__dirname, 'data', 'temp', `assembly_${timestamp}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Build unified audio layers (with backward compatibility for musicTrack)
    const allAudioLayers = [...audioLayers];
    if (musicTrack && audioLayers.length === 0) {
      console.log('Converting legacy musicTrack to audioLayer');
      allAudioLayers.push({ type: 'music', path: musicTrack, volume: musicVolume, startTime: 0 });
    }

    // Process audio layers - generate TTS for any with text instead of path
    const processedAudioLayers = [];
    for (let i = 0; i < allAudioLayers.length; i++) {
      const layer = allAudioLayers[i];

      if (layer.text && !layer.path) {
        // Generate VO from text
        if (!layer.voice_id) {
          throw new Error(`audioLayer ${i}: voice_id required when using text`);
        }

        const config = loadConfig();
        if (!config.elevenLabsKey) {
          throw new Error('No ElevenLabs API key configured for TTS generation');
        }

        // Compute voice settings from mood/tension/energy if provided
        let voiceSettings = { stability: 0.5, similarity_boost: 0.75 };
        let speedFactor = 1.0;
        if (layer.mood) {
          const voiceProfile = computeVoiceSettings({
            mood: layer.mood,
            tension: layer.tension,
            energy: layer.energy
          });
          voiceSettings = {
            stability: voiceProfile.stability,
            similarity_boost: voiceProfile.similarity_boost
          };
          speedFactor = voiceProfile.speed_factor;
          console.log(`AudioLayer ${i}: mood=${layer.mood}, voice settings:`, voiceSettings, `speed=${speedFactor}`);
        }

        console.log(`Generating TTS for audioLayer ${i}: "${layer.text.substring(0, 50)}..."`);

        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${layer.voice_id}`, {
          method: 'POST',
          headers: {
            'xi-api-key': config.elevenLabsKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: layer.text,
            model_id: layer.model_id || 'eleven_turbo_v2_5',
            voice_settings: voiceSettings
          })
        });

        if (!ttsResponse.ok) {
          const error = await ttsResponse.text();
          throw new Error(`TTS generation failed for audioLayer ${i}: ${error}`);
        }

        const audioBuffer = await ttsResponse.arrayBuffer();

        // Save to temp directory for this assembly
        const ttsFilename = `tts_layer_${i}_${Date.now()}.mp3`;
        const ttsPath = path.join(tempDir, ttsFilename);
        fs.writeFileSync(ttsPath, Buffer.from(audioBuffer));

        // Apply speed adjustment via ffmpeg if needed
        if (speedFactor !== 1.0) {
          try {
            const tempAudioPath = ttsPath.replace('.mp3', '_temp.mp3');
            const clampedSpeed = Math.max(0.5, Math.min(2.0, speedFactor));
            execSync(`ffmpeg -y -i "${ttsPath}" -filter:a "atempo=${clampedSpeed}" "${tempAudioPath}"`, { stdio: 'pipe' });
            fs.unlinkSync(ttsPath);
            fs.renameSync(tempAudioPath, ttsPath);
            console.log(`Applied speed factor ${clampedSpeed} to audioLayer ${i}`);
          } catch (ffmpegErr) {
            console.error(`ffmpeg atempo error for audioLayer ${i}:`, ffmpegErr.message);
          }
        }

        processedAudioLayers.push({
          ...layer,
          path: ttsPath  // Use absolute path since it's in tempDir
        });
      } else {
        processedAudioLayers.push(layer);
      }
    }

    // Create concat file for ffmpeg
    const concatFilePath = path.join(tempDir, 'concat.txt');
    const concatLines = [];

    // Helper to generate a black clip for energy drop transitions
    const generateBlackClip = (clipPath, duration = 0.5) => {
      const cmd = `ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:r=30:d=${duration} -f lavfi -i anullsrc=r=44100:cl=stereo -t ${duration} -c:v libx264 -preset fast -crf 23 -c:a aac -pix_fmt yuv420p "${clipPath}"`;
      execSync(cmd, { stdio: 'pipe' });
    };

    // Helper to get video duration
    const getClipDuration = (clipPath) => {
      const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${clipPath}"`, { encoding: 'utf8' });
      return parseFloat(result.trim());
    };

    // Helper to apply crossfade between two clips
    const applyCrossfade = (clip1Path, clip2Path, outputClipPath, fadeDuration = 0.25) => {
      const dur1 = getClipDuration(clip1Path);
      const offset = Math.max(0, dur1 - fadeDuration);
      const cmd = `ffmpeg -y -i "${clip1Path}" -i "${clip2Path}" -filter_complex "[0:v][1:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${fadeDuration}[a]" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -pix_fmt yuv420p "${outputClipPath}"`;
      execSync(cmd, { stdio: 'pipe' });
    };

    // Helper to trim end of a clip
    const trimClipEnd = (inputPath, outputClipPath, trimAmount = 0.1) => {
      const dur = getClipDuration(inputPath);
      const newDur = Math.max(0.1, dur - trimAmount);
      const cmd = `ffmpeg -y -i "${inputPath}" -t ${newDur} -c:v libx264 -preset fast -crf 23 -c:a aac -pix_fmt yuv420p "${outputClipPath}"`;
      execSync(cmd, { stdio: 'pipe' });
    };

    // Determine transition type between shots based on energy AND tension
    const getTransitionType = (prevShot, currShot) => {
      const prevEnergy = prevShot?.energy;
      const currEnergy = currShot?.energy;
      const prevTension = prevShot?.tension;
      const currTension = currShot?.tension;

      // Default to energy-only logic if tension not provided
      if (typeof prevEnergy !== 'number' || typeof currEnergy !== 'number') {
        return 'cut';
      }

      const energyChange = currEnergy - prevEnergy;
      const tensionChange = (typeof prevTension === 'number' && typeof currTension === 'number')
        ? currTension - prevTension
        : null;

      // Tension-aware transitions (if tension data available)
      if (tensionChange !== null) {
        // High tension release (tension drops significantly) - longer crossfade for catharsis
        if (tensionChange <= -0.4 && currTension < 0.3) {
          return 'crossfade_long'; // 0.5s crossfade for tension release
        }
        // Tension spike (low to high) - breath before impact
        if (tensionChange >= 0.4 && prevTension < 0.3) {
          return 'black'; // Pause before high-tension moment
        }
        // Sustained high tension - hard cuts maintain suspense
        if (prevTension >= 0.6 && currTension >= 0.6) {
          return 'hard_cut';
        }
      }

      // Fall back to energy-based logic
      if (energyChange <= -0.4) {
        return 'black'; // Energy drop >= 0.4
      } else if (energyChange >= 0.4) {
        return 'hard_cut'; // Energy rise >= 0.4
      } else if (Math.abs(energyChange) < 0.2) {
        return 'crossfade'; // Small change < 0.2
      }
      return 'cut'; // Default for changes between 0.2 and 0.4
    };

    // Detect aspect ratio from first video to determine output dimensions
    const firstVideoPath = path.join(__dirname, 'data', shots[0].videoPath.replace(/^\//, ''));
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${firstVideoPath}"`;
    const dimensions = execSync(probeCmd, { encoding: 'utf8' }).trim().split(',');
    const srcWidth = parseInt(dimensions[0]);
    const srcHeight = parseInt(dimensions[1]);
    const isLandscape = srcWidth > srcHeight;
    const targetWidth = isLandscape ? 1920 : 1080;
    const targetHeight = isLandscape ? 1080 : 1920;
    console.log(`Detected ${isLandscape ? 'landscape' : 'portrait'} (${srcWidth}x${srcHeight}), targeting ${targetWidth}x${targetHeight}`);

    // Process each shot - normalize to same format and mix in VO if present
    const normalizedPaths = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const videoFullPath = path.join(__dirname, 'data', shot.videoPath.replace(/^\//, ''));

      if (!fs.existsSync(videoFullPath)) {
        throw new Error(`Video not found: ${shot.videoPath}`);
      }

      const normalizedPath = path.join(tempDir, `shot_${i}.mp4`);

      // Normalize the video (audio layers are mixed post-concatenation)
      let ffmpegCmd = `ffmpeg -y -i "${videoFullPath}"`;

      if (shot.trimStart) {
        ffmpegCmd += ` -ss ${shot.trimStart}`;
      }
      if (shot.trimEnd) {
        ffmpegCmd += ` -to ${shot.trimEnd}`;
      }

      ffmpegCmd += ` -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=30"`;
      ffmpegCmd += ` -c:v libx264 -preset fast -crf 23`;
      ffmpegCmd += ` -c:a aac -ar 44100 -ac 2`;
      ffmpegCmd += ` -pix_fmt yuv420p`;
      ffmpegCmd += ` "${normalizedPath}"`;

      console.log(`Processing shot ${i}:`, ffmpegCmd);
      execSync(ffmpegCmd, { stdio: 'pipe' });
      normalizedPaths.push(normalizedPath);
    }

    // Build final sequence with transitions
    let currentClipPath = normalizedPaths[0];
    const finalClips = [];

    for (let i = 1; i < shots.length; i++) {
      const prevShot = shots[i - 1];
      const currShot = shots[i];
      const nextClipPath = normalizedPaths[i];

      // Skip transition for multi-take shots (takes should be continuous)
      if (currShot.skipTransition) {
        console.log(`Transition ${i - 1} → ${i}: cut (multi-take continuation)`);
        finalClips.push(currentClipPath);
        currentClipPath = nextClipPath;
        continue;
      }

      const transition = getTransitionType(prevShot, currShot);

      // Log transition with energy and tension info
      const prevInfo = `e:${prevShot.energy ?? '-'} t:${prevShot.tension ?? '-'}`;
      const currInfo = `e:${currShot.energy ?? '-'} t:${currShot.tension ?? '-'}`;
      console.log(`Transition ${i - 1} → ${i}: ${transition} (${prevInfo} → ${currInfo})`);

      if (transition === 'black') {
        // Add current clip, then black, then continue with next
        finalClips.push(currentClipPath);
        const blackPath = path.join(tempDir, `black_before_${i}.mp4`);
        generateBlackClip(blackPath);
        finalClips.push(blackPath);
        currentClipPath = nextClipPath;
      } else if (transition === 'hard_cut') {
        // Trim 0.1s from end of current clip
        const trimmedPath = path.join(tempDir, `trimmed_${i - 1}.mp4`);
        trimClipEnd(currentClipPath, trimmedPath, 0.1);
        finalClips.push(trimmedPath);
        currentClipPath = nextClipPath;
      } else if (transition === 'crossfade') {
        // Standard crossfade (0.25s) for small energy changes
        const crossfadePath = path.join(tempDir, `crossfade_${i - 1}_${i}.mp4`);
        applyCrossfade(currentClipPath, nextClipPath, crossfadePath, 0.25);
        currentClipPath = crossfadePath;
      } else if (transition === 'crossfade_long') {
        // Longer crossfade (0.5s) for tension release moments
        const crossfadePath = path.join(tempDir, `crossfade_long_${i - 1}_${i}.mp4`);
        applyCrossfade(currentClipPath, nextClipPath, crossfadePath, 0.5);
        currentClipPath = crossfadePath;
      } else {
        // Default cut - just add current clip
        finalClips.push(currentClipPath);
        currentClipPath = nextClipPath;
      }
    }
    // Don't forget the last clip
    finalClips.push(currentClipPath);

    // Build concat list
    for (const clipPath of finalClips) {
      concatLines.push(`file '${clipPath.replace(/\\/g, '/')}'`);
    }

    // Write concat file
    fs.writeFileSync(concatFilePath, concatLines.join('\n'));

    // Determine post-processing steps needed
    const hasOverlays = textOverlays && textOverlays.length > 0;
    const hasAudioLayers = processedAudioLayers.length > 0;
    const hasVolumeAdjust = videoVolume !== 1.0;
    const needsPostProcessing = hasOverlays || hasAudioLayers || hasVolumeAdjust;

    // Determine output paths for each stage
    let currentOutput = needsPostProcessing ? path.join(tempDir, 'concat_output.mp4') : outputPath;

    // Concatenate all clips
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${currentOutput}"`;
    console.log('Concatenating:', concatCmd);
    execSync(concatCmd, { stdio: 'pipe' });

    // Apply text overlays if present
    if (hasOverlays) {
      console.log(`Applying ${textOverlays.length} text overlay(s)...`);

      // Build drawtext filter chain
      const drawtextFilters = textOverlays.map((overlay, idx) => {
        const text = (overlay.text || '').replace(/'/g, "'\\''").replace(/:/g, '\\:');
        const startTime = overlay.startTime || 0;
        const endTime = startTime + (overlay.duration || 2);
        const position = overlay.position || 'bottom';

        // Y position based on position setting
        let yExpr;
        if (position === 'top') {
          yExpr = 'h*0.1';
        } else if (position === 'center') {
          yExpr = '(h-text_h)/2';
        } else {
          yExpr = 'h*0.85';
        }

        console.log(`  Overlay ${idx + 1}: "${overlay.text}" at ${startTime}s-${endTime}s (${position})`);

        // fontsize scales with video width (w/18 ≈ 40px at 720w, 107px at 1920w)
        return `drawtext=text='${text}':fontsize=(w/36):fontcolor=white:borderw=2:bordercolor=black:x=20:y=${yExpr}:enable='between(t,${startTime},${endTime})'`;
      });

      const filterChain = drawtextFilters.join(',');
      const overlayOutput = (hasAudioLayers || hasVolumeAdjust) ? path.join(tempDir, 'overlay_output.mp4') : outputPath;
      const overlayCmd = `ffmpeg -y -i "${currentOutput}" -vf "${filterChain}" -c:v libx264 -preset fast -crf 23 -c:a copy "${overlayOutput}"`;
      console.log('Applying text overlays:', overlayCmd);
      execSync(overlayCmd, { stdio: 'pipe' });
      currentOutput = overlayOutput;
    }

    // Mix audio layers if present, or adjust video volume if specified
    if (hasAudioLayers || hasVolumeAdjust) {
      // Get video duration for fade timing
      const videoDuration = getClipDuration(currentOutput);

      // Validate and collect audio layer paths
      const validLayers = [];
      for (const layer of processedAudioLayers) {
        // Handle both absolute paths (generated TTS) and relative paths (existing files)
        const layerPath = path.isAbsolute(layer.path)
          ? layer.path
          : path.join(__dirname, 'data', layer.path.replace(/^\//, ''));
        if (fs.existsSync(layerPath)) {
          validLayers.push({ ...layer, fullPath: layerPath });
        } else {
          console.log(`Audio layer not found, skipping: ${layer.path}`);
        }
      }

      if (validLayers.length > 0) {
        console.log(`Mixing ${validLayers.length} audio layer(s) with video (videoVolume: ${videoVolume})...`);

        // Build ffmpeg command with all audio inputs
        let audioCmd = `ffmpeg -y -i "${currentOutput}"`;
        for (const layer of validLayers) {
          audioCmd += ` -i "${layer.fullPath}"`;
        }

        // Build filter_complex
        const filterParts = [];
        const mixInputs = [];

        // Video audio with volume adjustment
        filterParts.push(`[0:a]volume=${videoVolume}[vid]`);
        mixInputs.push('[vid]');

        // Each audio layer with delay, volume, and optional fade
        validLayers.forEach((layer, idx) => {
          const inputIdx = idx + 1;
          const delayMs = Math.round((layer.startTime || 0) * 1000);
          const volume = layer.volume ?? 1.0;
          const label = `[a${inputIdx}]`;

          let layerFilter = `[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${volume}`;

          // Add fade-out for music type
          if (layer.type === 'music') {
            const fadeStart = Math.max(0, videoDuration - 1);
            layerFilter += `,afade=t=out:st=${fadeStart}:d=1`;
          }

          layerFilter += label;
          filterParts.push(layerFilter);
          mixInputs.push(label);

          console.log(`  Layer ${inputIdx}: ${layer.type} "${layer.path}" at ${layer.startTime || 0}s, volume ${volume}`);
        });

        // Mix all inputs together
        const mixCount = mixInputs.length;
        filterParts.push(`${mixInputs.join('')}amix=inputs=${mixCount}:duration=first:dropout_transition=0[aout]`);

        const filterComplex = filterParts.join(';');
        audioCmd += ` -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac "${outputPath}"`;

        console.log('Mixing audio layers:', audioCmd);
        execSync(audioCmd, { stdio: 'pipe' });
        currentOutput = outputPath;
      } else if (hasVolumeAdjust) {
        // No valid audio layers but video volume adjustment requested
        console.log(`Adjusting video volume to ${videoVolume}`);
        const volCmd = `ffmpeg -y -i "${currentOutput}" -af "volume=${videoVolume}" -c:v copy -c:a aac "${outputPath}"`;
        execSync(volCmd, { stdio: 'pipe' });
        currentOutput = outputPath;
      }
    }

    // Get duration of final video
    const duration = getVideoDuration(outputPath);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log('Assembly complete:', outputPath);
    
    res.json({
      success: true,
      filename: finalFilename,
      path: `/exports/${finalFilename}`,
      duration: duration,
      shotCount: shots.length
    });
  } catch (err) {
    console.error('Assembly error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve exported files
app.use('/exports', express.static(path.join(__dirname, 'data', 'exports')));

// ============ Frame Extraction ============

app.post('/api/extract-frame', async (req, res) => {
  let { videoPath, timestamp = 0, saveToDisk = false } = req.body;

  try {
    const videoFullPath = path.join(__dirname, 'data', videoPath.replace(/^\//, ''));

    if (!fs.existsSync(videoFullPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Support timestamp: 'last' or -1 to extract final frame
    if (timestamp === 'last' || timestamp === -1) {
      const duration = getVideoDuration(videoFullPath);
      timestamp = Math.max(0, duration - 0.1); // 0.1s before end to ensure valid frame
      console.log(`Extracting last frame at ${timestamp}s (video duration: ${duration}s)`);
    }


    if (saveToDisk) {
      // Save frame to generated-images/ directory
      const imagesDir = path.join(__dirname, 'generated-images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const randomId = Math.random().toString(36).substring(2, 8);
      const filename = `frame_${Date.now()}_${randomId}.png`;
      const filepath = path.join(imagesDir, filename);

      const ffmpegCmd = `ffmpeg -y -ss ${timestamp} -i "${videoFullPath}" -vframes 1 "${filepath}"`;
      console.log('Extracting frame to disk:', ffmpegCmd);
      execSync(ffmpegCmd, { stdio: 'pipe' });

      console.log('Saved frame to:', filepath);
      res.json({
        imagePath: filepath,
        imageUrl: `/generated-images/${filename}`
      });
    } else {
      // Return base64 dataUrl (original behavior)
      const framesDir = path.join(__dirname, 'data', 'frames');
      if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
      }

      const frameFilename = `frame_${Date.now()}.jpg`;
      const framePath = path.join(framesDir, frameFilename);

      const ffmpegCmd = `ffmpeg -y -ss ${timestamp} -i "${videoFullPath}" -vframes 1 -q:v 2 "${framePath}"`;
      console.log('Extracting frame:', ffmpegCmd);
      execSync(ffmpegCmd, { stdio: 'pipe' });

      const frameBuffer = fs.readFileSync(framePath);
      const base64 = frameBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      fs.unlinkSync(framePath);

      res.json({
        success: true,
        dataUrl: dataUrl
      });
    }
  } catch (err) {
    console.error('Frame extraction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Project Validation ============

const { validateProject, validateProjectStructure, validateNarrativeArc, validateVeoFeasibility, validateAudioSettings, validateTransitions, validateProductionRules } = require('./validators');

app.post('/api/validate-project', (req, res) => {
  try {
    const { project, validators } = req.body;

    if (!project) {
      return res.status(400).json({ error: 'Missing project in request body' });
    }

    if (validators && Array.isArray(validators)) {
      const results = {};
      const validatorMap = {
        structure: validateProjectStructure,
        narrative: validateNarrativeArc,
        feasibility: validateVeoFeasibility,
        audio: validateAudioSettings,
        transitions: validateTransitions,
        production: validateProductionRules
      };

      validators.forEach(name => {
        if (validatorMap[name]) {
          results[name] = validatorMap[name](project);
        }
      });

      const totalIssues = Object.values(results).reduce((sum, r) => sum + (r.issues?.length || 0), 0);
      res.json({
        valid: totalIssues === 0,
        results,
        summary: { totalIssues }
      });
    } else {
      const result = validateProject(project);
      res.json(result);
    }
  } catch (err) {
    console.error('Validation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/validate-project/:id', (req, res) => {
  try {
    const projectId = req.params.id;
    const files = fs.readdirSync(PROJECTS_PATH).filter(f => f.includes(projectId));

    if (files.length === 0) {
      return res.status(404).json({ error: 'No project found matching: ' + projectId });
    }

    const project = JSON.parse(fs.readFileSync(path.join(PROJECTS_PATH, files[0]), 'utf8'));
    const result = validateProject(project);
    res.json(result);
  } catch (err) {
    console.error('Validation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Serve Frontend ============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/analyze-dialogue-clip', analyzeDialogueRoutes);
app.use('/api/audio-timeline', audioTimelineRoutes);
app.use('/api/edit', editRoutes);
app.use('/api/analyze-clip-unified', unifiedAnalysisRoutes);
app.use('/api', musicRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`\n🎬 Video Pipeline running at http://localhost:${PORT}\n`);
});
