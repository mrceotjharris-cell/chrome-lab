/**
 * Vercel serverless proxy for the n8n Public API — what the dashboard reads.
 *
 * WHY THIS FILE EXISTS — two reasons, both non-negotiable:
 *
 * 1. CORS. n8n Cloud does not send Access-Control-Allow-Origin headers, so a
 *    browser on chrome-lab.vercel.app is blocked from calling it directly.
 *    This runs server-side, where CORS does not apply.
 *
 * 2. The API key. Anything shipped to the browser is public — "hidden" JS
 *    variables are readable in devtools in about four clicks. The key lives
 *    here, in a Vercel environment variable, and never leaves the server.
 *
 * It answers only a logged-in session (see _auth.js). The fetching and the
 * slimming live in _n8n.js, shared with /api/ask.
 */

const { requireAuth } = require('./_auth');
const { fetchResource } = require('./_n8n');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { status, body } = await fetchResource(req.query.resource, req.query.limit);

  // Private, not s-maxage: a shared edge cache does not key on the session
  // cookie, so it would hand a logged-in response to anyone. The browser may
  // still reuse it for 10s, which is all a 30s refresh needs.
  if (status === 200) res.setHeader('cache-control', 'private, max-age=10');
  return res.status(status).json(body);
};
