#!/usr/bin/env node
/**
 * nano-banana.cjs — Generate images via Vertex AI Gemini 3 Pro Image (a.k.a. Nano Banana Pro)
 * with optional reference images for style anchoring.
 *
 * The existing MCP `generate_image` wrapper is text-only for Gemini models; this tool exposes
 * the full multimodal input, which we need for visual-style continuity across scenes.
 *
 * Auth
 *   Uses the same service account key as the MCP server (path configured at
 *   data/config.json → veoServiceAccountPath). JWT signing uses node:crypto — no npm deps.
 *
 * Usage
 *   node tools/nano-banana.cjs --prompt="..." [flags]
 *
 * Flags
 *   --prompt=TEXT            Prompt text.
 *   --prompt-file=PATH       Read prompt from a file (alternative to --prompt).
 *   --ref=PATH               Reference image. Repeat for multiple references.
 *   --aspect=W:H             Aspect ratio (default 9:16). Supports 1:1, 9:16, 16:9, 3:4, 4:3, etc.
 *   --model=pro|flash        nano-banana-pro (default) or nano-banana-flash.
 *   --output=PATH            Output path (default: generated-images/nb_<timestamp>.png).
 *   --service-account=PATH   Override service account JSON path.
 *   --temperature=N          Sampling temperature (default 1.0).
 *   --json                   Emit JSON to stdout with {path, model, ...}; still writes the PNG.
 *
 * Examples
 *   # Text-only
 *   node tools/nano-banana.cjs --prompt="A quiet backstage corridor..."
 *
 *   # With style-anchor reference images
 *   node tools/nano-banana.cjs \
 *     --prompt="..." \
 *     --ref=data/workspace/banner_janitor_intro_4s.png \
 *     --ref=/tmp/producer_frame.png \
 *     --output=data/workspace/scene3_plate.png
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// -------- arg parsing --------

function parseArgs(argv) {
  const flags = {};
  const refs = [];
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
    const val = eq > 0 ? a.slice(eq + 1) : true;
    if (key === 'ref') refs.push(val);
    else flags[key] = val;
  }
  flags.ref = refs;
  return flags;
}

// -------- auth: JWT → access token --------

function base64UrlEncode(input) {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signRS256(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(serviceAccountPath) {
  const raw = fs.readFileSync(serviceAccountPath, 'utf-8');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const jwt = signRS256(
    {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    },
    sa.private_key
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { accessToken: data.access_token, projectId: sa.project_id };
}

// -------- model selection & URL --------

const MODELS = {
  pro: 'gemini-3-pro-image-preview', // global endpoint, 4K, reasoning
  flash: 'gemini-2.5-flash-image', // regional, fast, 1024px
};

function buildUrl(projectId, model) {
  const location = model === MODELS.pro ? 'global' : 'us-central1';
  const host =
    location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

// -------- request construction --------

function mimeTypeFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function buildRequest(promptText, refPaths, aspect, temperature) {
  const parts = [];
  for (const rp of refPaths) {
    const data = fs.readFileSync(rp).toString('base64');
    parts.push({ inlineData: { mimeType: mimeTypeFor(rp), data } });
  }
  parts.push({ text: promptText });
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature,
      imageConfig: { aspectRatio: aspect },
    },
  };
}

// -------- main --------

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  let prompt = flags.prompt;
  if (flags['prompt-file']) prompt = fs.readFileSync(flags['prompt-file'], 'utf-8');
  if (!prompt) {
    console.error('Error: --prompt or --prompt-file is required');
    process.exit(2);
  }

  const modelKey = (flags.model || 'pro').toLowerCase();
  const model = MODELS[modelKey];
  if (!model) {
    console.error(`Error: --model must be 'pro' or 'flash' (got ${flags.model})`);
    process.exit(2);
  }

  const aspect = flags.aspect || '9:16';
  const temperature = flags.temperature ? parseFloat(flags.temperature) : 1.0;
  const refs = flags.ref || [];
  for (const r of refs) {
    if (!fs.existsSync(r)) {
      console.error(`Error: reference image not found: ${r}`);
      process.exit(2);
    }
  }

  // Resolve service account
  let saPath = flags['service-account'];
  if (!saPath) {
    const configPath = path.join(process.cwd(), 'data', 'config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      saPath = cfg.veoServiceAccountPath;
    }
  }
  if (!saPath) {
    console.error('Error: no service account. Set --service-account=PATH or configure veoServiceAccountPath in data/config.json');
    process.exit(2);
  }
  // Resolve relative path
  if (!path.isAbsolute(saPath)) saPath = path.resolve(process.cwd(), saPath);
  if (!fs.existsSync(saPath)) {
    console.error(`Error: service account file not found: ${saPath}`);
    process.exit(2);
  }

  const output =
    flags.output || path.join('generated-images', `nb_${Date.now()}.png`);
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  process.stderr.write(
    `[nano-banana] model=${model} aspect=${aspect} refs=${refs.length} → ${output}\n`
  );

  const { accessToken, projectId } = await getAccessToken(saPath);
  const url = buildUrl(projectId, model);
  const body = buildRequest(prompt, refs, aspect, temperature);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${model}): ${res.status} ${errText}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text);
  if (!imagePart) {
    throw new Error(`No image in ${model} response. Text returned: ${textPart?.text || '(none)'}`);
  }

  fs.writeFileSync(output, Buffer.from(imagePart.inlineData.data, 'base64'));

  const result = {
    path: output,
    model,
    aspect,
    refs,
    text_response: textPart?.text || null,
  };
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`✓ wrote ${output}`);
    if (textPart?.text) console.log(`\nmodel notes:\n${textPart.text}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
