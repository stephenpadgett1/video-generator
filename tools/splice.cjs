#!/usr/bin/env node
/**
 * splice.cjs — Find and execute seamless joins between two video clips.
 *
 * Terminology
 *   "splice" — the cut point where clip A ends and clip B begins, ideally imperceptible.
 *   cut_a    — last visible timestamp in A (seconds).
 *   cut_b    — first visible timestamp in B (seconds).
 *   xfade    — crossfade duration in seconds (0 = hard cut).
 *
 * Usage
 *   node tools/splice.cjs analyze <A> <B> [--zone=1.5] [--step=0.1] [--top=5] [--json-out=path]
 *   node tools/splice.cjs render  <A> <B> <out> [--cut-a=T] [--cut-b=T] [--xfade=D] [--mode=auto|hard|xfade]
 *                                             [--from-analyze=path] [--crf=18] [--preset=fast]
 *
 * Notes
 *   - Sample cadence: zone = seconds scanned from A tail / B head; step = seconds between samples.
 *   - analyze runs ffprobe + many ffmpeg PSNR calls; a 1.5s zone at 0.1s step ≈ 225 pairs ≈ 20–30s wall time.
 *   - render re-encodes both inputs. Match input fps/resolution beforehand or results may stutter.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- arg parsing ----------

function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ---------- ffprobe / ffmpeg helpers ----------

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function shQuiet(cmd) {
  const r = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function probeDuration(p) {
  return parseFloat(sh(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${p}"`).trim());
}

function probeFps(p) {
  const r = sh(`ffprobe -v error -select_streams v -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "${p}"`).trim();
  const [n, d] = r.split('/').map(Number);
  return n / (d || 1);
}

function probeResolution(p) {
  const r = sh(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "${p}"`).trim();
  const [w, h] = r.split('x').map(Number);
  return { w, h };
}

function hasAudio(p) {
  const r = sh(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${p}"`).trim();
  return r.length > 0;
}

function extractFrame(video, t, outPath) {
  // -ss before -i seeks fast; accurate enough when combined with -frames:v 1 after re-decode via -copyts? We accept keyframe-adjacent approximation; scanning step (0.1s) is larger than any resulting jitter.
  execSync(`ffmpeg -v error -ss ${t} -i "${video}" -frames:v 1 -f image2 -q:v 2 "${outPath}" -y`);
}

function psnr(img1, img2) {
  const combined = execSync(`ffmpeg -hide_banner -i "${img1}" -i "${img2}" -filter_complex psnr -f null /dev/null 2>&1 || true`).toString();
  const m = combined.match(/average:([0-9.]+|inf)/);
  if (!m) return null;
  return m[1] === 'inf' ? 100 : parseFloat(m[1]);
}

// ---------- analyze ----------

function range(start, end, step) {
  const out = [];
  for (let t = start; t <= end + 1e-9; t += step) out.push(+t.toFixed(3));
  return out;
}

function detectAlign(clipA, clipB, cutA, cutB) {
  const py = path.join(__dirname, 'splice_align.py');
  // Prefer a positive seek to A's cutA (more reliable than -sseof, which fails on some
  // encodings). Clamp slightly inside the clip to avoid decoder edge issues.
  const durA = probeDuration(clipA);
  let aTime;
  if (typeof cutA === 'number' && cutA > 0) {
    aTime = Math.max(0, Math.min(cutA, Math.max(0, durA - 0.05)));
  } else {
    aTime = Math.max(0, durA - 0.05);
  }
  const args = ['detect-clips', clipA, clipB, `--a-time=${aTime}`, `--b-time=${cutB}`];
  const out = execSync(`python3 "${py}" ${args.map((a) => `"${a}"`).join(' ')}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return JSON.parse(out);
}

function sweepAlign(bFramePath, aFramePaths) {
  const py = path.join(__dirname, 'splice_align.py');
  const quoted = [bFramePath, ...aFramePaths].map((a) => `"${a}"`).join(' ');
  const out = execSync(`python3 "${py}" sweep ${quoted}`, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }).toString();
  return JSON.parse(out);
}

function trimAScan(clipA, clipB, cutB, opts) {
  const durA = probeDuration(clipA);
  const step = parseFloat(opts['trim-a-step'] || '0.5');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'splice-trim-'));
  try {
    // Sample A across its full duration (skip the very last 0.05s to avoid decoder tail issues).
    const aTimes = range(0, durA - 0.05, step);
    process.stderr.write(`[splice] trim-a: sampling ${aTimes.length} frames across full A (0–${(durA - 0.05).toFixed(2)}s)\n`);
    const aFrames = aTimes.map((t, i) => {
      const p = path.join(tmp, `a_${i}.png`);
      extractFrame(clipA, t, p);
      return { t, path: p };
    });
    const bFramePath = path.join(tmp, 'b.png');
    extractFrame(clipB, cutB, bFramePath);

    process.stderr.write(`[splice] trim-a: running alignment sweep (≈${(aFrames.length * 1.5).toFixed(0)}s)\n`);
    const sweepResults = sweepAlign(bFramePath, aFrames.map((f) => f.path));

    // Adjacent-frame motion on A samples, for plateau bonus.
    const adjA = [];
    for (let i = 1; i < aFrames.length; i++) {
      adjA.push(psnr(aFrames[i - 1].path, aFrames[i].path));
    }
    const localMotion = (i) => {
      const nb = [];
      if (i > 0) nb.push(adjA[i - 1]);
      if (i < aFrames.length - 1) nb.push(adjA[i]);
      if (!nb.length) return 50;
      return nb.reduce((s, p) => s + Math.max(0, 100 - (p ?? 0)), 0) / nb.length;
    };

    const candidates = sweepResults.map((r, i) => {
      const c = {
        cut_a: aFrames[i].t,
        cut_b: cutB,
        scale: r.scale,
        dx: r.dx,
        dy: r.dy,
        psnr: r.psnr,
        motion_a: +localMotion(i).toFixed(2),
      };
      // Score: reward geometric naturalness (scale≈1, no translation) + content match (psnr) + low motion at cut.
      const scaleCost = Math.min(1, Math.abs(c.scale - 1) * 20); // |Δs|=0.05 → cost 1
      const transCost = Math.min(1, (Math.abs(c.dx) + Math.abs(c.dy)) / 40); // 40px → cost 1
      const psnrScore = Math.max(0, Math.min(1, (c.psnr - 15) / 15)); // 15→0, 30→1
      const motionScore = 1 - Math.min(1, c.motion_a / 30); // low motion → closer to 1
      c.score = +(0.45 * (1 - scaleCost) + 0.15 * (1 - transCost) + 0.25 * psnrScore + 0.15 * motionScore).toFixed(3);
      return c;
    });
    candidates.sort((x, y) => y.score - x.score);
    return candidates;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function analyze(clipA, clipB, opts) {
  const zone = parseFloat(opts.zone || '1.5');
  const step = parseFloat(opts.step || '0.1');
  const topN = parseInt(opts.top || '5', 10);
  const doAlign = opts.align === true || opts.align === 'true';
  const doTrimA = opts['trim-a'] === true || opts['trim-a'] === 'true';

  const durA = probeDuration(clipA);
  const durB = probeDuration(clipB);
  const fpsA = probeFps(clipA);
  const fpsB = probeFps(clipB);
  const resA = probeResolution(clipA);
  const resB = probeResolution(clipB);

  const warnings = [];
  if (Math.abs(fpsA - fpsB) > 0.01) warnings.push(`fps mismatch: A=${fpsA} B=${fpsB}`);
  if (resA.w !== resB.w || resA.h !== resB.h) warnings.push(`resolution mismatch: A=${resA.w}x${resA.h} B=${resB.w}x${resB.h}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'splice-'));
  try {
    const aTimes = range(Math.max(0, durA - zone), durA - 0.05, step);
    const bTimes = range(0, Math.min(durB - 0.05, zone), step);

    process.stderr.write(`[splice] sampling ${aTimes.length} frames from A tail, ${bTimes.length} from B head\n`);
    const aFrames = aTimes.map((t, i) => {
      const p = path.join(tmp, `a_${i}.png`);
      extractFrame(clipA, t, p);
      return { t, path: p };
    });
    const bFrames = bTimes.map((t, i) => {
      const p = path.join(tmp, `b_${i}.png`);
      extractFrame(clipB, t, p);
      return { t, path: p };
    });

    // Pre-compute adjacent-frame PSNRs once; use for both per-side motion avg and per-frame local motion.
    const adjPsnr = (frames) => {
      const out = [];
      for (let i = 1; i < frames.length; i++) {
        out.push(psnr(frames[i - 1].path, frames[i].path));
      }
      return out;
    };
    process.stderr.write(`[splice] computing adjacent motion (${aFrames.length + bFrames.length - 2} pairs)\n`);
    const adjA = adjPsnr(aFrames);
    const adjB = adjPsnr(bFrames);

    const meanMotion = (adj) => (adj.length ? adj.reduce((s, p) => s + Math.max(0, 100 - (p ?? 0)), 0) / adj.length : 0);
    const motionA = meanMotion(adjA);
    const motionB = meanMotion(adjB);

    const localMotion = (adj, i, n) => {
      const neighbors = [];
      if (i > 0) neighbors.push(adj[i - 1]);
      if (i < n - 1) neighbors.push(adj[i]);
      if (!neighbors.length) return 50;
      return neighbors.reduce((s, p) => s + Math.max(0, 100 - (p ?? 0)), 0) / neighbors.length;
    };

    process.stderr.write(`[splice] computing ${aFrames.length * bFrames.length} pairwise similarities\n`);
    const pairs = [];
    for (let i = 0; i < aFrames.length; i++) {
      for (let j = 0; j < bFrames.length; j++) {
        const p = psnr(aFrames[i].path, bFrames[j].path);
        pairs.push({
          cut_a: aFrames[i].t,
          cut_b: bFrames[j].t,
          psnr: p,
          motion_a: localMotion(adjA, i, aFrames.length),
          motion_b: localMotion(adjB, j, bFrames.length),
        });
      }
    }

    // Detect flat-PSNR case: the clips don't pixel-align anywhere (e.g. slightly different crops of
    // visually-similar content). When this happens, pairwise similarity carries no signal, so we fall
    // back to motion-only scoring and preserve as much clip length as possible.
    const psnrs = pairs.map((p) => p.psnr).filter((p) => p != null);
    const psnrMax = Math.max(...psnrs);
    const psnrMin = Math.min(...psnrs);
    const psnrFlat = psnrMax - psnrMin < 2.0; // less than 2 dB spread across all pairs

    // Score: normalized PSNR (0–40 → 0–1) with plateau bonus (low local motion on either side).
    // In flat-PSNR mode, weight plateau + length preference heavily since PSNR is noise.
    for (const p of pairs) {
      const psnrScore = Math.max(0, Math.min(1, (p.psnr - 15) / 25)); // 15→0, 40→1
      const plateauBonus = 1 - Math.min(1, (p.motion_a + p.motion_b) / 40); // 0 motion → +1, 20+ → 0
      // Length preservation: prefer late cut_a (finish A fully) and early cut_b (start B from top).
      const lengthBonus =
        (p.cut_a - (durA - zone)) / zone * 0.5 + (1 - p.cut_b / Math.max(zone, 0.01)) * 0.5;
      if (psnrFlat) {
        p.score = +(0.7 * plateauBonus + 0.3 * lengthBonus).toFixed(3);
      } else {
        p.score = +(0.6 * psnrScore + 0.25 * plateauBonus + 0.15 * lengthBonus).toFixed(3);
      }
    }
    pairs.sort((x, y) => y.score - x.score);
    const top = pairs.slice(0, topN);

    // Optional: detect geometric alignment between A's last frame and B's first frame.
    // When the recommended cut lands at the very end of A, detection is meaningful; if cut_a is
    // well inside A we'd need to extract that specific frame (TODO).
    let alignment = null;
    if (doAlign) {
      process.stderr.write(`[splice] detecting geometric alignment (scale + translation)\n`);
      try {
        alignment = detectAlign(clipA, clipB, pairs[0].cut_a, pairs[0].cut_b);
      } catch (e) {
        alignment = { error: String(e.message || e) };
      }
    }

    // Recommendation
    const best = top[0];
    let mode, xfade, rationale;
    if (psnrFlat) {
      mode = 'xfade';
      xfade = 0.2;
      rationale = `PSNR is flat across all candidate pairs (${psnrMin.toFixed(1)}–${psnrMax.toFixed(1)} dB) — the clips don't pixel-align. Using motion + length heuristics to pick the cut; ${xfade}s crossfade masks the residual shift. If the join is still visible, increase xfade or regenerate the clips with matching final/first frames.`;
    } else if (best.psnr >= 35) {
      mode = 'hard';
      xfade = 0;
      rationale = `Best pair PSNR ${best.psnr.toFixed(1)} exceeds hard-cut threshold (35). Hard cut recommended.`;
    } else if (best.psnr >= 25) {
      mode = 'xfade';
      const motionAvg = (best.motion_a + best.motion_b) / 2;
      xfade = motionAvg < 5 ? 0.25 : 0.15; // quieter = longer fade allowed
      rationale = `Best pair PSNR ${best.psnr.toFixed(1)} in crossfade range. ${motionAvg < 5 ? 'Static' : 'Active'} frames → ${xfade}s crossfade.`;
    } else {
      mode = 'xfade';
      xfade = 0.4;
      rationale = `Best pair PSNR ${best.psnr.toFixed(1)} is low; frames do not closely match. Longer crossfade (${xfade}s) used, but consider regenerating one of the clips.`;
    }

    // Optional trim-a: deep scan across the full A to find a point where B natively matches A.
    let trimACandidates = null;
    let trimARecommendation = null;
    if (doTrimA) {
      trimACandidates = trimAScan(clipA, clipB, best.cut_b, opts);
      // A splice needs at least xfade + ~0.1s of A ahead of the cut. Candidates where cut_a is
      // smaller than that aren't actionable — they'd leave no visible A. Pick the best candidate
      // that meets the minimum.
      const minCutA = 0.3;
      const viable = trimACandidates.filter((c) => c.cut_a >= minCutA);
      const tBest = viable[0] || trimACandidates[0];
      const nearIdentity = Math.abs(tBest.scale - 1) < 0.015 && Math.abs(tBest.dx) + Math.abs(tBest.dy) < 5;
      trimARecommendation = {
        mode: nearIdentity ? 'xfade' : 'xfade', // always use a brief xfade for safety
        cut_a: tBest.cut_a,
        cut_b: tBest.cut_b,
        xfade: nearIdentity ? 0.12 : 0.2,
        psnr: tBest.psnr,
        rationale: nearIdentity
          ? `Natural match point at t=${tBest.cut_a}s in A (scale=${tBest.scale}, translation=(${tBest.dx},${tBest.dy})) — no geometric warp needed. Short ${(nearIdentity ? 0.12 : 0.2)}s crossfade masks residual content differences. Output will be ${(+tBest.cut_a + (durB - tBest.cut_b)).toFixed(2)}s (A tail discarded).`
          : `Best trim point at t=${tBest.cut_a}s in A still requires scale=${tBest.scale}, translation=(${tBest.dx},${tBest.dy}) — not fully natural. Consider using --align on full A instead, or accept a small warp with short relaxation.`,
      };
      if (!nearIdentity) {
        trimARecommendation.scale_b = tBest.scale;
        trimARecommendation.dx_b = tBest.dx;
        trimARecommendation.dy_b = tBest.dy;
        trimARecommendation.relax = 0.6;
      }
    }

    // If alignment detected a meaningful geometric offset, upgrade the recommendation to include it.
    let recommendation = {
      mode,
      cut_a: best.cut_a,
      cut_b: best.cut_b,
      xfade: +xfade.toFixed(3),
      psnr: +best.psnr.toFixed(2),
      rationale,
    };
    // When both modes are available, default recommendation = trim-a if it found a natural match.
    if (trimARecommendation) {
      const tBest = trimACandidates[0];
      const nearIdentity = Math.abs(tBest.scale - 1) < 0.015 && Math.abs(tBest.dx) + Math.abs(tBest.dy) < 5;
      if (nearIdentity) {
        recommendation = trimARecommendation;
      }
    }
    if (alignment && !alignment.error) {
      const scaleOffset = Math.abs(alignment.scale - 1);
      const transOffset = Math.abs(alignment.dx) + Math.abs(alignment.dy);
      const hasGeometricOffset = scaleOffset > 0.01 || transOffset > 5;
      recommendation.alignment = alignment;
      if (hasGeometricOffset) {
        recommendation.scale_b = alignment.scale;
        recommendation.dx_b = alignment.dx;
        recommendation.dy_b = alignment.dy;
        recommendation.relax = 1.0;
        recommendation.rationale = `Geometric offset detected (scale=${alignment.scale}, dx=${alignment.dx}, dy=${alignment.dy}, match PSNR=${alignment.psnr}). Warp B's head to match A's geometry, then relax to native over ${recommendation.relax}s; crossfade ${recommendation.xfade}s. This eliminates the zoom/pan jump at the splice.`;
      } else {
        recommendation.rationale += ` Alignment check: no meaningful geometric offset (scale=${alignment.scale}, dx=${alignment.dx}, dy=${alignment.dy}).`;
      }
    }

    return {
      clipA: { path: clipA, duration: durA, fps: fpsA, resolution: resA },
      clipB: { path: clipB, duration: durB, fps: fpsB, resolution: resB },
      scan: { zone, step, a_samples: aFrames.length, b_samples: bFrames.length },
      motion: { a_tail_avg: +motionA.toFixed(2), b_head_avg: +motionB.toFixed(2) },
      psnr_spread: { min: +psnrMin.toFixed(2), max: +psnrMax.toFixed(2), flat: psnrFlat },
      top_candidates: top.map((p) => ({
        cut_a: p.cut_a,
        cut_b: p.cut_b,
        psnr: +p.psnr.toFixed(2),
        motion_a: +p.motion_a.toFixed(2),
        motion_b: +p.motion_b.toFixed(2),
        score: p.score,
      })),
      ...(trimACandidates ? { trim_a_candidates: trimACandidates.slice(0, topN), trim_a_recommendation: trimARecommendation } : {}),
      recommendation,
      warnings,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- render ----------

function render(clipA, clipB, outPath, opts) {
  let cutA, cutB, xfade, mode;
  let scaleB, dxB, dyB, relax;

  if (opts['from-analyze']) {
    const j = JSON.parse(fs.readFileSync(opts['from-analyze'], 'utf8'));
    cutA = j.recommendation.cut_a;
    cutB = j.recommendation.cut_b;
    xfade = j.recommendation.xfade;
    mode = j.recommendation.mode;
    if (j.recommendation.scale_b !== undefined) {
      scaleB = j.recommendation.scale_b;
      dxB = j.recommendation.dx_b || 0;
      dyB = j.recommendation.dy_b || 0;
      relax = j.recommendation.relax || 1.0;
    }
  }

  if (opts['cut-a'] !== undefined) cutA = parseFloat(opts['cut-a']);
  if (opts['cut-b'] !== undefined) cutB = parseFloat(opts['cut-b']);
  if (opts.xfade !== undefined) xfade = parseFloat(opts.xfade);
  if (opts.mode) mode = opts.mode;
  if (opts['scale-b'] !== undefined) scaleB = parseFloat(opts['scale-b']);
  if (opts['dx-b'] !== undefined) dxB = parseFloat(opts['dx-b']);
  if (opts['dy-b'] !== undefined) dyB = parseFloat(opts['dy-b']);
  if (opts.relax !== undefined) relax = parseFloat(opts.relax);

  // --align flag on render: auto-detect scale/translation.
  if ((opts.align === true || opts.align === 'true') && scaleB === undefined) {
    process.stderr.write('[splice] auto-detecting alignment\n');
    const alignment = detectAlign(clipA, clipB, cutA, cutB || 0);
    process.stderr.write(`[splice] alignment: scale=${alignment.scale} dx=${alignment.dx} dy=${alignment.dy} psnr=${alignment.psnr}\n`);
    scaleB = alignment.scale;
    dxB = alignment.dx;
    dyB = alignment.dy;
    if (relax === undefined) relax = 1.0;
  }

  const durA = probeDuration(clipA);
  const durB = probeDuration(clipB);
  if (cutA === undefined) cutA = durA;
  if (cutB === undefined) cutB = 0;
  if (xfade === undefined) xfade = 0;
  if (!mode || mode === 'auto') mode = xfade > 0 ? 'xfade' : 'hard';

  if (mode === 'hard') xfade = 0;
  if (xfade >= cutA) throw new Error(`xfade (${xfade}) must be less than cut_a (${cutA})`);
  if (cutA > durA) throw new Error(`cut_a (${cutA}) exceeds duration A (${durA})`);
  if (cutB > durB) throw new Error(`cut_b (${cutB}) exceeds duration B (${durB})`);

  const audioA = hasAudio(clipA);
  const audioB = hasAudio(clipB);
  const bothAudio = audioA && audioB;

  const crf = opts.crf || '18';
  const preset = opts.preset || 'fast';

  // Build B's video chain — trimmed, optionally geometrically warped during the relaxation window.
  const hasWarp = scaleB !== undefined && scaleB !== null && (Math.abs(scaleB - 1) > 0.001 || (dxB && dxB !== 0) || (dyB && dyB !== 0));

  // When warping, zoompan + xfade in one filter graph stalls (timebase interaction). Pre-render
  // the warped B to a temp file and splice that against A with a plain xfade.
  let bSource = clipB;
  let bStartOffset = cutB;
  let tmpWarpPath = null;
  if (hasWarp) {
    if (scaleB < 1) {
      throw new Error(`scale_b=${scaleB} < 1 (zoom-out) not supported yet — would require padding B`);
    }
    const relaxT = relax || 1.0;
    const k = `(1-min(1\\,it/${relaxT}))`;
    const p = `(1-${k}*${k})`;
    const zExpr = `(${scaleB}+(1-${scaleB})*${p})`;
    const xExpr = `(iw/2-iw/zoom/2+${dxB || 0}*(1-${p}))`;
    const yExpr = `(ih/2-ih/zoom/2+${dyB || 0}*(1-${p}))`;
    // Probe B's actual resolution and fps so the warped B matches A for xfade.
    const probeOut = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of json "${clipB}"`).toString();
    const probed = JSON.parse(probeOut).streams[0];
    const outW = probed.width;
    const outH = probed.height;
    const [fpsNum, fpsDen] = probed.r_frame_rate.split('/').map(Number);
    const outFps = Math.round(fpsNum / (fpsDen || 1));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splice-warp-'));
    tmpWarpPath = path.join(tmpDir, 'b_warped.mp4');

    const warpFilter = [
      `[0:v]trim=start=${cutB},setpts=PTS-STARTPTS[bt]`,
      `[bt]zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${outW}x${outH}:fps=${outFps}[bw]`,
    ];
    if (audioB) {
      warpFilter.push(`[0:a]atrim=start=${cutB},asetpts=PTS-STARTPTS[ba]`);
    }
    const warpArgs = [
      '-v', 'error', '-stats',
      '-i', clipB,
      '-filter_complex', warpFilter.join(';'),
      '-map', '[bw]',
      ...(audioB ? ['-map', '[ba]'] : []),
      '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p',
      ...(audioB ? ['-c:a', 'aac', '-b:a', '192k'] : []),
      '-y', tmpWarpPath,
    ];
    process.stderr.write(`[splice] pre-rendering warped B (scale=${scaleB}, relax=${relaxT}s) → ${tmpWarpPath}\n`);
    const wr = spawnSync('ffmpeg', warpArgs, { stdio: 'inherit' });
    if (wr.status !== 0) throw new Error(`warp pre-render failed (exit ${wr.status})`);

    bSource = tmpWarpPath;
    bStartOffset = 0; // warped B already starts at the cut
  }

  process.stderr.write(`[splice] rendering mode=${mode} cut_a=${cutA} cut_b=${cutB} xfade=${xfade}${hasWarp ? ` warp(scale=${scaleB}, dx=${dxB || 0}, dy=${dyB || 0}, relax=${relax})` : ''} → ${outPath}\n`);

  const bAudioForFilter = bothAudio;
  let filter, maps;
  if (mode === 'xfade' && xfade > 0) {
    const offset = (cutA - xfade).toFixed(4);
    filter = [
      `[0:v]trim=end=${cutA},setpts=PTS-STARTPTS,fps=24,settb=AVTB[a]`,
      `[1:v]trim=start=${bStartOffset},setpts=PTS-STARTPTS,fps=24,settb=AVTB[b]`,
      `[a][b]xfade=transition=fade:duration=${xfade}:offset=${offset}[v]`,
    ];
    if (bAudioForFilter) {
      filter.push(`[0:a]atrim=end=${cutA},asetpts=PTS-STARTPTS[aa]`);
      filter.push(`[1:a]atrim=start=${bStartOffset},asetpts=PTS-STARTPTS[ab]`);
      filter.push(`[aa][ab]acrossfade=d=${xfade}[aout]`);
      maps = ['-map', '[v]', '-map', '[aout]'];
    } else {
      maps = ['-map', '[v]'];
    }
  } else {
    filter = [
      `[0:v]trim=end=${cutA},setpts=PTS-STARTPTS[a]`,
      `[1:v]trim=start=${bStartOffset},setpts=PTS-STARTPTS[b]`,
      `[a][b]concat=n=2:v=1:a=0[v]`,
    ];
    if (bAudioForFilter) {
      filter.push(`[0:a]atrim=end=${cutA},asetpts=PTS-STARTPTS[aa]`);
      filter.push(`[1:a]atrim=start=${bStartOffset},asetpts=PTS-STARTPTS[ab]`);
      filter.push(`[aa][ab]concat=n=2:v=0:a=1[aout]`);
      maps = ['-map', '[v]', '-map', '[aout]'];
    } else {
      maps = ['-map', '[v]'];
    }
  }

  if (opts.debug) process.stderr.write(`[splice] filter: ${filter.join(';')}\n`);
  const args = [
    '-v', 'error', '-stats',
    '-i', clipA,
    '-i', bSource,
    '-filter_complex', filter.join(';'),
    ...maps,
    '-c:v', 'libx264', '-crf', String(crf), '-preset', String(preset), '-pix_fmt', 'yuv420p',
  ];
  if (bAudioForFilter) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-y', outPath);

  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (tmpWarpPath) {
    try { fs.rmSync(path.dirname(tmpWarpPath), { recursive: true, force: true }); } catch (_) {}
  }
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);

  const outDur = probeDuration(outPath);
  return {
    out: outPath,
    duration: outDur,
    mode,
    cut_a: cutA,
    cut_b: cutB,
    xfade,
  };
}

// ---------- main ----------

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { positional, flags } = parseFlags(rest);

  if (cmd === 'analyze') {
    const [a, b] = positional;
    if (!a || !b) {
      console.error('Usage: splice.cjs analyze <A> <B> [--zone=1.5] [--step=0.1] [--top=5] [--json-out=path]');
      process.exit(2);
    }
    const result = analyze(a, b, flags);
    const json = JSON.stringify(result, null, 2);
    if (flags['json-out']) fs.writeFileSync(flags['json-out'], json);
    console.log(json);
    return;
  }

  if (cmd === 'render') {
    const [a, b, out] = positional;
    if (!a || !b || !out) {
      console.error('Usage: splice.cjs render <A> <B> <out> [--cut-a=T] [--cut-b=T] [--xfade=D] [--mode=auto|hard|xfade] [--from-analyze=path]');
      process.exit(2);
    }
    const result = render(a, b, out, flags);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error('Usage: splice.cjs <analyze|render> ...');
  process.exit(2);
}

main();
