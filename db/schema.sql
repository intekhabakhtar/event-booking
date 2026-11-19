-- College Event Registration & Seat Booking System : schema
-- Re-runnable: drops everything first (development only).
DROP TABLE IF EXISTS waitlist, bookings, events, users CASCADE;

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  -- second counter: how many events this student currently holds a seat in
  active_bookings INT  NOT NULL DEFAULT 0,
  CONSTRAINT users_active_bookings_range CHECK (active_bookings >= 0 AND active_bookings <= 3)
);

CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  venue       TEXT NOT NULL,
  event_date  TIMESTAMPTZ NOT NULL,
  capacity    INT NOT NULL CHECK (capacity > 0),
  seats_taken INT NOT NULL DEFAULT 0,
  -- BACKSTOP: both columns live in the SAME row, so CHECK can compare them.
  CONSTRAINT events_seats_not_negative CHECK (seats_taken >= 0),
  CONSTRAINT events_no_overbooking     CHECK (seats_taken <= capacity)
);

CREATE TABLE bookings (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id   INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_one_per_user_per_event UNIQUE (user_id, event_id)
);

CREATE TABLE waitlist (
  id         SERIAL PRIMARY KEY,           -- id order = queue order (first come, first served)
  user_id    INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id   INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_one_per_user_per_event UNIQUE (user_id, event_id)
);

CREATE INDEX idx_bookings_event ON bookings(event_id);
CREATE INDEX idx_waitlist_event ON waitlist(event_id, id);
