#!/usr/bin/env node
/**
 * evaluate-edit.cjs — single-command editorial QA for a rendered draft.
 *
 * Composes the smaller tools (detect-long-holds, cut-pair-inspector,
 * mix-health, optionally vo-alignment) into one report. Use this on any
 * draft assembly before showing it to the director / committing it as final.
 *
 * What it does
 *   1. Runs detect-long-holds → flags freezes ≥ min duration
 *   2. Runs ffmpeg scene detection → finds cut timestamps
 *   3. Runs cut-pair-inspector at those timestamps → side-by-side compares
 *   4. Runs mix-health → loudness verdict
 *   5. Optionally runs vo-alignment if --intent=PATH or --landing=... given
 *   6. Writes:
 *        <out>/evaluate.json           machine-readable bundle
 *        <out>/evaluate.md             human-readable summary
 *        <out>/qa-cuts/                cut compares
 *
 * Usage
 *   node tools/evaluate-edit.cjs <video> [flags]
 *
 * Flags
 *   --out=DIR                Output directory (default: alongside the video, in qa-evaluate/)
 *   --target-lufs=N          Mix target (default -16)
 *   --hold-min=SEC           Minimum hold duration to flag (default 1.0)
 *   --scene-threshold=N      Cut detection threshold (default 0.4; lower catches more)
 *   --at=T1,T2,...           Explicit cut timestamps (overrides auto-detection)
 *   --intent=PATH            JSON file with VO landing intents (optional)
 *   --landing=SPEC           Inline landing spec (repeatable; same syntax as vo-alignment)
 *   --no-mix                 Skip mix-health
 *   --no-cuts                Skip cut detection / pair inspection
 *   --no-holds               Skip hold detection
 *   --json                   Print full JSON to stdout (in addition to writing files)
 *
 * Exit codes
 *   0 — no findings or all findings within tolerance
 *   1 — internal error
 *   3 — at least one finding flagged (freeze, mix issue, vo drift)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.dirname(require.main.filename);
const ROOT = path.resolve(TOOLS_DIR, '..');

function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        const key = a.slice(2, eq);
        const val = a.slice(eq + 1);
        if (flags[key] === undefined) flags[key] = val;
        else if (Array.isArray(flags[key])) flags[key].push(val);
        else flags[key] = [flags[key], val];
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function runJson(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 3) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${r.status})\n` +
      `stdout: ${r.stdout?.slice(-500)}\nstderr: ${r.stderr?.slice(-500)}`
    );
  }
  // Tools print human summary after JSON; isolate the JSON block.
  const out = r.stdout.trim();
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`No JSON in output of ${cmd}`);
  // Find the matching brace by walking with a depth counter (handles nested objects).
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < out.length; i++) {
    const ch = out[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error(`Unterminated JSON in output of ${cmd}`);
  return JSON.parse(out.slice(start, end + 1));
}

function detectCuts(videoPath, threshold) {
  const out = execSync(
    `ffmpeg -hide_banner -i "${videoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 || true`,
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString();
  const cuts = [];
  for (const line of out.split('\n')) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) cuts.push(parseFloat(m[1]));
  }
  return cuts;
}

function probeDuration(p) {
  return parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${p}"`).toString().trim()
  );
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
}

function buildReport(video, evaluations) {
  const lines = [];
  lines.push(`# Editorial QA — ${path.basename(video)}`);
  lines.push('');
  lines.push(`Duration: ${evaluations.duration.toFixed(2)}s`);
  lines.push('');

  const findings = [];

  if (evaluations.holds) {
    lines.push('## Holds (freeze frames)');
    lines.push('');
    const holds = evaluations.holds.holds || [];
    if (holds.length) {
      for (const h of holds) {
        const tag = h.duration >= 2 ? '!! ' : '~ ';
        lines.push(`- ${tag}**${fmtTime(h.start)} → ${fmtTime(h.end)}** (${h.duration.toFixed(2)}s) ${h.duration >= 2 ? '— long hold; consider regenerating with motion or shortening' : ''}`);
        findings.push({ kind: 'hold', t: h.start, duration: h.duration });
      }
    } else {
      lines.push('No holds detected. ✓');
    }
    lines.push('');
  }

  if (evaluations.cuts) {
    lines.push('## Cuts');
    lines.push('');
    const cuts = evaluations.cuts.cuts || [];
    if (cuts.length) {
      lines.push(`Detected ${cuts.length} cut(s). Side-by-side compares written to \`${evaluations.cuts.out_dir}\`.`);
      lines.push('');
      for (const c of cuts) {
        lines.push(`- **${fmtTime(c.t)}**: \`${c.frames.compare}\``);
      }
    } else {
      lines.push('No cuts detected.');
    }
    lines.push('');
  }

  if (evaluations.mix) {
    lines.push('## Mix health');
    lines.push('');
    const m = evaluations.mix;
    const v = m.verdict || {};
    lines.push(`- Integrated: **${m.loudness?.integrated_lufs ?? '?'} LUFS** (target ${v.level_vs_target?.target}, delta ${v.level_vs_target?.delta} dB — ${v.level_vs_target?.status})`);
    lines.push(`- Loudness range: **${m.loudness?.loudness_range_lu ?? '?'} LU** — ${v.lra?.status}`);
    lines.push(`- True peak: **${m.loudness?.true_peak_dbfs ?? '?'} dBFS** — ${v.true_peak?.status}`);
    if (v.speech_bed_gap?.value !== null && v.speech_bed_gap?.value !== undefined) {
      lines.push(`- Speech vs bed: **${v.speech_bed_gap.value} dB** — ${v.speech_bed_gap.status}`);
    }
    lines.push('');
    if (m.issues?.length) {
      lines.push('### Issues');
      lines.push('');
      for (const i of m.issues) {
        lines.push(`- ${i}`);
        findings.push({ kind: 'mix', message: i });
      }
      lines.push('');
    }
  }

  if (evaluations.vo) {
    lines.push('## VO landing alignment');
    lines.push('');
    const vo = evaluations.vo;
    const s = vo.summary || {};
    lines.push(`Checked ${s.total} landing(s): ${s.pass} pass, ${s.fail} fail, ${s.missing} missing. Max drift: ${s.max_drift_ms} ms.`);
    lines.push('');
    for (const l of vo.landings || []) {
      const sym = { pass: '✓', fail: '✗', missing: '?' }[l.status];
      if (l.status === 'missing') {
        lines.push(`- ${sym} \`${l.word}\` (#${l.occurrence}): not found in transcript — possible mispronunciation`);
        findings.push({ kind: 'vo_missing', word: l.word });
      } else {
        const drift = `${l.drift_ms >= 0 ? '+' : ''}${l.drift_ms}ms (tol ±${l.tolerance_ms}ms)`;
        lines.push(`- ${sym} \`${l.word}\` target ${l.target}s, actual ${l.actual}s, drift ${drift}`);
        if (l.status === 'fail') findings.push({ kind: 'vo_drift', word: l.word, drift_ms: l.drift_ms });
      }
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings. ✓');
  } else {
    lines.push(`${findings.length} finding(s):`);
    for (const f of findings) {
      if (f.kind === 'hold') {
        lines.push(`- Hold at ${fmtTime(f.t)} (${f.duration.toFixed(2)}s)`);
      } else if (f.kind === 'mix') {
        lines.push(`- Mix: ${f.message}`);
      } else if (f.kind === 'vo_missing') {
        lines.push(`- VO: word "${f.word}" not in transcript`);
      } else if (f.kind === 'vo_drift') {
        lines.push(`- VO: "${f.word}" drift ${f.drift_ms}ms`);
      }
    }
  }

  return { md: lines.join('\n') + '\n', findings };
}

function main() {
  const [, , video, ...rest] = process.argv;
  if (!video || video.startsWith('--')) {
    console.error('Usage: node tools/evaluate-edit.cjs <video> [flags]');
    process.exit(2);
  }
  if (!fs.existsSync(video)) {
    console.error(`video not found: ${video}`);
    process.exit(2);
  }
  const { flags } = parseFlags(rest);

  const outDir = flags.out || path.join(path.dirname(video), 'qa-evaluate');
  fs.mkdirSync(outDir, { recursive: true });

  const targetLufs = parseFloat(flags['target-lufs'] || '-16');
  const holdMin = parseFloat(flags['hold-min'] || '1.0');
  const sceneThreshold = parseFloat(flags['scene-threshold'] || '0.4');

  const duration = probeDuration(video);
  const result = { video, duration, ran_at: new Date().toISOString() };

  // 1. Holds.
  if (!flags['no-holds']) {
    process.stderr.write('[evaluate] running detect-long-holds…\n');
    result.holds = runJson('python3', [
      path.join(TOOLS_DIR, 'detect-long-holds.py'),
      video, '--min-duration', String(holdMin), '--json',
    ]);
  }

  // 2 + 3. Cut detection + cut pair inspector.
  if (!flags['no-cuts']) {
    let cuts;
    if (flags.at) {
      cuts = String(flags.at).split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
      process.stderr.write(`[evaluate] using ${cuts.length} explicit cut(s) from --at\n`);
    } else {
      process.stderr.write('[evaluate] detecting cuts…\n');
      cuts = detectCuts(video, sceneThreshold);
    }
    if (cuts.length) {
      process.stderr.write(`[evaluate] running cut-pair-inspector on ${cuts.length} cut(s)…\n`);
      result.cuts = runJson('node', [
        path.join(TOOLS_DIR, 'cut-pair-inspector.cjs'),
        video,
        '--at=' + cuts.join(','),
        '--out=' + path.join(outDir, 'qa-cuts'),
        '--pre-offset=0.1',
        '--post-offset=0.1',
        '--json',
      ]);
    } else {
      result.cuts = { cuts: [], out_dir: null };
    }
  }

  // 4. Mix health.
  if (!flags['no-mix']) {
    process.stderr.write('[evaluate] running mix-health…\n');
    result.mix = runJson('python3', [
      path.join(TOOLS_DIR, 'mix-health.py'),
      video, '--target', String(targetLufs), '--no-speech-analysis', '--json',
    ]);
  }

  // 5. VO alignment (optional).
  const landings = []
    .concat(flags.landing ? (Array.isArray(flags.landing) ? flags.landing : [flags.landing]) : []);
  if (flags.intent || landings.length) {
    process.stderr.write('[evaluate] running vo-alignment…\n');
    const args = [path.join(TOOLS_DIR, 'vo-alignment.py'), video, '--json'];
    if (flags.intent) args.push('--intent', String(flags.intent));
    for (const l of landings) args.push('--landing', l);
    result.vo = runJson('python3', args);
  }

  // 6. Build report.
  const { md, findings } = buildReport(video, result);
  result.findings = findings;

  fs.writeFileSync(path.join(outDir, 'evaluate.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outDir, 'evaluate.md'), md);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(md);
    console.log(`\nWrote ${path.relative(process.cwd(), outDir)}/evaluate.{json,md}`);
  }

  process.exit(findings.length ? 3 : 0);
}

main();
