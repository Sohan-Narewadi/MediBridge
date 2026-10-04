# Novelty check of candidate MediBridge feature ideas (state as of October 2026)

Method note for the report writer: about 20 web searches and 6 page fetches were run on 2026-10-04 (general web search, with hits from PubMed/PMC, arXiv, JMIR, ClinicalTrials.gov, Google Patents/Justia, vendor help pages, App Store, Devpost/lablab). One search was rate-limited and re-run. Many findings rest on search-result snippets rather than a full read of the primary page; those are marked "(snippet)". Findings marked "(fetched)" were read from the page itself. No Google Patents, Y Combinator directory, Product Hunt, Crunchbase, Smart India Hackathon or GitHub search was run exhaustively, so "not found" below means "not found in a shallow search", never "does not exist".

Confidence scale used: High = several independent primary sources; Medium = one or two sources or snippets only; Low = inference from absence of hits.

## 1. For each idea: what already exists, how close it is, and what twist looks unclaimed?

### Takeaway
Every one of the eight ideas has prior art as a separate component; none is new on its own. What I did not find is a single product, especially a consumer or Indian one, that joins a patient-voiced pre-visit brief, an auto-generated care plan with a comprehension (teach-back) check, and a three-role "open loops" ledger with admin-level loop-break analytics. That integrated combination is the only defensible "white space", and the claim is medium-to-low confidence because the search was shallow.

### Cited Findings

**Idea 1 - Closed-loop "visit bridge" (pre-visit concerns -> doctor brief -> plain-language care plan -> teach-back -> progress back to doctor -> admin view)**
- Pre-visit patient agenda capture exists in US EHR portals: a "patient important issue" previsit questionnaire sent through the portal into the EHR was used by 34,037 primary care patients across three health systems in 2020 (snippet) — [JMIR Research Protocols / PMC8430844](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8430844/)
- OurNotes asks patients two questions before a visit: "How have you been since your last visit?" and "What are the most important things you would like to discuss at your visit?" (up to 3) (snippet) — [JMIR 2021 e29951](https://jmir.org/2021/11/e29951/PDF); press coverage — [Fierce Healthcare](https://www.fiercehealthcare.com/practices/patients-type-their-concerns-into-ehr-before-doctor-visit)
- LLM plain-language summaries of medical notes shown to patients before a clinic visit are under clinical trial (snippet) — [ClinicalTrials.gov NCT07602725](https://clinicaltrials.gov/study/NCT07602725)
- LLM-written after-visit summaries were rated more readable and of higher quality than physician-written ones without added harm risk in a blinded comparison (conference abstract, snippet) — [SHM Abstracts](https://shmabstracts.org/abstract/large-language-models-improve-readability-and-quality-of-patient-facing-after-visit-summaries-without-increasing-risk-of-harm-a-blinded-comparative-study/)
- Research on faithful LLM patient summaries stresses hallucination risk and data-centric fixes (snippet) — [arXiv 2402.15422](https://arxiv.org/pdf/2402.15422)
- Commercial "visit summarization" already turns consult transcripts into a plain-language after-visit summary, a draft note and extracted items such as orders (vendor glossary, snippet) — [Fora Soft](https://www.forasoft.com/learn/telemedicine/glossary/terms-telemedicine/visit-summarization)
- Between-visit care plans with tasks whose responses flow back to the care team exist in Epic: Care Companion "delivers a personalized care plan to patients between visits and feeds their responses back to the care team" inside MyChart, with a "To Do" list of provider-assigned tasks (third-party description, snippet) — [Folio3 Digital Health](https://digitalhealth.folio3.com/blog/?p=15448); [ASTRO-Epic collaboration](https://www.astro.org/provider-resources/shareable-resources/epic-collaboration); [SeamlessMD content for Care Companion](https://www.seamless.md/solutions/mychart-care-companion-content)
- GetWell Loop delivers episode-specific education, tasks, reminders and assessments as a "care journey" with automated check-ins, and a dashboard flags patients needing help in real time (snippet) — [Northern Light Health GetWell docs](https://ci.northernlighthealth.org/Flyers/Providers/Hospital/Documentation/Managing-GetWell-Dashboard.aspx)
- Twistle markets automated care-path workflows that engage the care team "only when necessary" (snippet) — [MemorialCare Twistle patient guide](https://memorialcare.org/patients-visitors/twistle); [Becker's](https://www.beckershospitalreview.com/digital-health/memorialcare-joins-16m-funding-for-care-process-automation-platform/)
- Indian context: Eka Care's EkaScribe is an AI clinical scribe working in Hindi, Tamil, Kannada, Gujarati and other languages; it is doctor-side documentation, not a patient-voiced pre-visit brief (snippet) — [MedTech Spectrum](https://www.medtechspectrum.com/news/25/24807/eka-cares-ai-powered-ekascribe-transforms-clinical-documentation-for-doctors-across-india.html)

**Idea 2 - Digital teach-back / understanding check**
- EHRTutor (Zhang, Yao, Zhou, Ouyang, Yu; submitted 30 Oct 2023; NeurIPS'23 GenAI for Education workshop) is an LLM framework that formulates questions from discharge instructions, administers each as a test in conversation and produces a summary; evaluated by LLMs and domain experts, with no indication of deployment to real patients (fetched) — [arXiv 2310.19212](https://arxiv.org/abs/2310.19212)
- PaniniQA is an earlier interactive question-answering system for patient education on discharge instructions (snippet) — [arXiv 2308.03253](https://arxiv.org/pdf/2308.03253)
- CanopyTeachback (Canopy Innovations, Inc; iOS 17+, free) has patients read about their condition, take a multiple-choice or true/false quiz, then "teach" a digital AI student and receive feedback; the store page does not say results are shared with a doctor (fetched) — [App Store](https://apps.apple.com/us/app/-/id6478934355)
- A GoCanvas form app exists for clinicians to self-evaluate and log their teach-back use (a clinician checklist, not a patient quiz) (snippet) — [GoCanvas](https://www.gocanvas.com/mobile-forms-apps/18252-Ambulatory-Patient-Teach-Back-Self-Evaluation-and-Tracking-Log)
- A practice-management vendor blog recommends "comprehension checks through teach-back or written confirmation" via portal after visits (marketing content, snippet) — [Pabau](https://pabau.com/fr/blog/patient-education/)

**Idea 3 - "Open loops" ledger with owners and escalation**
- "Closing the loop" is an established patient-safety concept covering diagnostic test tracking, referral tracking and follow-up after hospital or ED visits (snippet) — [ECRI](https://home.ecri.org/blogs/ecri-news/failure-to-track-diagnostic-results-puts-patients-at-risk)
- Of an estimated 12 million US diagnostic errors a year, 20 to 30 percent are attributed to breakdowns in the referral process (snippet; original source of the statistic not checked) — [CRICO "Are You Safe?" case study](https://rmf.harvard.edu/-/media/Files/CRICO/PDFs/SaferCare/AYS010_Tracking_tests_referrals_2016.pdf)
- Recommended practice is a staff-side log of all referrals, tracking receipt of the consultant report and routing it to the ordering provider for acknowledgement (snippet) — [Medical Mutual risk tips](https://www.medicalmutual.com/risk/practice-tips/tip/diagnostic-test-tracking-systems/53)
- AHRQ funded "Closed Loop Diagnostics" Patient Safety Learning Laboratories to engineer highly reliable follow-up of tests, referrals and symptom evolution (snippet) — [AHRQ](https://www.ahrq.gov/diagnostic-safety/research/closed-loop.html)
- A targeted search for a product tracking visit commitments as shared items across patient, clinician and staff returned only ambient-scribe coverage, no such product (snippet) — [KFF Health News on ambient scribes](https://kffhealthnews.org/news/article/ambient-ai-scribes-doctor-appointments-note-taking-ehr-epic/)

**Idea 4 - Admin "care friction / care gap" heatmap**
- No-show heatmaps by day and time slot are a marketed product feature; the vendor claims practices using them report no-show rates 53% lower than the industry average (vendor claim, unverified) — [Curogram](https://curogram.com/blog/appointment-scheduling-analytics-heatmap)
- athenahealth ships a Care Gaps Outreach Dashboard (message volume and scheduling conversion) — [athenahealth help](https://help.athenahealth.com/Ohelp/Content/aCom_Care_Gaps_Outreach_Dashboard_PH.htm); NextGen and MDLand have care-gap views — [NextGen docs](https://docs.nextgen.com/en-US/nextgenc2ae-enterprise-ehr-help-3240205/view-patient-s-gaps-in-care-299256), [MDLand manual](https://web121.mdland.com/eClinic/ec/images/MDLand%20Care-Gaps-Module-Manual-Final%20_1_.pdf)
- A Texas health system used a population-health analytics engine to analyse care gaps and no-shows at clinic, provider and patient level (snippet) — [UTMB news, 2022](https://www.utmb.edu/news/article/utmb-news/2022/02/04/how-a-texas-health-system-uses-a-data-deep-dive-to-find-care-gaps)

**Idea 5 - Outcome-linked doctor reputation**
- Physician-level average medication adherence tracks outcomes: 26.3 vs 45.9 uncontrolled-diabetes patients per 1000 for high- vs low-adherence physicians (snippet) — [AJMC 2019](https://www.ajmc.com/view/medication-adherence-as-a-measure-of-the-quality-of-care-provided-by-physicians)
- Consumer star ratings showed no significant association with specialty-specific performance scores (snippet) — [JAMIA 2018](https://academic.oup.com/jamia/article/25/4/401/4107665)
- Adherence measures are already used in pay-for-performance (Medicare Advantage Star Ratings, Quality Payment Program) (snippet) — [AJMC 2019](https://www.ajmc.com/view/medication-adherence-as-a-measure-of-the-quality-of-care-provided-by-physicians)

**Idea 6 - Adherence- and urgency-aware scheduling**
- US20160292369A1 (Radix Health Inc; published 6 Oct 2016; status Abandoned) predicts individual slot length by regression on patient demographics and medical history and overbooks using no-show probability (fetched) — [Google Patents](https://patents.google.com/patent/US20160292369A1/en)
- Another patent family lowers a patient's scheduling priority and restricts slot options using a "compliance score" decremented for missed appointments (snippet) — [USPTO 10262384](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10262384)
- An application covers dynamic appointment rescheduling from a real-time health risk score (snippet) — [Justia 20240120104](https://patents.justia.com/patent/20240120104)
- Academic work models variable slots and dynamic priority from no-show probability (snippet) — [PMC7481942](https://pmc.ncbi.nlm.nih.gov/articles/PMC7481942)

**Idea 7 - Family / caregiver "care circle"**
- Medisafe's "Medfriend" notifies a designated person when a dose is missed; Caring Village offers a role-permissioned hub with shared calendar and to-do lists (third-party roundup, snippet) — [Caring Village blog](https://caringvillage.com/2026/05/13/caregiver-apps-for-families/)
- Further apps with "care circles", shared tasks and medication tracking: CareAnchor Hub — [listing](https://mwm.ai/apps/careanchor-hub/6761386119); Caily — [App Store](https://apps.apple.com/us/app/-/id6746203787)

**Idea 8 - Patient-controlled, time-limited QR record sharing**
- India's ABDM consent manager (HIE-CM) already provides granular, revocable consent for sharing health records through PHR apps (snippet) — [ABDM HIE-CM document](https://abdm.gov.in:8081/uploads/ABDM_HIE_CM_ea5d4c0559.pdf); [ABHA app document](https://abdm.gov.in:8081/uploads/ABHA_App_8413f7c295.pdf)
- ABDM "Scan and Share" (launched 2022) uses a facility QR to share ABHA demographic details for a queue token; it is registration, not history sharing (snippet) — [ABDM Scan and Share manual](https://abdm.gov.in/strapicms/uploads/ABDM_Scan_and_Share_Onboarding_Manual_18_01_2023_1_0600fe7747.pdf)
- Patents exist for temporary display/sharing of patient information and for QR-based patient-controlled records — [US10998089](https://patents.google.com/patent/US10998089); [Justia 20190147137](https://patents.justia.com/patent/20190147137); [Justia 20160042483](https://patents.justia.com/patent/20160042483)
- SMART Health Links are an existing open pattern: the QR holds an encrypted pointer, not the data, and the patient can revoke (described on an agent-skill listing, weak source) — [clawhub listing](https://clawhub.ai/aks129/share-health-qr)
- OpenEMR's community has discussed patient-controlled one-time-code access (snippet) — [OpenEMR forum](https://community.open-emr.org/t/patient-control-the-access-to-the-records-in-one-time-code/21627)

### Inferences
- Closeness and confidence per idea (my judgement from the above):
  1. Visit bridge: every stage exists somewhere; the end-to-end chain in one lightweight three-role product was not found. Novelty of the combination: plausible. Confidence: Medium-Low.
  2. Digital teach-back: exists as research prototypes (EHRTutor, PaniniQA) and one consumer app (CanopyTeachback) that teaches about conditions in general. Not found: a quiz generated from the patient's own prescription/record, scored, and surfaced to both the treating doctor and an admin. This is the strongest single twist. Confidence: Medium.
  3. Open-loops ledger: the concept is mature in patient-safety literature, but described as a staff-side log. A ledger where the patient is a named owner of some loops and sees the same status as doctor and admin was not found. Confidence: Medium-Low.
  4. Care-gap/no-show heatmap: commoditised. Only the metric (broken loops and comprehension scores rather than HEDIS-style gaps) would be new, and that depends on ideas 2 and 3. Confidence: High that the base idea is taken.
  5. Outcome-linked reputation: adherence-as-quality is established in US payer programmes; a consumer-facing doctor profile built on it was not found, but the search was thin. It also carries a fairness problem (doctors with sicker or poorer patients score worse) that the AJMC-style literature would require risk adjustment for. Weak candidate. Confidence: Low.
  6. Adaptive scheduling: patented (though one key filing is abandoned) and studied. Using a self-built Care Score as the input is a minor variation. One patent penalises non-compliant patients with fewer slots, which is the opposite of an equity-minded design; giving low-adherence patients longer or earlier slots is a different stance but not a new mechanism. Confidence: High that it is taken.
  7. Care circle: thoroughly commoditised in consumer apps. Confidence: High.
  8. QR time-limited sharing: commoditised as a pattern and nationally standardised in India via ABDM consent artefacts. Confidence: High.
- The most defensible pitch is therefore not any single feature but: "one object, the visit commitment, followed from the patient's own words before the visit to verified understanding after it, with the same ledger visible to patient, doctor and admin". Ideas 1, 2, 3 and the metric half of 4 are one feature seen from three roles.
- All of this is buildable on the existing MediBridge data (records, prescriptions, follow-up dates, dose logs, Care Score) plus one LLM call for the brief, one for the plain-language plan and one for quiz generation.

### Gaps
- Google Patents was not searched systematically for "teach-back" + "comprehension score" + "care plan"; a patent may exist.
- Wellframe, Conversa, Memora Health and Careology product documentation were not opened; I cannot say whether any of them includes a comprehension quiz or an admin loop-break view.
- Practo, HealthPlix, mfine, Apollo 24/7 and Tata 1mg feature sets were not verified; no source was found either confirming or denying pre-visit briefs, care-plan tasks or teach-back in Indian consumer platforms.
- Y Combinator directory, Product Hunt, Crunchbase and GitHub were not searched directly.

## 2. Which ideas are commoditised, which are enterprise-US-only, and which look unclaimed as a three-role feature?

### Takeaway
Commoditised: care circle (7), QR/consent sharing (8), no-show and care-gap dashboards (4), adaptive scheduling (6). Enterprise-US-centric: pre-visit agenda capture, care-plan tasks feeding back to clinicians, closed-loop test/referral tracking. Apparently unclaimed as an integrated three-role feature: record-derived teach-back scoring plus a shared open-loops ledger with admin loop-break analytics.

### Cited Findings
- Commoditised consumer features: Medfriend missed-dose alerts and shared caregiver hubs — [Caring Village blog](https://caringvillage.com/2026/05/13/caregiver-apps-for-families/); slot-level no-show heatmaps — [Curogram](https://curogram.com/blog/appointment-scheduling-analytics-heatmap); care-gap dashboards — [athenahealth help](https://help.athenahealth.com/Ohelp/Content/aCom_Care_Gaps_Outreach_Dashboard_PH.htm)
- Enterprise US systems: Epic MyChart Care Companion / To Do — [Folio3](https://digitalhealth.folio3.com/blog/?p=15448); previsit issue questionnaire inside the EHR at three US health systems — [PMC8430844](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8430844/); GetWell Loop dashboard — [Northern Light Health](https://ci.northernlighthealth.org/Flyers/Providers/Hospital/Documentation/Managing-GetWell-Dashboard.aspx)
- Indian public infrastructure covers consented record sharing — [ABDM HIE-CM](https://abdm.gov.in:8081/uploads/ABDM_HIE_CM_ea5d4c0559.pdf); a July 2026 government document and press coverage report that over half of India has digital health records (snippet, not read) — [Digital Health News](https://www.digitalhealthnews.com/over-half-of-india-now-has-digital-health-records-govt-data-shows)
- Indian AI effort found is doctor-side scribing — [MedTech Spectrum on EkaScribe](https://www.medtechspectrum.com/news/25/24807/eka-cares-ai-powered-ekascribe-transforms-clinical-documentation-for-doctors-across-india.html)

### Inferences
- The enterprise tools are organised around the care team monitoring the patient; the admin role in those tools is population-health reporting, not "which doctor-patient loops are breaking and why". A student project can honestly claim a different framing, not a new technology.
- Evaluators asking for uniqueness will be better served by a claim of the form "we could not find X in consumer or Indian platforms after searching A, B, C" than by "this does not exist".

### Gaps
- No source directly states that Indian consumer platforms lack these features; this is an absence-of-evidence inference.

## 3. Is digital teach-back in any consumer app or portal, and what does the literature say about adherence and readmissions?

### Takeaway
Teach-back as a human technique has reasonably good evidence for reducing readmissions and improving adherence, mostly in heart failure and chronic disease, but study quality is mixed. Digital, automated teach-back exists only as research prototypes and one small consumer app; I found no evidence that an automated version reproduces the clinical benefit.

### Cited Findings
- Systematic review (Int J Environ Res Public Health, 2021): 17 studies from 2002 to 2019, 5,713 participants; of 6 teach-back studies, 5 showed statistically significant readmission reductions; meta-analysis was not feasible because of heterogeneity, and the authors note publication bias and scant literature (fetched) — [PMC8508113](https://pmc.ncbi.nlm.nih.gov/articles/PMC8508113/)
- A different review reported teach-back reduced 30-day readmissions in 9 of 10 articles and promoted treatment adherence in 7 of 10 (snippet; which review this is was not confirmed) — [UTHSC DNP project](https://dc.uthsc.edu/dnp/51)
- A hospitalist review found only 2 of 6 studies of teach-back with discharge summaries showed statistically significant readmission improvement (heart failure at 12 months; CABG at 30 days, 25% vs 12%, P = .02). The heart-failure figures in the snippet ("teach-back 59% vs non-teach-back 44%") are ambiguous as to direction and should be checked before quoting (snippet) — [The Hospitalist](https://blogs.the-hospitalist.org/content/use-and-effectiveness-teach-back-method-patient-education-and-health-outcomes)
- EM-TeBa study: after teach-back in the emergency department, the proportion of patients with a comprehension deficit fell from 49% to 11.9%, measured with four standard questions on diagnosis, treatment, follow-up and return precautions (snippet) — [PMC7513274](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7513274/)
- In a randomised trial of 90 inflammatory bowel disease patients in Iran, self-care education by smartphone app gave higher post-test scores and self-efficacy than teach-back (snippet) — [PubMed 40439903](https://pubmed.ncbi.nlm.nih.gov/40439903/)
- Counter-evidence on LLM aids: LLM-translated Spanish discharge instructions in emergency departments had a promising safety profile but did not increase comprehension in most domains, and human verification was still required (snippet) — [Int J Emerg Med 2025](https://intjem.biomedcentral.com/articles/10.1186/s12245-025-00885-5)
- Digital prototypes: EHRTutor (fetched) — [arXiv 2310.19212](https://arxiv.org/abs/2310.19212); PaniniQA — [arXiv 2308.03253](https://arxiv.org/pdf/2308.03253); consumer app CanopyTeachback (fetched) — [App Store](https://apps.apple.com/us/app/-/id6478934355)
- AHRQ's Health Literacy Universal Precautions Toolkit is the standard reference for teach-back (document located, not read) — [AHRQ toolkit PDF mirror](https://www.medchi.org/Portals/18/Files/Practice%20Services/AHRQ_healthlittoolkit2.pdf)

### Inferences
- The two review counts (5 of 6 versus 2 of 6 significant) conflict; the difference probably reflects different inclusion criteria. The honest summary is "mostly positive, moderate-quality, concentrated in heart failure".
- MediBridge should present a comprehension score as a communication-quality signal, not as a proven way to cut readmissions. The four EM-TeBa domains (what is wrong, what to take, when to come back, when to worry) are a ready-made, literature-backed template for auto-generated questions.
- A quiz is a recognition test; true teach-back is free recall in the patient's own words. An LLM grading a free-text or spoken restatement would be closer to the real method and further from existing apps.

### Gaps
- No trial of automated or LLM-driven teach-back with adherence or readmission outcomes was found.
- No evidence was found of teach-back quizzes inside Epic MyChart or any Indian portal; vendor documentation was not checked.
- The AHRQ toolkit text itself was not read.

## 4. Does any platform track consultation commitments as shared closed-loop tasks across patient, doctor and administrator?

### Takeaway
Partly. Enterprise platforms track care-plan tasks between patient and care team, and safety guidance describes staff-side logs for tests and referrals, but I did not find a product exposing one shared ledger of visit commitments, with a named owner per item, to patient, doctor and administrator together.

### Cited Findings
- Epic Care Companion: care plans split into tasks released at set time points, patient notified in MyChart, responses returned to the care team (snippets) — [ASTRO-Epic collaboration](https://www.astro.org/provider-resources/shareable-resources/epic-collaboration); [Folio3](https://digitalhealth.folio3.com/blog/?p=15448); [Surety Systems](https://www.suretysystems.com/insights/how-can-epic-care-companion-improve-patient-health/)
- MyChart "To Do" was used for a COVID-19 home monitoring programme (document located, not read) — [Cleveland Clinic QRG](https://my.clevelandclinic.org/-/scassets/files/org/landing/preparing-for-coronavirus/covid-19-home-monitoring-program-qrg.pdf?la=en)
- GetWell Loop: care-journey check-ins with a dashboard for care teams to intervene (snippet) — [Northern Light Health](https://ci.northernlighthealth.org/Flyers/Providers/Hospital/Documentation/Managing-GetWell-Dashboard.aspx)
- Twistle: automated care paths that pull in the care team only when needed (snippet) — [MemorialCare](https://memorialcare.org/patients-visitors/twistle)
- Memora Health: "digitizes and automates care journeys" (snippet, directory listing) — [YourStory company page](https://yourstory.com/companies/memora-health)
- Safety guidance frames loop-closing as a practice-staff responsibility: log referrals, track receipt, route to ordering provider — [Medical Mutual](https://www.medicalmutual.com/risk/practice-tips/tip/diagnostic-test-tracking-systems/53); [ECRI](https://home.ecri.org/blogs/ecri-news/failure-to-track-diagnostic-results-puts-patients-at-risk); [AHRQ Closed Loop Diagnostics](https://www.ahrq.gov/diagnostic-safety/research/closed-loop.html)

### Inferences
- Existing tools are programme-driven (a pre-authored pathway per condition) rather than visit-driven (items extracted from what this doctor wrote for this patient today). Auto-creating ledger items from each record and prescription, with owner and due date, is the differentiating mechanic.
- In the sources found, escalation flows from patient to care team. Escalation in the other direction (a loop owned by the doctor or clinic, such as a result not yet reviewed, visible to the patient and admin) was not described. That is a small but real twist.

### Gaps
- Wellframe, Conversa and Careology were named in the brief but not found in search results or checked.
- Vendor pages were mostly seen via third-party descriptions; internal admin views could not be inspected.

## 5. What 2024 to 2026 launches, hackathon projects or prototypes point to emerging ideas?

### Takeaway
The visible trend is LLM plain-language explanation of medical documents and ambient scribing. Hackathon projects cluster on "explain my prescription or report"; I found none framed around verified understanding or three-role loop tracking, though hackathon coverage was thin.

### Cited Findings
- A Devpost project takes lab results, prescriptions or discharge summaries and returns plain-language breakdowns plus a "questions to ask your doctor" list (snippet; the search summary called it "Plainly" while the URL slug is "memcura", so the name is uncertain) — [Devpost](https://devpost.com/software/memcura)
- Hackathon entries include a post-discharge chatbot with RAG and red-flag detection, and multilingual prescription-sharing projects (snippet) — [AI Tinkerers entry](https://austin.aitinkerers.org/hackathons/h_XtF20GeHnS4/entries/ht_MeOg3lW_Wsg); [lablab.ai profile](https://lablab.ai/u/@SandyDev73)
- Ambient AI scribes are being adopted widely; Epic is building its own (snippet) — [KFF Health News](https://kffhealthnews.org/news/article/ambient-ai-scribes-doctor-appointments-note-taking-ehr-epic/); Cleveland Clinic experience — [Consult QD](https://consultqd.clevelandclinic.org/less-typing-more-talking-how-ambient-ai-is-reshaping-clinical-workflow-at-cleveland-clinic)
- A clinical trial is testing AI plain-language summaries against original notes for patient trust and experience — [NCT07602725](https://clinicaltrials.gov/study/NCT07602725)
- A trial protocol exists on the impact of after-visit instructions on patient comprehension — [NCT06021730 protocol](https://cdn.clinicaltrials.gov/large-docs/30/NCT06021730/Prot_SAP_000.pdf)

### Inferences
- "Explain it in plain language" is now a crowded student-project idea and will not read as unique. "Prove the patient understood it, and show everyone what is still open" is one step beyond the crowd.
- Other under-served ideas noticed along the way: (a) a "questions to ask your doctor" list carried into the doctor's pre-visit brief so the patient's agenda is not lost; (b) loops owned by the clinic made visible to the patient; (c) admin reporting on comprehension by language or age group to target interpreter or counselling support.

### Gaps
- Smart India Hackathon winner lists, Y Combinator batches and Product Hunt were not searched; no specific 2025 or 2026 startup launch in this niche was identified.

## 6. What regulatory and safety limits should a student project respect when using an LLM on health data?

### Takeaway
In India the LLM may assist but must not counsel, diagnose or prescribe; a doctor must deliver the final advice. Health data needs free, specific, informed consent under the DPDP Act, whose Rules were notified on 13 November 2025 and phase in until May 2027.

### Cited Findings
- Telemedicine Practice Guidelines (25 March 2020): AI/ML platforms "are not allowed to counsel the patients or prescribe any medicines"; they may assist the doctor, "but the final prescription or counseling has to be directly delivered by the doctor" (fetched summary) — [MediaNama](https://www.medianama.com/2020/03/223-summary-india-telemedicine-guidelines/); [Conventus Law](https://conventuslaw.com/report/india-note-on-telemedicine-practice-guidelines/)
- Platforms must verify doctors are registered with the relevant medical council and provide a complaint mechanism; consent is implied when the patient initiates and must be explicit otherwise; doctors must keep records and prescriptions (fetched summary) — [MediaNama](https://www.medianama.com/2020/03/223-summary-india-telemedicine-guidelines/)
- DPDP Act Section 6: consent must be free, specific, informed, unconditional and unambiguous with a clear affirmative action (snippet) — [SGCMS summary](https://www.sgcms.com/regulatory-updates/digital-personal-data-protection-dpdpa-rules-2025/)
- DPDP Rules 2025 and commencement were notified 13 November 2025, with three enforcement dates (14 Nov 2025, 14 Nov 2026, 14 May 2027) over 18 months; Data Protection Board established; Consent Manager registration from about November 2026 (snippet) — [AZB & Partners](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/); [Hogan Lovells](https://ca.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-)
- Obligations include express permission systems and breach reporting within 72 hours (snippet) — [TCSA roadmap](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap)
- Sector analysis of DPDP for healthcare exists (located, not read) — [KPMG, Dec 2025](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2025/12/the-privacy-prescription-impact-of-dpdp-act-and-rules-in-healthcare-and-life-sciences-sector.pdf.coredownload.pdf)
- LLM risks documented in the literature: hallucinated facts in patient summaries — [arXiv 2402.15422](https://arxiv.org/pdf/2402.15422); hallucination and poor question quality in LLM tutoring (snippet) — [arXiv 2310.19212](https://arxiv.org/abs/2310.19212); human verification still required for LLM-translated instructions — [Int J Emerg Med 2025](https://intjem.biomedcentral.com/articles/10.1186/s12245-025-00885-5)

### Inferences
- Practical guardrails that follow: the LLM only rephrases what the doctor already wrote (no new advice, doses or diagnoses); the doctor approves the plain-language plan before the patient sees it, which keeps counselling "delivered by the doctor"; the pre-visit brief is labelled as the patient's own words, not a triage or diagnosis; send the LLM the minimum data with name and identifiers stripped; record explicit consent for AI processing with a way to withdraw; show a non-diagnostic disclaimer and an emergency instruction; use synthetic data for the demo.
- Sending identifiable patient data to a free third-party LLM API is the single biggest compliance weakness of the design and should be acknowledged in the project report.

### Gaps
- The DPDP Rules text and the Telemedicine Guidelines original were not read directly; all statements come from law-firm or news summaries.
- Whether DPDP imposes any health-specific category rules, and exactly which obligations are live as of October 2026, was not verified.
- Whether a college demo with synthetic data falls within DPDP scope at all was not researched.
