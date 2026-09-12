# MediBridge — Smart Healthcare Access & Management Platform

MediBridge is a full-stack web platform connecting **patients**, **doctors** and **administrators**
around real appointment booking, medical records, prescriptions, medication reminders and a
personal **Care Score**. It was built as a college full-stack development project, using a
traditional Node.js/Express/MySQL backend and a vanilla HTML/CSS/JavaScript multi-page frontend —
no frontend framework, so the HTML/CSS/JS and backend engineering are directly visible.

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
- **Security**: bcrypt password hashing, JWT in an httpOnly cookie, role-based middleware, parameterized SQL everywhere, centralized input validation and error handling.
- **UX details**: loading skeletons, empty states, toasts, modals, confirmation prompts, a real 404 page and an Unauthorized page, responsive layout down to ~360px.

## 4. Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom design system, no framework), vanilla JavaScript, Chart.js, Leaflet/OpenStreetMap |
| Backend | Node.js, Express.js, REST API |
| Database | MySQL (`mysql2/promise`), parameterized queries |
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
│   ├── schema.sql             Full normalized schema (15 tables, FKs, indexes)
│   ├── db.js                  Shared MySQL connection pool
│   ├── migrate.js             Applies schema.sql  → `npm run db:create`
│   └── seed.js                Realistic fictional demo data → `npm run db:seed`
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
in controllers, and `database/db.js` is the single place that knows how to connect — so switching
databases or adding caching later touches one file. The frontend has no build step: every page is
a real, addressable `.html` file; shared chrome (header, footer, sidebar) is injected by
`layout.js` so it never has to be hand-copied across 30+ pages.

## 6. Database design

15 tables, fully normalized: `users` (shared identity + role) → `patients` / `doctors` (1:1
role profiles) → `specializations`, `doctor_availability`, `appointments`, `medical_records` →
`prescriptions` → `medications` → `medication_logs`, plus `reviews`, `notifications`,
`healthcare_resources`, `reported_issues`, `audit_logs`. Every foreign key is enforced, and the
`appointments` table has a `UNIQUE (doctor_id, appointment_date, start_time)` constraint so a
double-booking is rejected at the database level even if application logic is bypassed. See
`database/schema.sql` for full column definitions, keys and indexes.

## 7. Getting started

### Prerequisites
- Node.js 18+ and npm (already verified on this machine: Node v24, npm 11)
- A running MySQL server (8.x recommended) reachable from this machine

### Install MySQL (if you don't already have it)
```powershell
# In an elevated (Run as Administrator) PowerShell window:
choco install mysql -y
# then create the app's database user (optional but recommended over using root):
mysql -u root
```
```sql
CREATE DATABASE medibridge;
CREATE USER 'medibridge_app'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON medibridge.* TO 'medibridge_app'@'localhost';
FLUSH PRIVILEGES;
```

### Setup
```bash
npm install
cp .env.example .env   # then edit .env with your real DB credentials
npm run setup          # creates the schema AND seeds realistic demo data
npm start               # http://localhost:4000
```
`npm run setup` runs `db:create` (applies `database/schema.sql`) then `db:seed` (populates 24
doctors, 15 patients, ~45 days of appointment history, medical records, prescriptions, medication
logs, reviews, notifications, resources, reported issues and audit entries — all fictional).
Re-running `npm run db:seed` truncates and regenerates the same dataset deterministically (a
seeded PRNG keeps it consistent across runs).

### Environment variables (`.env`)
| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (default 4000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `JWT_SECRET` | Secret used to sign session tokens — set this to a long random string |
| `JWT_EXPIRES_IN` | Session lifetime (default `7d`) |
| `CLIENT_ORIGIN` | Allowed CORS origin (default: same origin) |

## 8. Demo accounts

| Role | Email | Password |
|---|---|---|
| Patient | `patient@medibridge.demo` | `Patient@123` |
| Doctor | `doctor@medibridge.demo` | `Doctor@123` |
| Admin | `admin@medibridge.demo` | `Admin@123` |

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

All responses are JSON; errors return `{ "error": "message" }` with an appropriate HTTP status
code and never leak raw database errors or stack traces to the client.

## 10. The Care Score — how it's computed

See `server/utils/careScore.js`. It blends three signals, each a real SQL aggregate over the
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

## 12. Quality checklist (self-assessment)

- ✅ Real Express + MySQL backend with parameterized queries throughout.
- ✅ Role-based authentication (bcrypt + JWT) and authorization enforced server-side.
- ✅ Full CRUD across appointments, medical records, medications, specializations, resources, users.
- ✅ Appointment slot computation and conflict prevention enforced in the backend and the database.
- ✅ Responsive, cohesive custom design system — not a generic template.
- ✅ Centralized error handling, input validation, loading/empty/error states, 404 & unauthorized pages.
- ✅ A genuine standout feature (Care Score + Health Timeline) backed by real aggregation queries.
