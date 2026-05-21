#!/usr/bin/env node
/*
 * elevenlabs-usage.cjs — pull actual ElevenLabs character (credit) usage by day.
 *
 * ElevenLabs is a flat monthly subscription, so there is no per-render dollar
 * charge. The meaningful figure is credits consumed against the plan quota.
 * This reports daily credits + a marginal-cost estimate (quota share).
 *
 * Usage:
 *   node tools/elevenlabs-usage.cjs [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--json]
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8'));
const KEY = cfg.elevenLabsKey;
if (!KEY) { console.error('elevenLabsKey not set in data/config.json'); process.exit(1); }

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; })
);
const day = (d) => d.toISOString().slice(0, 10);
const from = args.from || day(new Date(Date.now() - 30 * 864e5));
const to = args.to || day(new Date());

// Plan allowances (credits/month) for a rough marginal-cost share. Flat subscription — not pay-per-use.
const PLAN = { starter: [5, 30000], creator: [22, 100000], pro: [99, 500000], scale: [330, 2000000] };

(async () => {
  const s = Date.parse(from + 'T00:00:00Z');
  const e = Date.parse(to + 'T23:59:59Z');
  const headers = { 'xi-api-key': KEY };

  const statsRes = await fetch(
    `https://api.elevenlabs.io/v1/usage/character-stats?start_unix=${s}&end_unix=${e}&aggregation_interval=day`,
    { headers }
  );
  if (!statsRes.ok) { console.error(`HTTP ${statsRes.status}: ${await statsRes.text()}`); process.exit(2); }
  const stats = await statsRes.json();
  const series = (stats.usage && (stats.usage.All || Object.values(stats.usage)[0])) || [];
  const days = (stats.time || []).map((t, i) => ({ day: new Date(t).toISOString().slice(0, 10), chars: series[i] || 0 }));

  const sub = await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers })).json();
  const total = days.reduce((a, d) => a + d.chars, 0);
  const plan = PLAN[sub.tier];
  const marginal = plan ? (total / plan[1]) * plan[0] : null;

  if (args.json) {
    console.log(JSON.stringify({ from, to, tier: sub.tier, days: days.filter((d) => d.chars > 0), total_chars: total, est_marginal_usd: marginal }, null, 2));
    return;
  }
  console.log(`ElevenLabs usage  ${from} .. ${to}`);
  console.log(`  plan: ${sub.tier}  ·  cycle ${sub.character_count}/${sub.character_limit} credits used`);
  for (const d of days) if (d.chars > 0) console.log(`  ${d.day}   ${d.chars.toLocaleString().padStart(10)} credits`);
  console.log(`  ${'TOTAL'.padEnd(10)} ${total.toLocaleString().padStart(10)} credits`);
  if (marginal != null)
    console.log(`  est. marginal cost ≈ $${marginal.toFixed(2)}  (flat subscription — quota share, not a real charge)`);
})().catch((err) => { console.error(err.message || err); process.exit(3); });
