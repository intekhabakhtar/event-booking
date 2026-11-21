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

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      ['Admin', 'admin@college.edu', hash]
    );

    // [title, description, venue, days from today, capacity, registration closes N hours before the event (null = until it starts)]
    const events = [
      ['Hackathon', '24-hour coding contest', 'Main Auditorium', 14, 100, 24],
      ['AI Workshop', 'Hands-on intro to machine learning', 'Lab 3', 21, 40, 48],
      ['Cultural Fest Night', 'Music and dance performances', 'Open Air Theatre', 30, 250, null],
      ['Tiny Seminar', 'Only 2 seats - good for testing the waitlist', 'Room 101', 45, 2, null],
    ];  // always in the future, whenever you run setup
    for (const [title, description, venue, days, capacity, hoursBefore] of events) {
      const date = new Date(Date.now() + days * 864e5);
      const deadline = hoursBefore === null ? null : new Date(date.getTime() - hoursBefore * 36e5);
      await pool.query(
        `INSERT INTO events (title, description, venue, event_date, registration_deadline, capacity)
         VALUES ($1,$2,$3,$4,$5,$6)`, [title, description, venue, date, deadline, capacity]);
    }
    console.log('Database ready. Admin login: admin@college.edu / ' + adminPassword);
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
