/**
 * POST { question, history? } → { answer, model }
 *
 * Iyelle's voice with a real model behind it. The route reads the live n8n
 * data itself — it never trusts engine data sent from the browser — and hands
 * it to Claude with the question. The dashboard falls back to its built-in
 * rule-based answers when this route says the model key is missing.
 *
 * Env: ANTHROPIC_API_KEY (required), IYELLE_MODEL (optional override).
 */

const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('./_auth');
const { fetchResource } = require('./_n8n');

const DEFAULT_MODEL = 'claude-opus-5-5';
// Models that accept the server-side refusal fallback. An override outside
// this set (e.g. Haiku) is sent without it rather than rejected.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

const MAX_QUESTION = 1000;
const MAX_TURNS = 8;          // prior messages carried for follow-ups
const MAX_TURN_CHARS = 2000;

const SYSTEM = `You are Iyelle, the AI inside Goldentune's ops dashboard. You watch the user's traffic engines (automations running on n8n) and tell them, plainly, what is working, what is stuck, and what to do next.

How you talk:
- Lead with the answer in one short sentence. Then at most a few short lines or "- " bullets if they help.
- Plain words. Say "traffic engine" or "engine", never "workflow".
- When something is wrong, name the engine and give one concrete next step.
- Use **bold** only for engine names and the single most important fact. No headings, no tables.
- Answer only from the engine data you are given. If it doesn't hold the answer, say what's missing instead of guessing.
- Times in the data are ISO timestamps; "now" is given with the data. Say "2 hours ago", not the raw timestamp.

What the fields mean: active = switched on and runs on its trigger; archived = shelved, ignore it in counts; nodeCount 0 = an empty shell; missingCreds = steps that need a login attached in n8n before the engine can run; status error, crashed or failed = a failed run.`;

/** Compact, model-friendly view of the dashboard data. */
function engineContext(workflows, executions) {
  const names = new Map(workflows.map(w => [String(w.id), w.name]));
  const engines = workflows.map(w => ({
    name: w.name, active: w.active, archived: w.archived || undefined,
    nodeCount: w.nodeCount, trigger: w.trigger || undefined,
    missingCreds: w.missingCreds && w.missingCreds.length ? w.missingCreds : undefined,
    description: w.description || undefined, updatedAt: w.updatedAt
  }));
  const runs = executions.map(e => ({
    engine: names.get(String(e.workflowId)) || `engine ${e.workflowId}`,
    status: e.status, mode: e.mode, startedAt: e.startedAt, stoppedAt: e.stoppedAt || undefined
  }));
  return JSON.stringify({ now: new Date().toISOString(), engines, runs });
}

/** Prior turns from the browser: text only, alternating, bounded. */
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const t of raw.slice(-MAX_TURNS)) {
    if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string') continue;
    const text = t.text.trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1].content += '\n\n' + text;
    else out.push({ role: t.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();      // must open on the user
  while (out.length && out[out.length - 1].role === 'user') out.pop(); // the new question goes last
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!requireAuth(req, res)) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'missing_model_key',
      message: 'ANTHROPIC_API_KEY is not set on this deployment.',
      fix: 'Vercel → your project → Settings → Environment Variables → add ANTHROPIC_API_KEY, then redeploy.'
    });
  }

  const body = req.body || {};
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!question) return res.status(400).json({ error: 'empty_question' });

  const [w, e] = await Promise.all([fetchResource('workflows', 100), fetchResource('executions', 100)]);
  const bad = [w, e].find(r => r.status !== 200);
  if (bad) return res.status(bad.status).json(bad.body);

  const model = process.env.IYELLE_MODEL || DEFAULT_MODEL;
  const messages = [
    ...cleanHistory(body.history),
    { role: 'user', content:
      `<engine_data>\n${engineContext(w.body.data, e.body.data)}\n</engine_data>\n\n${question}` }
  ];

  const params = {
    model,
    max_tokens: 4000,
    system: SYSTEM,
    // Short chat answers over data already in hand: low effort is enough
    // and keeps each question cheap.
    output_config: { effort: 'low' },
    messages
  };
  if (FALLBACK_MODELS.has(model)) {
    // If the model declines, the API retries on a fallback model in the same call.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  try {
    const client = new Anthropic();
    const msg = await client.beta.messages.create(params);

    if (msg.stop_reason === 'refusal') {
      return res.status(200).json({ answer: "I can't help with that one. Ask me about your traffic engines.", model: msg.model });
    }
    const answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return res.status(200).json({ answer: answer || 'I came back empty on that. Try asking it another way.', model: msg.model });

  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(502).json({ error: 'model_auth', message: 'The Anthropic API key was rejected. Create a new one at console.anthropic.com and update ANTHROPIC_API_KEY.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'model_busy', message: 'Iyelle is getting too many questions right now. Try again in a minute.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: 'model_error', status: err.status, message: 'The model could not answer right now.', detail: String(err.message).slice(0, 300) });
    }
    return res.status(502).json({ error: 'model_unreachable', message: 'Could not reach the model.', detail: String(err && err.message || err).slice(0, 300) });
  }
};
