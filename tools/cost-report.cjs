#!/usr/bin/env node
/*
 * cost-report.cjs — unified cost reconciliation across all three vendors.
 *
 *   GCP (Veo + Nano-Banana)  — BigQuery billing export, actual $.
 *   Anthropic (frame-qa/clip-qa) — data/cost-ledger.jsonl, actual $ (forward-logged
 *                                  by costlog.py; days before instrumentation show $0).
 *   ElevenLabs (TTS/SFX/music)   — usage API, credits consumed (flat subscription).
 *
 * Usage:
 *   node tools/cost-report.cjs --from=YYYY-MM-DD --to=YYYY-MM-DD [--json]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; })
);
const day = (d) => d.toISOString().slice(0, 10);
const from = args.from || day(new Date(Date.now() - 14 * 864e5));
const to = args.to || day(new Date());

// ---- GCP via BigQuery billing export ----
function gcpByDay() {
  const sql = `SELECT DATE(usage_start_time) AS day, ROUND(SUM(cost),2) AS usd
    FROM \`gen-lang-client-0137184346.billing_export.gcp_billing_export_v1_018C08_5B28A7_193FDC\`
    WHERE service.description='Vertex AI' AND DATE(usage_start_time) BETWEEN '${from}' AND '${to}'
    GROUP BY day ORDER BY day`;
  try {
    const out = execFileSync('node', [path.join(__dirname, 'gcp', 'bq.cjs'), sql], { encoding: 'utf8' });
    const map = {};
    for (const line of out.trim().split('\n').slice(1)) {
      const [d, usd] = line.split('\t');
      if (d && usd && !d.startsWith('(')) map[d] = parseFloat(usd) || 0;
    }
    return { map, ok: true };
  } catch (e) {
    return { map: {}, ok: false, err: (e.stderr || e.message || '').toString().slice(0, 200) };
  }
}

// ---- Anthropic via the local ledger ----
function anthropicByDay() {
  const f = path.join(ROOT, 'data', 'cost-ledger.jsonl');
  const map = {};
  let calls = 0;
  if (!fs.existsSync(f)) return { map, calls, exists: false };
  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const d = (r.ts || '').slice(0, 10);
    if (d < from || d > to) continue;
    map[d] = (map[d] || 0) + (r.cost_usd || 0);
    calls++;
  }
  return { map, calls, exists: true };
}

// ---- ElevenLabs via usage API ----
async function elByDay() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  const s = Date.parse(from + 'T00:00:00Z');
  const e = Date.parse(to + 'T23:59:59Z');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/usage/character-stats?start_unix=${s}&end_unix=${e}&aggregation_interval=day`,
    { headers: { 'xi-api-key': cfg.elevenLabsKey } }
  );
  if (!res.ok) return { map: {}, ok: false };
  const j = await res.json();
  const series = (j.usage && (j.usage.All || Object.values(j.usage)[0])) || [];
  const map = {};
  (j.time || []).forEach((t, i) => { map[new Date(t).toISOString().slice(0, 10)] = series[i] || 0; });
  return { map, ok: true };
}

(async () => {
  const gcp = gcpByDay();
  const anth = anthropicByDay();
  const el = await elByDay();

  const days = [...new Set([...Object.keys(gcp.map), ...Object.keys(anth.map), ...Object.keys(el.map)])]
    .filter((d) => d >= from && d <= to).sort();

  if (args.json) {
    console.log(JSON.stringify({ from, to, gcp: gcp.map, anthropic: anth.map, elevenlabs_credits: el.map }, null, 2));
    return;
  }

  let tg = 0, ta = 0, te = 0;
  console.log(`\nCost reconciliation  ${from} .. ${to}\n`);
  console.log(`  ${'day'.padEnd(12)} ${'GCP $'.padStart(10)} ${'Anthropic $'.padStart(12)} ${'EL credits'.padStart(12)}`);
  console.log('  ' + '-'.repeat(48));
  for (const d of days) {
    const g = gcp.map[d] || 0, a = anth.map[d] || 0, e = el.map[d] || 0;
    tg += g; ta += a; te += e;
    console.log(`  ${d.padEnd(12)} ${g.toFixed(2).padStart(10)} ${a.toFixed(2).padStart(12)} ${e.toLocaleString().padStart(12)}`);
  }
  console.log('  ' + '-'.repeat(48));
  console.log(`  ${'TOTAL'.padEnd(12)} ${tg.toFixed(2).padStart(10)} ${ta.toFixed(2).padStart(12)} ${te.toLocaleString().padStart(12)}`);
  console.log(`\n  GCP (Veo+Nano) actual: $${tg.toFixed(2)}` + (gcp.ok ? '' : `  [BQ query failed: ${gcp.err}]`));
  console.log(`  Anthropic QA actual:   $${ta.toFixed(2)}  (${anth.calls} logged call${anth.calls === 1 ? '' : 's'})`);
  if (!anth.exists || anth.calls === 0)
    console.log(`    note: no ledger entries in range — frame-qa/clip-qa runs before costlog.py instrumentation are not recoverable (estimate only).`);
  console.log(`  ElevenLabs: ${te.toLocaleString()} credits (flat subscription — see elevenlabs-usage.cjs for marginal $).`);
  console.log(`  Reconciled cash total (GCP + Anthropic): $${(tg + ta).toFixed(2)}\n`);
})().catch((err) => { console.error(err.message || err); process.exit(3); });
