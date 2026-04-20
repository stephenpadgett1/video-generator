/**
 * Shared GCP auth helper for infra scripts.
 * Reads data/infra_client_key.json and exchanges for an OAuth access token.
 * Zero npm dependencies — uses node:crypto only.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_KEY_PATH = path.join(REPO_ROOT, 'data', 'infra_client_key.json');

function base64UrlEncode(input) {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signRS256(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  return `${signingInput}.${base64UrlEncode(signer.sign(privateKey))}`;
}

async function getAccessToken(keyPath = DEFAULT_KEY_PATH) {
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
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
  const { access_token, expires_in } = await res.json();
  return { accessToken: access_token, projectId: sa.project_id, expiresIn: expires_in, clientEmail: sa.client_email };
}

async function gcpFetch(accessToken, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

module.exports = { getAccessToken, gcpFetch, REPO_ROOT, DEFAULT_KEY_PATH };
