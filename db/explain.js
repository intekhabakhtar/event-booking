// Shows how PostgreSQL runs three typical queries (run "npm run seed" first for realistic volume).
//   npm run explain
require('dotenv').config();
const { pool } = require('../src/db');

async function show(title, sql, params = []) {
  console.log('\n=== ' + title + ' ===');
  const { rows } = await pool.query('EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) ' + sql, params);
  rows.forEach((r) => console.log(r['QUERY PLAN']));
}

(async () => {
  try {
    await pool.query('ANALYZE');
    const ev = (await pool.query(`SELECT id FROM events WHERE title = 'Seed Event 1'`)).rows[0];
    const user = (await pool.query(`SELECT id FROM users WHERE email = 'student1@seed.test'`)).rows[0];
    if (!ev || !user) { console.log('No seed data found. Run: npm run seed'); return; }

    await show('1. Who booked event X?  (uses idx_bookings_event)',
      'SELECT b.id, u.name FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.event_id = $1', [ev.id]);
    await show('2. My bookings  (uses the UNIQUE(user_id, event_id) index)',
      'SELECT b.id, e.title FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.user_id = $1', [user.id]);
    await show('3. Login lookup by email  (uses the UNIQUE index on users.email)',
      'SELECT id, password_hash FROM users WHERE email = $1', ['student4999@seed.test']);
    await show('4. For comparison: NO index on this column -> full table scan',
      `SELECT count(*) FROM users WHERE name = 'Student 4999'`);
    console.log('\nLook for "Index Scan" / "Bitmap Index Scan" (fast) vs "Seq Scan" (reads every row).');
  } finally {
    await pool.end();
  }
})();
