// All seat logic lives here. Every function returns { status, body }.
// Lock order is ALWAYS: events row first, then users row. Same order everywhere = no deadlocks.
const { pool } = require('../db');
const { guardOn, MAX_BOOKINGS_PER_STUDENT } = require('../config');

const result = (status, body) => ({ status, body });
const fail = (status, error, message) => result(status, { error, message });

// Postgres error codes we care about
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const DEADLOCK = '40P01';
const SERIALIZATION = '40001';

// Two cancels on DIFFERENT events can promote overlapping waitlisted students in different orders,
// which PostgreSQL may resolve by aborting one transaction (deadlock). The transaction is safe to
// run again, so retry a few times instead of returning a 500.
async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if ((err.code === DEADLOCK || err.code === SERIALIZATION) && i < attempts) {
        await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30));
        continue;
      }
      throw err;
    }
  }
}

// Append one row to the booking history (runs inside the caller's transaction, so the history entry
// is saved if and only if the booking change is saved).
const logHistory = (client, userId, eventId, title, action) =>
  client.query(
    'INSERT INTO booking_history (user_id, event_id, event_title, action) VALUES ($1, $2, $3, $4)',
    [userId, eventId, title, action]);

// Booking and waitlisting close when the event starts, or earlier if the admin set a registration deadline.
function closedReason(ev) {
  const now = new Date();
  if (new Date(ev.event_date) <= now) return ['EVENT_PAST', 'This event has already started or finished'];
  if (ev.registration_deadline && new Date(ev.registration_deadline) <= now) {
    return ['REGISTRATION_CLOSED', 'Registration for this event has closed'];
  }
  return null;
}

// ---------------------------------------------------------------------------
// BOOK A SEAT
// ---------------------------------------------------------------------------
async function bookSeat(userId, eventId) {
  const guard = guardOn();
  const client = await pool.connect(); // take one connection from the pool
  try {
    await client.query('BEGIN');

    // 1. Read the event. With the guard ON we lock the row (FOR UPDATE):
    //    any other transaction wanting this row must wait until we COMMIT/ROLLBACK.
    const ev = await client.query(
      `SELECT title, capacity, seats_taken, event_date, registration_deadline
       FROM events WHERE id = $1 ${guard ? 'FOR UPDATE' : ''}`,
      [eventId]
    );
    if (ev.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'EVENT_NOT_FOUND', 'Event does not exist');
    }
    const event = ev.rows[0];

    if (guard) {
      // 2. Application-level checks (safe because the row is locked)
      const closed = closedReason(event);
      if (closed) {
        await client.query('ROLLBACK');
        return fail(409, closed[0], closed[1]);
      }
      if (event.seats_taken >= event.capacity) {
        await client.query('ROLLBACK');
        return fail(409, 'SOLD_OUT', 'No seats left for this event');
      }

      // 3. Per-student limit: lock the student's row and check their counter
      const u = await client.query(
        'SELECT active_bookings FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (u.rowCount === 0) {
        await client.query('ROLLBACK');
        return fail(401, 'UNAUTHORIZED', 'User no longer exists');
      }
      if (u.rows[0].active_bookings >= MAX_BOOKINGS_PER_STUDENT) {
        await client.query('ROLLBACK');
        return fail(409, 'LIMIT_REACHED',
          `A student can hold at most ${MAX_BOOKINGS_PER_STUDENT} bookings`);
      }
    }

    // 4. Record the booking (UNIQUE(user_id, event_id) blocks duplicates)
    await client.query('INSERT INTO bookings (user_id, event_id) VALUES ($1, $2)', [userId, eventId]);

    // 5. Increase both counters. These two UPDATEs are where the CHECK constraints fire
    //    if anything above was bypassed (GUARD=off) or buggy.
    await client.query('UPDATE events SET seats_taken = seats_taken + 1 WHERE id = $1', [eventId]);
    await client.query('UPDATE users  SET active_bookings = active_bookings + 1 WHERE id = $1', [userId]);
    await logHistory(client, userId, eventId, event.title, 'BOOKED');

    await client.query('COMMIT'); // steps 4 and 5 become permanent together, or not at all
    return result(201, { code: 'BOOKED', message: 'Seat booked', eventId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === UNIQUE_VIOLATION) {
      return fail(409, 'ALREADY_BOOKED', 'You already booked this event');
    }
    if (err.code === CHECK_VIOLATION) {
      // Only reachable when the app guard is bypassed: the database refused to go wrong.
      return fail(500, 'CONSTRAINT_VIOLATION', `Database CHECK blocked the write (${err.constraint})`);
    }
    throw err;
  } finally {
    client.release(); // ALWAYS give the connection back, even after errors
  }
}

// ---------------------------------------------------------------------------
// CANCEL A BOOKING (+ promote the first eligible person on the waitlist)
// `by` is 'user' (student cancels own booking) or 'admin' (admin cancels it); only the history label differs.
// ---------------------------------------------------------------------------
async function cancelBookingOnce(userId, eventId, by = 'user') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ev = await client.query('SELECT title FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (ev.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'EVENT_NOT_FOUND', 'Event does not exist');
    }
    const title = ev.rows[0].title;

    // DELETE ... RETURNING is atomic: if the same cancel arrives twice, only one gets a row back
    const del = await client.query(
      'DELETE FROM bookings WHERE user_id = $1 AND event_id = $2 RETURNING id', [userId, eventId]);
    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'BOOKING_NOT_FOUND', 'You have no booking for this event');
    }

    await client.query('UPDATE events SET seats_taken = seats_taken - 1 WHERE id = $1', [eventId]);
    await client.query('UPDATE users  SET active_bookings = active_bookings - 1 WHERE id = $1', [userId]);
    await logHistory(client, userId, eventId, title, by === 'admin' ? 'CANCELLED_BY_ADMIN' : 'CANCELLED');

    const promoted = await promoteFromWaitlist(client, eventId, title);

    await client.query('COMMIT');
    return result(200, { code: 'CANCELLED', message: 'Booking cancelled', promotedUserId: promoted });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Runs INSIDE the cancel transaction (event row already locked), so "free seat -> give it away"
// is one atomic step and nobody can sneak in between.
async function promoteFromWaitlist(client, eventId, title) {
  const queue = await client.query(
    'SELECT id, user_id FROM waitlist WHERE event_id = $1 ORDER BY id', [eventId]);

  for (const entry of queue.rows) {
    const u = await client.query(
      'SELECT active_bookings FROM users WHERE id = $1 FOR UPDATE', [entry.user_id]);
    // skip students who are already at their booking limit (they stay on the waitlist)
    if (!u.rows[0] || u.rows[0].active_bookings >= MAX_BOOKINGS_PER_STUDENT) continue;

    await client.query('DELETE FROM waitlist WHERE id = $1', [entry.id]);
    await client.query('INSERT INTO bookings (user_id, event_id) VALUES ($1, $2)', [entry.user_id, eventId]);
    await client.query('UPDATE events SET seats_taken = seats_taken + 1 WHERE id = $1', [eventId]);
    await client.query('UPDATE users SET active_bookings = active_bookings + 1 WHERE id = $1', [entry.user_id]);
    await logHistory(client, entry.user_id, eventId, title, 'PROMOTED');
    return entry.user_id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// WAITLIST: join / leave
// ---------------------------------------------------------------------------
async function joinWaitlist(userId, eventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the event so a cancellation cannot free a seat between our check and our insert
    const ev = await client.query(
      `SELECT capacity, seats_taken, event_date, registration_deadline
       FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
    if (ev.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'EVENT_NOT_FOUND', 'Event does not exist');
    }
    const closed = closedReason(ev.rows[0]);
    if (closed) {
      await client.query('ROLLBACK');
      return fail(409, closed[0], closed[1]);
    }
    if (ev.rows[0].seats_taken < ev.rows[0].capacity) {
      await client.query('ROLLBACK');
      return fail(409, 'SEATS_AVAILABLE', 'Seats are available, book directly instead');
    }
    const already = await client.query(
      'SELECT 1 FROM bookings WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
    if (already.rowCount > 0) {
      await client.query('ROLLBACK');
      return fail(409, 'ALREADY_BOOKED', 'You already booked this event');
    }
    await client.query('INSERT INTO waitlist (user_id, event_id) VALUES ($1, $2)', [userId, eventId]);
    const pos = await client.query(
      `SELECT count(*)::int AS position FROM waitlist WHERE event_id = $1`, [eventId]);
    await client.query('COMMIT');
    return result(201, { code: 'WAITLISTED', message: 'Added to waitlist', position: pos.rows[0].position });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === UNIQUE_VIOLATION) {
      return fail(409, 'ALREADY_WAITLISTED', 'You are already on the waitlist');
    }
    throw err;
  } finally {
    client.release();
  }
}

async function leaveWaitlist(userId, eventId) {
  const del = await pool.query(
    'DELETE FROM waitlist WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
  if (del.rowCount === 0) return fail(404, 'WAITLIST_ENTRY_NOT_FOUND', 'You are not on this waitlist');
  return result(200, { code: 'LEFT_WAITLIST', message: 'Removed from waitlist' });
}

// ---------------------------------------------------------------------------
// ADMIN: UPDATE AN EVENT (raising capacity frees seats -> give them to the waitlist)
// ---------------------------------------------------------------------------
async function updateEventOnce(eventId, v) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (ev.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'EVENT_NOT_FOUND', 'Event does not exist');
    }
    // If capacity < seats_taken, the CHECK constraint refuses this UPDATE (caught below)
    await client.query(
      `UPDATE events SET title=$1, description=$2, venue=$3, event_date=$4, registration_deadline=$5, capacity=$6
       WHERE id=$7`,
      [v.title, v.description, v.venue, v.event_date, v.registration_deadline, v.capacity, eventId]);

    // New free seats? Promote waiting students until the event is full or the queue is empty.
    let promoted = 0;
    for (;;) {
      const cur = await client.query('SELECT capacity, seats_taken FROM events WHERE id = $1', [eventId]);
      if (cur.rows[0].seats_taken >= cur.rows[0].capacity) break;
      const who = await promoteFromWaitlist(client, eventId, v.title);
      if (who === null) break;
      promoted++;
    }
    // re-read so the response shows the final numbers (after any promotions)
    const final = await client.query('SELECT * FROM events WHERE id = $1', [eventId]);
    await client.query('COMMIT');
    return result(200, { ...final.rows[0], promoted });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === CHECK_VIOLATION) {
      if (err.constraint === 'events_no_overbooking') {
        return fail(409, 'CAPACITY_BELOW_BOOKED', 'Capacity cannot be lower than the seats already booked');
      }
      return fail(400, 'INVALID_INPUT', 'The registration deadline cannot be after the event date');
    }
    throw err;
  } finally {
    client.release();
  }
}

const cancelBooking = (userId, eventId, by = 'user') => withRetry(() => cancelBookingOnce(userId, eventId, by));
const updateEvent = (eventId, v) => withRetry(() => updateEventOnce(eventId, v));

// ---------------------------------------------------------------------------
// ADMIN: DELETE AN EVENT
// ON DELETE CASCADE removes the booking rows, but it cannot touch users.active_bookings.
// Without this fix every student who held a seat would permanently lose one of their 3 slots.
// The history keeps an EVENT_DELETED row for each of them.
// ---------------------------------------------------------------------------
async function deleteEvent(eventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query('SELECT title FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (ev.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(404, 'EVENT_NOT_FOUND', 'Event does not exist');
    }
    // lock + fix the affected students in id order (fixed order = no deadlocks)
    await client.query(
      `SELECT id FROM users WHERE id IN (SELECT user_id FROM bookings WHERE event_id = $1) ORDER BY id FOR UPDATE`,
      [eventId]);
    await client.query(
      `INSERT INTO booking_history (user_id, event_id, event_title, action)
       SELECT user_id, event_id, $2::text, 'EVENT_DELETED' FROM bookings WHERE event_id = $1`,
      [eventId, ev.rows[0].title]);
    await client.query(
      `UPDATE users SET active_bookings = active_bookings - 1
       WHERE id IN (SELECT user_id FROM bookings WHERE event_id = $1)`, [eventId]);
    await client.query('DELETE FROM events WHERE id = $1', [eventId]);
    await client.query('COMMIT');
    return result(200, { code: 'DELETED', message: 'Event deleted' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { bookSeat, cancelBooking, joinWaitlist, leaveWaitlist, updateEvent, deleteEvent };
