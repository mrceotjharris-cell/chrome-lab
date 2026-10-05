/**
 * n8n Public API client, shared by /api/n8n (the dashboard) and /api/ask
 * (Iyelle). Files starting with "_" are not routes on Vercel.
 *
 * The key never leaves the server; see n8n.js for why the proxy exists.
 *
 * This file also SLIMS the response. /api/v1/workflows returns every node's full
 * definition — parameters, system prompts, the lot. That is 100 KB+ to draw
 * six cards. We project it down to the handful of fields the dashboard uses.
 */

const ALLOWED = new Set(['workflows', 'executions']);
const DEFAULT_BASE = 'https://goldentune.app.n8n.cloud';

// Nodes that are documentation, not logic — excluded from the node count.
const NON_LOGIC = new Set(['n8n-nodes-base.stickyNote']);

// Node types that cannot run without a credential attached. n8n's API does not
// tell you "this node is unconfigured", so we infer it: a node of one of these
// types with no credentials block — or with one whose id is null — will fail.
const NEEDS_CRED = new Set([
  'n8n-nodes-base.wordpress', 'n8n-nodes-base.slack', 'n8n-nodes-base.linkedIn',
  'n8n-nodes-base.telegram', 'n8n-nodes-base.medium', 'n8n-nodes-base.twitter',
  'n8n-nodes-base.facebookGraphApi', 'n8n-nodes-base.googleBusinessProfile',
  'n8n-nodes-base.gmail', 'n8n-nodes-base.googleSheets', 'n8n-nodes-base.airtable',
  'n8n-nodes-base.notion', 'n8n-nodes-base.discord',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic', '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.googleGemini', '@n8n/n8n-nodes-langchain.openAi'
]);

/** Names of nodes that need a credential and don't have a usable one. */
function missingCredentials(nodes) {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const n of nodes) {
    if (!n || typeof n.type !== 'string') continue;
    const authed = n.parameters && n.parameters.authentication
      && n.parameters.authentication !== 'none';
    if (!NEEDS_CRED.has(n.type) && !(/httpRequest$/.test(n.type) && authed)) continue;

    const creds = n.credentials;
    const usable = creds && typeof creds === 'object' &&
      Object.values(creds).some(c => c && c.id);   // id:null = placeholder, not configured
    if (!usable) out.push(n.name || n.type.split('.').pop());
  }
  return out;
}

/** First sticky note's text, used as a description (n8n has no description field). */
function stickyDescription(nodes) {
  if (!Array.isArray(nodes)) return null;
  const sticky = nodes.find(n => n && n.type === 'n8n-nodes-base.stickyNote'
    && n.parameters && typeof n.parameters.content === 'string');
  if (!sticky) return null;
  return sticky.parameters.content
    .replace(/^#{1,6}\s*.*$/m, '')     // drop the leading markdown heading
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260) || null;
}

/** Human-readable trigger summary from the workflow's trigger node. */
function triggerSummary(nodes) {
  if (!Array.isArray(nodes)) return null;
  const t = nodes.find(n => n && typeof n.type === 'string' &&
    /trigger|webhook/i.test(n.type) && !NON_LOGIC.has(n.type));
  if (!t) return null;
  if (/manualTrigger/i.test(t.type)) return 'manual only';
  if (/scheduleTrigger/i.test(t.type)) {
    const iv = t.parameters && t.parameters.rule && t.parameters.rule.interval;
    const r = Array.isArray(iv) ? iv[0] : null;
    if (r) {
      const h = r.triggerAtHour, m = r.triggerAtMinute || 0;
      const hhmm = h !== undefined ? ` ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` : '';
      if (r.field === 'weeks' && Array.isArray(r.triggerAtDay)) {
        const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return `${r.triggerAtDay.map(d => D[d] || d).join(' + ')}${hhmm}`;
      }
      if (r.field === 'hours') return `every ${r.hoursInterval || 1}h`;
      return `daily${hhmm}`;
    }
    return 'scheduled';
  }
  if (/webhook/i.test(t.type)) return 'webhook';
  return String(t.type).split('.').pop();
}

function slimWorkflow(w) {
  const nodes = Array.isArray(w.nodes) ? w.nodes : [];
  return {
    id: w.id,
    name: w.name,
    active: !!w.active,
    archived: !!w.isArchived,
    nodeCount: nodes.filter(n => n && !NON_LOGIC.has(n.type)).length,
    trigger: triggerSummary(nodes),
    description: stickyDescription(nodes),
    missingCreds: missingCredentials(nodes),
    triggerCount: w.triggerCount || 0,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt
  };
}

const slimExecution = e => ({
  id: e.id,
  workflowId: e.workflowId,
  status: e.status,
  mode: e.mode,
  startedAt: e.startedAt,
  stoppedAt: e.stoppedAt
});

/**
 * Fetch one whitelisted resource from n8n and slim it.
 * Resolves to { status, body } — never throws — so each route can pass the
 * same error shapes through to the browser.
 */
async function fetchResource(resourceRaw, limitRaw) {
  const key  = process.env.N8N_API_KEY;
  const base = (process.env.N8N_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');

  if (!key) {
    return { status: 500, body: {
      error: 'missing_key',
      message: 'N8N_API_KEY is not set on this deployment.',
      fix: 'Vercel → your project → Settings → Environment Variables → add N8N_API_KEY, then redeploy.'
    } };
  }

  // Whitelist the resource. Never interpolate user input straight into the
  // upstream path — that turns this proxy into an open redirect / SSRF hole.
  const resource = String(resourceRaw || 'workflows');
  if (!ALLOWED.has(resource)) {
    return { status: 400, body: { error: 'bad_resource', allowed: [...ALLOWED] } };
  }

  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 250);

  let url;
  try {
    url = new URL(`${base}/api/v1/${resource}`);
  } catch {
    return { status: 500, body: { error: 'bad_base_url', base } };
  }
  url.searchParams.set('limit', String(limit));
  // Execution payloads carry the full run data — megabytes each. Metadata only.
  if (resource === 'executions') url.searchParams.set('includeData', 'false');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);

  try {
    const upstream = await fetch(url, {
      headers: { 'X-N8N-API-KEY': key, accept: 'application/json' },
      signal: ctl.signal
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      const hint =
        upstream.status === 401 ? 'The API key was rejected. Generate a fresh one in n8n → Settings → n8n API.' :
        upstream.status === 404 ? 'Endpoint not found — check N8N_BASE_URL points at your instance root.' :
        undefined;
      return { status: upstream.status, body: {
        error: 'upstream_error', status: upstream.status,
        detail: text.slice(0, 400), hint
      } };
    }

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return { status: 502, body: { error: 'bad_upstream_json', detail: text.slice(0, 200) } }; }

    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    const data = resource === 'workflows' ? rows.map(slimWorkflow) : rows.map(slimExecution);
    return { status: 200, body: { data, count: data.length, upstreamBytes: text.length } };

  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return { status: aborted ? 504 : 502, body: {
      error: aborted ? 'upstream_timeout' : 'proxy_failed',
      detail: String(e && e.message || e).slice(0, 300)
    } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchResource };
