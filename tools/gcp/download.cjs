#!/usr/bin/env node
// Download a single GCS object to a local path using the infra SA key.
// Usage: node tools/gcp/download.cjs <gs://bucket/object> <localPath>
const fs = require('node:fs');
const path = require('node:path');
const { getAccessToken } = require('./auth.cjs');

const [, , gsUri, localPath, keyPathArg] = process.argv;
if (!gsUri || !localPath) {
  console.error('Usage: download.cjs <gs://bucket/object> <localPath> [keyPath]');
  process.exit(1);
}
// Default to the Veo service-account key (has read on the Veo output bucket).
const keyPath = keyPathArg || path.resolve(__dirname, '..', '..', 'data', 'service_client_key.json');
const m = /^gs:\/\/([^/]+)\/(.+)$/.exec(gsUri);
if (!m) {
  console.error(`Invalid GCS URI: ${gsUri}`);
  process.exit(1);
}
const [, bucket, object] = m;

(async () => {
  const { accessToken } = await getAccessToken(keyPath);
  const url = `https://storage.googleapis.com/${bucket}/${object}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.error(`Download failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  console.log(`✓ ${localPath} (${buf.length} bytes)`);
})().catch((e) => { console.error(e); process.exit(1); });
