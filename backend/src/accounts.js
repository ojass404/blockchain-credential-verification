import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getAddress, verifyMessage } from 'ethers';
import { checkPassword, hashPassword, token, digest, userFields } from './database.js';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const requireRole = (user, ...roles) => { if (!roles.includes(user.role)) throw new HttpError(403, 'This account is not permitted to perform that action.'); };
export function originGuard(req, _res, next) {
  const expected = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:5173';
  if (process.env.NODE_ENV === 'production' && !expected.startsWith('https://')) return next(new HttpError(503, 'Production requires an HTTPS PUBLIC_ORIGIN.'));
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== expected) return next(new HttpError(403, 'Request origin is not allowed.'));
  next();
}
export function sessionMiddleware(db) {
  return (req, _res, next) => {
    const raw = /(?:^|;\s*)credential_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = raw && db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(digest(raw), Date.now());
    if (!session) return next(new HttpError(401, 'Sign in to continue.'));
    const user = db.prepare(`SELECT ${userFields} FROM users u LEFT JOIN institutions i ON i.id=u.institution_id WHERE u.id=?`).get(session.user_id);
    req.account = user; req.session = session;
    if (!['GET','HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrf) return next(new HttpError(403, 'Invalid session request token. Refresh and try again.'));
    next();
  };
}
const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/api', secure: process.env.NODE_ENV === 'production' };
// Dummy scrypt work prevents an obvious nonexistent-account timing shortcut.
const dummyPassword = await hashPassword(token());
export function accountRouter(db) {
  const router = Router();
  router.post('/login', rateLimit({ windowMs: 15 * 60000, limit: 20, message: { error: 'Too many sign-in attempts. Try again later.' } }), async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256) throw new HttpError(400, 'Enter an email and password.');
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    const valid = await checkPassword(password, user?.password_hash || dummyPassword);
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect.');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    const raw = token(), csrf = token();
    const old = /(?:^|;\s*)credential_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (old) db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(old));
    db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(raw), user.id, csrf, Date.now() + 8*3600000);
    res.cookie('credential_session', raw, { ...cookieOptions, maxAge: 8*3600000 }).json({ csrf });
  });
  router.use(sessionMiddleware(db));
  router.get('/me', (req, res) => res.json({ user: req.account, csrf: req.session.csrf, walletVerified: req.session.wallet_expires > Date.now() && req.session.verified_wallet === req.account.wallet }));
  router.post('/logout', (req, res) => { db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash); res.clearCookie('credential_session', cookieOptions).json({ ok: true }); });
  router.post('/wallet/challenge', (req, res) => {
    requireRole(req.account, 'institution', 'administrator');
    const expires = Date.now() + 5*60000;
    const message = `${process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:5173'} requests proof of wallet ownership.\nAccount: ${req.account.id}\nWallet: ${req.account.wallet}\nChain ID: 31337\nNonce: ${token()}\nExpires: ${new Date(expires).toISOString()}\nThis signature links this wallet to this authenticated session; it does not send a transaction.`;
    db.prepare('UPDATE sessions SET challenge=?,challenge_expires=? WHERE hash=?').run(message, expires, req.session.hash);
    res.json({ message, wallet: req.account.wallet });
  });
  router.post('/wallet/verify', (req, res) => {
    requireRole(req.account, 'institution', 'administrator');
    const { challenge, challenge_expires } = req.session;
    db.prepare('UPDATE sessions SET challenge=NULL,challenge_expires=NULL WHERE hash=?').run(req.session.hash);
    let address;
    try { address = getAddress(verifyMessage(challenge || '', req.body?.signature)); } catch { throw new HttpError(400, 'Invalid wallet signature.'); }
    if (!challenge || challenge_expires < Date.now() || address !== req.account.wallet) throw new HttpError(403, 'Signature must match the assigned wallet and an unexpired, unused challenge.');
    db.prepare('UPDATE sessions SET verified_wallet=?,wallet_expires=? WHERE hash=?').run(address, Date.now() + 30*60000, req.session.hash);
    res.json({ walletVerified: true });
  });
  return router;
}
export function requireWallet(req) {
  if (req.session.verified_wallet !== req.account.wallet || req.session.wallet_expires <= Date.now()) throw new HttpError(403, 'Verify ownership of your assigned wallet first.');
}
