const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

// AUTHENTICATION: "who are you?" -> verify the token and attach the user to req
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';           // "Bearer <token>"
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);           // throws if tampered or expired
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

// AUTHORIZATION: "are you allowed?" -> only admins pass
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin only' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
