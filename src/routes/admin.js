// Admin-only endpoints: dashboard numbers, reports, and booking management.
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const svc = require('../services/bookingService');

const router = express.Router();
router.use(requireAuth, requireAdmin); // every route below needs a valid token AND role = admin

function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 2147483647 ? n : null;
}

// ---- dashboard numbers -----------------------------------------------------
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM users WHERE role = 'student')::int AS students,
             (SELECT count(*) FROM events)::int                       AS events,
             (SELECT count(*) FROM bookings)::int                     AS bookings,
             (SELECT count(*) FROM waitlist)::int                     AS waitlisted,
             (SELECT count(*) FROM events WHERE seats_taken >= capacity)::int AS sold_out_events`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ---- reports (JOIN / GROUP BY / HAVING / aggregates) -----------------------
router.get('/reports', async (req, res, next) => {
  try {
    // 1. Fill rate and waitlist size per event (LEFT JOIN + GROUP BY in a subquery)
    const perEvent = await pool.query(`
      SELECT e.id, e.title, e.event_date, e.capacity, e.seats_taken,
             ROUND(100.0 * e.seats_taken / e.capacity, 1)::float AS fill_percent,
             COALESCE(w.n, 0)::int AS waitlist_count
      FROM events e
      LEFT JOIN (SELECT event_id, count(*) AS n FROM waitlist GROUP BY event_id) w ON w.event_id = e.id
      ORDER BY fill_percent DESC, e.id
      LIMIT 100`);

    // 2. Bookings per day, last 14 days that have bookings
    const perDay = await pool.query(`
      SELECT created_at::date AS day, count(*)::int AS bookings
      FROM bookings GROUP BY created_at::date ORDER BY day DESC LIMIT 14`);

    // 3. Integrity check: the counter on events must equal the real number of booking rows.
    //    HAVING keeps only the events where they disagree. The list should always be empty.
    const mismatches = await pool.query(`
      SELECT e.id, e.title, e.seats_taken, count(b.id)::int AS actual_bookings
      FROM events e LEFT JOIN bookings b ON b.event_id = e.id
      GROUP BY e.id HAVING e.seats_taken <> count(b.id)`);

    res.json({ perEvent: perEvent.rows, perDay: perDay.rows, integrityMismatches: mismatches.rows });
  } catch (err) { next(err); }
});

// ---- manage bookings of one event (paginated) ------------------------------
router.get('/events/:id/bookings', async (req, res, next) => {
  try {
    const eventId = intParam(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid event id' });
    const page = intParam(req.query.page) || 1;
    const limit = Math.min(intParam(req.query.limit) || 20, 100);

    const ev = await pool.query('SELECT id, title, capacity, seats_taken FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'EVENT_NOT_FOUND', message: 'Event does not exist' });

    const rows = await pool.query(
      `SELECT b.id, b.created_at, u.id AS user_id, u.name, u.email
       FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.event_id = $1
       ORDER BY b.id LIMIT $2 OFFSET $3`, [eventId, limit, (page - 1) * limit]);
    res.json({ event: ev.rows[0], page, limit, total: ev.rows[0].seats_taken, bookings: rows.rows });
  } catch (err) { next(err); }
});

// ---- admin cancels a student's booking (same transaction as a normal cancel) ----
router.delete('/events/:id/bookings/:userId', async (req, res, next) => {
  try {
    const eventId = intParam(req.params.id);
    const userId = intParam(req.params.userId);
    if (!eventId || !userId) return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid id' });
    const r = await svc.cancelBooking(userId, eventId, 'admin');
    res.status(r.status).json(r.body);
  } catch (err) { next(err); }
});

module.exports = router;
