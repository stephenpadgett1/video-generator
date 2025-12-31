#!/usr/bin/env node

/**
 * Video Clip Analyzer
 * Processes all video files in a directory using Gemini 2.5 Pro
 * Writes to manifest incrementally and stops on first error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration - edit these or pass as environment variables
const CONFIG = {
  projectId: process.env.GOOGLE_PROJECT_ID || '',
  inputDir: process.env.INPUT_DIR || '',
  outputFile: process.env.OUTPUT_FILE || '',
  model: 'gemini-2.5-pro',
  region: 'us-central1',
  // Supported video extensions
  videoExtensions: ['.mp4', '.mov', '.webm', '.avi', '.mkv'],
  // Skip N entries (use to resume after a failure)
  skip: parseInt(process.env.SKIP || '0', 10),
  // Stop on error (default true)
  //stopOnError: process.env.STOP_ON_ERROR !== 'false'
  stopOnError: false
};

// Token management with auto-refresh
let accessToken = null;
let tokenFetchedAt = 0;
const TOKEN_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes (more conservative)

// Get access token via gcloud, refreshing if needed
function getAccessToken() {
  const now = Date.now();
  if (!accessToken || (now - tokenFetchedAt) > TOKEN_REFRESH_INTERVAL) {
    try {
      accessToken = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
      tokenFetchedAt = now;
      console.log('    [Access token refreshed]');
    } catch (err) {
      console.error('Failed to get access token. Make sure gcloud is configured:');
      console.error('  gcloud auth application-default login');
      throw new Error('Authentication failed');
    }
  }
  return accessToken;
}

// Get video duration using ffprobe
function getVideoDuration(filePath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(result);
  } catch (err) {
    console.warn(`Could not get duration for ${filePath}`);
    return null;
  }
}

// Get video dimensions using ffprobe
function getVideoDimensions(filePath) {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    const [width, height] = result.split(',').map(Number);
    return { width, height, aspectRatio: `${width}:${height}` };
  } catch (err) {
    console.warn(`Could not get dimensions for ${filePath}`);
    return null;
  }
}

// Analyze video with Gemini
async function analyzeVideo(filePath, accessToken, originalPrompt = null) {
  const videoBuffer = fs.readFileSync(filePath);
  const videoBase64 = videoBuffer.toString('base64');
  
  const mimeType = filePath.endsWith('.webm') ? 'video/webm' : 
                   filePath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

  let analysisPrompt = `Analyze this video clip for use in an editing database. Be specific and concise.
${originalPrompt ? `\nORIGINAL PROMPT USED TO GENERATE THIS CLIP:\n"${originalPrompt}"\n` : ''}

Provide a JSON response with these fields:
{
  "description": "2-3 sentence description of what happens in the video",
  "subjects": ["list", "of", "main", "subjects", "or", "objects"],
  "setting": "brief description of location/environment",
  "mood": "emotional tone or atmosphere",
  "visualStyle": "lighting, color palette, visual aesthetic",
  "dominantColors": ["color1", "color2", "color3"],
  "cameraWork": "camera movement, angles, framing",
  "audio": {
    "hasSpeech": true/false,
    "speechTranscript": "transcription if speech present, null otherwise",
    "hasMusic": true/false,
    "musicDescription": "description if music present, null otherwise",
    "ambientSounds": "description of background/ambient audio"
  },
  "motionIntensity": "low/medium/high - how much movement/action",
  "usableSegments": [
    {
      "startSeconds": 0.0,
      "endSeconds": 3.5,
      "quality": "good/fair/poor",
      "notes": "description of any issues or why this segment is usable"
    }
  ],
  "startsClean": true/false,
  "endsClean": true/false,
  "hasTextOrGraphics": true/false,
  "textOrGraphicsNotes": "description of any burned-in text, logos, UI elements, or null if none",
  "discontinuities": [
    {
      "atSeconds": 4.2,
      "type": "jump cut/scene change/artifact/flicker",
      "description": "brief description of the discontinuity"
    }
  ],
  "technicalNotes": "any artifacts, quality issues, or editing considerations",
  "suggestedTags": ["useful", "tags", "for", "searching"],
  "promptMatch": "If original prompt provided: how well does the video match it? Note discrepancies. If no prompt provided: null"
}

IMPORTANT: Watch carefully for discontinuities, jumps, or quality changes throughout the clip. Many AI-generated clips have issues partway through. Timestamp all usable segments and all problem areas.

Respond ONLY with valid JSON, no markdown formatting.`;

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType,
            data: videoBase64
          }
        },
        { text: analysisPrompt }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  };

  const response = await fetch(
    `https://${CONFIG.region}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.region}/publishers/google/models/${CONFIG.model}:generateContent`,
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
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Parse JSON from response (handle potential markdown wrapping)
  let analysis;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseErr) {
    console.warn('Could not parse JSON response, using raw text');
    analysis = { rawDescription: text };
  }

  return analysis;
}

// Load original prompts if available
function loadOriginalPrompts(inputPath) {
  const promptsFile = path.join(inputPath, 'prompts.json');
  if (fs.existsSync(promptsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
      console.log(`Loaded original prompts from prompts.json`);
      return data;
    } catch (err) {
      console.warn(`Could not parse prompts.json: ${err.message}`);
    }
  }
  
  console.log('No prompts.json found. Will check for individual .txt sidecar files.');
  return null;
}

// Get original prompt for a specific file
function getOriginalPrompt(filename, promptsMap, inputPath) {
  const basename = path.basename(filename, path.extname(filename));
  
  if (promptsMap) {
    if (promptsMap[filename]) return promptsMap[filename];
    if (promptsMap[basename]) return promptsMap[basename];
  }
  
  const sidecarPath = path.join(inputPath, `${basename}.txt`);
  if (fs.existsSync(sidecarPath)) {
    return fs.readFileSync(sidecarPath, 'utf8').trim();
  }
  
  return null;
}

// Load existing manifest or create new one
function loadOrCreateManifest(outputFile, totalFiles) {
  if (fs.existsSync(outputFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      console.log(`Loaded existing manifest with ${existing.clips.length} clips`);
      return existing;
    } catch (err) {
      console.warn(`Could not parse existing manifest, creating new one`);
    }
  }
  
  return {
    generatedAt: new Date().toISOString(),
    model: CONFIG.model,
    totalClips: totalFiles,
    clips: []
  };
}

// Save manifest to disk
function saveManifest(manifest, outputFile) {
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
}

// Get set of already processed filenames from manifest
function getProcessedFilenames(manifest) {
  return new Set(manifest.clips.map(c => c.filename));
}

// Process all videos in directory
async function processDirectory() {
  console.log('Video Clip Analyzer');
  console.log('===================\n');
  
  // Verify auth works before starting
  console.log('Verifying authentication...');
  getAccessToken();
  console.log('Authenticated.\n');

  // Find all video files
  const inputPath = path.resolve(CONFIG.inputDir);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input directory not found: ${inputPath}`);
    process.exit(1);
  }

  // Load original prompts
  const promptsMap = loadOriginalPrompts(inputPath);

  // Get all video files
  let files = fs.readdirSync(inputPath)
    .filter(f => CONFIG.videoExtensions.includes(path.extname(f).toLowerCase()))
    .sort();

  console.log(`Found ${files.length} video files in ${inputPath}`);

  // Load or create manifest
  const outputFile = path.resolve(CONFIG.outputFile);
  const manifest = loadOrCreateManifest(outputFile, files.length);
  const alreadyProcessed = getProcessedFilenames(manifest);
  
  // Filter out already processed files
  const remainingFiles = files.filter(f => !alreadyProcessed.has(f));
  console.log(`Already processed: ${alreadyProcessed.size} clips`);
  console.log(`Remaining to process: ${remainingFiles.length} clips`);

  // Apply skip if specified
  let filesToProcess = remainingFiles;
  if (CONFIG.skip > 0) {
    filesToProcess = remainingFiles.slice(CONFIG.skip);
    console.log(`Skipping first ${CONFIG.skip} remaining clips`);
  }

  console.log(`Will process: ${filesToProcess.length} clips\n`);

  if (filesToProcess.length === 0) {
    console.log('Nothing to process. All done!');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  // Process each file
  for (let i = 0; i < filesToProcess.length; i++) {
    const filename = filesToProcess[i];
    const filePath = path.join(inputPath, filename);
    const globalIndex = files.indexOf(filename) + 1;
    
    console.log(`[${globalIndex}/${files.length}] Processing: ${filename}`);
    
    try {
      // Get technical metadata
      const duration = getVideoDuration(filePath);
      const dimensions = getVideoDimensions(filePath);
      const fileSizeBytes = fs.statSync(filePath).size;
      
      // Get original prompt if available
      const originalPrompt = getOriginalPrompt(filename, promptsMap, inputPath);
      if (originalPrompt) {
        console.log(`    Original prompt found`);
      }
      
      // Analyze with Gemini (gets fresh token if needed)
      const analysis = await analyzeVideo(filePath, getAccessToken(), originalPrompt);
      
      // Combine metadata
      const clipMetadata = {
        filename,
        filePath: path.relative(process.cwd(), filePath),
        originalPrompt: originalPrompt || null,
        technical: {
          durationSeconds: duration,
          ...dimensions,
          fileSizeBytes,
          fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2)
        },
        analysis,
        analyzedAt: new Date().toISOString()
      };
      
      // Add to manifest and save immediately
      manifest.clips.push(clipMetadata);
      manifest.totalClips = files.length;
      saveManifest(manifest, outputFile);
      
      successCount++;
      console.log(`    ✓ Saved (${manifest.clips.length} total)`);
      console.log(`    Duration: ${duration?.toFixed(2)}s | ${dimensions?.aspectRatio || 'unknown'}`);
      console.log(`    Mood: ${analysis.mood || 'unknown'} | Motion: ${analysis.motionIntensity || 'unknown'}\n`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      errorCount++;
      console.error(`    ✗ Error: ${err.message}`);
      console.error(`    Processed ${successCount} clips before error.\n`);
      
      if (CONFIG.stopOnError) {
        console.log(`\nStopping due to error. To resume, run with:`);
        console.log(`  SKIP=0 node analyze-clips.js`);
        console.log(`(The script will automatically skip already-processed clips)\n`);
        
        // Save manifest before exiting
        saveManifest(manifest, outputFile);
        console.log(`Manifest saved with ${manifest.clips.length} clips.`);
        process.exit(1);
      }
    }
  }

  console.log(`\n===================`);
  console.log(`Processing complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total in manifest: ${manifest.clips.length}`);
  console.log(`Manifest saved: ${outputFile}`);
}

// Run
processDirectory().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
