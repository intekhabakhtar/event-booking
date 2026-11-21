# Course guide checklist ("Your Project, Full Stack Development 1")

Each row of the guide, where this project meets it, and how to show it to the examiner.

## Professor's proposal feedback: every point and where it is done
| Feedback | Done in |
|---|---|
| `CHECK (seats_taken <= capacity)` on the events row, and keep the transaction | `db/schema.sql` (`events_no_overbooking`), `bookSeat()` in `src/services/bookingService.js` |
| Scripted harness: 100 seats, 500 concurrent requests, exactly 100 x 201, 400 x 409, zero 500s, `seats_taken = 100` | `npm run harness`, Scenario 1 |
| A schema, a scale target and an error contract | `README.md`: ER diagram + constraint table, 5,000-student / 10,000-booking seed, error code table |
| Delete the guard and run again; the CHECK must still hold the line | `GUARD=off npm run harness` (no `FOR UPDATE`, no availability check) |
| Two runs side by side in the README | README sections "Run A: guard ON" / "Run B: guard REMOVED" (**paste your own output**) |
| Cancellation returning a seat (increment race) | Scenario 2 |
| Waitlist that promotes atomically | Scenario 3, `promoteFromWaitlist()` |
| Per-student booking limit as a second counter | `users.active_bookings` + `CHECK (0..3)`, Scenario 4 |
| Distinguishing feature | backstop proof (GUARD=off), waitlist, booking history, registration deadlines |

## Requirements in the brief
| Guide says | Where in this project | How to show it |
|---|---|---|
| Front end + back end + real database | `client/` (React), `src/` (Express), PostgreSQL (`db/schema.sql`) | `npm start`, open http://localhost:3000 |
| **At least 5,000 rows without slowing down** | `npm run seed`: 5,000 students, 60 events, 10,000 bookings | run seed, then `npm run explain` (index scans, ms timings) |
| **Refuse invalid requests even when they bypass the interface** | server validation in `src/routes/*.js`, DB constraints in `db/schema.sql` | Postman collection (bad email, short password, negative capacity, malformed JSON, wrong role, invalid ids) |
| **Correct when two people act at the same instant** (the whole point) | `src/services/bookingService.js`: transaction + `SELECT ... FOR UPDATE` + `CHECK` backstop | `npm run harness` (guard ON) and `GUARD=off npm run harness`; two-browser test |
| Hard requirement of one of 3 kinds | **Kind 1, Concurrency** (limited seats) | `PROPOSAL.md` (three questions answered) |
| Proposal: 3 questions, Q3 = the exact test | `PROPOSAL.md` | hand in / show |

## Technology list
| Guide topic | Done | Evidence |
|---|---|---|
| React: components, props, state, effects, keyed lists | yes | `client/src/pages`, `components`, `hooks/useFetch.js` |
| React Router + params | yes | `client/src/App.jsx` (`/events/:id`, `/admin/events/:id/edit`) |
| axios + error handling | yes | `client/src/api.js` (interceptors, `errorMessage`) |
| Controlled forms | yes | `Register.jsx`, `EventForm.jsx`, `ResetPassword.jsx` |
| **Conditional rendering: loading / error / empty** (marked) | yes | every page shows Loading, error Alert, "No ... yet" text, or data |
| Node + Express + env variables | yes | `src/`, `.env.example` |
| **REST design: URLs, methods, status codes** (marked) | yes | table in `README.md` (201, 400, 401, 403, 404, 409, 429) |
| Auth: login, JWT, roles; protect every route | yes | `src/middleware/auth.js` (`requireAuth`, `requireAdmin`) |
| bcrypt for passwords | yes | `src/routes/auth.js` |
| **Server validation, tested with Postman** (marked) | yes | `postman/event-booking.postman_collection.json` (34 requests) |
| PostgreSQL, SQL: SELECT, JOIN, GROUP BY, aggregates | yes | `src/routes/admin.js` reports (JOIN, GROUP BY, HAVING, COUNT, ROUND) |
| Schema design, keys, relationships | yes | `db/schema.sql`, ER diagram in `README.md` and `docs/er.mmd` |
| Constraints: UNIQUE, CHECK, NOT NULL, FK | yes | `db/schema.sql` |
| **Transactions: BEGIN / COMMIT / ROLLBACK, row locking** | yes | `bookingService.js` (book, cancel, waitlist, edit, delete) |
| Indexes, EXPLAIN | yes | `docs/INDEXES.md`, `npm run explain` |
| Query logging (week 11) | yes | `LOG_QUERIES=on npm start` prints each SQL statement with ms |
| Postman collection | yes | `postman/` |
| Git + GitHub history (part of assessment) | **you must do this** | commit in small steps with clear messages; do not commit `.env` |
| `.env` for secrets | yes | `.env.example`, `.gitignore` |

## Optional bonus marks
| Bonus | Status |
|---|---|
| Jest / Supertest automated tests (4 marks) | done: `npm test`, 18 tests |
| Socket.io live updates (3 marks) | not done |
| Deployment on Render / Railway / Vercel (2 marks) | not done (Docker files and deployment notes are ready in `README.md`) |

## Things the guide says NOT to do (and this project does not)
No Redux, TypeScript, GraphQL, microservices, Kubernetes, NoSQL or ML. Plain CSS only. One server.

## Before you submit (your own to-do list)
1. Run `npm run harness` and `GUARD=off npm run harness` yourself and paste YOUR output into `README.md` (the examiner may rerun it).
2. Run `npm test` and the Postman collection; make sure everything passes on your machine.
3. Make sure your GitHub history shows your own commits (the guide says it counts as evidence of who did what).
4. Read `VIVA_NOTES.md` and do the "break it" drill: the guide says you must be able to explain every line you submit.
5. Practise the week-five demo: two browser windows, last seat, exactly one wins.
