const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EDITS_DIR = path.join(__dirname, '..', 'data', 'edits');
const VIDEO_DIR = path.join(__dirname, '..', 'data', 'video');
const JOBS_FILE = path.join(__dirname, '..', 'jobs.json');

// Load jobs to look up video paths
function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function getJobById(jobId) {
  const jobs = loadJobs();
  return jobs.find(j => j.id === jobId);
}

function getVideoPath(jobId) {
  const job = getJobById(jobId);
  if (!job || !job.result?.filename) return null;
  return path.join(VIDEO_DIR, job.result.filename);
}

function getEditDir(jobId) {
  return path.join(EDITS_DIR, jobId);
}

function getManifestPath(jobId) {
  return path.join(getEditDir(jobId), 'manifest.json');
}

function loadManifest(jobId) {
  const manifestPath = getManifestPath(jobId);
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function saveManifest(jobId, manifest) {
  const manifestPath = getManifestPath(jobId);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function getNextVariationNumber(manifest) {
  if (!manifest.variations || manifest.variations.length === 0) return 1;
  const nums = manifest.variations.map(v => parseInt(v.id.replace('v', ''), 10));
  return Math.max(...nums) + 1;
}

function formatVariationId(num) {
  return 'v' + String(num).padStart(3, '0');
}

// Get video duration via ffprobe
function getVideoDuration(videoPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  return parseFloat(output.trim());
}

// POST /api/edit/start - Initialize edit folder for a job
router.post('/start', (req, res) => {
  const { job_id, project_id, shot_id, take_index, expected_dialogue } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }

  const editDir = getEditDir(job_id);
  const manifestPath = getManifestPath(job_id);

  // Check if already exists
  if (fs.existsSync(manifestPath)) {
    const manifest = loadManifest(job_id);
    return res.json({ message: 'Edit folder already exists', manifest });
  }

  // Get source video
  const sourcePath = getVideoPath(job_id);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: `Video not found for job ${job_id}` });
  }

  // Create edit directory
  fs.mkdirSync(editDir, { recursive: true });

  // Copy source (symlinks don't work well on Windows)
  const sourceInEdit = path.join(editDir, 'source.mp4');
  fs.copyFileSync(sourcePath, sourceInEdit);

  // Get duration
  const duration = getVideoDuration(sourcePath);

  // Create manifest
  const manifest = {
    job_id,
    source: {
      path: path.relative(editDir, sourcePath),
      duration
    },
    context: {
      project_id: project_id || null,
      shot_id: shot_id || null,
      take_index: take_index !== undefined ? take_index : null,
      expected_dialogue: expected_dialogue || null
    },
    analysis: null,
    variations: [],
    selected: null,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  saveManifest(job_id, manifest);

  res.json({ message: 'Edit folder created', path: editDir, manifest });
});

// POST /api/edit/trim - Create trimmed variation
router.post('/trim', (req, res) => {
  const { job_id, trim_start, trim_end, notes } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}. Call /api/edit/start first.` });
  }

  const editDir = getEditDir(job_id);
  const sourceFile = path.join(editDir, 'source.mp4');

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).json({ error: 'Source file not found in edit folder' });
  }

  // Determine trim values
  const start = trim_start || 0;
  const end = trim_end || manifest.source.duration;

  // Generate variation filename
  const num = getNextVariationNumber(manifest);
  const varId = formatVariationId(num);
  const filename = `${varId}_trim.mp4`;
  const outputPath = path.join(editDir, filename);

  try {
    // ffmpeg trim: -ss for start, -t for duration
    const duration = end - start;
    const cmd = `ffmpeg -y -ss ${start} -i "${sourceFile}" -t ${duration} -c copy "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });

    // Get actual output duration
    const actualDuration = getVideoDuration(outputPath);

    // Add to manifest
    const variation = {
      id: varId,
      filename,
      edits: {
        trim_start: start,
        trim_end: end
      },
      duration: actualDuration,
      created_at: new Date().toISOString(),
      created_by: 'api',
      notes: notes || `Trim ${start.toFixed(2)}s - ${end.toFixed(2)}s`
    };

    manifest.variations.push(variation);
    manifest.status = 'in_progress';
    saveManifest(job_id, manifest);

    res.json({ message: 'Trim variation created', variation, path: outputPath });

  } catch (err) {
    res.status(500).json({ error: `ffmpeg error: ${err.message}` });
  }
});

// POST /api/edit/speed - Create speed-adjusted variation
router.post('/speed', (req, res) => {
  const { job_id, base_variation, speed, notes } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }
  if (!speed || speed <= 0) {
    return res.status(400).json({ error: 'speed must be a positive number' });
  }

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}. Call /api/edit/start first.` });
  }

  const editDir = getEditDir(job_id);

  // Determine source file (base variation or source)
  let inputFile, baseEdits = {};
  if (base_variation) {
    const baseVar = manifest.variations.find(v => v.id === base_variation);
    if (!baseVar) {
      return res.status(404).json({ error: `Base variation ${base_variation} not found` });
    }
    inputFile = path.join(editDir, baseVar.filename);
    baseEdits = { ...baseVar.edits };
  } else {
    inputFile = path.join(editDir, 'source.mp4');
  }

  if (!fs.existsSync(inputFile)) {
    return res.status(404).json({ error: 'Input file not found' });
  }

  // Generate variation filename
  const num = getNextVariationNumber(manifest);
  const varId = formatVariationId(num);
  const speedLabel = speed.toFixed(1).replace('.', '');
  const suffix = base_variation ? `${base_variation.replace('v', '')}_speed${speedLabel}` : `speed${speedLabel}`;
  const filename = `${varId}_${suffix}.mp4`;
  const outputPath = path.join(editDir, filename);

  try {
    // ffmpeg speed change: setpts for video, atempo for audio
    // atempo only accepts 0.5-2.0, so we may need to chain
    let atempoFilter = '';
    let remaining = speed;
    const atempoChain = [];
    while (remaining > 2.0) {
      atempoChain.push('atempo=2.0');
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      atempoChain.push('atempo=0.5');
      remaining /= 0.5;
    }
    atempoChain.push(`atempo=${remaining}`);
    atempoFilter = atempoChain.join(',');

    const cmd = `ffmpeg -y -i "${inputFile}" -filter:v "setpts=${1/speed}*PTS" -filter:a "${atempoFilter}" "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });

    // Get actual output duration
    const actualDuration = getVideoDuration(outputPath);

    // Add to manifest
    const variation = {
      id: varId,
      filename,
      edits: {
        ...baseEdits,
        speed
      },
      base_variation: base_variation || null,
      duration: actualDuration,
      created_at: new Date().toISOString(),
      created_by: 'api',
      notes: notes || `Speed ${speed}x${base_variation ? ` on ${base_variation}` : ''}`
    };

    manifest.variations.push(variation);
    manifest.status = 'in_progress';
    saveManifest(job_id, manifest);

    res.json({ message: 'Speed variation created', variation, path: outputPath });

  } catch (err) {
    res.status(500).json({ error: `ffmpeg error: ${err.message}` });
  }
});

// POST /api/edit/select - Mark a variation as selected
router.post('/select', (req, res) => {
  const { job_id, variation_id } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }
  if (!variation_id) {
    return res.status(400).json({ error: 'variation_id is required' });
  }

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}` });
  }

  const variation = manifest.variations.find(v => v.id === variation_id);
  if (!variation) {
    return res.status(404).json({ error: `Variation ${variation_id} not found` });
  }

  manifest.selected = variation_id;
  manifest.status = 'approved';
  manifest.selected_at = new Date().toISOString();
  saveManifest(job_id, manifest);

  res.json({ message: 'Variation selected', selected: variation_id, manifest });
});

// POST /api/edit/analysis - Store analysis results from cut-point-analyzer
router.post('/analysis', (req, res) => {
  const { job_id, analysis } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}. Call /api/edit/start first.` });
  }

  manifest.analysis = {
    ...analysis,
    analyzed_at: new Date().toISOString()
  };
  saveManifest(job_id, manifest);

  res.json({ message: 'Analysis stored', manifest });
});

// GET /api/edit/:job_id - Get manifest for a job
router.get('/:job_id', (req, res) => {
  const { job_id } = req.params;

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}` });
  }

  res.json(manifest);
});

// GET /api/edit/:job_id/video/:variation_id - Get path to variation video
router.get('/:job_id/video/:variation_id', (req, res) => {
  const { job_id, variation_id } = req.params;

  const manifest = loadManifest(job_id);
  if (!manifest) {
    return res.status(404).json({ error: `No edit folder for job ${job_id}` });
  }

  let videoPath;
  if (variation_id === 'source') {
    videoPath = path.join(getEditDir(job_id), 'source.mp4');
  } else {
    const variation = manifest.variations.find(v => v.id === variation_id);
    if (!variation) {
      return res.status(404).json({ error: `Variation ${variation_id} not found` });
    }
    videoPath = path.join(getEditDir(job_id), variation.filename);
  }

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  res.sendFile(videoPath);
});

// GET /api/edit - List all edit folders
router.get('/', (req, res) => {
  if (!fs.existsSync(EDITS_DIR)) {
    return res.json({ edits: [] });
  }

  const folders = fs.readdirSync(EDITS_DIR).filter(f => {
    const stat = fs.statSync(path.join(EDITS_DIR, f));
    return stat.isDirectory();
  });

  const edits = folders.map(jobId => {
    const manifest = loadManifest(jobId);
    return {
      job_id: jobId,
      status: manifest?.status || 'unknown',
      variations_count: manifest?.variations?.length || 0,
      selected: manifest?.selected || null
    };
  });

  res.json({ edits });
});

// POST /api/edit/auto-analyze - Run unified analysis and optionally apply suggestions
router.post('/auto-analyze', async (req, res) => {
  const { job_id, apply_suggestions = false, context = {} } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }

  const videoPath = getVideoPath(job_id);
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(404).json({ error: `Video not found for job ${job_id}` });
  }

  try {
    // Call unified analysis endpoint
    const analysisResponse = await fetch('http://localhost:3000/api/analyze-clip-unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath, context })
    });

    if (!analysisResponse.ok) {
      const err = await analysisResponse.text();
      return res.status(500).json({ error: `Analysis failed: ${err}` });
    }

    const analysis = await analysisResponse.json();

    // Ensure edit folder exists
    const editDir = getEditDir(job_id);
    if (!fs.existsSync(path.join(editDir, 'manifest.json'))) {
      // Initialize edit folder
      fs.mkdirSync(editDir, { recursive: true });
      const sourceInEdit = path.join(editDir, 'source.mp4');
      fs.copyFileSync(videoPath, sourceInEdit);

      const manifest = {
        job_id,
        source: {
          path: path.relative(editDir, videoPath),
          duration: analysis.clip_duration
        },
        context: context || {},
        analysis: null,
        variations: [],
        selected: null,
        status: 'pending',
        created_at: new Date().toISOString()
      };
      fs.writeFileSync(path.join(editDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }

    // Store analysis in manifest
    const manifest = loadManifest(job_id);
    manifest.analysis = {
      unified: analysis,
      analyzed_at: new Date().toISOString()
    };
    saveManifest(job_id, manifest);

    // Apply suggestions if requested
    let appliedVariation = null;
    if (apply_suggestions && analysis.summary.trim_recommendation) {
      const trim = analysis.summary.trim_recommendation;

      // Create trim variation
      const sourceFile = path.join(editDir, 'source.mp4');
      const start = trim.trim_start || 0;
      const end = trim.trim_end || manifest.source.duration;
      const duration = end - start;

      const num = manifest.variations.length + 1;
      const varId = 'v' + String(num).padStart(3, '0');
      const filename = `${varId}_trim.mp4`;
      const outputPath = path.join(editDir, filename);

      const cmd = `ffmpeg -y -ss ${start} -i "${sourceFile}" -t ${duration} -c copy "${outputPath}"`;
      execSync(cmd, { stdio: 'pipe' });

      // Get actual duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputPath}"`;
      const actualDuration = parseFloat(execSync(durationCmd, { encoding: 'utf8' }).trim());

      appliedVariation = {
        id: varId,
        filename,
        edits: {
          trim_start: start,
          trim_end: end
        },
        duration: actualDuration,
        created_at: new Date().toISOString(),
        created_by: 'auto-analyze',
        notes: `Auto-trim: ${analysis.summary.trim_recommendation.based_on.join('+')} analysis`
      };

      manifest.variations.push(appliedVariation);
      manifest.selected = varId;
      manifest.status = 'approved';
      manifest.selected_at = new Date().toISOString();
      saveManifest(job_id, manifest);
    }

    res.json({
      analysis,
      manifest: loadManifest(job_id),
      applied_variation: appliedVariation
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function for assembly to get selected video path
function getSelectedVideoPath(jobId) {
  const manifest = loadManifest(jobId);
  if (!manifest || !manifest.selected) {
    return null;
  }

  const variation = manifest.variations.find(v => v.id === manifest.selected);
  if (!variation) {
    return null;
  }

  return path.join(getEditDir(jobId), variation.filename);
}

// Export for use in assembly
router.getSelectedVideoPath = getSelectedVideoPath;
router.loadManifest = loadManifest;

module.exports = router;
