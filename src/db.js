require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/event_booking',
  max: Number(process.env.DB_POOL_MAX) || 20,
});

// An idle connection can die (database restart, network blip). Without this handler Node would
// treat it as an unhandled error and crash the whole server.
pool.on('error', (err) => console.error('Unexpected idle database client error:', err.message));

// Query logging (course guide, week 11): LOG_QUERIES=on prints every SQL statement and how long it took.
// Wrapping client.query on connect covers pool.query() and transaction clients from pool.connect().
if (process.env.LOG_QUERIES === 'on') {
  pool.on('connect', (client) => {
    const original = client.query.bind(client);
    client.query = (...args) => {
      const started = Date.now();
      const sql = String(typeof args[0] === 'string' ? args[0] : (args[0] && args[0].text) || '').replace(/\s+/g, ' ').trim();
      const result = original(...args);
      if (result && typeof result.then === 'function') {
        const log = () => console.log(`[sql ${Date.now() - started} ms] ${sql.slice(0, 110)}`);
        result.then(log, log);   // both handlers keep the returned promise untouched
      }
      return result;
    };
  });
}

module.exports = { pool };
