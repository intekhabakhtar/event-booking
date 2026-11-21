// Automated API tests (Jest + Supertest).  Run:  npm test
// They call the Express app directly and need the database from "npm run setup".
require('dotenv').config();
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool } = require('../src/db');
const { JWT_SECRET } = require('../src/config');

const STAMP = Date.now();
const email = (tag) => `${tag}${STAMP}@jest.test`;
const bearer = (token) => ({ Authorization: 'Bearer ' + token });

let admin, studentA, studentB;   // { id, token }
let eventId;

async function makeUser(tag, role) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id`,
    ['Jest ' + tag, email(tag), role]);
  return { id: rows[0].id, token: jwt.sign({ id: rows[0].id, role }, JWT_SECRET, { expiresIn: '10m' }) };
}
const newEvent = (capacity, title = 'JEST event') => ({
  title, venue: 'Jest Hall', event_date: new Date(Date.now() + 30 * 864e5).toISOString(), capacity,
});

beforeAll(async () => {
  admin = await makeUser('admin', 'admin');
  studentA = await makeUser('a', 'student');
  studentB = await makeUser('b', 'student');
});

afterAll(async () => {
  await pool.query(`DELETE FROM events WHERE title LIKE 'JEST%'`);
  await pool.query(`DELETE FROM users WHERE email LIKE '%@jest.test'`);
  await pool.end();
});

describe('authentication and validation', () => {
  test('register rejects a bad email (400 INVALID_INPUT)', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'X', email: 'nope', password: '123456' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_INPUT');
  });

  test('register works, duplicate email gives 409, login works, wrong password gives 401', async () => {
    const body = { name: 'Jest User', email: email('reg'), password: 'secret1' };
    const ok = await request(app).post('/api/auth/register').send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.password_hash).toBeUndefined();

    const dup = await request(app).post('/api/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('EMAIL_TAKEN');

    const bad = await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('INVALID_CREDENTIALS');

    const good = await request(app).post('/api/auth/login').send({ email: body.email, password: 'secret1' });
    expect(good.status).toBe(200);
  });

  test('protected routes need a token (401) and admin routes need the admin role (403)', async () => {
    expect((await request(app).post('/api/events/1/book')).status).toBe(401);
    expect((await request(app).get('/api/me/bookings').set(bearer('garbage'))).status).toBe(401);
    expect((await request(app).post('/api/events').set(bearer(studentA.token)).send(newEvent(5))).status).toBe(403);
    expect((await request(app).get('/api/admin/stats').set(bearer(studentA.token))).status).toBe(403);
  });

  test('admin cannot create an event with invalid data (400)', async () => {
    for (const bad of [newEvent(0), newEvent(-5), newEvent('abc'), newEvent(''), { ...newEvent(5), title: '' }, { ...newEvent(5), event_date: 'tomorrow' }]) {
      const r = await request(app).post('/api/events').set(bearer(admin.token)).send(bad);
      expect(r.status).toBe(400);
    }
  });

  test('malformed JSON gives 400 and a bad id gives 400', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
    expect((await request(app).post('/api/events/abc/book').set(bearer(studentA.token))).status).toBe(400);
    expect((await request(app).post('/api/events/999999999/book').set(bearer(studentA.token))).status).toBe(404);
  });
});

describe('booking rules', () => {
  test('admin creates a 1-seat event', async () => {
    const r = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(1, 'JEST one seat'));
    expect(r.status).toBe(201);
    eventId = r.body.id;
  });

  test('first student books (201), second gets SOLD_OUT (409), duplicate is blocked', async () => {
    const a = await request(app).post(`/api/events/${eventId}/book`).set(bearer(studentA.token));
    expect(a.status).toBe(201);
    expect(a.body.code).toBe('BOOKED');

    const b = await request(app).post(`/api/events/${eventId}/book`).set(bearer(studentB.token));
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('SOLD_OUT');

    const ev = await request(app).get(`/api/events/${eventId}`);
    expect(ev.body.seats_taken).toBe(1);
    expect(ev.body.seats_left).toBe(0);
  });

  test('waitlist: join only when full, then a cancellation promotes the waiting student', async () => {
    const join = await request(app).post(`/api/events/${eventId}/waitlist`).set(bearer(studentB.token));
    expect(join.status).toBe(201);
    expect(join.body.position).toBe(1);

    const again = await request(app).post(`/api/events/${eventId}/waitlist`).set(bearer(studentB.token));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('ALREADY_WAITLISTED');

    const cancel = await request(app).delete(`/api/events/${eventId}/book`).set(bearer(studentA.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.promotedUserId).toBe(studentB.id);

    const mine = await request(app).get('/api/me/bookings').set(bearer(studentB.token));
    expect(mine.body.bookings.map((b) => b.event_id)).toContain(eventId);
    expect(mine.body.waitlist).toHaveLength(0);

    const second = await request(app).delete(`/api/events/${eventId}/book`).set(bearer(studentA.token));
    expect(second.status).toBe(404);
    expect(second.body.error).toBe('BOOKING_NOT_FOUND');
  });

  test('joining the waitlist is refused while seats are free (409 SEATS_AVAILABLE)', async () => {
    const e = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(5, 'JEST roomy'));
    const r = await request(app).post(`/api/events/${e.body.id}/waitlist`).set(bearer(studentA.token));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('SEATS_AVAILABLE');
  });
});

describe('admin features', () => {
  test('lowering capacity below booked seats is refused (409), raising it promotes the waitlist', async () => {
    const created = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(1, 'JEST resize'));
    const id = created.body.id;
    await request(app).post(`/api/events/${id}/book`).set(bearer(studentA.token));
    await request(app).post(`/api/events/${id}/waitlist`).set(bearer(studentB.token));

    const tooLow = await request(app).put(`/api/events/${id}`).set(bearer(admin.token)).send({ ...newEvent(0, 'JEST resize') });
    expect(tooLow.status).toBe(400);

    const raise = await request(app).put(`/api/events/${id}`).set(bearer(admin.token)).send(newEvent(2, 'JEST resize'));
    expect(raise.status).toBe(200);
    expect(raise.body.promoted).toBe(1);
    expect(raise.body.seats_taken).toBe(2);

    const lower = await request(app).put(`/api/events/${id}`).set(bearer(admin.token)).send(newEvent(1, 'JEST resize'));
    expect(lower.status).toBe(409);
    expect(lower.body.error).toBe('CAPACITY_BELOW_BOOKED');
  });

  test('admin lists and cancels bookings; reports show no counter mismatches', async () => {
    const created = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(3, 'JEST manage'));
    const id = created.body.id;
    await request(app).post(`/api/events/${id}/book`).set(bearer(studentA.token));

    const list = await request(app).get(`/api/admin/events/${id}/bookings`).set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.bookings).toHaveLength(1);
    expect(list.body.bookings[0].email).toBe(email('a'));

    const del = await request(app).delete(`/api/admin/events/${id}/bookings/${studentA.id}`).set(bearer(admin.token));
    expect(del.status).toBe(200);

    const reports = await request(app).get('/api/admin/reports').set(bearer(admin.token));
    expect(reports.status).toBe(200);
    expect(reports.body.integrityMismatches).toEqual([]);
  });

  test('profile: read and update name, validation applies', async () => {
    const me = await request(app).get('/api/me').set(bearer(studentA.token));
    expect(me.status).toBe(200);
    expect(me.body.max_bookings).toBe(3);
    expect((await request(app).put('/api/me').set(bearer(studentA.token)).send({ name: '' })).status).toBe(400);
    const up = await request(app).put('/api/me').set(bearer(studentA.token)).send({ name: 'Renamed' });
    expect(up.body.name).toBe('Renamed');
  });
  test('deleting an event frees the students\' booking slots (counter fix)', async () => {
    const before = (await request(app).get('/api/me').set(bearer(studentB.token))).body.active_bookings;
    const created = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(3, 'JEST delete me'));
    const id = created.body.id;
    expect((await request(app).post(`/api/events/${id}/book`).set(bearer(studentB.token))).status).toBe(201);
    expect((await request(app).get('/api/me').set(bearer(studentB.token))).body.active_bookings).toBe(before + 1);

    expect((await request(app).delete(`/api/events/${id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).get('/api/me').set(bearer(studentB.token))).body.active_bookings).toBe(before);
    expect((await request(app).delete(`/api/events/${id}`).set(bearer(admin.token))).status).toBe(404);
  });

  test('past events cannot be booked or waitlisted (409 EVENT_PAST)', async () => {
    const { rows } = await pool.query(
      `INSERT INTO events (title, venue, event_date, capacity)
       VALUES ('JEST past', 'Old Hall', now() - interval '1 day', 5) RETURNING id`);
    const id = rows[0].id;
    const book = await request(app).post(`/api/events/${id}/book`).set(bearer(studentA.token));
    expect(book.status).toBe(409);
    expect(book.body.error).toBe('EVENT_PAST');
    await pool.query('DELETE FROM events WHERE id = $1', [id]);
  });
  test('forgot / reset password: link works once, old password stops working', async () => {
    const mail = `reset${STAMP}@jest.test`;
    await request(app).post('/api/auth/register').send({ name: 'Reset Me', email: mail, password: 'oldpass1' });

    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: `nobody${STAMP}@jest.test` });
    expect(unknown.status).toBe(200);
    expect(unknown.body.resetPath).toBeUndefined();          // same reply, nothing revealed

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: mail });
    expect(forgot.status).toBe(200);
    const token = new URL('http://x' + forgot.body.resetPath).searchParams.get('token');

    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'abc' })).status).toBe(400);   // too short
    expect((await request(app).post('/api/auth/reset-password').send({ token: 'junk', password: 'newpass1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'newpass1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'another1' })).status).toBe(400); // used once

    expect((await request(app).post('/api/auth/login').send({ email: mail, password: 'oldpass1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: mail, password: 'newpass1' })).status).toBe(200);
    // a reset token must not work as a login token
    expect((await request(app).get('/api/me').set(bearer(token))).status).toBe(401);
  });
  test('registration deadline: later than the event is refused (400), a passed deadline closes booking (409)', async () => {
    const date = new Date(Date.now() + 30 * 864e5).toISOString();
    const bad = await request(app).post('/api/events').set(bearer(admin.token))
      .send({ ...newEvent(5, 'JEST bad deadline'), registration_deadline: new Date(Date.now() + 40 * 864e5).toISOString() });
    expect(bad.status).toBe(400);

    const created = await request(app).post('/api/events').set(bearer(admin.token))
      .send({ ...newEvent(5, 'JEST closed'), event_date: date, registration_deadline: new Date(Date.now() - 864e5).toISOString() });
    expect(created.status).toBe(201);
    const r = await request(app).post(`/api/events/${created.body.id}/book`).set(bearer(studentA.token));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('REGISTRATION_CLOSED');
  });

  test('booking history is kept after cancelling (append-only log, newest first)', async () => {
    const s = await makeUser('hist', 'student');
    const created = await request(app).post('/api/events').set(bearer(admin.token)).send(newEvent(3, 'JEST history'));
    const id = created.body.id;
    expect((await request(app).post(`/api/events/${id}/book`).set(bearer(s.token))).status).toBe(201);
    expect((await request(app).delete(`/api/events/${id}/book`).set(bearer(s.token))).status).toBe(200);

    const h = await request(app).get('/api/me/history').set(bearer(s.token));
    expect(h.status).toBe(200);
    expect(h.body.map((x) => x.action)).toEqual(['CANCELLED', 'BOOKED']);
    expect(h.body[0].event_title).toBe('JEST history');
    expect((await request(app).get('/api/me/history')).status).toBe(401);

    // deleting the event keeps the history readable (title is copied into the log)
    expect((await request(app).post(`/api/events/${id}/book`).set(bearer(s.token))).status).toBe(201);
    expect((await request(app).delete(`/api/events/${id}`).set(bearer(admin.token))).status).toBe(200);
    const after = await request(app).get('/api/me/history').set(bearer(s.token));
    expect(after.body[0].action).toBe('EVENT_DELETED');
    expect(after.body[0].event_title).toBe('JEST history');
  });

  test('last-seat race: 100 seats, 99 booked, two students book at once -> exactly one wins', async () => {
    const { rows: [ev] } = await pool.query(
      `INSERT INTO events (title, venue, event_date, capacity)
       VALUES ('JEST last seat', 'Jest Hall', now() + interval '30 days', 100) RETURNING id`);
    const { rows: filled } = await pool.query(
      `INSERT INTO users (name, email, password_hash, active_bookings)
       SELECT 'Filler ' || g, 'filler' || g || '-' || $1 || '@jest.test', 'x', 1 FROM generate_series(1, 99) g RETURNING id`, [STAMP]);
    await pool.query(`INSERT INTO bookings (user_id, event_id) SELECT id, $1 FROM unnest($2::int[]) id`, [ev.id, filled.map((r) => r.id)]);
    await pool.query('UPDATE events SET seats_taken = 99 WHERE id = $1', [ev.id]);

    const s1 = await makeUser('race1', 'student');
    const s2 = await makeUser('race2', 'student');
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/events/${ev.id}/book`).set(bearer(s1.token)),
      request(app).post(`/api/events/${ev.id}/book`).set(bearer(s2.token)),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect([r1, r2].find((r) => r.status === 409).body.error).toBe('SOLD_OUT');

    const e = await pool.query('SELECT seats_taken FROM events WHERE id = $1', [ev.id]);
    const b = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE event_id = $1', [ev.id]);
    expect(e.rows[0].seats_taken).toBe(100);
    expect(b.rows[0].n).toBe(100);
  });
});
