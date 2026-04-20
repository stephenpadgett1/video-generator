#!/usr/bin/env node
/**
 * Query Cloud Logging for recent Vertex AI / Veo errors.
 *
 * Usage:
 *   node tools/gcp/logs.cjs                              # last 1h, Veo errors
 *   node tools/gcp/logs.cjs --hours=24                   # last 24h
 *   node tools/gcp/logs.cjs --operation=OP_ID            # errors for a specific op
 *   node tools/gcp/logs.cjs --severity=WARNING           # WARNING+ instead of ERROR+
 *   node tools/gcp/logs.cjs --filter='textPayload=~"..."'  # raw filter override
 *   node tools/gcp/logs.cjs --limit=50                   # entry cap (default 20)
 *
 * Output: one line per entry with timestamp, severity, method/resource, and a short message.
 * Full JSON of each entry when --json is passed.
 */
const { getAccessToken, gcpFetch } = require('./auth.cjs');

function parseFlags(argv) {
  const flags = { hours: 1, severity: 'ERROR', limit: 20, json: false };
  for (const a of argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
    const v = eq > 0 ? a.slice(eq + 1) : true;
    flags[k] = v;
  }
  if (typeof flags.hours === 'string') flags.hours = parseFloat(flags.hours);
  if (typeof flags.limit === 'string') flags.limit = parseInt(flags.limit, 10);
  return flags;
}

function buildFilter(flags) {
  const since = new Date(Date.now() - flags.hours * 3600 * 1000).toISOString();
  const parts = [
    `timestamp >= "${since}"`,
    `severity >= ${flags.severity}`,
    '(resource.type="aiplatform.googleapis.com/PublisherModel" OR resource.type="audited_resource" OR protoPayload.serviceName="aiplatform.googleapis.com")',
  ];
  if (flags.operation) parts.push(`protoPayload.response.name=~"operations/${flags.operation}"`);
  if (flags.filter) parts.push(`(${flags.filter})`);
  return parts.join(' AND ');
}

function oneLine(entry) {
  const ts = entry.timestamp || entry.receiveTimestamp || '';
  const sev = entry.severity || '-';
  const method = entry.protoPayload?.methodName || '';
  const resource = entry.resource?.type + (entry.resource?.labels?.model ? `:${entry.resource.labels.model}` : '');
  const msg =
    entry.protoPayload?.status?.message ||
    entry.protoPayload?.response?.error?.message ||
    entry.textPayload ||
    entry.jsonPayload?.message ||
    '(no message)';
  const short = typeof msg === 'string' ? msg.replace(/\s+/g, ' ').slice(0, 180) : JSON.stringify(msg).slice(0, 180);
  return `${ts}  ${sev.padEnd(8)}  ${method || resource || '-'}  ${short}`;
}

(async () => {
  const flags = parseFlags(process.argv);
  const { accessToken, projectId } = await getAccessToken();
  const filter = buildFilter(flags);
  const body = {
    resourceNames: [`projects/${projectId}`],
    filter,
    orderBy: 'timestamp desc',
    pageSize: flags.limit,
  };
  process.stderr.write(`[logs] project=${projectId} hours=${flags.hours} severity>=${flags.severity} limit=${flags.limit}\n`);
  process.stderr.write(`[logs] filter: ${filter}\n`);
  const r = await gcpFetch(accessToken, 'https://logging.googleapis.com/v2/entries:list', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) {
    console.error('ERROR', r.status, JSON.stringify(r.body, null, 2));
    process.exit(1);
  }
  const entries = r.body?.entries || [];
  if (entries.length === 0) {
    console.log('(no matching entries)');
    return;
  }
  if (flags.json) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const e of entries) console.log(oneLine(e));
  }
})();
