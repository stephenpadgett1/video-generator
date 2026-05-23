#!/usr/bin/env node
// Upload a local file to the infra GCS bucket and print a V4 signed GET URL.
// Usage: node tools/gcp/share.cjs <localPath> <objectName> [contentType] [expiresDays]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getAccessToken, DEFAULT_KEY_PATH } = require('./auth.cjs');

const BUCKET = 'vg-veo-0137184346';

const [, , localPath, objectName, contentType = 'application/octet-stream', expiresDays = '7'] = process.argv;
if (!localPath || !objectName) {
  console.error('Usage: share.cjs <localPath> <objectName> [contentType] [expiresDays]');
  process.exit(1);
}

function signedUrl(bucket, object, sa, expiresSec) {
  const host = 'storage.googleapis.com';
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]/g, '');
  const timestamp = iso.slice(0, 15) + 'Z';        // YYYYMMDDTHHMMSSZ
  const datestamp = iso.slice(0, 8);               // YYYYMMDD
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${sa.client_email}/${credentialScope}`;
  const canonicalUri = '/' + bucket + '/' + object.split('/').map(encodeURIComponent).join('/');
  const qp = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expiresSec),
    'X-Goog-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(qp).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(qp[k])}`).join('&');
  const canonicalRequest = ['GET', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const hashedCR = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = ['GOOG4-RSA-SHA256', timestamp, credentialScope, hashedCR].join('\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(stringToSign);
  const signature = signer.sign(sa.private_key, 'hex');
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

(async () => {
  const sa = JSON.parse(fs.readFileSync(DEFAULT_KEY_PATH, 'utf-8'));
  const { accessToken } = await getAccessToken();
  const data = fs.readFileSync(localPath);
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType },
    body: data,
  });
  if (!res.ok) {
    console.error(`Upload failed HTTP ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const expiresSec = Math.min(parseInt(expiresDays, 10) * 86400, 604800);
  const url = signedUrl(BUCKET, objectName, sa, expiresSec);
  console.log(`uploaded ${(data.length / 1048576).toFixed(1)} MB -> gs://${BUCKET}/${objectName}`);
  console.log(`SIGNED_URL ${url}`);
})().catch(e => { console.error(e); process.exit(3); });
