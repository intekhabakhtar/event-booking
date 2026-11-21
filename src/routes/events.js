const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const svc = require('../services/bookingService');

const router = express.Router();

// Validate :id (positive integer that fits a Postgres INT)
function parseId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid event id' });
  }
  req.eventId = id;
  next();
}

// Server-side validation: runs even if somebody skips the React form and calls the API directly.
function validateEvent(body) {
  const { title, description = '', venue, event_date, capacity, registration_deadline } = body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 150) return { error: 'title is required (max 150 characters)' };
  if (typeof venue !== 'string' || !venue.trim() || venue.length > 150) return { error: 'venue is required (max 150 characters)' };
  if (!event_date || Number.isNaN(Date.parse(event_date))) return { error: 'a valid event_date is required' };
  const cap = Number(capacity);
  if (capacity === '' || capacity === null || !Number.isInteger(cap) || cap < 1 || cap > 100000) {
    return { error: 'capacity must be an integer between 1 and 100000' };
  }
  // registration_deadline is optional: empty / missing = booking stays open until the event starts
  let deadline = null;
  if (registration_deadline !== undefined && registration_deadline !== null && registration_deadline !== '') {
    if (Number.isNaN(Date.parse(registration_deadline))) return { error: 'registration_deadline must be a valid date' };
    if (Date.parse(registration_deadline) > Date.parse(event_date)) {
      return { error: 'registration_deadline cannot be after the event date' };
    }
    deadline = registration_deadline;
  }
  return {
    values: {
      title: title.trim(), description: String(description).slice(0, 1000),
      venue: venue.trim(), event_date, registration_deadline: deadline, capacity: cap,
    },
  };
}

const send = (res, r) => res.status(r.status).json(r.body);
const EVENT_COLS = `id, title, description, venue, event_date, registration_deadline, capacity, seats_taken,
                    capacity - seats_taken AS seats_left`;

// ---- public: list / details ------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLS} FROM events
       WHERE ($1 = '' OR title ILIKE '%' || $1 || '%' OR venue ILIKE '%' || $1 || '%')
       ORDER BY event_date, id`, [search]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', parseId, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${EVENT_COLS} FROM events WHERE id = $1`, [req.eventId]);
    if (!rows[0]) return res.status(404).json({ error: 'EVENT_NOT_FOUND', message: 'Event does not exist' });
    const wl = await pool.query('SELECT count(*)::int AS n FROM waitlist WHERE event_id = $1', [req.eventId]);
    res.json({ ...rows[0], waitlist_count: wl.rows[0].n });
  } catch (err) { next(err); }
});

// ---- admin: create / update / delete ---------------------------------------
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const v = validateEvent(req.body);
    if (v.error) return res.status(400).json({ error: 'INVALID_INPUT', message: v.error });
    const { title, description, venue, event_date, registration_deadline, capacity } = v.values;
    const { rows } = await pool.query(
      `INSERT INTO events (title, description, venue, event_date, registration_deadline, capacity)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description, venue, event_date, registration_deadline, capacity]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, requireAdmin, parseId, async (req, res, next) => {
  try {
    const v = validateEvent(req.body);
    if (v.error) return res.status(400).json({ error: 'INVALID_INPUT', message: v.error });
    send(res, await svc.updateEvent(req.eventId, v.values));
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireAdmin, parseId, async (req, res, next) => {
  try {
    send(res, await svc.deleteEvent(req.eventId));
  } catch (err) { next(err); }
});

// ---- student: book / cancel / waitlist -------------------------------------
router.post('/:id/book', requireAuth, parseId, async (req, res, next) => {
  try { send(res, await svc.bookSeat(req.user.id, req.eventId)); } catch (err) { next(err); }
});

router.delete('/:id/book', requireAuth, parseId, async (req, res, next) => {
  try { send(res, await svc.cancelBooking(req.user.id, req.eventId)); } catch (err) { next(err); }
});

router.post('/:id/waitlist', requireAuth, parseId, async (req, res, next) => {
  try { send(res, await svc.joinWaitlist(req.user.id, req.eventId)); } catch (err) { next(err); }
});

router.delete('/:id/waitlist', requireAuth, parseId, async (req, res, next) => {
  try { send(res, await svc.leaveWaitlist(req.user.id, req.eventId)); } catch (err) { next(err); }
});

module.exports = router;
