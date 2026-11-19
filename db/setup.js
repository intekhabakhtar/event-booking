// Creates tables (db/schema.sql) and inserts an admin + sample events.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);

    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      ['Admin', 'admin@college.edu', hash]
    );

    const events = [
      ['Hackathon 2026', '24-hour coding contest', 'Main Auditorium', '2026-12-05 09:00+05:30', 100],
      ['AI Workshop', 'Hands-on intro to machine learning', 'Lab 3', '2026-12-08 14:00+05:30', 40],
      ['Cultural Fest Night', 'Music and dance performances', 'Open Air Theatre', '2026-12-12 18:00+05:30', 250],
      ['Tiny Seminar', 'Only 2 seats - good for testing the waitlist', 'Room 101', '2026-12-15 11:00+05:30', 2],
    ];
    for (const e of events) {
      await pool.query(
        `INSERT INTO events (title, description, venue, event_date, capacity) VALUES ($1,$2,$3,$4,$5)`, e);
    }
    console.log('Database ready. Admin login: admin@college.edu / admin123');
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
