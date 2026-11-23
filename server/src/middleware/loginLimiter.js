// In-memory brute-force guard for /api/auth/login.
// Counted per username, not per IP: on a shop PC every login comes from the same machine, so
// per-IP counting would let one cashier's typos lock everyone out. After MAX_FAILURES failures
// for a username, its logins are refused until LOCK_MS after the first failure. A success clears it.

const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

const failures = new Map(); // username -> { count, firstAt }

function keyFor(req) {
  return String((req.body && req.body.username) || '').trim().toLowerCase();
}

function current(key, now) {
  const e = failures.get(key);
  if (e && now - e.firstAt > LOCK_MS) {
    failures.delete(key);
    return null;
  }
  return e || null;
}

function loginLimiter(req, res, next) {
  const now = Date.now();
  const e = current(keyFor(req), now);
  if (e && e.count >= MAX_FAILURES) {
    const retryAfterSec = Math.ceil((e.firstAt + LOCK_MS - now) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`
    });
  }
  next();
}

function recordLoginFailure(req) {
  const now = Date.now();
  const key = keyFor(req);
  const e = current(key, now);
  if (e) e.count += 1;
  else failures.set(key, { count: 1, firstAt: now });
}

function recordLoginSuccess(req) {
  failures.delete(keyFor(req));
}

function resetLoginLimiter() {
  failures.clear();
}

module.exports = { loginLimiter, recordLoginFailure, recordLoginSuccess, resetLoginLimiter, MAX_FAILURES, LOCK_MS };
