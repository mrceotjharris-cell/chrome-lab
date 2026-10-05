/**
 * Password gate for the dashboard's API. Files starting with "_" are not
 * routes on Vercel, so this is a helper, not an endpoint.
 *
 * One password, IYELLE_PASSWORD, set in the Vercel project. Logging in trades
 * it for a signed session cookie; every API route checks that cookie before it
 * touches n8n or the model. The HTML itself stays static and public — it holds
 * no data. What it shows comes from these routes, and they say no.
 *
 * The signing key is derived from the password, so changing the password logs
 * every open session out. No database, no second secret to manage.
 */

const crypto = require('crypto');

const COOKIE = 'iyelle_session';
const TTL_S = 30 * 24 * 3600;   // 30 days

const keyFor = pw => crypto.createHash('sha256').update('iyelle-session:' + pw).digest();
const sign = (pw, exp) => crypto.createHmac('sha256', keyFor(pw)).update(String(exp)).digest('base64url');

/** Constant-time string compare that doesn't leak length via an early return. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function sessionCookie(pw) {
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  const token = `${exp}.${sign(pw, exp)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_S}`;
}

const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function validSession(req, pw) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(mac, sign(pw, exp));
}

/**
 * Call first in every protected route. Returns true when the request may
 * proceed; otherwise it has already sent the response.
 */
function requireAuth(req, res) {
  const pw = process.env.IYELLE_PASSWORD;
  if (!pw) {
    // Fail closed: no password configured means nobody gets in, not everybody.
    res.status(500).json({
      error: 'missing_password',
      message: 'IYELLE_PASSWORD is not set on this deployment.',
      fix: 'Vercel → your project → Settings → Environment Variables → add IYELLE_PASSWORD, then redeploy.'
    });
    return false;
  }
  if (!validSession(req, pw)) {
    res.status(401).json({ error: 'unauthorized', message: 'Log in to see your traffic engines.' });
    return false;
  }
  return true;
}

module.exports = { requireAuth, sessionCookie, clearCookie, safeEqual };
