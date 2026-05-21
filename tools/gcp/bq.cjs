#!/usr/bin/env node
// Run a BigQuery SQL query with the infra service account. Usage: node tools/gcp/bq.cjs "<SQL>"
const { getAccessToken } = require('./auth.cjs');

(async () => {
  const sql = process.argv[2];
  if (!sql) { console.error('Usage: bq.cjs "<SQL>"'); process.exit(1); }
  const { accessToken, projectId } = await getAccessToken();
  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 60000 }),
    }
  );
  const j = await res.json();
  if (!res.ok) { console.error(`HTTP ${res.status}:`, JSON.stringify(j, null, 2)); process.exit(2); }
  if (!j.jobComplete) { console.error('Job not complete within timeout'); process.exit(3); }
  const cols = (j.schema?.fields || []).map((f) => f.name);
  const rows = (j.rows || []).map((r) => r.f.map((c) => c.v));
  console.log(cols.join('\t'));
  for (const r of rows) console.log(r.join('\t'));
  console.log(`\n(${rows.length} rows)`);
})().catch((e) => { console.error(e.message || e); process.exit(4); });
