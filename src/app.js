const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DIST = path.join(__dirname, '..', 'client', 'dist'); // built React app

app.disable('x-powered-by');
app.use((req, res, next) => {                              // basic security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});
app.use(express.json({ limit: '50kb' }));                  // parse JSON bodies into req.body

// health check for hosting platforms / Docker (also proves the database answers)
app.get('/api/health', async (req, res) => {
  try {
    await require('./db').pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'database_down' });
  }
});

// auth endpoints: max AUTH_RATE_LIMIT (default 100) attempts per IP per 15 minutes (disabled under Jest so tests are not throttled)
const authLimiter = process.env.NODE_ENV === 'test' ? (req, res, next) => next() : require('./middleware/rateLimit')({ max: Number(process.env.AUTH_RATE_LIMIT) || 100 });
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/me', require('./routes/me'));
app.use('/api/admin', require('./routes/admin'));

// unknown API route
app.use('/api', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'No such endpoint' }));

// Serve the built React app (npm run build). Any other URL returns index.html so React Router can handle it.
app.use(express.static(DIST));
app.get('*', (req, res) => {
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(200).send('API is running. The React frontend is not built yet: run "npm run build" (or "npm run dev:client" for development).');
});

// central error handler (bad JSON, unexpected bugs)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Malformed JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
});

module.exports = app;
