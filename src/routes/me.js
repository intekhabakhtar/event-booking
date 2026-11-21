const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MAX_BOOKINGS_PER_STUDENT } = require('../config');

const router = express.Router();

// My profile
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, active_bookings FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User no longer exists' });
    res.json({ ...rows[0], max_bookings: MAX_BOOKINGS_PER_STUDENT });
  } catch (err) { next(err); }
});

// Change my name
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.length > 100) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'name is required (max 100 characters)' });
    }
    const { rows } = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role, active_bookings',
      [name.trim(), req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User no longer exists' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// My bookings + my waitlist entries
router.get('/bookings', requireAuth, async (req, res, next) => {
  try {
    const bookings = await pool.query(
      `SELECT b.id, b.created_at, e.id AS event_id, e.title, e.venue, e.event_date
       FROM bookings b JOIN events e ON e.id = b.event_id
       WHERE b.user_id = $1 ORDER BY e.event_date`, [req.user.id]);
    const waitlist = await pool.query(
      `SELECT w.event_id, e.title, e.venue, e.event_date,
              (SELECT count(*)::int FROM waitlist w2 WHERE w2.event_id = w.event_id AND w2.id <= w.id) AS position
       FROM waitlist w JOIN events e ON e.id = w.event_id
       WHERE w.user_id = $1 ORDER BY w.id`, [req.user.id]);
    res.json({ bookings: bookings.rows, waitlist: waitlist.rows });
  } catch (err) { next(err); }
});

// My booking history (append-only log, newest first): booked, cancelled, promoted from the waitlist, event deleted
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, event_id, event_title, action, created_at
       FROM booking_history WHERE user_id = $1 ORDER BY id DESC LIMIT 100`, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
