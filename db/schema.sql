-- College Event Registration & Seat Booking System : schema
-- Re-runnable: drops everything first (development only).
DROP TABLE IF EXISTS booking_history, waitlist, bookings, events, users CASCADE;

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
  -- last moment students may book or join the waitlist; NULL = open until the event starts
  registration_deadline TIMESTAMPTZ,
  capacity    INT NOT NULL CHECK (capacity > 0),
  seats_taken INT NOT NULL DEFAULT 0,
  -- BACKSTOP: both columns live in the SAME row, so CHECK can compare them.
  CONSTRAINT events_seats_not_negative CHECK (seats_taken >= 0),
  CONSTRAINT events_no_overbooking     CHECK (seats_taken <= capacity),
  CONSTRAINT events_deadline_before_event CHECK (registration_deadline IS NULL OR registration_deadline <= event_date)
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

-- Append-only booking history: rows are only ever INSERTed, never updated or deleted by the application,
-- so "what happened to my booking?" stays answerable after a cancellation. event_title is copied in so the
-- history still reads correctly if an admin later deletes the event (event_id then becomes NULL).
CREATE TABLE booking_history (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id    INT          REFERENCES events(id) ON DELETE SET NULL,
  event_title TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('BOOKED', 'CANCELLED', 'CANCELLED_BY_ADMIN', 'PROMOTED', 'EVENT_DELETED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes (see docs/INDEXES.md for the EXPLAIN evidence)
CREATE INDEX idx_bookings_event   ON bookings(event_id);          -- "who booked event X?"
CREATE INDEX idx_bookings_created ON bookings(created_at);        -- reports: bookings per day
CREATE INDEX idx_events_date      ON events(event_date);          -- event list ordered by date
CREATE INDEX idx_waitlist_event ON waitlist(event_id, id);
CREATE INDEX idx_history_user ON booking_history(user_id, id DESC);  -- "my booking history", newest first
