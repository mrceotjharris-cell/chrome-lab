/**
 * POST { password } → sets the session cookie the other routes check.
 * DELETE → clears it (log out).
 */

const { sessionCookie, clearCookie, safeEqual } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'DELETE') {
    res.setHeader('set-cookie', clearCookie());
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const pw = process.env.IYELLE_PASSWORD;
  if (!pw) {
    return res.status(500).json({
      error: 'missing_password',
      message: 'IYELLE_PASSWORD is not set on this deployment.',
      fix: 'Vercel → your project → Settings → Environment Variables → add IYELLE_PASSWORD, then redeploy.'
    });
  }

  const given = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!given || !safeEqual(given, pw)) {
    // There is nowhere to keep a per-IP counter without a database, so a
    // fixed delay is the brake on guessing. Use a long password.
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'wrong_password', message: 'That password is not right.' });
  }

  res.setHeader('set-cookie', sessionCookie(pw));
  return res.status(200).json({ ok: true });
};
