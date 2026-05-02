#!/usr/bin/env node
// Download a gs:// URI to a local path using the infra service account.
// Usage: node tools/gcp/dl.cjs <gs://bucket/path> <local_path>
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./auth.cjs');

const [, , gsUri, outPath] = process.argv;
if (!gsUri || !outPath) {
  console.error('Usage: dl.cjs <gs://bucket/path> <local_path>');
  process.exit(1);
}

(async () => {
  const { accessToken } = await getAccessToken();
  const url = gsUri.replace(/^gs:\/\/([^/]+)\/(.+)$/, (_, b, p) =>
    `https://storage.googleapis.com/${b}/${encodeURI(p)}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
})().catch(e => { console.error(e); process.exit(3); });
