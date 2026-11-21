// Bulk demo data: 5,000 students, 60 events, 10,000 bookings (all done inside SQL for speed).
// Run AFTER "npm run setup":   npm run seed
// Every seeded student has the password:  password123   (email: student1@seed.test ... student5000@seed.test)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

const STUDENTS = 5000;
const EVENTS = 60;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // make the script re-runnable
    await client.query(`DELETE FROM events WHERE title LIKE 'Seed Event %'`);
    await client.query(`DELETE FROM users  WHERE email LIKE '%@seed.test'`);

    const hash = await bcrypt.hash('password123', 10); // hash once, reuse for everyone

    await client.query(
      `INSERT INTO users (name, email, password_hash)
       SELECT 'Student ' || g, 'student' || g || '@seed.test', $1 FROM generate_series(1, $2) g`,
      [hash, STUDENTS]);

    // capacity is a placeholder here; it is set properly after the bookings exist
    await client.query(
      `INSERT INTO events (title, description, venue, event_date, capacity)
       SELECT 'Seed Event ' || g,
              'Generated event number ' || g,
              (ARRAY['Main Auditorium','Lab 3','Seminar Hall','Open Air Theatre','Library Hall'])[1 + g % 5],
              now() + (g || ' days')::interval,
              1
       FROM generate_series(1, $1) g`, [EVENTS]);

    // each student books 2 different events (so 10,000 bookings, 2 of the 3 allowed per student)
    await client.query(
      `WITH ev AS (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM events WHERE title LIKE 'Seed Event %'),
            st AS (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM users  WHERE email LIKE '%@seed.test')
       INSERT INTO bookings (user_id, event_id)
       SELECT st.id, ev.id FROM st JOIN ev ON ev.n = st.n % $1
       UNION ALL
       SELECT st.id, ev.id FROM st JOIN ev ON ev.n = (st.n + 17) % $1`, [EVENTS]);

    // counters must match the real rows. Every 5th event is exactly full, the others have 10-40 spare seats.
    await client.query(
      `UPDATE events e
       SET seats_taken = c.n, capacity = c.n + (e.id % 5) * 10
       FROM (SELECT event_id, count(*)::int AS n FROM bookings GROUP BY event_id) c
       WHERE c.event_id = e.id AND e.title LIKE 'Seed Event %'`);
    await client.query(
      `UPDATE users SET active_bookings = 2 WHERE email LIKE '%@seed.test'`);

    // history: one BOOKED row per seeded booking, so "My booking history" is never empty for demo students
    await client.query(
      `INSERT INTO booking_history (user_id, event_id, event_title, action, created_at)
       SELECT b.user_id, b.event_id, e.title, 'BOOKED', b.created_at
       FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.title LIKE 'Seed Event %'`);

    await client.query('COMMIT');

    const r = await pool.query(
      `SELECT (SELECT count(*) FROM users)    AS users,
              (SELECT count(*) FROM events)   AS events,
              (SELECT count(*) FROM bookings) AS bookings,
              (SELECT count(*) FROM booking_history) AS history_rows`);
    console.log('Seed done:', r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
