# MediBridge should close the visit loop

MediBridge's current features are all already invented, so the project needs a new centre of gravity: we recommend a "Visit Loop" that follows each consultation from the patient's own words before the visit, through a doctor-approved plain-language care plan and a teach-back check built from that patient's own record, to a shared ledger of open commitments that patient, doctor and admin all see. Booking, records, prescriptions, reminders, timelines, reviews and admin dashboards exist at Practo, Eka Care, MyChart, Medisafe and in many open-source and student projects; the Care Score is the only item with no direct equivalent found, and it is a recombination of known measures. Every single part of the Visit Loop also has prior art, mostly in US enterprise systems. What the research did not find is one lightweight product, consumer or Indian, that joins those parts into a single three-role loop with admin analytics on where loops break. That is a "not found in a shallow search" result, not proof of absence, and our confidence in the novelty of the combination is medium to low. The case for it rests on evidence that patients forget 40-80% of what they are told, that about half of Indian chronic-disease patients neither adhere nor return, and that Indian doctors have about two minutes per patient. The loop fits the existing Node/Express/MySQL stack with six new tables, about sixteen endpoints and roughly six weeks of phased work, and it runs without any LLM. Many figures below came from search summaries only and must be opened and checked before they go on a slide; the last section lists them.

## MediBridge today is a complete clinic platform with a patient-only twist

MediBridge is a role-based, multi-page web application in which patients, doctors and administrators share one MySQL database of 15 tables behind an Express REST API. A patient searches doctors by specialization, city, mode, experience and rating, sees the clinic on a Leaflet map, and books a slot that the server computes from the doctor's weekly availability minus existing bookings, with a database unique constraint as the final guard against double booking. After the visit the doctor writes one medical record (diagnosis, vitals, summary, follow-up date) and a multi-line prescription in a single transaction. The patient can turn any prescription line into a tracked medication, log each day as taken, missed or skipped, and watch a 14-day adherence chart. Reviews are tied to completed appointments, notifications are in-app rows, and the admin has statistics, charts, doctor verification, account activation, content management, reported-issue triage and an audit-log page.

The project's stated signature is the **Care Score**: a 0-100 number blending 30-day dose-log adherence (40%), recency of the last completed visit (35%) and completion of doctor-recommended follow-ups (25%), shown with its breakdown next to a Health Timeline that merges appointments, records and medication starts.

Three properties of the current build matter for what follows. First, the chain `medical_records` → `prescriptions` → `medications` → `medication_logs` already links what the doctor ordered to what the patient did, inside one system. Second, that information flows in one direction only: the Care Score, the adherence trend and the timeline are patient-only routes, so the doctor never sees whether the prescription was followed and the admin sees only counts of appointments and users. Third, the `audit_logs` table is populated only by the seed script; no controller writes to it. The platform stores the follow-up date, the prescription and the dose logs, but nobody acts on them across roles. That unused linkage is the asset the innovation builds on.

## Every current feature already exists somewhere

The evaluators are right, and twice over. Commercially, discovery, booking, digital prescriptions, stored records, reminders and reviews are standard across Indian and global platforms. Practo's own About page lists a verified doctor directory, online booking at 9,000+ hospitals and clinics, online consultation, and the Ray practice-management software used by 10,000+ clinics ([Practo About](https://www.practo.com/company/about)). Academically, "hospital management system with patient, doctor and admin" is among the most common full-stack student projects, including several on Node, Express and MySQL ([Mishra-coder/Appointment-Booking-System](https://github.com/Mishra-coder/Appointment-Booking-System); [jmrashed/hospital-management-system](https://github.com/jmrashed/hospital-management-system)).

The table gives the feature-by-feature position. "Assumed" means the feature is widely understood to be standard but the researchers did not retrieve a source for it.

| MediBridge feature | Who already does it | Verdict |
|---|---|---|
| Three roles with separate dashboards | Practo with Ray; Eka Care with Eka Doc ([App Store](https://apps.apple.com/us/app/id1598859349)); student HMS repos | Already invented |
| Doctor search and filters | Practo; Zocdoc ([iDataLabs](https://idatalabs.com/tech/products/zocdoc)); Bajaj Finserv Health ([App Store](https://apps.apple.com/in/app/id1487452389)) | Already invented (mode and rating filters assumed) |
| Clinic map, cancel and reschedule, emergency page | Not individually sourced | Assumed commodity |
| Slot booking without double booking | Practo, Zocdoc, Doctolib, OpenEMR ([Techjockey](https://www.techjockey.com/blog/open-source-and-free-hospital-management-software/amp)) | Already invented |
| Doctor-written record and multi-line prescription | Practo Ray ([Capterra](https://www.capterra.com/p/167778/Ray/)); Eka Doc; HealthPlix | Already invented |
| Patient view of records and prescriptions | ABHA app ([ABDM](https://abdm.gov.in:8081/uploads/ABHA_App_8413f7c295.pdf)); Eka Care; MyChart | Already invented, and weaker than ABDM on portability |
| Medication reminders, taken/skipped logging, adherence chart | Medisafe ([Help Center](https://help-center.medisafe.com/en/articles/11793638-caregiver-guide-how-to-use-medisafe-to-manage-a-family-member-s-medications)); Apple Health ([Apple Support](https://support.apple.com/en-ca/105064)); Eka Care ([Techjockey](https://www.techjockey.com/detail/eka-care)) | Already invented |
| Health Timeline | Apple Health Records since 2018 ([Apple Newsroom](https://www.apple.com/newsroom/2018/01/apple-announces-effortless-solution-bringing-health-records-to-iPhone/)); Practo "medical timeline" per a third-party write-up ([Apptunix](https://www.apptunix.com/blog/practo-business-model-and-revenue-model/)) | Already invented |
| Reviews of doctors | Practo, Zocdoc | Already invented |
| Notifications | NHS App push reminders ([Digital Health](https://www.digitalhealth.net/2026/04/patients-across-england-can-now-check-appointments-via-nhs-app/)) and all majors | Already invented |
| Admin statistics, verification, moderation, audit log | OpenEMR, student HMS repos, Practo's internal verification | Already invented as internal tooling |
| Health-education library | MyChart Care Companion content ([Surety Systems](https://www.suretysystems.com/insights/how-can-epic-care-companion-improve-patient-health/)) | Already invented |
| Care Score (adherence 40 / recency 35 / follow-up 25) | Ingredients exist separately; no direct equivalent found | Recombination, not invention |

The Care Score deserves a precise statement, because it is what the team currently presents as unique. Scores of this shape are established: the Patient Activation Measure is a 0-100 engagement score with four levels ([Phreesia PAM FAQ](https://memberconnect.phreesia.com/rs/753-LZD-147/images/PAM_FAQ_8ffb939234.pdf)); Proportion of Days Covered is the standard adherence percentage with an **80% threshold** ([PQA](https://www.pqaalliance.org/assets/docs/PQA_PDC-CMP_Rationale.pdf)); Epic shows overdue care to both clinician and patient ([Connect Care FAQ](https://questions.connect-care.ca/2022/10/28.html)); and Oura presents a 0-100 score with a contributor breakdown ([Oura](https://support.ouraring.com/hc/en-us/articles/360057791533)). A clinical study record describes a three-point composite awarding one point each for more than 80% of medicines taken, more than 80% of appointments kept and complete activity logs, which is structurally close to the Care Score ([NCT04029298](https://clinicaltrials.gov/study/NCT04029298)); that attribution came from a search extract and needs confirming. The honest claim is "a transparent, patient-visible blend of three care-process behaviours computed inside the system the doctor prescribes in". The weights are unvalidated, the adherence input is self-reported taps, and the best trial of a leading reminder app found a small gain in self-reported adherence with no difference in blood pressure ([PubMed 29710289](https://pubmed.ncbi.nlm.nih.gov/29710289/)). A Cochrane review of 182 trials called adherence interventions "mostly complex and not very effective" and found that the ones that worked relied on tailored human support ([Cochrane](https://www.cochrane.org/evidence/CD000011_interventions-enhancing-medication-adherence)). A score on its own will not answer the evaluators.

Several obvious "innovations" are also taken and should be avoided. AI scribes already work in Indian languages (EkaScribe, HealthPlix HALO) ([MedTech Spectrum](https://www.medtechspectrum.com/news/25/24807/eka-cares-ai-powered-ekascribe-transforms-clinical-documentation-for-doctors-across-india.html)). Caregiver "care circles" are commoditised by Medisafe's Medfriend. Time-limited, consented record sharing is national infrastructure under ABDM ([ABDM HIE-CM](https://abdm.gov.in:8081/uploads/ABDM_HIE_CM_ea5d4c0559.pdf)). No-show heatmaps and care-gap dashboards are shipped products ([athenahealth](https://help.athenahealth.com/Ohelp/Content/aCom_Care_Gaps_Outreach_Dashboard_PH.htm)). Adaptive scheduling from a patient score is patented ([Google Patents US20160292369A1](https://patents.google.com/patent/US20160292369A1/en)) and carries a documented fairness problem ([Healthcare IT News](https://www.healthcareitnews.com/news/study-scheduling-systems-lead-longer-wait-times-black-patients)). "Explain my prescription in plain language" is now a crowded hackathon idea ([Devpost](https://devpost.com/software/memcura)).

Where the incumbents are weak is the interval between visits. A July 2026 analysis of India's national programme, which has over 93 crore health IDs ([PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/jul/doc202676912801.pdf)), states that "the continuity loop that would make ABDM clinically meaningful for chronic disease management remains largely untapped" and that the required steps "can add time rather than save it" for doctors ([HMPI](https://hmpi.org/2026/07/09/from-infrastructure-to-impact-operationalizing-indias-ayushman-bharat-digital-mission/)). The researchers classified the surveyed tools by who they connect and found almost all single-sided or two-sided: scribes serve the doctor, intake and outreach tools serve the patient-to-system link, command centres serve the admin. That classification is theirs, built from product descriptions, not from a published analysis.

## The unclaimed space is one loop seen from three roles

### The recommended feature: the Visit Loop

The recommendation is one object, the **visit commitment**, followed from before the consultation to verified understanding after it, with the same ledger visible to all three roles. It has five connected parts.

**My Agenda and the Visit Brief.** When a patient books, they answer two short questions modelled on OurNotes: how they have been since the last visit, and up to three things they most want to discuss ([JMIR 2021](https://jmir.org/2021/11/e29951/PDF)). When the doctor opens the appointment, one screen shows those words, labelled as the patient's own, beside facts the system already holds: 30-day adherence to this doctor's prescriptions, the reasons given for skipped doses, overdue follow-ups, open loops from the last visit and the last teach-back result.

**The doctor-approved care plan.** When the doctor saves the record, the server drafts a plain-language plan from the fields just written (diagnosis, each prescription line, follow-up date) using fixed templates. The doctor adds one optional line, "come back sooner if...", and clicks approve. Nothing reaches the patient unapproved.

**Automatic loops.** Approval creates ledger items with an owner and a due date: one per prescription line (patient: start tracking this medicine), one for the follow-up (patient: book by this date, with one-tap rebooking), and any the doctor adds, such as "get this test done" (patient) or "review the report when uploaded" (doctor). Loops close themselves when the underlying event happens, for example when a medication row is created from the prescription or a later appointment with the same doctor is completed.

**The teach-back check.** The patient answers four questions generated from their own record, following the four domains used in the EM-TeBa emergency-department study: what is wrong, what to take, when to come back, when to worry ([PMC7513274](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7513274/)). Wrong answers show the correct line from the approved plan, and the doctor sees which domain was missed.

**Loop Health for the admin.** The admin sees aggregate, de-identified numbers: share of loops closed on time by doctor and specialization, overdue follow-ups, teach-back pass rate by domain, the distribution of skip reasons, and loops owned by a doctor that are overdue. Each tile leads to an action (nudge, reassign, open a report), and every transition writes to `audit_logs`, which finally instruments that table.

A small addition supports the brief: when a dose is logged as skipped or missed, the patient picks a reason (forgot, side effect, cost, ran out, felt better). This turns the Care Score from a grade into a description of barriers. It is a design inference by the researchers, not a tested intervention.

### What exists, and what was not found

Each part has precedent, and the team should say so before an evaluator does.

| Part of the loop | Closest prior art | What the search did not find |
|---|---|---|
| Patient agenda before the visit | A previsit "important issue" questionnaire used by 34,037 patients at three US health systems ([PMC8430844](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8430844/)); Infermedica Intake ([Infermedica](https://infermedica.com/intake-api)) | The same in an Indian clinic product, merged with adherence and open-loop data |
| Plain-language after-visit plan | LLM after-visit summaries rated more readable than physician-written ones ([SHM Abstracts](https://shmabstracts.org/abstract/large-language-models-improve-readability-and-quality-of-patient-facing-after-visit-summaries-without-increasing-risk-of-harm-a-blinded-comparative-study/)) | Nothing new here; this part is crowded |
| Care-plan tasks feeding back to clinicians | Epic MyChart Care Companion ([Folio3](https://digitalhealth.folio3.com/blog/?p=15448)); GetWell Loop ([Northern Light Health](https://ci.northernlighthealth.org/Flyers/Providers/Hospital/Documentation/Managing-GetWell-Dashboard.aspx)) | Tasks created from what this doctor wrote today, as opposed to a pre-authored pathway per condition |
| Digital teach-back | EHRTutor research prototype ([arXiv 2310.19212](https://arxiv.org/abs/2310.19212)); CanopyTeachback consumer app ([App Store](https://apps.apple.com/us/app/-/id6478934355)) | A quiz built from the patient's own prescription, scored, and shown to the treating doctor and an admin |
| Closing the loop on tests and referrals | Staff-side tracking logs recommended in patient-safety guidance ([ECRI](https://home.ecri.org/blogs/ecri-news/failure-to-track-diagnostic-results-puts-patients-at-risk); [AHRQ](https://www.ahrq.gov/diagnostic-safety/research/closed-loop.html)) | A ledger where the patient owns some loops, the doctor owns others, and all three roles see the same status |
| Admin analytics | No-show and care-gap dashboards ([Curogram](https://curogram.com/blog/appointment-scheduling-analytics-heatmap)) | Reporting on which doctor-patient loops break and on comprehension |

### How confident the team can be

The researchers ran roughly 20 web searches and 6 page fetches for the novelty check, and many findings rest on search-result snippets. They did not search Google Patents systematically, nor the Y Combinator directory, Product Hunt, Crunchbase, GitHub or Smart India Hackathon lists. They did not open the documentation of Wellframe, Conversa, Memora Health or Careology, and they could not confirm either way whether Practo, Eka Care, HealthPlix, Apollo 24/7 or Tata 1mg already ship a pre-visit brief, care-plan tasks or teach-back. "Not found" therefore means "not found in a shallow search".

With that stated, confidence is **medium** that a record-derived teach-back score surfaced to the treating doctor and an admin is not a standard feature, **medium to low** that the full three-role loop has no existing equivalent, and **high** that every component taken alone is prior art. The safe wording for evaluators is: "We searched these sources and did not find this combination in consumer or Indian platforms; each part exists separately and we cite where." The team is claiming a different framing and a fit to small Indian clinics, not a new technology. A targeted patent and app-store search before the final presentation would strengthen or correct the claim.

## The loop removes work from each role and connects them

The three roles suffer from the same broken hand-off, seen from different sides. The figures below are the researchers' strongest; the ones marked "search summary" were not read on the source page.

### Patients: remembering and understanding the visit

A review in the Journal of the Royal Society of Medicine reports that **40-80% of medical information is forgotten immediately** and almost half of what is remembered is wrong; spoken instructions alone gave 14% correct recall against over 80% with pictographs ([Kessels 2003](https://pmc.ncbi.nlm.nih.gov/articles/PMC539473/)). This was read on the page; it is a narrative review of non-Indian studies. In a Mumbai teaching hospital only 12.4% of patients had good overall knowledge of their prescription ([IJCMPH](https://www.ijcmph.com/index.php/ijcmph/article/view/5450), search summary). Small single-site Indian studies put limited health literacy at about 60-67% ([PMC3714819](https://pmc.ncbi.nlm.nih.gov/articles/PMC3714819), search summary, figure-to-source mapping unconfirmed). A static summary does not fix this: in a randomised trial, medication recall stayed at 53% whatever the after-visit summary contained ([JABFM](https://www.jabfm.org/content/27/2/209.long), search summary). Checking understanding does better: after teach-back in an emergency department, the share of patients with a comprehension deficit fell from **49% to 11.9%** (PMC7513274, search summary).

The Visit Loop gives the patient a written, approved plan in plain words, a check that catches misunderstanding on the same day, and a short list of what is still theirs to do. The agenda also means their concerns reach the doctor before the two-minute clock starts.

### Doctors: no time, and no view of what happened afterwards

A 67-country review puts the average Indian primary-care consultation at about **two minutes** ([BMJ Open 2017](https://bmjopen.bmj.com/content/7/10/e017902), search summary; a single 2015 data point for India). A meta-analysis of Indian postgraduate residents reports burnout in 50.9% ([Int J Med Students](https://ijms.pitt.edu/IJMS/article/download/4727/3399/45609), search summary). The HMPI analysis, read in full, warns that digital steps inside such a consultation "can add time rather than save it".

The design rule that follows is that the doctor must not type more. History-taking moves before the visit (the agenda), explanation moves after it (the plan and teach-back), and the doctor's added work is one approve click and one optional line. In return the doctor gets what no current MediBridge screen provides: whether the last prescription was followed and why not, and whether the patient understood. Independent trials of AI scribes found savings of only about 2-3 minutes per patient against vendor claims of one to two hours a day ([UChicago Medicine](https://www.uchicagomedicine.org/forefront/research-and-discoveries-articles/2025/november/ambient-ai-saves-time-reduces-burnout-fosters-patient-connection)), so the team should not promise a number of minutes saved. No study measuring time saved by a pre-visit brief in India was found.

### Admins: seeing where care breaks

The admin role has the weakest evidence base of the three; no survey of Indian clinic administrators was found. The outcome data are still stark. In the Mumbai Hypertension Project **48.7% of 13,184 enrolled patients never returned** for one follow-up, and a successful follow-up phone contact was associated with returning (adjusted odds ratio 2.76) ([PMC9510164](https://pmc.ncbi.nlm.nih.gov/articles/PMC9510164), read on the page). Pooled non-adherence among Indian hypertension patients is 48% across 40 studies ([Current Hypertension Reviews](https://www.eurekaselect.com/article/150468), search summary); a smaller 2025 meta-analysis reports only 15.8% adherence with a very wide interval ([Hipertensión y Riesgo Vascular](https://elsevier.es/en-revista-hipertension-riesgo-vascular-67-articulo-prevalence-antihypertensive-medication-adherence-associated-S188918372400117X)), so 48% is the safer figure. A systematic review puts the average no-show rate near 23% ([reference record](https://www.textbookofdigitalhealth.com/references/dantas2018noshows.html), search summary), and an Indian tertiary-hospital study names forgetting and lack of reminders as the top reasons ([Health Science Reports](https://doaj.org/article/a1a6a19a568949a5a453351f60fd1e22), search summary).

Today MediBridge's admin sees how many appointments exist. Loop Health shows which follow-ups are overdue, which doctors' patients fail the "when to come back" question, and which loops owned by the clinic are stuck, and it lets the admin trigger the outbound contact that the Mumbai data links to patients returning.

### The bridge

One record of the visit now serves all three. The patient's words reach the doctor; the doctor's plan reaches the patient in a form that is checked; the patient's actions flow back to the doctor; and the admin sees the health of the whole exchange without reading anyone's record. Escalation also runs in a direction the researchers did not find described elsewhere: a loop owned by the doctor or clinic is visible to the patient and the admin, not only the reverse.

The limits of the evidence belong in the pitch. Teach-back evidence is mostly positive but of moderate quality: one review found significant readmission reductions in 5 of 6 teach-back studies and could not pool them ([PMC8508113](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508113/)), while another found significance in only 2 of 6 ([PMC6590951](https://pmc.ncbi.nlm.nih.gov/articles/PMC6590951)). No trial of automated teach-back with adherence or readmission outcomes was found. A multiple-choice quiz tests recognition, whereas true teach-back is free recall. LLM-translated discharge instructions did not raise comprehension in most domains in one emergency-department study ([Int J Emerg Med 2025](https://intjem.biomedcentral.com/articles/10.1186/s12245-025-00885-5)). The teach-back result is therefore a communication-quality signal, not a proven way to improve outcomes.

## A six-week build on the existing stack

The plan below is sized by us for a team of three or four; the team's deadline and headcount were not in the research, so the weeks are estimates to adjust. The whole loop works with deterministic templates. The LLM is an optional final phase behind a feature flag, so the demo never depends on a network call.

### Database changes

All tables follow the existing conventions (InnoDB, `utf8mb4`, foreign keys to `patients.user_id` and `doctors.user_id`).

| Table or change | Key columns | Purpose |
|---|---|---|
| `previsit_agendas` (new) | `appointment_id` UNIQUE, `how_have_you_been` TEXT, `concern_1..3` VARCHAR(255), `submitted_at` | The patient's own words, one row per appointment |
| `care_plans` (new) | `medical_record_id` UNIQUE, `draft_text` TEXT, `approved_text` TEXT, `warning_signs` VARCHAR(255), `source` ENUM('template','llm'), `status` ENUM('draft','approved'), `approved_by`, `approved_at` | Plain-language plan; keeps the draft and the approved text separately |
| `care_loops` (new) | `medical_record_id`, `patient_id`, `doctor_id`, `loop_type` ENUM('start_medication','follow_up','test','doctor_review','custom'), `title`, `owner_role` ENUM('patient','doctor','admin'), `due_date`, `status` ENUM('open','done','cancelled'), `related_type`, `related_id`, `closed_at`, `closed_by` | The shared ledger; "overdue" is computed as `status='open' AND due_date < CURDATE()` |
| `teachback_quizzes` (new) | `care_plan_id`, `patient_id`, `status` ENUM('pending','completed'), `score_pct`, `completed_at` | One check per approved plan |
| `teachback_questions` (new) | `quiz_id`, `domain` ENUM('diagnosis','medication','follow_up','warning'), `question_text`, `options_json`, `correct_index`, `chosen_index`, `is_correct` | Questions and answers in one table to keep it small |
| `ai_consents` (new, phase 6 only) | `patient_id`, `granted_at`, `withdrawn_at` | Explicit, withdrawable consent before any LLM call |
| `medication_logs` (alter) | add `skip_reason` ENUM('forgot','side_effect','cost','ran_out','felt_better','other') NULL | Barrier capture |
| `audit_logs` (no schema change) | existing `action`, `entity_type`, `entity_id`, `details` | Written by a new `server/utils/audit.js` helper |

Because Vercel serverless functions have no long-running process, the team should not rely on a scheduler. Overdue status is computed at read time, and reminder notifications are created idempotently when a dashboard endpoint runs, by checking for an existing notification with the same `related_type` and `related_id`.

### API endpoints

New routes go in `server/routes/loop.js` with a `loopController.js`, plus four admin routes, reusing `requireAuth`, `requireRole` and the existing `doctorHasRelationship` check.

| Method and path | Role | What it does |
|---|---|---|
| `POST /api/agenda` and `GET /api/agenda/:appointmentId` | patient writes; patient and treating doctor read | Save and fetch the pre-visit agenda |
| `GET /api/brief/:appointmentId` | doctor | One call returning agenda, adherence and skip reasons for this doctor's prescriptions, overdue follow-ups, open loops, last teach-back result |
| `GET /api/care-plans/draft/:recordId` | doctor | Template draft built from the record and its prescriptions |
| `POST /api/care-plans/:recordId/approve` | doctor | Stores approved text and warning signs, then in one transaction creates loops and the quiz and notifies the patient |
| `GET /api/care-plans/:recordId` | patient, treating doctor | Approved plan only |
| `GET /api/loops` | all | Scoped by role: own loops for a patient, own patients' loops for a doctor |
| `POST /api/loops` | doctor | Add a custom loop to a record |
| `PATCH /api/loops/:id` | owner or admin | Mark done or cancelled; writes an audit row |
| `GET /api/teachback/pending` and `GET /api/teachback/:quizId` | patient | Fetch the check |
| `POST /api/teachback/:quizId/submit` | patient | Scores answers, returns the correct plan line for misses, notifies the doctor if a domain was missed |
| `GET /api/teachback/patient/:patientId` | doctor | Results by domain |
| `GET /api/admin/loop-health` | admin | Aggregates: on-time closure by doctor and specialization, overdue follow-ups, pass rate by domain, skip-reason distribution |
| `GET /api/admin/loops/overdue` | admin | De-identified list of overdue loops with owner role and age |
| `POST /api/admin/loops/:id/nudge` | admin | Sends a notification to the loop's owner; audited |
| `POST /api/medications/:id/log` (extend) | patient | Accept `skipReason` |

Auto-closure belongs in the existing controllers: `medicationsController.create` closes the matching `start_medication` loop when `prescriptionId` is present, and the status change to `completed` in `appointmentsController.updateStatus` or `medicalRecordsController.create` closes any open `follow_up` loop for that doctor and patient. Quiz generation needs no model: the diagnosis question draws distractors from other diagnoses in the database, the medication question takes its correct answer from the prescription's `frequency` field with distractors from a fixed list, the follow-up question offers the true date among nearby dates, and the warning question uses the doctor's `warning_signs` line against generic distractors. If a field is empty, that question is skipped.

### Pages per role

| Role | Page | Change |
|---|---|---|
| Patient | `doctor.html` booking form, `patient/appointments.html` | Add the two agenda questions at booking, editable until the visit |
| Patient | `patient/care-plan.html` (new) | Approved plan, the teach-back check, and "My open loops" with one-tap follow-up booking |
| Patient | `patient/medications.html` | Skip-reason picker |
| Patient | `patient/dashboard.html` | "Open loops" card beside the Care Score |
| Doctor | `doctor/appointments.html` | Visit Brief panel when an appointment is opened; after saving a record, a review-and-approve step for the plan |
| Doctor | `doctor/loops.html` (new) | Open loops across the doctor's patients, their own overdue loops first, teach-back misses flagged |
| Doctor | `doctor/patients.html` | Per-patient loop history and Care Score breakdown in the drill-down |
| Admin | `admin/loop-health.html` (new) | Chart.js tiles and charts from `/admin/loop-health`, overdue table with a nudge button |
| Admin | `admin/audit-log.html` | Now shows live entries |

### Phased milestones

| Week | Deliverable | Why this order |
|---|---|---|
| 1 | `audit.js` helper wired into login, status changes, verification and report resolution; `skip_reason`; seed data for both | Fixes a documented gap and gives every later phase its audit trail |
| 2 | Agenda capture and the doctor's Visit Brief | First visible three-role value with no AI |
| 3 | Care-plan draft and approval, loop creation, auto-closure hooks | The core mechanic |
| 4 | Teach-back generation, scoring, doctor view | The strongest single twist in the research |
| 5 | Admin Loop Health, nudge action, overdue logic, extended seed script | Completes the third role |
| 6 | Optional LLM rephrase behind a flag, consent table, tests for loop creation and quiz scoring, demo script | Stretch; cut first if time runs short |

If only three weeks are available, weeks 1 to 4 compressed without the admin charts still demonstrate the loop for patient and doctor, with the admin shown through the live audit log.

### What to demo to evaluators

A five-minute script with three browser windows, one per demo account, carries the argument. The patient books and types "the tablets make me dizzy, so I skip the evening one." The doctor opens the appointment and sees that sentence beside 60% adherence and a "side effect" skip reason, then writes the record, reviews the drafted plan, adds "come back sooner if dizziness continues" and approves. The patient opens the plan, answers the four questions, gets the follow-up date wrong and is shown the right one; the doctor's loop page shows the miss. The patient taps "start tracking" and the medication loop closes by itself. The admin opens Loop Health, sees one overdue follow-up and the pass rate by domain, sends a nudge, and the audit log shows every step with who did it. The seed script should generate about 45 days of loops, agendas and quiz results so the charts are populated.

### How to pitch the significance

Open by conceding the overlap: booking, records and reminders are table stakes, and here is the table showing who already does each. Then state the gap in one line: existing platforms record what was said in a visit, and MediBridge tracks what was understood and what was done, for all three roles. Support it with three numbers read on the source page: 40-80% of information forgotten, 48.7% of Mumbai hypertension patients never returning, and the national programme's own "continuity loop" described as largely untapped. Then make the novelty claim in its honest form, with the searched sources named and the confidence stated. Evaluators asking "does it work?" get a straight answer: reminders have modest evidence for self-reported adherence, teach-back has mostly positive evidence of moderate quality, and this specific loop is untested.

### Regulatory and safety limits to respect

India's Telemedicine Practice Guidelines of March 2020 say AI platforms "are not allowed to counsel the patients or prescribe any medicines" and that final counselling must be delivered by the doctor ([MediaNama summary](https://www.medianama.com/2020/03/223-summary-india-telemedicine-guidelines/)). The Digital Personal Data Protection Act requires consent that is free, specific, informed and unambiguous, and its Rules were notified on 13 November 2025 with phased enforcement to May 2027 ([AZB & Partners](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)). These statements come from law-firm and news summaries; the researchers did not read the original texts, nor establish which obligations are live in October 2026 or whether a synthetic-data college demo falls in scope.

The guardrails that follow are concrete. Any LLM only rephrases what the doctor already wrote and adds no advice, dose or diagnosis. The doctor approves every plan before the patient sees it, and `care_plans` keeps the draft, the approved text and the `source` so the audit trail shows what was machine-drafted and what was edited. The pre-visit brief is labelled as the patient's own words and performs no triage. The teach-back screen only quotes the approved plan. Every patient-facing page carries a non-diagnostic disclaimer and an emergency instruction linking to the existing emergency page. Name and identifiers are stripped before any model call, consent is recorded and withdrawable, and the demo uses only the fictional seed data. Sending identifiable patient data to a third-party model API is the largest compliance weakness of the design and should be acknowledged in the project report.

Three design risks need the same care. Research on AI scribes found omissions in 18% and hallucinations in 11.5% of evaluated notes ([eScholarship](https://escholarship.org/uc/item/9r89g3sp), search summary), which is why the template path is the default. Clinicians override 46-96% of alerts ([JMIR Medical Informatics](https://medinform.jmir.org/2020/7/e15653/PDF), search summary), so the doctor should receive only two kinds of flag: a failed teach-back domain and an overdue follow-up. And a score that rewards recent visits will rate patients with cost, distance or literacy barriers lower, so the admin sees aggregates only, the doctor sees reasons beside numbers, and nothing in scheduling penalises a low score.

## Figures to verify before they reach a slide

The researchers were explicit about what they read and what they saw only as a search summary. These are safe to quote as read on the page: Practo's About-page figures, the HMPI quotations on ABDM, Kessels' 40-80% and 14% versus 80%, the Mumbai Hypertension Project's 48.7% and odds ratio of 2.76, the 15.8% adherence meta-analysis, the Delphi study on ABDM workload, the EHRTutor and CanopyTeachback descriptions, the 5-of-6 teach-back review, the abandoned Radix Health patent, and the UChicago ambient-AI article.

| Figure | Problem | Action |
|---|---|---|
| 2-minute Indian consultation | Search summary; BMJ page blocked; single 2015 data point | Open the paper and check the India rows |
| 48% non-adherence (hypertension, diabetes) | Search summaries; diabetes paper blocked | Open both; quote with the conflicting 15.8% noted |
| 51% returning in the India Hypertension Control Initiative | Search summary | Open the paper |
| Health literacy 60-67%; prescription legibility 11-17.6%; 50.3% knowing dose | Search summaries with figure-to-source mapping unconfirmed | Match each number to its paper or drop it |
| KEM Mumbai 12.4% | Search summary | Open the paper |
| EM-TeBa 49% to 11.9% | Search summary | Open the paper |
| 2-of-6 teach-back review; "9 of 10 articles" review | Search summaries; the second review was not identified; a "59% vs 44%" figure was ambiguous and is omitted here | Use only after reading |
| After-visit summary recall of 53% | Search summary | Open the paper |
| 23% average no-show; India no-show reasons | Search summaries; Indian sample size not retrieved | Open both |
| India private-hospital no-show of 32% | Vendor blog with no method | Do not use as evidence |
| Burnout 50.9% | Search summary | Open the paper |
| Doctor-population ratio 1:811 | Counts AYUSH practitioners at 80% availability | Quote only with that caveat |
| "57% of doctors unqualified" | 2001 census data | Present as historical or omit |
| ABHA and eSanjeevani totals | Sources disagree by date (78, 88 and 93 crore); dashboard not read | Take one dated figure from the official dashboard |
| Practo "5 lakh doctors" and "50 crore patients" | Contradicted by Practo's own page | Use the About-page figures only |
| Scribe error rates; alert override rates; five-centre scribe trial | Search summaries or secondary reports | Open the primary papers |
| NCT04029298 composite score | Attribution from a search extract | Open the trial record |
| Telemedicine Guidelines and DPDP statements | Summaries only | Read the originals or cite as "as summarised by" |
| All vendor outcome claims (Luma, CipherHealth, HealthPlix HALO, Medisafe Medfriend 40%) | Marketing, no independent check | Label as vendor-reported or omit |

Several items the researchers recalled from background knowledge without a retrieved source (for example Mango Health, Samsung Health medication tracking, Morisky-scale licensing, Health Connect) are left out of this report and should not be cited.

## Conclusion

The research changes what the project should claim. MediBridge's strength was never its feature list; it is that one database already holds the prescription, the dose log and the follow-up date together, which consumer adherence apps and booking marketplaces do not. The Visit Loop turns that stored linkage into something each role acts on, and it shifts the Care Score from a private grade to a shared starting point for a conversation.

The most valuable thing the team can show evaluators is calibrated honesty: a table of what is already invented, a claim limited to a combination not found in a named set of sources, and stated confidence. Two pieces of follow-up work would firm that up cheaply: a targeted patent and app-store search for record-derived teach-back, and a direct look at Eka Care's and Practo's current patient apps. If either turns up the same loop, the fit to short Indian consultations and the clinic-owned loops visible to patients remain the parts worth defending.
