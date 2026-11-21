// Tiny in-memory rate limiter (per IP). Enough to slow down password guessing on /api/auth/*.
// For several server instances use a shared store (e.g. Redis) instead.
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
  }, windowMs);
  timer.unref(); // never keep the process alive just for cleanup

  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.resetAt <= now) { h = { count: 0, resetAt: now + windowMs }; hits.set(req.ip, h); }
    h.count++;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' });
    }
    next();
  };
}
module.exports = rateLimit;
