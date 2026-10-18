# MediBridge — Care that doesn't fall through the gaps

MediBridge is a **care-handoff platform**. Most health software handles one visit at a time; the
things that actually go wrong happen *between* steps — the doctor who starts from zero, the patient
who is medically fit at noon but still in bed at five because billing and insurance haven't signed
off, the transfer arranged one phone call at a time. MediBridge carries the patient's information
across every one of those handoffs so nobody re-types it, and shows every role exactly who the
patient is waiting on.

It connects **patients**, **doctors**, **hospital department staff** and **administrators**, built
on real appointment booking, medical records, prescriptions, medication tracking and a personal
**Care Score**. It is a college full-stack project: Node.js/Express/MongoDB backend and a vanilla
HTML/CSS/JavaScript multi-page frontend with no framework, so the engineering is directly visible.

### What's new and why (v2)

| Module | The gap it closes | What it does |
|---|---|---|
| **Smart Brief** | Doctors start every consult by re-asking history; patients repeat themselves. | The patient answers a 2-minute pre-visit form once. The doctor opens a one-page brief compiled automatically from biodata, allergies, current medicines + adherence, recent records, open follow-ups and the intake, with computed flags ("New allergy reported", "Missed 3 doses this week", "Follow-up overdue"). |
| **Discharge Flow** | Patients are medically cleared but wait hours for billing, insurance, pharmacy and paperwork, and nobody can see which desk is holding them. | When the doctor marks a patient fit, every department gets its task with a target time. Staff work from a live queue, report blockers with a reason, get nudged, and the patient/family see the same live "currently waiting on" status. Admins see which department causes the most delay. |
| **TransferConnect** | When a hospital can't provide the care needed, staff phone other hospitals one by one. | Hospitals are ranked by specialty, free beds, ICU, distance and response history (with plain-English reasons). One request goes to several at once; the first to accept wins, beds are reserved, and the clinical summary is generated automatically and revealed only on open, with consent and an access log. |
| **Visit Loop** | Patients forget most of what they're told; follow-ups silently lapse. | After a visit or discharge the doctor writes a plain-language plan with commitments (tests, follow-ups, medicines) that patient, doctor and admin all track until they're done. Overdue items surface as "broken loops" for the admin to act on. |

The **Operations Center** (admin) shows all three handoff problems on one screen.

> **Disclaimer:** All doctors, patients, and medical data in this project are entirely fictional
> demo data. MediBridge is not a certified medical-records system and must not be used for real
> clinical decisions. Always consult a qualified healthcare professional.

---

## 1. Problem statement

Finding a suitable doctor, booking an appointment without phone tag, keeping track of
prescriptions and medical history, and staying consistent with medication are everyday frictions
in healthcare access — especially for people without easy access to a single, trusted family
clinic. MediBridge addresses this by giving patients, doctors and administrators one shared,
secure system for discovery, scheduling, records and medication adherence.

## 2. SDG mapping

| SDG | How MediBridge supports it |
|---|---|
| **SDG 3 — Good Health & Well-being** (primary) | Appointment booking with real-time availability, structured medical records & prescriptions, medication reminders with adherence tracking, and the Care Score encourage consistent engagement with preventive and ongoing care. |
| **SDG 9 — Industry, Innovation & Infrastructure** | A normalized relational database, a documented REST API, and role-based web architecture demonstrate accessible digital health infrastructure. |
| **SDG 10 — Reduced Inequalities** | Transparent consultation fees, video-consultation options, and a searchable doctor directory reduce friction and information gaps that disproportionately affect underserved patients. |

## 3. Key features

- **Three roles**: Patient, Doctor, Admin — each with a dedicated dashboard and permissions enforced server-side.
- **Doctor discovery**: search/filter by name, specialization, city, consultation mode, experience, rating; sortable results; a Leaflet/OpenStreetMap clinic-location map on each doctor's profile.
- **Real appointment system**: time slots are computed from the doctor's recurring weekly availability *minus* already-booked slots — not simulated in the frontend. Conflicting double-bookings are rejected both by application logic and a DB unique constraint. Patients can cancel/reschedule; doctors can confirm/complete/cancel.
- **Medical records & prescriptions**: doctors document diagnosis, vitals, consultation summary, follow-up date, and a multi-line prescription — all written atomically in one transaction and access-controlled (a doctor only sees patients they've actually had an appointment with).
- **Medication reminders**: patients track medicines (self-added or promoted from a prescription), log daily intake (taken/missed/skipped), and see Today/Upcoming/Completed views plus a 14-day adherence chart.
- **★ Care Score (signature feature)**: a 0–100 score blending medication adherence (40%), checkup recency (35%) and follow-up completion (25%) — computed live from real data with a visible breakdown, plus a unified Health Timeline merging appointments, records and medications chronologically.
- **Admin dashboard**: platform stats, charts (status breakdown, specialization distribution, user growth), patient/doctor management (search, pagination, activate/deactivate, verify), specialization & resource CRUD, reported-issue moderation, and a system audit log.
- **Healthcare resources library**: general educational articles across preventive care, nutrition, mental wellness, first aid, healthy lifestyle and emergency guidance — explicitly non-diagnostic.
- **Security**: bcrypt password hashing, JWT in an httpOnly cookie, role-based middleware, schema-validated Mongoose models, injection-safe queries, centralized input validation and error handling.
- **UX details**: loading skeletons, empty states, toasts, modals, confirmation prompts, a real 404 page and an Unauthorized page, responsive layout down to ~360px.

## 4. Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom design system, no framework), vanilla JavaScript, Chart.js, Leaflet/OpenStreetMap |
| Backend | Node.js, Express.js, REST API |
| Database | MongoDB (Mongoose ODM): schema-validated models, indexes, aggregation pipelines |
| Auth | bcryptjs password hashing, JWT (httpOnly cookie), role-based middleware |
| Validation | express-validator |

## 5. Architecture & folder structure

```
medibridge/
├── server/
│   ├── app.js                 Express app entry point, route wiring, static serving
│   ├── routes/                Thin route definitions → controllers
│   ├── controllers/           Business logic (one file per resource)
│   ├── middleware/            auth (JWT + role guard), validation, error handling
│   └── utils/                 slot-builder, Care Score algorithm, JWT helpers, ApiError
├── database/
│   ├── db.js                  MongoDB connection (cached, reused by app, seeds and serverless)
│   ├── store.js               Mongoose models for every collection + query/date helpers
│   ├── migrate.js             Creates collections and indexes → `npm run db:create`
│   ├── seed.js                Core fictional demo data → `npm run db:seed`
│   ├── seed_v2.js             Hospitals, staff, discharge, transfers, care plans → `npm run db:v2`
│   └── seed_demo_extra.js     Extra demo layer (more cases in every state) → `npm run db:demo`
├── public/                    Static multi-page frontend
│   ├── css/main.css           Design system: tokens, buttons, forms, cards, tables, modals...
│   ├── js/                    api.js (fetch wrapper), layout.js (header/footer/sidebar),
│   │                          nav.js, guard.js (auth/role guard), toast.js
│   ├── auth/                  login.html, register.html
│   ├── patient/               dashboard, doctors, appointments, medical-records,
│   │                          prescriptions, medications, notifications, profile
│   ├── doctor/                dashboard, appointments, patients, availability,
│   │                          notifications, profile
│   ├── admin/                 dashboard, patients, doctors, appointments,
│   │                          specializations, resources, reports, audit-log
│   └── index.html, doctors.html, doctor.html, resources.html, about.html,
│       emergency.html, 404.html, unauthorized.html
├── .env.example
└── package.json
```

**Why this structure:** routes stay thin (path + middleware only), all query/business logic lives
in controllers, and `database/db.js` plus `database/store.js` are the only places that know about the database — so switching
databases or adding caching later touches one file. The frontend has no build step: every page is
a real, addressable `.html` file; shared chrome (header, footer, sidebar) is injected by
`layout.js` so it never has to be hand-copied across 30+ pages.

## 6. Database design

MongoDB, one collection per entity, with the same field names and numeric `id`s the API has
always returned, so the frontend did not need to change. `users` holds shared identity and role;
`patients`, `doctors` and `staff` are one-to-one role profiles keyed by `user_id`. Around them:
`specializations`, `doctor_availability`, `appointments`, `medical_records`, `prescriptions`,
`medications`, `medication_logs`, `reviews`, `notifications`, `healthcare_resources`,
`reported_issues`, `audit_logs`, and the care-handoff collections (`hospitals`,
`hospital_capabilities`, `admissions`, `discharge_tasks`, `discharge_events`, `transfer_requests`,
`transfer_offers`, `intake_forms`, `care_plans`, `commitments`).

How it maps from a relational design:
- **Ids:** a `counters` collection hands out auto-incrementing integer ids with an atomic `$inc`.
- **Relationships:** documents reference each other by id. Lists that need names (for example an
  appointment's doctor) fetch the related documents in one batched query; the doctor directory and
  admin tables use `$lookup` aggregation pipelines.
- **Dates:** calendar dates and times are `'YYYY-MM-DD'` / `'HH:MM:SS'` strings (they sort correctly);
  timestamps are real `Date`s, serialised as local `'YYYY-MM-DD HH:MM:SS'` strings.
- **Constraints:** unique indexes replace unique keys. `appointments` has a unique index on
  `(doctor_id, appointment_date, start_time)`, so a double-booking is rejected by the database even
  if application logic is bypassed. Other unique indexes cover reviews per appointment, medication
  logs per day, and one offer per hospital per transfer.
- **Concurrency without transactions:** a standalone MongoDB server has no multi-document
  transactions, so races are settled by single atomic conditional updates. For example, when two
  hospitals accept the same transfer at once, the bed reservation and the request claim are each a
  conditional update, so exactly one hospital wins and the other bed is never taken.

See `database/store.js` for every field, type, default and index.

## 7. Getting started

### Prerequisites
- Node.js 18+ and npm (already verified on this machine: Node v24, npm 11)
- A running MongoDB server (local `mongod`, or a free MongoDB Atlas cluster)

### MongoDB
Install MongoDB Community Server and make sure it is running (on Windows it normally runs as a
service on `mongodb://127.0.0.1:27017`). Nothing needs creating by hand: the `medibridge`
database and its collections are created by the setup script.

### Setup
```bash
npm install
cp .env.example .env   # then set JWT_SECRET (and MONGO_URI if MongoDB is not on this machine)
npm run setup          # creates collections + indexes AND seeds realistic demo data
npm start               # http://localhost:4000
```
`npm run setup` runs `db:create` (collections and indexes), `db:seed` (24 doctors, 15 patients,
about 60 days of appointment history, medical records, prescriptions, medication logs, reviews,
notifications, resources, reported issues and audit entries) and `db:v2` (hospitals, staff logins,
inpatients and discharge cases in every state, transfer requests in every status, pre-visit
intakes and care plans). All data is fictional.

**Demo data is dated relative to the day you seed it**, so run `npm run setup` again on the day
of a demo to get "upcoming" appointments and "cleared 3 hours ago" admissions.
- `npm run db:seed` wipes the `medibridge` database and regenerates the core data deterministically
  (a seeded PRNG keeps it consistent). Run `npm run db:v2` after it.
- `npm run db:v2` resets only the care-handoff modules and re-adds the extra demo layer.
- `npm run db:demo` adds just the extra demo layer (it skips itself if it is already present).

### Environment variables (`.env`)
| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (default 4000) |
| `MONGO_URI` | MongoDB connection string (default `mongodb://127.0.0.1:27017/medibridge`) |
| `JWT_SECRET` | Secret used to sign session tokens — set this to a long random string |
| `JWT_EXPIRES_IN` | Session lifetime (default `7d`) |
| `CLIENT_ORIGIN` | Allowed CORS origin (default: same origin) |

## 8. Demo accounts

| Role | Email | Password |
|---|---|---|
| Patient | `patient@medibridge.demo` | `Patient@123` |
| Doctor | `doctor@medibridge.demo` | `Doctor@123` |
| Admin | `admin@medibridge.demo` | `Admin@123` |
| Hospital staff (MediBridge City Hospital) | `billing@`, `insurance@`, `pharmacy@`, `nursing@`, `records@` `medibridge.demo` | `Staff@123` |
| Transfer desk, home hospital | `transfer@medibridge.demo` | `Staff@123` |
| Transfer desks, partner hospitals | `desk@` (Lakeview), `desk.sunrise@`, `desk.agnes@`, `desk.cedar@`, `desk.riverside@` `medibridge.demo` | `Staff@123` |

A step-by-step evaluation walkthrough is in [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md).

(The login page also has one-click buttons to fill these in.) New patient accounts can also be
created via **Register** — doctor and admin accounts are provisioned by an admin, by design.

## 9. API overview

All endpoints are under `/api`. Protected routes require a valid session (httpOnly `token`
cookie, set on login/register) and, where noted, a specific role.

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Users | `GET/PUT /users/me/profile` |
| Doctors | `GET /doctors` (search/filter/sort/paginate), `GET /doctors/:id`, `GET /doctors/:id/slots?date=`, `POST /doctors` (admin), `PUT /doctors/:id`, `PUT /doctors/:id/availability`, `DELETE /doctors/:id` (admin) |
| Specializations | `GET /specializations`, `POST/PUT/DELETE` (admin) |
| Appointments | `GET /appointments`, `GET /appointments/my-patients` (doctor), `GET /appointments/:id`, `POST /appointments`, `PATCH /appointments/:id/status`, `PATCH /appointments/:id/reschedule` |
| Medical records | `GET /medical-records`, `GET /medical-records/:id`, `POST /medical-records` (doctor) |
| Prescriptions | `GET /prescriptions` (flattened view for patient/doctor) |
| Medications | `GET /medications?bucket=today|upcoming|expired`, `POST`, `PUT/:id`, `DELETE/:id`, `POST /:id/log` |
| Notifications | `GET /notifications`, `PATCH /:id/read`, `PATCH /read-all` |
| Resources | `GET /resources`, `GET /resources/:id`, `POST/PUT/DELETE` (admin) |
| Reviews | `POST /reviews`, `GET /reviews/doctor/:doctorId` |
| Care (signature feature) | `GET /care/score`, `GET /care/timeline`, `GET /care/adherence-trend` |
| Dashboard | `GET /dashboard/patient`, `GET /dashboard/doctor` |
| Admin | `GET /admin/stats`, `GET /admin/analytics`, `GET /admin/patients`, `GET /admin/doctors`, `PATCH /admin/doctors/:id/verify`, `PATCH /admin/users/:id/status`, `GET/PATCH /admin/reports`, `GET /admin/audit-logs` |
| Smart Brief + Visit Loop | `POST /visit-loop/intake`, `GET /visit-loop/intake/:appointmentId`, `GET /visit-loop/pending-intakes`, `GET /visit-loop/intake-status`, `GET /visit-loop/brief/:appointmentId` (doctor), `GET /visit-loop/briefs/today` (doctor), `GET/POST /visit-loop/care-plans`, `GET /visit-loop/commitments`, `PATCH /visit-loop/commitments/:id`, `GET /visit-loop/analytics` (admin) |
| Discharge Flow | `GET /discharge/queue` (staff), `PATCH /discharge/tasks/:id`, `POST /discharge/tasks/:id/nudge`, `GET /discharge/admissions`, `GET /discharge/admissions/:id`, `POST /discharge/admissions/:id/clear` (doctor), `POST /discharge/admissions/:id/discharge`, `GET /discharge/my-stay` (patient), `GET /discharge/board`, `GET /discharge/analytics` (admin), `GET /staff/me` |
| TransferConnect | `GET /transfers/hospitals`, `GET /transfers/candidates`, `POST /transfers/match`, `POST /transfers/preview-summary`, `POST /transfers`, `GET /transfers`, `GET /transfers/incoming` (desk), `GET /transfers/:id`, `POST /transfers/offers/:id/respond` (desk), `POST /transfers/:id/complete`, `POST /transfers/:id/cancel`, `GET /transfers/analytics` (admin) |

All responses are JSON; errors return `{ "error": "message" }` with an appropriate HTTP status
code and never leak raw database errors or stack traces to the client.

## 10. The Care Score — how it's computed

See `server/utils/careScore.js`. It blends three signals, each computed from real queries over the
patient's own data:
- **Medication adherence (40%)** — % of logged doses marked "taken" in the last 30 days.
- **Checkup recency (35%)** — 100 if the last completed visit was within 90 days, decaying
  linearly to 0 at 365+ days.
- **Follow-up completion (25%)** — % of doctor-recommended follow-ups (past their due date) for
  which a later completed appointment with that doctor actually happened.

It is explicitly **not** a diagnostic or risk score — it measures engagement with one's own care
plan, and the full breakdown is always shown alongside the number.

## 11. Known limitations & future enhancements

- File/document upload for medical reports is modeled in the schema (`document_url`) but not
  yet wired to an upload endpoint — a reasonable next step with `multer` + local/object storage.
- No real-time push (WebSocket) for notifications; the client polls on page load.
- No automated test suite yet — would add Jest + Supertest for the API layer next.
- Payment/billing for consultation fees is out of scope.
- Video consultation is a selectable mode but does not launch an actual video call (no WebRTC integration).

## 12. Deploying to Vercel (full stack)

MediBridge can be deployed as a single Vercel project — the whole Express app (API + static
pages) runs as one serverless function via `api/index.js` and `vercel.json`. Vercel does not
host a database, so use a free MongoDB Atlas cluster (cloud.mongodb.com).

1. **Create an Atlas cluster**, add a database user, allow network access, and copy the
   connection string (it looks like `mongodb+srv://user:password@cluster.mongodb.net/medibridge`).
2. **Create the collections and seed data** in Atlas — from your machine, point `MONGO_URI` in
   `.env` at the Atlas string temporarily and run:
   ```bash
   npm run setup
   ```
3. **Push this repo to GitHub** (if not already).
4. **Import the repo into Vercel** (vercel.com → Add New Project → import from GitHub).
5. **Set environment variables** in the Vercel project settings (Settings → Environment
   Variables) — the same keys as `.env.example`: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`. Leave `PORT` unset (Vercel manages
   this). `NODE_ENV` is set to `production` by Vercel automatically, which makes auth cookies
   `secure` — this requires the site be served over HTTPS, which Vercel does by default.
6. **Deploy.** Vercel builds `api/index.js` (which re-exports `server/app.js`) and routes every
   request — API and static pages alike — through it, so behavior matches `npm start` locally.
7. Visit the deployed URL and log in with one of the [demo accounts](#8-demo-accounts) to
   confirm the dashboards load.

Because every request (including static assets) goes through one serverless function rather
than a CDN-cached static host, expect a brief cold start after periods of inactivity — normal
for free-tier serverless hosting and not a sign of a broken deployment.

### Static-only preview (GitHub Pages)

If you just want to showcase the frontend UI without a live backend, you can publish the
`public/` folder to GitHub Pages. Pages that call the API (login, dashboards, booking, etc.)
will show a "could not load" error there since there's no server to answer them — this mode is
for browsing the design only, not a functional demo.

## 13. Quality checklist (self-assessment)

- ✅ Real Express + MongoDB backend (Mongoose models, indexes, aggregation pipelines).
- ✅ Role-based authentication (bcrypt + JWT) and authorization enforced server-side.
- ✅ Full CRUD across appointments, medical records, medications, specializations, resources, users.
- ✅ Appointment slot computation and conflict prevention enforced in the backend and the database.
- ✅ Responsive, cohesive custom design system — not a generic template.
- ✅ Centralized error handling, input validation, loading/empty/error states, 404 & unauthorized pages.
- ✅ A genuine standout feature (Care Score + Health Timeline) backed by real aggregation queries.
