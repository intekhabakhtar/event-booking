// Concurrency harness.  Usage:
//   npm run harness                (GUARD=on  : all scenarios, strict assertions)
//   GUARD=off npm run harness      (GUARD=off : scenarios 1 and 5 only, invariant assertions)
//
// It starts the real Express app, creates users directly in the DB (so we don't wait for 500 bcrypt
// hashes), signs a valid JWT for each, then fires real HTTP requests at the same time.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { pool } = require('../src/db');
const app = require('../src/app');
const { JWT_SECRET, guardOn, MAX_BOOKINGS_PER_STUDENT } = require('../src/config');

let base;
let failures = 0;

// ---------- helpers ----------
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${actual}`);
}
function checkTrue(label, cond, detail = '') {
  if (!cond) failures++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label} ${detail}`);
}

async function cleanup() {
  await pool.query(`DELETE FROM events WHERE title LIKE 'HARNESS%'`);
  await pool.query(`DELETE FROM users  WHERE email LIKE '%@harness.test'`);
}

async function makeUsers(n, tag) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'Harness ' || $2 || g, $2 || g || '@harness.test', 'not-a-real-hash'
     FROM generate_series(1, $1) g ORDER BY g RETURNING id`, [n, tag]);
  return rows.map((r) => ({ id: r.id, token: jwt.sign({ id: r.id, role: 'student' }, JWT_SECRET, { expiresIn: '10m' }) }));
}

async function makeEvent(capacity, label) {
  const { rows } = await pool.query(
    `INSERT INTO events (title, venue, event_date, capacity)
     VALUES ($1, 'Harness Hall', now() + interval '30 days', $2) RETURNING id`, ['HARNESS ' + label, capacity]);
  return rows[0].id;
}

// put users straight into an event as booked (bypasses the API on purpose: setup only)
async function seedBookings(eventId, users) {
  const ids = users.map((u) => u.id);
  await pool.query(`INSERT INTO bookings (user_id, event_id) SELECT u, $2 FROM unnest($1::int[]) u`, [ids, eventId]);
  await pool.query(`UPDATE events SET seats_taken = seats_taken + $2 WHERE id = $1`, [eventId, ids.length]);
  await pool.query(`UPDATE users SET active_bookings = active_bookings + 1 WHERE id = ANY($1::int[])`, [ids]);
}
async function seedWaitlist(eventId, users) {
  for (const u of users) { // sequential so queue order == array order
    await pool.query(`INSERT INTO waitlist (user_id, event_id) VALUES ($1, $2)`, [u.id, eventId]);
  }
}

// send one authenticated request, return { status, code }
// All requests are started at once, but they share 50 reusable connections. This keeps Windows
// from refusing hundreds of brand-new sockets at the same moment (that would be a test problem,
// not an application problem).
const http = require('http');
const agent = new http.Agent({ keepAlive: true, maxSockets: 50 });

function hit(method, url, user) {
  return new Promise((resolve) => {
    const req = http.request(base + url,
      { method, agent, headers: { Authorization: 'Bearer ' + user.token } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let body = {};
          try { body = JSON.parse(data); } catch (e) { /* not JSON */ }
          resolve({ status: res.statusCode, code: body.code || body.error || '-' });
        });
      });
    req.on('error', () => resolve({ status: 0, code: 'NETWORK_ERROR' }));
    req.end();
  });
}

function tally(results) {
  const t = {};
  for (const r of results) { const k = `${r.status} ${r.code}`; t[k] = (t[k] || 0) + 1; }
  return t;
}
const count = (results, status) => results.filter((r) => r.status === status).length;
function printTally(t) {
  console.log('  Response tally:');
  Object.entries(t).sort().forEach(([k, v]) => console.log(`    ${String(v).padStart(4)} x ${k}`));
}
async function one(sql, params) { return (await pool.query(sql, params)).rows[0]; }

// ---------- scenarios ----------
async function scenarioBooking() {
  const SEATS = 100, REQUESTS = 500;
  console.log(`\n=== Scenario 1: ${REQUESTS} concurrent bookings for ${SEATS} seats (GUARD=${guardOn() ? 'on' : 'OFF'}) ===`);
  const users = await makeUsers(REQUESTS, 'book');
  const ev = await makeEvent(SEATS, 'booking race');

  const t0 = Date.now();
  const results = await Promise.all(users.map((u) => hit('POST', `/api/events/${ev}/book`, u)));
  console.log(`  ${REQUESTS} requests finished in ${Date.now() - t0} ms`);
  printTally(tally(results));

  const e = await one('SELECT seats_taken, capacity FROM events WHERE id=$1', [ev]);
  const b = await one('SELECT count(*)::int AS n FROM bookings WHERE event_id=$1', [ev]);

  if (guardOn()) {
    check('201 responses', count(results, 201), SEATS);
    check('409 responses', count(results, 409), REQUESTS - SEATS);
    check('409 all SOLD_OUT', results.filter((r) => r.status === 409 && r.code === 'SOLD_OUT').length, REQUESTS - SEATS);
    check('500 responses', count(results, 500), 0);
    check('events.seats_taken', e.seats_taken, SEATS);
    check('COUNT(bookings)', b.n, SEATS);
  } else {
    console.log('  (guard removed: some requests may fail with CHECK violations - the DATA must still be correct)');
    console.log(`  INFO  ${count(results, 500)} requests were stopped by the database CHECK constraint`);
    checkTrue('seats_taken <= capacity', e.seats_taken <= e.capacity, `(${e.seats_taken} <= ${e.capacity})`);
    check('seats_taken == COUNT(bookings)', e.seats_taken, b.n);
    check('seats_taken == number of 201s', e.seats_taken, count(results, 201));
    checkTrue('no network errors', count(results, 0) === 0);
  }
}

async function scenarioCancel() {
  console.log('\n=== Scenario 2: cancellation race (100 users cancel at once + 9 duplicate cancels from user #1) ===');
  const users = await makeUsers(100, 'cancel');
  const ev = await makeEvent(100, 'cancel race');
  await seedBookings(ev, users);

  const reqs = users.map((u) => hit('DELETE', `/api/events/${ev}/book`, u));
  for (let i = 0; i < 9; i++) reqs.push(hit('DELETE', `/api/events/${ev}/book`, users[0]));
  const results = await Promise.all(reqs);
  printTally(tally(results));

  check('200 responses', count(results, 200), 100);
  check('404 responses (duplicates)', count(results, 404), 9);
  check('500 responses', count(results, 500), 0);
  check('events.seats_taken', (await one('SELECT seats_taken FROM events WHERE id=$1', [ev])).seats_taken, 0);
  check('COUNT(bookings)', (await one('SELECT count(*)::int n FROM bookings WHERE event_id=$1', [ev])).n, 0);
  check('students with active_bookings != 0',
    (await one('SELECT count(*)::int n FROM users WHERE id = ANY($1::int[]) AND active_bookings <> 0', [users.map(u => u.id)])).n, 0);
}

async function scenarioWaitlist() {
  console.log('\n=== Scenario 3: waitlist promotion (cap 10, 10 booked, 15 waiting, 10 cancel at once) ===');
  const booked = await makeUsers(10, 'wbooked');
  const waiting = await makeUsers(15, 'wwait');
  const ev = await makeEvent(10, 'waitlist');
  await seedBookings(ev, booked);
  await seedWaitlist(ev, waiting);

  const results = await Promise.all(booked.map((u) => hit('DELETE', `/api/events/${ev}/book`, u)));
  printTally(tally(results));

  check('200 responses', count(results, 200), 10);
  check('500 responses', count(results, 500), 0);
  check('events.seats_taken (still full)', (await one('SELECT seats_taken FROM events WHERE id=$1', [ev])).seats_taken, 10);
  const holders = (await pool.query('SELECT user_id FROM bookings WHERE event_id=$1', [ev])).rows.map((r) => r.user_id).sort((a, b) => a - b);
  const first10 = waiting.slice(0, 10).map((u) => u.id).sort((a, b) => a - b);
  checkTrue('seat holders are exactly the first 10 in the queue', JSON.stringify(holders) === JSON.stringify(first10));
  check('people still on waitlist', (await one('SELECT count(*)::int n FROM waitlist WHERE event_id=$1', [ev])).n, 5);
}

async function scenarioLimit() {
  const N = 10;
  console.log(`\n=== Scenario 4: per-student limit (1 student, ${N} concurrent bookings on ${N} events, limit ${MAX_BOOKINGS_PER_STUDENT}) ===`);
  const [user] = await makeUsers(1, 'limit');
  const events = [];
  for (let i = 0; i < N; i++) events.push(await makeEvent(5, 'limit ' + i));

  const results = await Promise.all(events.map((ev) => hit('POST', `/api/events/${ev}/book`, user)));
  printTally(tally(results));

  check('201 responses', count(results, 201), MAX_BOOKINGS_PER_STUDENT);
  check('409 LIMIT_REACHED', results.filter((r) => r.status === 409 && r.code === 'LIMIT_REACHED').length, N - MAX_BOOKINGS_PER_STUDENT);
  check('500 responses', count(results, 500), 0);
  check('users.active_bookings', (await one('SELECT active_bookings FROM users WHERE id=$1', [user.id])).active_bookings, MAX_BOOKINGS_PER_STUDENT);
}

// The smallest possible race (the original proposal test), repeated so a lucky ordering cannot hide a bug:
// event of 100 seats with 99 already booked, two different students click Book on the LAST seat at the same instant.
async function scenarioLastSeat() {
  const ROUNDS = 10, CAP = 100;
  console.log(`\n=== Scenario 5: last-seat race, ${ROUNDS} rounds (${CAP} seats, ${CAP - 1} booked, 2 students book the last one at once) ===`);
  const all = [];
  let roundsWithOneWinner = 0, roundsDataCorrect = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    const filled = await makeUsers(CAP - 1, `last${r}x`);
    const rivals = await makeUsers(2, `rival${r}x`);
    const ev = await makeEvent(CAP, `last seat ${r}`);
    await seedBookings(ev, filled);

    const results = await Promise.all(rivals.map((u) => hit('POST', `/api/events/${ev}/book`, u)));
    all.push(...results);
    if (count(results, 201) === 1) roundsWithOneWinner++;
    const e = await one('SELECT seats_taken FROM events WHERE id=$1', [ev]);
    const b = await one('SELECT count(*)::int AS n FROM bookings WHERE event_id=$1', [ev]);
    if (e.seats_taken === CAP && b.n === CAP) roundsDataCorrect++;
  }
  printTally(tally(all));
  check('rounds with exactly one winner (one 201)', roundsWithOneWinner, ROUNDS);
  check('rounds where seats_taken == capacity == COUNT(bookings)', roundsDataCorrect, ROUNDS);
  if (guardOn()) {
    check('losers got a clean 409 SOLD_OUT', all.filter((r) => r.status === 409 && r.code === 'SOLD_OUT').length, ROUNDS);
    check('500 responses', count(all, 500), 0);
  } else {
    console.log(`  INFO  ${count(all, 500)} losing requests were stopped by the database CHECK constraint`);
  }
}

// ---------- main ----------
(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    await cleanup();
    await scenarioBooking();
    await scenarioLastSeat();
    if (guardOn()) {
      await scenarioCancel();
      await scenarioWaitlist();
      await scenarioLimit();
    }
  } catch (err) {
    console.error('Harness crashed:', err);
    failures++;
  } finally {
    await cleanup().catch(() => {});
    server.close();
    await pool.end();
  }
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
