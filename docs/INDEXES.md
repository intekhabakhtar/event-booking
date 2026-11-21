# Indexes and query plans

Run `npm run setup && npm run seed && npm run explain` to reproduce. The seed creates 5,001 users, 64 events and
10,000 bookings. `EXPLAIN ANALYZE` shows how PostgreSQL actually runs a query.

| Query (where it is used) | Index it uses | Why this index exists |
|---|---|---|
| Who booked event X? (admin bookings page) | `idx_bookings_event (event_id)` | Without it PostgreSQL reads all 10,000 booking rows to find one event's rows |
| My bookings (student page) | `bookings_one_per_user_per_event UNIQUE (user_id, event_id)` | The UNIQUE constraint creates an index whose first column is `user_id`, so no extra index is needed |
| Login by email | `users_email_key` (created by `UNIQUE` on email) | Login runs on every sign-in |
| Events ordered by date | `idx_events_date (event_date)` | The events list is always sorted by date |
| Bookings per day (reports) | `idx_bookings_created (created_at)` | The report groups by day |
| Waitlist queue of an event | `idx_waitlist_event (event_id, id)` | Promotion reads "first in line" for one event |
| My booking history, newest first | `idx_history_user (user_id, id DESC)` | The history page reads one student's latest rows out of 10,000+ |

## Reading the output
- `Index Scan` / `Bitmap Index Scan` = PostgreSQL jumped straight to the matching rows (fast).
- `Seq Scan` = it read every row of the table. This is fine for tiny tables (`events` has 64 rows) and is exactly
  what you do NOT want on `bookings` once it has many rows. The last query in `npm run explain` deliberately
  filters on an un-indexed column (`users.name`) to show a `Seq Scan` for comparison.
- In query 1 you will still see a `Seq Scan on users`: the event has 167 bookings, so PostgreSQL decides reading the
  whole 5,001-row users table into a hash is cheaper than 167 separate lookups. The important part is the
  `Bitmap Index Scan on idx_bookings_event` on the big `bookings` table.

## Why indexes cost something
Every INSERT/UPDATE/DELETE must also update every index on that table, so we only index columns that real
queries filter, join or sort on, not every column.
