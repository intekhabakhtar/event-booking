const app = require('./app');
const { pool } = require('./db');
const { PORT, guardOn } = require('./config');

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}  (GUARD=${guardOn() ? 'on' : 'OFF'})`);
});

// Finish in-flight requests, then close DB connections (Ctrl+C, docker stop, hosting restarts)
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
