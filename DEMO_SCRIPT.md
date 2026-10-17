# MediBridge — Evaluation demo script (about 10 minutes)

## Before the evaluation (morning of)

```bash
npm run setup     # demo data is dated relative to today - re-seed on the day
npm start         # http://localhost:4000
```

Open the app in one browser window. Use the one-click demo buttons on the login page, and log out
between roles (or use a second browser/incognito window for the staff and admin views).

## 1. The pitch (30 seconds) — landing page `/`

> "In our first evaluation, the feedback was that booking, records and reminders already exist on other sites, and they do.
> So we looked at where care actually breaks: not during a visit, but **between** steps. The doctor
> starts every consult from zero. A patient is medically fit at noon but still in bed at five
> because billing and insurance haven't signed off, and nobody can say which desk is holding them.
> A hospital that can't treat a patient phones other hospitals one by one. MediBridge carries the
> patient's information across every one of those handoffs, so nobody types anything twice and
> everyone can see who the patient is waiting on."

Scroll through "Care breaks at the handoffs" and the four modules.

## 2. Smart Brief: enter once, reuse everywhere (2 min)

**Patient** (`patient@medibridge.demo`)
1. Dashboard → the "what needs you now" card → *Fill pre-visit form*.
2. Point out the "already on file" panel: allergies, conditions and medicines are **not** asked
   again. Pick symptom chips and a severity, then submit. It takes about 2 minutes.

**Doctor** (`doctor@medibridge.demo`)
3. Dashboard → **Visits** list → click **Brief** on the first patient's brief.
4. Show **Things to know first**. These flags are computed from real data: a new allergy reported in
   the intake, severity 4/5, a medication change, a recent hospital stay, first visit.
5. Show "Why they're coming" (the patient's own words and question), medicines with adherence,
   recent records and visit history.
   > "The doctor didn't ask anything and the patient didn't repeat anything."

## 3. Discharge Flow: who is the patient waiting on? (3 min)

**Patient** (still logged in as patient, or show it later)
1. Dashboard → **Hospital stay** card: "Waiting on Insurance desk — blocked, 3h". Open
   *Track discharge*: the same live status in plain words, with the event timeline.

**Doctor**
2. Sidebar → **Inpatients & Discharge**. Aarav Sharma shows the bottleneck banner "Waiting on
   Insurance — Awaiting TPA pre-authorisation". Click **Nudge Insurance**.
3. Take a patient still "In treatment" → **Mark medically fit for discharge**. Five department
   tasks are created and each department is notified. This is the moment the clock starts.

**Insurance staff** (`insurance@medibridge.demo`, password `Staff@123`)
4. **My Queue** shows every patient waiting on *this desk*, most urgent first, with time since
   clearance against the 2-hour target and which other desks the patient is waiting on. Show the
   nudge in notifications.
5. On Aarav: **Resume** → **Mark done**.

**Admin** (`admin@medibridge.demo`)
6. Sidebar → **Operations Center** (Discharge tab). The live board shows the cleared patients still in a bed and
   who is holding each one. The department chart shows Insurance averaging about 3h against a 2h
   target.
   > "This is the number a hospital manager has never had: which desk to fix first."

## 4. TransferConnect: one request instead of ten phone calls (2.5 min)

**Doctor**
1. Sidebar → **TransferConnect** → New transfer. Choose a patient, *Neurology*, urgency, and a
   reason → **Find hospitals**.
2. Hospitals are **ranked with reasons**: specialty, free beds, ICU, distance and how fast they
   usually reply. Hospitals without the specialty are excluded.
3. Show the **auto-generated clinical summary preview** ("you don't type this"). Tick consent,
   select the top hospitals and send.

**Partner hospital desk** (`desk.agnes@medibridge.demo`, `Staff@123`)
4. The incoming queue shows only initials, age, sex and reason until the desk opens a request. Open it: the full
   summary appears with a notice that every open is logged. **Accept**.

**Doctor**
5. The request shows **accepted**, and the other hospitals' offers are withdrawn automatically. A bed
   is reserved. Admin → Audit Log shows who viewed the summary and when.

## 5. Visit Loop: the plan doesn't end at the door (1.5 min)

**Doctor** → Appointments → document a visit: write the record, a **plain-language plan** and
commitments. The follow-up date becomes a commitment automatically.

**Patient** → **My Care Plan**: the plan in plain words and a checklist (Overdue / Coming up /
Done) showing who is responsible: You, Doctor or Hospital. Tick one off.

**Admin** → Operations Center → **Follow-ups** tab: overdue commitments are the "broken
loops", the patients to call.

## Likely questions and short answers

- **"Doesn't Practo / a hospital HMS do this?"** They do booking and records, which is our
  foundation, not our pitch. Discharge coordination and transfer brokering exist only inside
  expensive enterprise hospital systems (for example Epic or TeleTracking in the US) and they aren't joined to
  the patient's own view. We found no lightweight product that connects the patient, the doctor,
  the departments and other hospitals in one loop. That claim rests on our research, not on proof of absence.
- **"How is the match score calculated?"** Specialty 30 + beds 20 + ICU 15 + distance 20 + response
  history 15 = 100. Every part is shown as a reason, so it's explainable rather than a black box.
- **"How is the bottleneck chosen?"** An explicitly blocked task first, otherwise the task furthest
  past its target time.
- **"What about privacy?"** Consent is required to send a transfer. Receiving desks see initials only
  until they open the request. Every summary view is audit-logged. Doctors only see patients they
  have a care relationship with.
- **"Is the Care Score medical advice?"** No. It measures engagement (adherence, check-ups, follow-ups), not
  diagnosis, and it always shows its breakdown.
- **"Is any of this AI?"** No. Flags, matching and bottlenecks are transparent rules over real
  data, so a clinician can check every one of them.
