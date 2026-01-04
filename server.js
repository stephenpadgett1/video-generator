const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '200mb' }));  // Large limit for base64 videos
app.use(express.static('public'));

// Config storage (simple file-based for now)
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const PROJECTS_PATH = path.join(__dirname, 'data', 'projects');

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

// ============ ElevenLabs Proxy ============

app.get('/api/elevenlabs/voices', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }

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
    res.json(data);
  } catch (err) {
    console.error('ElevenLabs voices error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/elevenlabs/tts', async (req, res) => {
  const config = loadConfig();
  if (!config.elevenLabsKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }

  const { voiceId, text, voiceSettings } = req.body;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: voiceSettings || {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const audioBuffer = await response.arrayBuffer();
    
    // Save to temp file and return path
    const filename = `vo_${Date.now()}.mp3`;
    const filepath = path.join(__dirname, 'data', 'audio', filename);
    
    if (!fs.existsSync(path.join(__dirname, 'data', 'audio'))) {
      fs.mkdirSync(path.join(__dirname, 'data', 'audio'));
    }
    
    fs.writeFileSync(filepath, Buffer.from(audioBuffer));
    
    res.json({ 
      success: true, 
      filename,
      path: `/audio/${filename}`
    });
  } catch (err) {
    console.error('ElevenLabs TTS error:', err);
    res.status(500).json({ error: err.message });
  }
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

const { execSync } = require('child_process');

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
        model: 'claude-sonnet-4-20250514',
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
        model: 'claude-sonnet-4-20250514',
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
      maxOutputTokens: 1024  // Gemini 2.5 Flash uses thinking tokens that count against this limit
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
        model: 'claude-sonnet-4-20250514',
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
        maxOutputTokens: 1024
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

// ============ Video Assembly ============

app.post('/api/assemble', async (req, res) => {
  const { shots, outputFilename } = req.body;
  
  // shots should be array of: { videoPath, voPath?, trimStart?, trimEnd? }
  
  if (!shots || shots.length === 0) {
    return res.status(400).json({ error: 'No shots provided' });
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
    
    // Create concat file for ffmpeg
    const concatFilePath = path.join(tempDir, 'concat.txt');
    const concatLines = [];
    
    // Process each shot - normalize to same format and mix in VO if present
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const videoFullPath = path.join(__dirname, 'data', shot.videoPath.replace(/^\//, ''));
      
      if (!fs.existsSync(videoFullPath)) {
        throw new Error(`Video not found: ${shot.videoPath}`);
      }
      
      const normalizedPath = path.join(tempDir, `shot_${i}.mp4`);
      
      // Check if we have a VO to mix in
      let hasVo = false;
      let voFullPath = '';
      if (shot.voPath) {
        voFullPath = path.join(__dirname, 'data', shot.voPath.replace(/^\//, ''));
        hasVo = fs.existsSync(voFullPath);
        if (!hasVo) {
          console.log(`VO not found, skipping: ${shot.voPath}`);
        }
      }
      
      let ffmpegCmd;
      
      if (hasVo) {
        // Mix video with VO audio
        // Use the video's audio (if any) at lower volume and overlay VO
        ffmpegCmd = `ffmpeg -y -i "${videoFullPath}" -i "${voFullPath}"`;
        
        // Add trim if specified
        if (shot.trimStart) {
          ffmpegCmd += ` -ss ${shot.trimStart}`;
        }
        if (shot.trimEnd) {
          ffmpegCmd += ` -to ${shot.trimEnd}`;
        }
        
        // Video filter: normalize to 1080x1920, 30fps
        ffmpegCmd += ` -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30"`;
        
        // Audio filter: mix original audio (reduced volume) with VO
        // [0:a] is video's audio, [1:a] is VO
        // Reduce video audio to 20%, keep VO at 100%
        ffmpegCmd += ` -filter_complex "[0:a]volume=0.2[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]"`;
        
        ffmpegCmd += ` -c:v libx264 -preset fast -crf 23`;
        ffmpegCmd += ` -c:a aac -ar 44100 -ac 2`;
        ffmpegCmd += ` -pix_fmt yuv420p`;
        ffmpegCmd += ` -shortest`;  // End when shortest stream ends
        ffmpegCmd += ` "${normalizedPath}"`;
      } else {
        // No VO - just normalize the video
        ffmpegCmd = `ffmpeg -y -i "${videoFullPath}"`;
        
        if (shot.trimStart) {
          ffmpegCmd += ` -ss ${shot.trimStart}`;
        }
        if (shot.trimEnd) {
          ffmpegCmd += ` -to ${shot.trimEnd}`;
        }
        
        ffmpegCmd += ` -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30"`;
        ffmpegCmd += ` -c:v libx264 -preset fast -crf 23`;
        ffmpegCmd += ` -c:a aac -ar 44100 -ac 2`;
        ffmpegCmd += ` -pix_fmt yuv420p`;
        ffmpegCmd += ` "${normalizedPath}"`;
      }
      
      console.log(`Processing shot ${i}${hasVo ? ' (with VO)' : ''}:`, ffmpegCmd);
      execSync(ffmpegCmd, { stdio: 'pipe' });
      
      concatLines.push(`file '${normalizedPath.replace(/\\/g, '/')}'`);
    }
    
    // Write concat file
    fs.writeFileSync(concatFilePath, concatLines.join('\n'));
    
    // Concatenate all clips
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputPath}"`;
    console.log('Concatenating:', concatCmd);
    execSync(concatCmd, { stdio: 'pipe' });
    
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
  const { videoPath, timestamp = 0, saveToDisk = false } = req.body;

  try {
    const videoFullPath = path.join(__dirname, 'data', videoPath.replace(/^\//, ''));

    if (!fs.existsSync(videoFullPath)) {
      return res.status(404).json({ error: 'Video not found' });
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

// ============ Serve Frontend ============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎬 Video Pipeline running at http://localhost:${PORT}\n`);
});
