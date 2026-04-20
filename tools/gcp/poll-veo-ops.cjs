#!/usr/bin/env node
/**
 * Poll multiple Veo ops until all reach terminal state.
 * Emits one line per op on termination, plus a final ALL_DONE.
 * Usage: node poll-veo-ops.cjs <name>=<opName> [<name>=<opName> ...]
 */
const { getAccessToken, gcpFetch } = require('./auth.cjs');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: poll-veo-ops.cjs name=opName [name=opName ...]');
  process.exit(1);
}

const OPS = {};
for (const a of args) {
  const i = a.indexOf('=');
  if (i < 0) { console.error(`Bad arg: ${a}`); process.exit(1); }
  OPS[a.slice(0, i)] = a.slice(i + 1);
}

// Build the fetchPredictOperation URL for a given op path.
// Op format: projects/<p>/locations/<r>/publishers/google/models/<modelId>/operations/<uuid>
function fetchUrlForOp(op) {
  const m = op.match(/^projects\/([^/]+)\/locations\/([^/]+)\/publishers\/google\/models\/([^/]+)\/operations\//);
  if (!m) throw new Error(`Unrecognized op path: ${op}`);
  const [, project, region, modelId] = m;
  return `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${modelId}:fetchPredictOperation`;
}

(async () => {
  const { accessToken } = await getAccessToken();
  const status = Object.fromEntries(Object.keys(OPS).map(n => [n, 'pending']));
  const INTERVAL = 20_000;
  const MAX_TICKS = 50; // ~17 min

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    for (const [name, op] of Object.entries(OPS)) {
      if (status[name] !== 'pending') continue;
      try {
        const { body } = await gcpFetch(accessToken, fetchUrlForOp(op), {
          method: 'POST',
          body: JSON.stringify({ operationName: op }),
        });
        if (!body || !body.done) continue;
        const filtered = body.response && body.response.raiMediaFilteredCount;
        const hasVideo = body.response && body.response.videos && body.response.videos.length > 0;
        if (filtered) {
          const reasons = body.response.raiMediaFilteredReasons || [];
          console.log(`FILTERED ${name} count=${filtered} reasons=${JSON.stringify(reasons)}`);
          status[name] = 'filtered';
        } else if (hasVideo) {
          const uri = body.response.videos[0].uri || body.response.videos[0].gcsUri || '(base64)';
          console.log(`DONE ${name} uri=${uri}`);
          status[name] = 'done';
        } else if (body.error) {
          console.log(`ERROR ${name} ${JSON.stringify(body.error)}`);
          status[name] = 'error';
        } else {
          console.log(`DONE_UNKNOWN ${name} ${JSON.stringify(body).slice(0, 300)}`);
          status[name] = 'unknown';
        }
      } catch (e) {
        console.log(`POLL_ERR ${name} ${e.message}`);
      }
    }
    if (Object.values(status).every(s => s !== 'pending')) {
      console.log(`ALL_DONE ${JSON.stringify(status)}`);
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  console.log(`TIMEOUT ${JSON.stringify(status)}`);
  process.exit(1);
})().catch(e => {
  console.log(`FATAL ${e.message}\n${e.stack || ''}`);
  process.exit(2);
});
