# MediBridge — Complete Technical Documentation

This document explains **exactly how MediBridge works internally**: every layer of the stack,
every backend function, every frontend page, the database design, the authentication flow, what
the app currently does end-to-end, and what is deliberately left for future work. It is meant to
be read alongside the code — file paths are given throughout so you can jump straight to the
source.

For a shorter, presentation-style overview (problem statement, SDG mapping, quick start), see
[`README.md`](./README.md). This file goes deeper into *how* the code works.

---

## Table of contents

1. [What MediBridge is](#1-what-medibridge-is)
2. [Technology stack — what we used and why](#2-technology-stack--what-we-used-and-why)
3. [High-level architecture](#3-high-level-architecture)
4. [Database design (all 15 tables explained)](#4-database-design-all-15-tables-explained)
5. [Authentication & authorization — the exact flow](#5-authentication--authorization--the-exact-flow)
6. [Backend: every controller and function explained](#6-backend-every-controller-and-function-explained)
7. [Complete API reference](#7-complete-api-reference)
8. [Frontend: shared JavaScript modules](#8-frontend-shared-javascript-modules)
9. [Frontend: every page and what it currently displays/does](#9-frontend-every-page-and-what-it-currently-displaysdoes)
10. [The Care Score algorithm, in detail](#10-the-care-score-algorithm-in-detail)
11. [Appointment slot computation, in detail](#11-appointment-slot-computation-in-detail)
12. [A real bug we found and fixed (case study)](#12-a-real-bug-we-found-and-fixed-case-study)
13. [Deployment](#13-deployment)
14. [Future scope — what is not implemented yet](#14-future-scope--what-is-not-implemented-yet)

---

## 1. What MediBridge is

MediBridge is a **full-stack, role-based healthcare access and management platform**. It is a
traditional multi-page web app (not a single-page React/Vue app) with three kinds of logged-in
users — **patient**, **doctor**, **admin** — each with their own dashboard and set of pages, plus
a public marketing site (home, doctor directory, health resources, emergency info, about).

It is a real working system, not a mockup: every button and form on every page is backed by a
genuine HTTP API call to an Express server, which runs real, parameterized SQL queries against a
MySQL database. There is no mock data baked into the frontend.

---

## 2. Technology stack — what we used and why

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Node.js** | JavaScript on both client and server — one language for the whole stack. |
| Web framework | **Express 4** | Minimal, unopinionated router/middleware framework; keeps request handling explicit. |
| Database | **MySQL 8** (via `mysql2/promise`) | Relational data (users, appointments, medical records) has real foreign-key relationships — a relational DB models that directly, with `mysql2` giving promise-based/async queries and a connection pool. |
| Auth | **JWT (`jsonwebtoken`)** stored in an **httpOnly cookie** (`cookie-parser`) | Stateless auth — no server-side session store needed. httpOnly means client-side JavaScript can never read the token (mitigates XSS token theft). |
| Password hashing | **bcryptjs** | Industry-standard salted password hashing; never stores plaintext passwords. |
| Input validation | **express-validator** | Declarative validation chains on routes (e.g. `body('email').isEmail()`) instead of hand-rolled `if` checks scattered through controllers. |
| Cross-origin support | **cors** | Configurable allowed origin, with `credentials: true` so the auth cookie is sent on cross-origin requests if ever needed. |
| Logging | **morgan** | HTTP request logging in the terminal during development (`dev` format) and combined format in production. |
| Environment config | **dotenv** | Loads `.env` into `process.env` locally; on hosts like Vercel, environment variables are injected directly instead. |
| Frontend | **Plain HTML + CSS + vanilla JavaScript** (no framework, no build step) | Every page is a real `.html` file served statically; a handful of small shared `.js` files (see §8) provide just enough shared behavior (auth guarding, layout, toasts, fetch wrapper) without the overhead of a SPA framework or bundler. This keeps the project inspectable — you can open any `.html` file and read exactly what it does. |
| Charts | **Chart.js** (via CDN) | Used only on the admin dashboard and doctor dashboard for the bar/line/doughnut charts. |
| Maps | **Leaflet** (via CDN) | Used only on the doctor profile page (`doctor.html`) to show the clinic's location pin. |

No frontend framework, bundler, or CSS framework is used — `public/css/main.css` is a hand-written
design system (tokens, buttons, cards, forms, tables, modals, skeleton loaders, badges) shared by
every page via one `<link>` tag.

---

## 3. High-level architecture

```
Browser
  │  requests any URL (page or /api/*)
  ▼
Express app (server/app.js)
  │
  ├─ /api/auth/*            → server/routes/auth.js            → authController.js
  ├─ /api/users/*           → server/routes/users.js           → usersController.js
  ├─ /api/doctors/*         → server/routes/doctors.js         → doctorsController.js
  ├─ /api/specializations/* → server/routes/specializations.js → specializationsController.js
  ├─ /api/appointments/*    → server/routes/appointments.js    → appointmentsController.js
  ├─ /api/medical-records/* → server/routes/medicalRecords.js  → medicalRecordsController.js
  ├─ /api/prescriptions/*   → server/routes/prescriptions.js   → prescriptionsController.js
  ├─ /api/medications/*     → server/routes/medications.js     → medicationsController.js
  ├─ /api/notifications/*   → server/routes/notifications.js   → notificationsController.js
  ├─ /api/resources/*       → server/routes/resources.js       → resourcesController.js
  ├─ /api/reviews/*         → server/routes/reviews.js         → reviewsController.js
  ├─ /api/care/*            → server/routes/care.js            → careController.js
  ├─ /api/dashboard/*       → server/routes/dashboard.js       → dashboardController.js
  ├─ /api/admin/*           → server/routes/admin.js           → adminController.js
  │
  ├─ everything else that matches a real file → express.static('public/')
  └─ everything else that matches no file     → public/404.html
       │
       ▼
  database/db.js (one shared mysql2 connection pool)
       │
       ▼
     MySQL (database/schema.sql — 15 tables)
```

Every controller function follows the same shape: read `req.user` (set by the auth middleware),
run one or more parameterized SQL queries via the shared `pool`, and respond with JSON. There is
no ORM — queries are hand-written SQL, which keeps exactly what's happening in the database
visible in the controller code itself.

### Request flow for a typical page load

Take `patient/dashboard.html` as an example, end to end:

1. Browser requests `GET /patient/dashboard.html` → served as a static file by
   `express.static`.
2. The page's `<script>` tags run in order: `api.js`, `toast.js`, `layout.js`, then `guard.js`
   (with `data-role="patient"`).
3. `guard.js` immediately calls `GET /api/auth/me` (with the cookie automatically attached by the
   browser). If that fails (no valid cookie), it redirects to the login page. If it succeeds but
   the returned role doesn't match `data-role`, it redirects to `/unauthorized.html`.
4. On success, `guard.js` un-hides the page (removes the `mb-auth-pending` CSS class) and fires a
   custom `mb:auth-ready` DOM event carrying the user object.
5. The page's own inline `<script>` listens for `mb:auth-ready`, builds the dashboard shell
   (topbar + sidebar) via `layout.js`, and calls `GET /api/dashboard/patient` to get all the data
   the page needs in one round trip.
6. `dashboardController.patientSummary` runs five queries (next appointment, appointment counts,
   today's medications, recent medical records, unread notification count) plus the Care Score
   computation, and returns them as one JSON object.
7. The page's render functions turn that JSON into HTML (appointment card, Care Score gauge SVG,
   quick-action tiles, medication list, records list).

---

## 4. Database design (all 15 tables explained)

Full source: [`database/schema.sql`](./database/schema.sql). MySQL 8, InnoDB, `utf8mb4`.

| Table | Purpose | Key relationships |
|---|---|---|
| **users** | Every person who can log in — patients, doctors, admins all live in one table with a `role` enum. Holds email, bcrypt password hash, full name, phone, avatar, active flag. | Root of everything; `patients.user_id`, `doctors.user_id` are both 1:1 extensions of a `users` row. |
| **patients** | Patient-only profile fields (DOB, gender, blood group, height/weight, address, emergency contact, allergies, chronic conditions). | `user_id` → `users.id` (cascade delete). |
| **specializations** | Lookup table of medical specializations (Cardiology, Pediatrics, etc.), admin-managed. | Referenced by `doctors.specialization_id`. |
| **doctors** | Doctor-only profile fields (specialization, qualifications, experience, consultation fee, languages, bio, clinic name/address/city/lat-lng, allowed consultation modes, rolling `rating_avg`/`rating_count`, verification flag). | `user_id` → `users.id`; `specialization_id` → `specializations.id`. |
| **doctor_availability** | A doctor's *recurring weekly* schedule template: one row per (day-of-week, time block, slot length). This is the source of truth the slot-builder algorithm reads — it does **not** store individual bookable slots. | `doctor_id` → `doctors.user_id`. |
| **appointments** | The backbone transactional table: one row per booking, with date/time/mode/status/reason/cancellation info. A `UNIQUE KEY (doctor_id, appointment_date, start_time)` makes true double-booking impossible at the database level, as a second line of defense behind the application-level slot check. | `patient_id` → `patients.user_id`; `doctor_id` → `doctors.user_id`. |
| **medical_records** | One row per documented consultation: diagnosis, summary, vitals, follow-up date/notes, optional link back to the appointment it came from. | `appointment_id` → `appointments.id` (nullable); `patient_id`, `doctor_id`. |
| **prescriptions** | Line items (one row per medicine) attached to a medical record. | `medical_record_id` → `medical_records.id`. |
| **medications** | The patient-facing "things I'm currently taking" list used for reminders/tracking — may have been created from a prescription or added directly by the patient. | `patient_id`; `prescription_id` (nullable, links back if it originated from a doctor's prescription). |
| **medication_logs** | One row per day per medication recording whether it was taken/missed/skipped. This is the raw data behind adherence % and the Care Score. `UNIQUE(medication_id, log_date)` means logging twice in a day updates the same row (`ON DUPLICATE KEY UPDATE`) rather than creating duplicates. | `medication_id` → `medications.id`. |
| **notifications** | A generic in-app notification inbox for any user (appointment confirmed/cancelled, new medical record, etc.). | `user_id` → `users.id`. |
| **healthcare_resources** | Educational articles shown on the public Health Resources page, admin-authored. | Standalone. |
| **reviews** | A patient's 1–5 star rating + comment for a doctor, tied to one specific completed appointment (`UNIQUE(appointment_id)` — one review per appointment). Inserting a review also recomputes the doctor's `rating_avg`/`rating_count` in the same transaction. | `doctor_id`, `patient_id`, `appointment_id`. |
| **reported_issues** | Free-form issue reports from any user, triaged by admins (open → in_review → resolved/dismissed). | `reporter_id` → `users.id`. |
| **audit_logs** | A generic system-activity trail table, displayed on the admin "Audit Log" page. | `user_id` → `users.id` (nullable). *(See §14 — nothing currently writes to this table at runtime; it's only populated by the demo seed script.)* |

**Entity relationship summary**: `users` is the hub. `patients` and `doctors` are 1:1 role
extensions of `users`. `appointments` is the central many-to-many join between a patient and a
doctor over time. `medical_records` → `prescriptions` → `medications` → `medication_logs` forms a
chain from "what the doctor prescribed" to "what the patient is actually taking day to day,"
which is exactly the data the Care Score reads.

---

## 5. Authentication & authorization — the exact flow

**Files**: `server/controllers/authController.js`, `server/middleware/auth.js`,
`server/utils/jwt.js`, `public/js/guard.js`, `public/js/nav.js`.

### Registration & login

- `POST /api/auth/register` (`authController.register`) — public self-registration is
  **patient-only by design**: it inserts a `users` row with `role = 'patient'` and a matching
  `patients` row, hashes the password with `bcrypt.hash(password, 10)`, and immediately signs a
  JWT and sets it as a cookie (auto-login after registering). Doctor and admin accounts are
  **not** self-registerable — an admin creates them via `POST /api/doctors` — so they can be
  vetted before going live.
- `POST /api/auth/login` (`authController.login`) — looks up the user by email, checks
  `is_active`, compares the password with `bcrypt.compare`, signs a JWT, sets it as a cookie.
- `POST /api/auth/logout` (`authController.logout`) — clears the cookie.
- `GET /api/auth/me` (`authController.me`) — returns the current user's identity, resolved from
  the JWT via the `requireAuth` middleware. This is the endpoint every protected page calls on
  load to find out who's logged in.

### The token itself

`server/utils/jwt.js`'s `signToken(user)` signs a JWT containing `{ id, role, email, name }` with
`process.env.JWT_SECRET`, expiring after `JWT_EXPIRES_IN` (default 7 days). The cookie options
(`COOKIE_OPTIONS`) are:

```js
{ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 days }
```

- `httpOnly` — JavaScript in the browser can never read this cookie, which is the main defense
  against XSS-based token theft.
- `sameSite: 'lax'` — the cookie is sent on normal top-level navigation and same-site requests,
  but not on cross-site POSTs from other domains — a baseline CSRF mitigation.
- `secure` — only sent over HTTPS, but only turned on in production (`NODE_ENV=production`), so
  it still works over plain `http://localhost` in development.

### Middleware: `requireAuth` and `requireRole`

`server/middleware/auth.js`:

- **`requireAuth`** reads the token from the cookie (or an `Authorization: Bearer <token>` header
  as a fallback, useful for testing with curl/Postman), verifies it with `jwt.verify`, and — if
  valid — attaches the decoded payload to `req.user`. Critically, **it does not query the
  database** on every request; it trusts the signed token. This keeps every protected request
  cheap. Any handler that needs fresh data (e.g. the user's current `is_active` status) queries
  it itself.
- **`requireRole(...roles)`** is a factory: `requireRole('doctor')` or
  `requireRole('doctor', 'admin')` returns a middleware that 403s if `req.user.role` isn't in the
  allowed list. Every router applies `requireAuth` first (often via `router.use(requireAuth)`),
  then layers `requireRole` on specific routes that need it.

### Frontend enforcement: `guard.js`

Every protected HTML page (all of `patient/*.html`, `doctor/*.html`, `admin/*.html`) starts with:

```html
<script src="/js/guard.js" data-role="patient"></script>
```

`guard.js` (`public/js/guard.js`) adds a `mb-auth-pending` class to `<html>` (which CSS uses to
`visibility: hidden` the whole page — see `main.css` line 95 — so there's no flash of protected
content before auth resolves), then calls `GET /api/auth/me`. If that fails, it redirects to
`/auth/login.html?next=<original path>` so login can bounce the user right back. If it succeeds
but the role doesn't match `data-role`, it redirects to `/unauthorized.html`. Otherwise it reveals
the page and dispatches `mb:auth-ready` with the user object for the page's own script to consume.

This means **authorization is enforced twice**, deliberately: `guard.js` on the frontend gives a
good UX (redirect before rendering anything), but the real security boundary is server-side —
`requireAuth`/`requireRole` on every API route. A user could disable JavaScript or hand-craft
requests and `guard.js` wouldn't stop them; the server-side middleware is what actually protects
the data.

---

## 6. Backend: every controller and function explained

### `authController.js`
| Function | What it does |
|---|---|
| `register` | Patient self-signup: validates uniqueness of email, hashes password, inserts `users` + `patients` rows, signs a JWT, sets the cookie, returns the new user. |
| `login` | Validates credentials, signs a JWT, sets the cookie, returns the user. |
| `logout` | Clears the auth cookie. |
| `me` | Returns the logged-in user's identity (id, email, role, fullName, phone, avatarUrl) from the DB, keyed off `req.user.id` from the verified JWT. |

### `usersController.js`
| Function | What it does |
|---|---|
| `getMyProfile` | Fetches the `users` row for the caller and **merges in** the role-specific table (`patients` or `doctors`, including the doctor's specialization name via a join) into one flat object, so the frontend gets everything about "me" in a single call. |
| `updateMyProfile` | Updates `full_name`/`phone` on `users`, and — for patients — any of a whitelisted set of `patients` columns (DOB, gender, blood group, height/weight, address, emergency contact, allergies, chronic conditions), translating camelCase request keys to snake_case columns via a lookup map. |

### `doctorsController.js`
| Function | What it does |
|---|---|
| `list` | The doctor search/discovery endpoint. Builds a dynamic `WHERE` clause from optional query params (`q` name/specialization search, `specialization`, `city`, `mode`, `minExperience`, `minRating`), supports sorting (`experience`, `fee_low`, `fee_high`, `rating`, `name`) and pagination, and returns doctors + total count. |
| `getById` | Full public profile for one doctor: profile fields, up to 10 recent reviews, and their weekly availability blocks. |
| `getSlots` | Given a doctor id and a date, computes the actual bookable time slots for that day (delegates the real logic to `utils/slots.js` — see §11) after fetching that day's availability template and already-booked appointments. |
| `create` | **Admin-only.** Provisions a brand-new doctor account: creates the `users` row (`role='doctor'`) and the `doctors` profile row in one call. |
| `update` | Lets a doctor edit their own profile (or an admin edit anyone's) — dynamically builds an `UPDATE` from whichever recognized fields were sent, translating camelCase → snake_case. |
| `setAvailability` | Replaces a doctor's entire weekly availability template: deletes all existing `doctor_availability` rows for that doctor and re-inserts the array sent by the client. Self-service (a doctor can only touch their own) or admin. |
| `deactivate` | **Admin-only.** Soft-deletes a doctor by setting `users.is_active = 0` (they stop appearing in search, but their historical data is preserved). |

### `appointmentsController.js`
| Function | What it does |
|---|---|
| `notify` (internal helper) | Inserts a row into `notifications` for a given user — used after every state-changing action so the other party gets an in-app notification. |
| `assertSlotIsFree` (internal helper) | Re-derives the doctor's available slots for the requested date (same algorithm as `getSlots`) and throws a `409 Conflict` if the requested time isn't in that list — this is the **server-side double-booking guard**, run again just before insert/update, inside a transaction, so two simultaneous booking requests can't both succeed for the same slot. |
| `list` | Returns appointments scoped to the caller's role automatically: a patient only ever sees their own, a doctor only their own, an admin can filter by `doctorId`/`patientId`. Also supports `status`, `from`, `to` filters. |
| `getById` | Fetches one appointment with an ownership check (403 if it's not yours and you're not an admin). |
| `create` | Books an appointment. Runs inside a DB transaction: re-validates the slot is free, inserts the row with `status='pending'`, notifies the doctor, commits. Rolls back cleanly on any error (including the slot-taken conflict). |
| `updateStatus` | Role-gated state machine for appointment status. `ALLOWED_TRANSITIONS` explicitly defines what each role can do from each state (e.g. a doctor can move `pending → confirmed` or `pending → cancelled`; a patient can only cancel; nothing can leave `completed`/`cancelled`). Rejects any other transition with a 400. Notifies the other party. |
| `reschedule` | Moves an existing pending/confirmed appointment to a new date/time, re-validating slot availability first (inside a transaction) and resetting status back to `pending` (needs re-confirmation). |
| `listMyPatients` | **Doctor-only.** Derives a doctor's patient roster from their appointment history (not a separate "assigned patients" table) — one row per distinct patient with appointment counts, last visit date, and a few clinically relevant fields (blood group, allergies, chronic conditions) pulled from `patients`. |

### `medicalRecordsController.js`
| Function | What it does |
|---|---|
| `doctorHasRelationship` (internal helper) | The core **access-control rule** for clinical data: a doctor may only view a patient's records/history if they've had at least one non-cancelled appointment with that patient. Prevents doctors browsing arbitrary patients' medical history. |
| `list` | Patients see their own records; doctors see records they authored, or (if `patientId` is passed and the relationship check passes) another patient's records; admins can filter by `patientId`. |
| `getById` | One record plus its attached prescriptions, with the same ownership/relationship checks. |
| `create` | **Doctor-only.** Documents a consultation: validates the doctor is allowed to write for this patient (either via the linked appointment being theirs, or the relationship check), then — in one transaction — inserts the medical record, inserts every prescription line item from the `prescriptions[]` array in the request body, marks the linked appointment `completed` if one was given, and notifies the patient. |

### `prescriptionsController.js`
| Function | What it does |
|---|---|
| `list` | A flattened, chronological view of every prescription line item across a patient's (or doctor's authored) medical records, including an `already_tracked` flag (`EXISTS` subquery) showing whether the patient has already turned that prescription into a tracked `medications` reminder — used to grey out/hide the "add to my medications" action once it's been done. |

### `medicationsController.js`
| Function | What it does |
|---|---|
| `list` | The patient's medication list, filterable by `bucket=today\|upcoming\|expired` (computed from `start_date`/`end_date` against `CURDATE()`), each row annotated with today's log status if one exists. A doctor may view a specific patient's medications only if they have a relationship (checked via a direct appointment lookup). |
| `create` | Adds a medication the patient wants tracked (either self-added or created from a prescription via `prescriptionId`). |
| `update` | Patient-only, ownership-checked, dynamic field update (same camelCase→snake_case pattern as elsewhere). |
| `remove` | Soft-deletes by setting `is_active = 0` ("stop" rather than hard delete, preserving history). |
| `logIntake` | Records today's (or a specified date's) status as taken/missed/skipped, using `INSERT ... ON DUPLICATE KEY UPDATE` against the `UNIQUE(medication_id, log_date)` constraint so re-logging the same day overwrites rather than duplicates. This is the data source for adherence % and the Care Score. |

### `notificationsController.js`
| Function | What it does |
|---|---|
| `list` | The caller's 50 most recent notifications plus an unread count. |
| `markRead` | Marks one notification read (ownership-scoped via `AND user_id = ?`). |
| `markAllRead` | Marks every notification for the caller as read. |

### `resourcesController.js` (Health Resources content library)
| Function | What it does |
|---|---|
| `list` | Public list of articles, filterable by `category`/`q` (title/summary search), plus a category-count breakdown for building the filter UI. |
| `getById` | One full article. |
| `create` / `update` / `remove` | **Admin-only** CRUD for managing the content library. |

### `reviewsController.js`
| Function | What it does |
|---|---|
| `create` | **Patient-only.** Validates the appointment belongs to the caller and is `completed` (you can only review a visit that actually happened), inserts the review, then — in the same transaction — recomputes and writes back the doctor's `rating_avg`/`rating_count` from a live `AVG()`/`COUNT()` over all their reviews. The `UNIQUE(appointment_id)` constraint prevents reviewing the same appointment twice (caught and turned into a friendly 409). |
| `listForDoctor` | Public list of a doctor's reviews (used on the doctor profile page). |

### `specializationsController.js`
| Function | What it does |
|---|---|
| `list` | All specializations with a live doctor-count per specialization (used for the search filter dropdown and the admin management table). |
| `create` / `update` | **Admin-only.** |
| `remove` | **Admin-only**, refuses to delete a specialization that's still assigned to any doctor (409), preventing orphaned foreign keys. |

### `careController.js` — the "Care" feature set (patient-only)
| Function | What it does |
|---|---|
| `getScore` | Returns the Care Score + breakdown (delegates to `utils/careScore.js` — see §10). |
| `getTimeline` | Merges three different sources — appointments, medical records, medication start dates — into a single chronologically-sorted feed, each entry normalized to `{ type, date, title, detail }`. This powers the patient's unified "Health Timeline" view. |
| `getAdherenceTrend` | Daily adherence percentage over the last 14 days (taken doses ÷ total logged doses per day), used for the adherence chart on the Medications page. |

### `dashboardController.js`
| Function | What it does |
|---|---|
| `patientSummary` | One call that feeds the entire patient dashboard: next upcoming appointment, appointment counts (upcoming/completed/cancelled), today's active medications with today's log status, 3 most recent medical records, unread notification count, and the full Care Score. |
| `doctorSummary` | One call that feeds the entire doctor dashboard: today's appointments, next 8 upcoming appointments, appointment counts + distinct patient count, a 14-day appointment trend (for the bar chart), 5 most recent consultations authored, unread notification count. |

### `adminController.js`
| Function | What it does |
|---|---|
| `getStats` | Headline numbers for the admin dashboard: total patients, active doctors, total/completed/cancelled/pending appointments, patients seen today, open reported issues, plus the 6 most recently registered users and 6 most recent appointments. |
| `getAnalytics` | Three chart-ready series: user growth by role over the last 6 months, appointment counts by status over the last 30 days, and doctor count per specialization. |
| `listPatients` / `listDoctors` | Paginated, searchable admin tables of all patients / all doctors (including inactive/unverified doctors, which the public search hides). |
| `verifyDoctor` | Flips a doctor's `is_verified` flag on. |
| `setUserStatus` | Activates/deactivates any user account (patient or doctor). |
| `listReports` / `updateReport` | Lists reported issues (optionally filtered by status) and transitions a report's status (`open → in_review → resolved/dismissed`), auto-stamping `resolved_at` when it lands on a terminal status. |
| `listAuditLogs` | Lists the 100 most recent audit log entries (see the caveat in §14 — currently only seed data populates this table). |

### Shared infrastructure

- **`server/utils/asyncHandler.js`** — wraps every controller function so a rejected promise (a
  thrown error, a failed query) is forwarded to Express's error-handling middleware via `.catch(next)`,
  instead of crashing the process or leaving the request hanging forever.
- **`server/utils/ApiError.js`** — a small `Error` subclass carrying an HTTP status code and
  optional structured `details`, so controllers can `throw new ApiError(404, 'Doctor not found.')`
  and have it turn into the right JSON response automatically.
- **`server/middleware/errorHandler.js`** — the single place that turns any thrown error into a
  JSON response: `ApiError`s become their own status/message; a MySQL duplicate-key error becomes
  a friendly 409; anything else is logged server-side and returned to the client as a generic
  500 — **raw stack traces and SQL errors never leak to the client.**
- **`server/middleware/validate.js`** — pairs with `express-validator`: run after a chain of
  `body(...)`/`param(...)` checks, it turns any validation failures into one consistent
  `400 { error, details: [{ field, message }] }` response.
- **`database/db.js`** — the single shared `mysql2` connection pool every controller imports;
  configured with `dateStrings: true` so DATE/DATETIME columns come back as plain `'YYYY-MM-DD'`
  strings rather than JS `Date` objects (avoids timezone-shift bugs when serializing to JSON).

---

## 7. Complete API reference

All routes are mounted under `/api`. 🔒 = requires a valid session (`requireAuth`). Role names in
parentheses = also requires that role (`requireRole`).

| Method | Path | Auth | Controller function |
|---|---|---|---|
| POST | `/auth/register` | public | `authController.register` |
| POST | `/auth/login` | public | `authController.login` |
| POST | `/auth/logout` | public | `authController.logout` |
| GET | `/auth/me` | 🔒 | `authController.me` |
| GET | `/users/me/profile` | 🔒 | `usersController.getMyProfile` |
| PUT | `/users/me/profile` | 🔒 | `usersController.updateMyProfile` |
| GET | `/doctors` | public | `doctorsController.list` |
| GET | `/doctors/:id` | public | `doctorsController.getById` |
| GET | `/doctors/:id/slots` | public | `doctorsController.getSlots` |
| POST | `/doctors` | 🔒 (admin) | `doctorsController.create` |
| PUT | `/doctors/:id` | 🔒 (doctor/admin) | `doctorsController.update` |
| PUT | `/doctors/:id/availability` | 🔒 (doctor/admin) | `doctorsController.setAvailability` |
| DELETE | `/doctors/:id` | 🔒 (admin) | `doctorsController.deactivate` |
| GET | `/specializations` | public | `specializationsController.list` |
| POST/PUT/DELETE | `/specializations[/:id]` | 🔒 (admin) | `specializationsController.*` |
| GET | `/appointments` | 🔒 | `appointmentsController.list` |
| GET | `/appointments/my-patients` | 🔒 (doctor) | `appointmentsController.listMyPatients` |
| GET | `/appointments/:id` | 🔒 | `appointmentsController.getById` |
| POST | `/appointments` | 🔒 (patient/doctor/admin) | `appointmentsController.create` |
| PATCH | `/appointments/:id/status` | 🔒 (patient/doctor/admin) | `appointmentsController.updateStatus` |
| PATCH | `/appointments/:id/reschedule` | 🔒 (patient/doctor/admin) | `appointmentsController.reschedule` |
| GET | `/medical-records` | 🔒 | `medicalRecordsController.list` |
| GET | `/medical-records/:id` | 🔒 | `medicalRecordsController.getById` |
| POST | `/medical-records` | 🔒 (doctor) | `medicalRecordsController.create` |
| GET | `/prescriptions` | 🔒 (patient/doctor) | `prescriptionsController.list` |
| GET | `/medications` | 🔒 | `medicationsController.list` |
| POST | `/medications` | 🔒 (patient) | `medicationsController.create` |
| PUT | `/medications/:id` | 🔒 (patient) | `medicationsController.update` |
| DELETE | `/medications/:id` | 🔒 (patient) | `medicationsController.remove` |
| POST | `/medications/:id/log` | 🔒 (patient) | `medicationsController.logIntake` |
| GET | `/notifications` | 🔒 | `notificationsController.list` |
| PATCH | `/notifications/:id/read` | 🔒 | `notificationsController.markRead` |
| PATCH | `/notifications/read-all` | 🔒 | `notificationsController.markAllRead` |
| GET | `/resources` | public | `resourcesController.list` |
| GET | `/resources/:id` | public | `resourcesController.getById` |
| POST/PUT/DELETE | `/resources[/:id]` | 🔒 (admin) | `resourcesController.*` |
| GET | `/reviews/doctor/:doctorId` | public | `reviewsController.listForDoctor` |
| POST | `/reviews` | 🔒 (patient) | `reviewsController.create` |
| GET | `/care/score` | 🔒 (patient) | `careController.getScore` |
| GET | `/care/timeline` | 🔒 (patient) | `careController.getTimeline` |
| GET | `/care/adherence-trend` | 🔒 (patient) | `careController.getAdherenceTrend` |
| GET | `/dashboard/patient` | 🔒 (patient) | `dashboardController.patientSummary` |
| GET | `/dashboard/doctor` | 🔒 (doctor) | `dashboardController.doctorSummary` |
| GET | `/admin/stats` | 🔒 (admin) | `adminController.getStats` |
| GET | `/admin/analytics` | 🔒 (admin) | `adminController.getAnalytics` |
| GET | `/admin/patients` | 🔒 (admin) | `adminController.listPatients` |
| GET | `/admin/doctors` | 🔒 (admin) | `adminController.listDoctors` |
| PATCH | `/admin/doctors/:id/verify` | 🔒 (admin) | `adminController.verifyDoctor` |
| PATCH | `/admin/users/:id/status` | 🔒 (admin) | `adminController.setUserStatus` |
| GET | `/admin/reports` | 🔒 (admin) | `adminController.listReports` |
| PATCH | `/admin/reports/:id` | 🔒 (admin) | `adminController.updateReport` |
| GET | `/admin/audit-logs` | 🔒 (admin) | `adminController.listAuditLogs` |
| GET | `/health` | public | inline health check in `app.js` |

---

## 8. Frontend: shared JavaScript modules

All under `public/js/`, loaded via plain `<script>` tags (no bundler, no import statements).

- **`api.js`** — a ~30-line `fetch` wrapper (`api.get/post/put/patch/del`). Centralizes three
  things every page would otherwise repeat: always sending `credentials: 'include'` (so the auth
  cookie goes with every request), always parsing the response body as JSON (or `null` if empty),
  and throwing a normal `Error` (with `.status` and `.details` attached) whenever the response
  isn't `ok`, so every page can just `try { await api.get(...) } catch (err) { toast.error(err.message) }`.
- **`guard.js`** — described fully in §5. The frontend half of authentication enforcement.
- **`layout.js`** — renders the shared marketing header/footer (`renderHeader`/`renderFooter`,
  used on public pages) and the dashboard chrome (`renderDashboardShell` — topbar + role-specific
  sidebar nav, used on all patient/doctor/admin pages) and the logged-in user menu
  (`renderUserMenu` — avatar, "Dashboard" link, log-out button). Centralizing this means every
  page's markup stays short (just placeholder `<div>`s) and the chrome is pixel-identical
  everywhere.
- **`nav.js`** — marketing-page-only behavior: mobile nav toggle, active-link highlighting, and
  populating the header's auth area (calls `/auth/me`; shows Login/Register buttons if that
  fails, or the user menu if it succeeds). Not used on dashboard pages — those get their user menu
  directly from `guard.js`'s event instead.
- **`toast.js`** — a minimal toast/snackbar notification system used everywhere for
  success/error feedback after an action (`toast.success('Saved.')` / `toast.error(err.message)`).

---

## 9. Frontend: every page and what it currently displays/does

### Public / marketing pages (no login required)

| Page | What it shows/does |
|---|---|
| `index.html` | Landing page: hero section, featured specializations (`GET /specializations`), top-rated doctors (`GET /doctors?sort=rating&pageSize=3`). |
| `doctors.html` | Public doctor directory/search: filter by specialization/city/consultation mode/experience/rating, sort, paginate (`GET /doctors`, `GET /specializations`). |
| `doctor.html?id=` | One doctor's public profile: bio, clinic info + map (Leaflet), qualifications, patient reviews (`GET /doctors/:id`), a date picker that loads real bookable slots (`GET /doctors/:id/slots`) and a booking form that posts `POST /appointments` — booking itself still requires being logged in as a patient (checked via `/auth/me`; otherwise shows a "log in to book" prompt). |
| `resources.html` | Health education article library: category filter, search, and a detail view for one article (`GET /resources`, `GET /resources/:id`). |
| `emergency.html` | Static emergency-contact/first-aid information page. |
| `about.html` | Static project/about page. |
| `auth/login.html` | Login form + one-click demo-account autofill buttons for all three roles; on success, redirects to the role's dashboard (or wherever `?next=` points, e.g. back to a page that redirected here via `guard.js`). |
| `auth/register.html` | Patient self-registration form (`POST /auth/register`). |
| `unauthorized.html` / `404.html` | Static error pages `guard.js`/the server fall back to. |

### Patient pages (`data-role="patient"`)

| Page | What it shows/does |
|---|---|
| `patient/dashboard.html` | Upcoming appointment card, Care Score gauge (SVG ring), quick-action tiles, today's medications, recent medical records (`GET /dashboard/patient`). |
| `patient/appointments.html` | List/filter all of the patient's appointments; cancel, reschedule (loads real slots for the new date), and leave a review on completed ones. |
| `patient/doctors.html` | Same doctor search as the public directory, but rendered inside the patient's own dashboard shell. |
| `patient/medical-records.html` | List of the patient's medical records; click through to one record's full detail + its prescriptions. |
| `patient/prescriptions.html` | Flattened list of every prescription ever written for the patient, with a one-click "start tracking this" action that calls `POST /medications` (greyed out once already tracked, via the `already_tracked` flag). |
| `patient/medications.html` | Tabs for today/upcoming/expired medications, a 14-day adherence trend chart, and taken/missed/skipped logging buttons per medication for today. |
| `patient/notifications.html` | The patient's notification inbox, mark-one-read / mark-all-read. |
| `patient/profile.html` | Edit personal + medical profile fields (`GET`/`PUT /users/me/profile`). |

### Doctor pages (`data-role="doctor"`)

| Page | What it shows/does |
|---|---|
| `doctor/dashboard.html` | Today's appointments, a 14-day appointment trend bar chart, upcoming appointments, recent consultations, headline stat tiles (`GET /dashboard/doctor`). |
| `doctor/appointments.html` | Full appointment list with confirm/cancel actions and a form to document a completed visit (writes a medical record + prescriptions via `POST /medical-records`). |
| `doctor/patients.html` | The doctor's patient roster derived from appointment history, with a drill-down into one patient's record history. |
| `doctor/availability.html` | Manage the doctor's weekly recurring availability blocks (`PUT /doctors/:id/availability`) — this is what drives real bookable slots everywhere else in the app. |
| `doctor/notifications.html` | Same notification inbox pattern as the patient side. |
| `doctor/profile.html` | Edit the doctor's public profile fields. |

### Admin pages (`data-role="admin"`)

| Page | What it shows/does |
|---|---|
| `admin/dashboard.html` | Platform-wide stat tiles, appointment-status doughnut chart, doctors-by-specialization bar chart, 6-month user-growth line chart, recent registrations, recent appointments (`GET /admin/stats`, `GET /admin/analytics`). |
| `admin/patients.html` / `admin/doctors.html` | Searchable, paginated tables of every patient/doctor; activate/deactivate accounts; verify doctors. |
| `admin/appointments.html` | Platform-wide appointment table with filters. |
| `admin/specializations.html` | CRUD for the specializations lookup table. |
| `admin/resources.html` | CRUD for the Health Resources article library. |
| `admin/reports.html` | Triage reported issues: filter by status, change status, add admin notes. |
| `admin/audit-log.html` | Read-only table of the 100 most recent audit log entries. |

---

## 10. The Care Score algorithm, in detail

**File**: `server/utils/careScore.js`, function `computeCareScore(pool, patientId)`.

This is the project's signature differentiating feature: a single 0–100 number summarizing how
"on track" a patient's engagement with their own care plan is — **explicitly not a medical risk
score or diagnosis**, just an engagement metric, and every score ships with a breakdown so it's
never a black box.

It's a weighted average of three sub-scores:

1. **Medication adherence — 40% weight.** `% of medication_logs rows with status='taken'` over
   the last 30 days. If nothing has been logged yet, this component defaults to a neutral 70
   (rather than 0, which would unfairly punish a brand-new patient with no log history) but the
   breakdown honestly reports `"No medications logged yet"`.
2. **Checkup recency — 35% weight.** Days since the patient's last `completed` appointment. ≤90
   days → 100 points. ≥365 days → 0 points. Linearly interpolated in between. No visit history at
   all → a neutral 50 (not penalized, since there's no data to judge).
3. **Follow-up completion — 25% weight.** Of all medical records with a `follow_up_date` that has
   already passed, what fraction had a subsequent completed appointment with the same doctor on
   or after that date? If nothing was ever due, this defaults to 100 (nothing to be behind on).

```
score = round(adherence*0.40 + recency*0.35 + followUp*0.25)   // clamped to [0, 100]
```

Every field returned also carries a plain-English `label` (e.g. `"70% of doses taken (last 30
days)"`) so the frontend never has to re-derive human-readable text from raw numbers.

---

## 11. Appointment slot computation, in detail

**File**: `server/utils/slots.js`, function `buildAvailableSlots`.

Slots are never stored in the database — they're computed on demand from two inputs:

1. The doctor's **recurring weekly template** (`doctor_availability`): for a given day-of-week,
   one or more `(start_time, end_time, slot_duration_mins)` blocks.
2. That specific date's **already-booked appointments** (any non-cancelled appointment for that
   doctor on that date).

The algorithm walks each availability block in `slot_duration_mins` steps, skips any start time
that's already booked, and — if the requested date is *today* — also skips any slot whose start
time has already passed (`now`). The result is the exact list of bookable start/end time pairs,
computed identically whether it's shown to the user (`GET /doctors/:id/slots`) or re-verified at
booking time (`assertSlotIsFree` in `appointmentsController.js`, run again inside the booking
transaction) — so what you see is always what you can actually book, and a race between two users
booking the same slot is caught by the re-check plus the database's own
`UNIQUE(doctor_id, appointment_date, start_time)` constraint as a final backstop.

---

## 12. A real bug we found and fixed (case study)

While reviewing the dashboard pages, we found and fixed a real production bug, documented here
because it's a good illustration of how the frontend/backend contract in this codebase works —
and where it can break.

**Symptom**: clicking the "Dashboard" button (top-right, shown once logged in) appeared to do
nothing — the page it navigated to stayed stuck showing its loading skeletons forever.

**Root cause**: `GET /api/auth/me` (`authController.me`) was returning the raw database row
shape — `full_name`, `avatar_url` (snake_case, matching the SQL column names) — while
`login`/`register` returned a hand-mapped camelCase shape (`fullName`, `avatarUrl`). Every
frontend consumer of `/auth/me` (`guard.js`, `nav.js`, and every dashboard page's `mb:auth-ready`
handler) was written expecting the camelCase shape, since that's what `login.html` receives and
that's the pattern used everywhere else in the frontend. Because `guard.js` is what supplies the
user object to every dashboard page (not the login response — that page has already navigated
away by the time the dashboard loads), `user.fullName` was `undefined` on every dashboard.

The actual crash: `public/patient/dashboard.html` had —

```js
document.getElementById('welcome-block').innerHTML =
  `<h2>Welcome back, ${user.fullName.split(' ')[0]}</h2>...`;
```

— **before** the `try/catch` block that fetches and renders the dashboard's data. With
`user.fullName` undefined, `.split(' ')` threw an uncaught `TypeError`, which stopped the whole
`async` event handler dead — so the dashboard data fetch and every render function after it
simply never ran, leaving the skeleton loaders on screen indefinitely with no visible error (no
console access needed to guess this — it was found by tracing the exact data returned by each
endpoint and comparing it against what each piece of frontend code expected).

**Fix**: `server/controllers/authController.js`'s `me` handler now maps the DB row to the same
camelCase shape `login`/`register` already use:

```js
const u = rows[0];
res.json({ user: { id: u.id, email: u.email, role: u.role, fullName: u.full_name, phone: u.phone, avatarUrl: u.avatar_url } });
```

This is a one-line-of-intent fix at the actual source of the inconsistency (rather than patching
every place that reads `user.fullName` to also accept `full_name`), and it incidentally also fixed
a second, non-crashing cosmetic bug: the doctor and admin dashboards, and the logged-in user menu
on marketing pages, were all silently displaying the literal text `"undefined"` in place of the
user's name.

---

## 13. Deployment

See [`README.md` §12](./README.md#12-deploying-to-vercel-full-stack) for the up-to-date,
step-by-step deployment instructions (Vercel for the full working app; GitHub Pages for a
static-only UI preview with no backend). In short:

- **`vercel.json`** + **`api/index.js`** route *every* request (API and static pages alike)
  through the same Express app (`server/app.js`) as one serverless function, so behavior matches
  local `npm start` exactly.
- **`server/app.js`** only calls `app.listen()` when **not** running on Vercel
  (`if (!process.env.VERCEL)`), since a serverless platform manages the HTTP server itself; the
  file otherwise exports the Express `app` unchanged.
- MySQL is **not** hosted by Vercel — a separate free MySQL-compatible host (Aiven, Railway,
  Clever Cloud, etc.) is required, with its credentials set as Vercel environment variables.

---

## 14. Future scope — what is not implemented yet

Honest gaps, in the order they'd most improve the product:

1. **Real-time updates.** Notifications and dashboard data are fetched on page load only — there's
   no WebSocket/SSE push. A new appointment request doesn't appear for the doctor until they
   reload. Adding Socket.IO (or plain SSE) for notifications would be the highest-impact addition.
2. **Audit logging isn't actually instrumented.** The `audit_logs` table and the admin "Audit Log"
   page exist and work, but no controller currently writes to that table — the only rows in it
   come from the demo seed script. A real implementation would insert a row from key actions
   (login, status changes, doctor verification, report resolution, etc.).
3. **File/document uploads.** `medical_records.document_url` exists in the schema for attaching a
   scanned report or image, but there's no upload endpoint yet — a natural next step with
   `multer` plus local disk or object storage (S3/Cloudinary).
4. **Refresh tokens / session revocation.** The JWT is a single long-lived (7-day) token; there's
   no refresh-token rotation and no way to invalidate a token before it expires (e.g. force
   logout everywhere after a password change). A refresh-token pair or a server-side token
   denylist would close this gap.
5. **Automated tests.** There is currently no test suite. Given the backend is a set of pure
   Express route handlers over SQL, Jest + Supertest (hitting a test database) would be the
   natural fit, starting with the appointment-booking transaction logic and the Care Score
   calculation, since both have real business-rule edge cases worth locking down.
6. **Payments/billing.** Consultation fees are displayed but there's no payment flow — adding one
   (Stripe/Razorpay) would need a `payments` table and webhook handling.
7. **Video consultations.** "Video" is a selectable consultation mode on booking, but no actual
   video call is launched — integrating WebRTC (or embedding a provider like Twilio/Daily) would
   make that mode functional rather than just a label.
8. **Rate limiting & brute-force protection.** Login/register have no rate limiting — repeated
   failed logins aren't throttled or locked out. `express-rate-limit` on the auth routes would be
   a small, high-value addition.
9. **Two-factor authentication** for doctor/admin accounts, given they can access other people's
   medical data.
10. **Email/SMS reminders** for upcoming appointments and medication times — currently reminders
    exist only as in-app notification rows and a `reminder_times` field on `medications` that
    isn't yet wired to any actual scheduled delivery mechanism.
11. **Search relevance/pagination polish** — doctor and admin list search currently uses simple
    `LIKE '%term%'` matching; a real deployment at scale would want a proper full-text index or a
    dedicated search service.
12. **Data export** for admins (CSV/PDF export of reports, appointment logs, analytics) is not
    implemented.
13. **Mobile app / PWA.** The frontend is responsive down to ~360px but is not an installable PWA
    (no manifest/service worker) and there is no native mobile app.
14. **Multi-language support.** All UI text is hardcoded English; there's no i18n layer.

---

*This document reflects the codebase as of the dashboard bug fix described in §12. If you change
a controller, route, or table, please keep this file in sync — it's meant to always be an accurate
map of what the code actually does, not an aspirational description.*
