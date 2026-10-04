# Doctor-side and Admin-side Workflow Tools: Existing Landscape (state as of October 2026)

Reliability note for the report writer: most figures below were taken from search-result summaries of the cited pages. Only two pages were opened in full (UChicago Medicine article; MedTech Spectrum EkaScribe article). Three other fetches failed (HTTP 403 or empty body). Vendor-published outcome numbers (Luma, CipherHealth, LeanTaaS, Qventus, Hyro, HealthPlix) are marketing claims, not independent evaluations, and are labelled as such. Items sourced from low-quality aggregator blogs are flagged individually.

## 1. Clinic and practice management systems (India and global)

### Takeaway
Practice management + EMR is a mature, commoditised category: scheduling, e-prescriptions, records, billing, reminders and basic analytics are standard everywhere, at roughly Rs 999/month in India and USD 29 to 399 per provider per month in the US. MediBridge's current doctor and admin features (availability, appointment status, records, prescriptions, stats) duplicate this baseline and are not in themselves innovative.

### Cited Findings
India
- Practo Ray: practice management covering appointment management, EMR/EHR, billing/invoices, analytical reports, SMS alerts, patient portal and intake, e-prescribing, inventory. Pricing listed from Rs 999 per month (USD 15 per user per month on international listings), free trial available. — [Capterra: Ray](https://www.capterra.com/p/167778/Ray/); [Capterra India](https://www.capterra.in/software/167778/ray)
- HealthPlix: AI-powered EMR built for Indian clinicians with clinical decision support at point of care. Company figures vary by date: "10,000+ doctors, 22 million patients, 16 specialities, 370+ cities" (older, around the Series C period) — [MobiHealthNews](https://mobihealthnews.com/node/152828); "over 14,000 doctors and 60 million patients across 370+ cities" (more recent, undated on the Sarvam case study) — [Sarvam AI: HealthPlix story](https://www.sarvam.ai/stories/healthplix)
- HealthPlix clinic analytics reported as used by "over 4,900 individual doctor clinics in 300+ cities" (date unclear, likely older). — [CXOToday](https://cxotoday.com/corner-office/healthplix-harnessing-technology-to-drive-digital-healthcare-revolution-in-india/)
- Eka Care: ABDM-integrated EMR and personal health record platform; doctors manage patient data, prescriptions and follow-ups with secure data sharing; described as "trusted by over 25,000 doctors"; features include customisable templates, medical calculators, dental and vaccination charts, real-time revenue tracking. — [MedBound Times](https://www.medboundtimes.com/amp/story/medicine/emr-ehr-platforms-india-clinical-practice)
- Halemind: cloud hospital/clinic management (patient registration, EHR, appointment scheduling, automated billing, e-prescriptions, customisable templates, digital signatures, queue management). Listed pricing: Starter USD 10.26/month, Standard USD 27.39/month, Premium USD 54.79/month. — [Capterra: Halemind](https://www.capterra.com/p/206523/Halemind/)
- KareXpert: cloud hospital management on one platform (OPD, diagnostics, billing, EMR, role-based permissions, alerts, real-time bed management, patient feedback collection, white-labelling). — [Software Advice listing](https://www.softwareadvice.com.au/software/118936/halemind) (comparison listing; KareXpert description came from the same directory family)
- Bahmni: open-source EMR and hospital system built on OpenMRS, OpenELIS and OpenERP (Odoo); covers registration, clinical services, lab, inventory, billing and reporting; can run offline without internet; modular. Over 500 implementations across 50 countries, mostly Africa and Asia. Recognised digital public good. — [AWS Public Sector Blog](https://aws.amazon.com/blogs/publicsector/how-an-open-source-emr-system-has-transformed-patient-healthcare-in-more-than-50-countries); [Bahmni implementations](https://www.bahmni.org/implementations); [Digital Public Goods registry](https://digitalpublicgoods.net/registry/bahmni.html)

Global
- Epic holds 43.7% of the US acute care hospital EHR market (up from 42.3% a year earlier) and 56.9% of hospital beds, per the KLAS 2026 market share report covering 2025 decisions. Epic was the only vendor selected by large health systems (more than 10 hospitals) in 2025 and added 77 hospitals and 18,679 beds. — [HIT Consultant, 14 May 2026](https://hitconsultant.net/2026/05/14/klas-2026-ehr-market-share-report/)
- Oracle Health (Cerner) had a third consecutive year of net losses: 56 hospitals and 14,676 beds lost. — [HIT Consultant, 14 May 2026](https://hitconsultant.net/2026/05/14/klas-2026-ehr-market-share-report/)
- Hospitals affected by EHR purchase decisions fell 40% versus 2024; KLAS tracked zero large health system migrations; capital was redirected to AI and operational-efficiency tools rather than core EHR replacement. — [Healthcare IT Today, 9 July 2026](https://www.healthcareittoday.com/2026/07/09/the-2026-ehr-market-is-cooling-as-leaders-pivot-to-ai/)
- SimplePractice (small/solo practices, strong in behavioural health): Starter USD 29/month, Essential USD 69/month, Plus USD 99/month, with extra charges for SMS, integrations and team seats. — [Capterra: SimplePractice](https://capterra.com/p/130710/SimplePractice/)
- Jane App: entry pricing from USD 99/month for one user. — [G2 comparison](https://www.g2.com/compare/jane-software-jane-vs-simplepractice)
- Tebra (formerly Kareo + PatientPop): typically USD 99 to 399 per provider per month depending on modules and specialty. — [G2 comparison](https://www.g2.com/compare/jane-software-jane-vs-simplepractice-vs-tebra-previously-kareo-patientpop)

Barriers to adoption in small Indian clinics
- Reported barriers: cost for small clinics and small/medium hospitals, resistance to changing paper workflows, low awareness of EMR benefits, power outages and unreliable internet, limited digital training of staff, effort of data entry. — [Greenbook: EMR Market in India](https://greenbook.org/marketing-research/emr-market-india-growth-challenges-40073); [BMC Health Services Research 2025](https://bmchealthservres.biomedcentral.com/articles/10.1186/s12913-025-12877-5)

### Inferences
- Even the largest Indian EMR vendors report tens of thousands of doctors (HealthPlix about 14,000; Eka Care about 25,000) against more than 13 lakh registered doctors (see section 6), which implies single-digit-percent penetration of dedicated EMR tools among Indian doctors. This is my arithmetic on vendor self-reports, not a published penetration figure.
- The global market signal for 2026 is that buyers have stopped competing on core records and scheduling and are spending on AI layers on top. A project that only re-implements records and scheduling is in the commoditised layer.
- Indian tools win on price and on fitting the high-volume, short-consultation OPD pattern (prescription-first design, regional language output); US tools are built around billing and insurance claims, which is largely irrelevant to MediBridge.

### Gaps
- No verified current figures found for DocPulse, Clinicea, MocDoc, eClinicalWorks or athenahealth (features, pricing, user counts). They are known products in this category but I did not retrieve sources for them in this pass.
- KareXpert citation is weak (directory listing); no vendor page or customer count retrieved.
- No independent (non-vendor) measurement of EMR penetration among Indian private clinics was found.
- HealthPlix and Eka Care user counts are self-reported and undated in the sources retrieved.

## 2. AI clinical documentation and ambient scribes

### Takeaway
Ambient AI scribes are the fastest-adopted clinical technology in recent memory and are now standard in large US systems, but independently measured time savings are modest (roughly 13 to 27 minutes per 8-hour clinic day, or 2 to 3 minutes per patient), far below vendor claims of 1 to 2 hours per day. The clearer benefit is reduced burnout; documented weaknesses are omissions, hallucinations, uneven adoption and unclear financial return.

### Cited Findings
What they do
- Ambient scribes listen to the doctor-patient conversation and draft a structured clinical note for clinician review. About 60 ambient scribe products were being implemented in practice as of the Peterson Health Technology Institute (PHTI) report, March 2025. — [Becker's: fastest-adopted tech](https://www.beckershospitalreview.com/healthcare-information-technology/ai/the-fastest-adopted-tech-in-healthcare-report/); [MobiHealthNews](https://www.mobihealthnews.com/news/phti-report-finds-ambient-scribes-set-be-fastest-tech-adopted-healthcare)
- PHTI (March 2025): "There is no technology in recent memory that has been adopted more enthusiastically by clinicians or has scaled so uncharacteristically fast, absent a regulatory mandate." — [Healthcare Innovation](https://www.hcinnovationgroup.com/analytics-ai/generative-ai/news/55277198/report-ambient-scribes-help-with-burnout-but-financial-impact-unclear)

Adoption
- Microsoft Dragon Copilot (successor to Nuance DAX Copilot): reported at 100,000+ clinicians and 21 million patient visits, with more than 2x year-on-year growth; integrated directly into Epic. Source is an aggregator restating Microsoft figures, so treat as vendor-reported. — [FourWeekMBA](https://fourweekmba.com/microsoft-dragon-copilot-reaches-100k-healthcare-providers/)
- Intermountain Health: over 2,500 active Dragon Copilot users. — [Microsoft customer story](https://www.microsoft.com/en/customers/story/25891-intermountain-health-microsoft-dragon-copilot)
- UChicago Medicine: over 800 clinicians use ambient AI in daily practice (November 2025). — [UChicago Medicine](https://www.uchicagomedicine.org/forefront/research-and-discoveries-articles/2025/november/ambient-ai-saves-time-reduces-burnout-fosters-patient-connection)
- Where ambient scribes are made widely available, clinician adoption is typically 20 to 50%; usage splits into heavy users, partial users, and low/no users including people who tried and stopped. — [Healthcare Innovation](https://www.hcinnovationgroup.com/home/article/55283221/ambient-scribe-physician-adoption-uneven-as-use-cases-evolve); [HealthExec](https://healthexec.com/topics/artificial-intelligence/ambient-scribe-technology-all-rage-despite-uneven-interest-and-still-imperfect-performance)
- The clinicians who benefited most were not tech-savvy early adopters but those who were behind on notes, talked longer with patients, or wrote longer notes. — [HealthExec](https://healthexec.com/topics/artificial-intelligence/ambient-scribe-technology-all-rage-despite-uneven-interest-and-still-imperfect-performance)

Measured time savings and burnout
- Randomised study across five academic medical centres: about 16 minutes less documentation time and 13.4 minutes less total EHR time per 8 hours of patient care; heavy users (scribe on at least 50% of visits) saved 27.3 minutes of documentation and 21.3 minutes of EHR time per 8-hour day. Reported May 2026. — [Textbook of Digital Health news, 18 May 2026](https://textbookofdigitalhealth.com/news/2026-05-18-jama-scribe-study.html) (secondary summary of a JAMA-family paper; the primary paper was not opened)
- Multi-site survey study, JAMA Network Open, October 2025 ("Use of Ambient AI Scribes to Reduce Administrative Burden and Professional Burnout"): among roughly 250 to 263 ambulatory clinicians at six health systems, burnout fell from 51.9% to 38.8% after 30 days; cognitive load and after-hours documentation also fell. — [UChicago Medicine](https://www.uchicagomedicine.org/forefront/research-and-discoveries-articles/2025/november/ambient-ai-saves-time-reduces-burnout-fosters-patient-connection)
- UChicago matched-cohort analysis: 8.5% less total EHR time and over 15% less time composing notes, equal to about 2 to 3 minutes per patient for a clinician seeing 20 patients a day. Authors note the need for larger, longer-term data beyond self-report. — [UChicago Medicine](https://www.uchicagomedicine.org/forefront/research-and-discoveries-articles/2025/november/ambient-ai-saves-time-reduces-burnout-fosters-patient-connection)
- PHTI (March 2025): some health systems report up to 40% reduction in burnout among users, but financial impact on health systems is unclear. — [Axios, 27 March 2025](https://www.axios.com/2025/03/27/ai-scribes-reduce-burnout-financial-improvement); [TechTarget](https://www.techtarget.com/healthtechanalytics/news/366621678/Ambient-AI-scribes-reduce-burnout-but-cost-impact-uncertain)
- Vendor-style claim of "1 to 2 hours per day saved" circulates in guides; this is far higher than the trial results above. — [AI Indigo guide](https://aiindigo.com/guides/guide-healthcare) (low-quality source, cited only to show the claim exists)

Pricing (US, per clinician per month; most are third-party estimates because enterprise vendors do not publish prices)
- Heidi Health about USD 110 (annual billing) with a permanent free tier; Nabla Pro USD 119 with a limited free tier; Suki about USD 299 to 399; Abridge estimated about USD 208 to 250; DAX/Dragon Copilot estimated about USD 369 plus about USD 700 setup. Setup, IT and training costs are typically extra. — [Commure comparison (a competing vendor's blog)](https://www.commure.com/blog-scribe/best-ai-medical-scribes); [Heidi Health blog](https://webflow.heidihealth.com/blog/best-ai-medical-scribe)

India
- EkaScribe (Eka Care), reported 16 September 2025: ambient scribe that generates structured notes in real time and auto-generates prescriptions, symptom logs and medical histories; supports voice, text and uploaded audio; works in Hindi, Tamil, Kannada, Gujarati and other regional languages; runs on Eka's own "Parrotlet" model; ABDM-compliant and integrable with other EMRs. The article states doctors spend nearly one-third of consultation time on documentation. No pricing, user counts or measured time savings were given. — [MedTech Spectrum](https://www.medtechspectrum.com/news/25/24807/eka-cares-ai-powered-ekascribe-transforms-clinical-documentation-for-doctors-across-india.html)
- HealthPlix H.A.L.O.: converts doctor-patient conversation into a structured digital prescription; launched with English and Hindi and a stated plan to add five more languages. — [BioVoice News](https://biovoicenews.com/?p=57611); [Digital Health News](https://www.digitalhealthnews.com/healthplix-launches-ai-powered-h-a-l-o-for-doctor-patient-interactions)
- HALO vendor-reported metrics: "97%+ accuracy on prescriptions", about 5 minutes saved per consultation, more than 50,000 consultations completed. Speech layer supplied by Sarvam AI. — [Sarvam AI: HealthPlix story](https://www.sarvam.ai/stories/healthplix)

Errors and safety
- Pragmatic pilot (July to August 2024, published in JMIR Medical Informatics 2026): 31 physicians, 7,545 notes; of 356 evaluated notes, omissions occurred in 18% (64), hallucinations in 11.5% (41), accidental inclusions in 9.3% (33). 94.7% (337/356) were free from significant errors, but a small number carried risk of serious harm if uncorrected; authors conclude clinician review remains imperative. — [eScholarship record](https://escholarship.org/uc/item/9r89g3sp); [JMIR Medical Informatics PDF](https://medinform.jmir.org/2026/1/e86474/PDF)
- A UK review reported 4 September 2026 found AI scribes fail to note patient experiences. Headline only; article not opened. — [Medical Economics](https://www.medicaleconomics.com/view/ai-scribes-fail-to-note-patient-experiences-u-k-review-finds)
- Reporting on a study of AI charting tools describes fabricated diagnoses and examinations that did not happen, with higher error rates for Black patients. — [Nurse.org](https://nurse.org/news/ai-charting-racial-bias-errors-nurses/) (secondary news source; primary study not identified)

### Inferences
- An AI scribe is already "invented" and commercially available in India in Indian languages (EkaScribe, HALO). Proposing a scribe as MediBridge's innovation would not be novel, and a student team cannot match its speech accuracy.
- Scribes are single-sided: they reduce the doctor's typing but do not involve the patient before the visit or the admin at all. The note is generated after or during the conversation, so it does not shorten the history-taking part of the consultation.
- The gap between vendor claims (1 to 2 hours/day, 5 minutes/consultation) and trial evidence (about 2 to 3 minutes/patient) is the key caution for any claim MediBridge makes about time savings.
- The safety pattern that holds across studies is "AI drafts, clinician reviews and signs". Any AI feature in MediBridge should follow the same pattern and keep an audit trail of what was AI-generated versus doctor-edited.

### Gaps
- No verified current user counts for Abridge, Suki, Nabla, Heidi Health or Augmedix (now part of Commure) were retrieved. Epic's own native AI charting product was searched for but no reliable source was returned.
- No independent, peer-reviewed evaluation of EkaScribe or HealthPlix HALO accuracy in Indian languages or in code-mixed speech (for example Hindi-English) was found. The 97% figure is vendor-reported with no stated method.
- No Indian pricing for EkaScribe or HALO was found.
- The primary JAMA-family paper for the five-centre randomised trial was not opened; figures come from a secondary summary.
- The PHTI report itself could not be fetched (403); findings are from trade-press summaries.

## 3. Pre-visit intake and symptom collection

### Takeaway
Digital intake exists in two separate forms: administrative intake (Phreesia, Yosi, Klara: forms, consent, demographics, payments) and clinical symptom interviewing (Infermedica, Ada, Buoy, K Health). Only some of the second group hand a structured clinical summary to the doctor, and I found no evidence of this being a standard feature in Indian clinic software.

### Cited Findings
- Phreesia: core strength is digital intake and registration, with pre-visit questionnaires, consents and demographic updates that reduce in-office paperwork. — [RFP.wiki: Phreesia](https://www.rfp.wiki/vendors/phreesia); [GetApp: Phreesia features](https://www.getapp.com/healthcare-pharmaceuticals-software/a/phreesia/features/)
- Infermedica Intake: interviews the patient before the visit and gives the doctor a summary containing present and absent symptoms, structured medical history, input for pre-populated notes and a list of most probable conditions, with transfer into the EHR. — [Infermedica Intake](https://infermedica.com/intake-api)
- Claim that Infermedica Intake cuts average visit time by 37.5% (20 minutes to about 12.5 minutes). This appears only on a third-party marketing blog and I could not trace it to a study; treat as unverified. — [Simbo AI blog](https://www.simbo.ai/blog/the-role-of-ai-powered-chatbots-in-streamlining-patient-histories-for-orthopedic-clinics-3782633)
- Klara: patient communication platform; patients start conversations by phone, text or web chat; integrates with EHRs; supports scheduling, digital forms, and pre- and post-visit instructions. — [AVIA Marketplace comparison](https://marketplace.aviahealth.com/compare/25373/25692)
- Yosi Health: pre-arrival check-in, scheduling, billing and telehealth; launched an AI voice agent for "digital front door" experiences (press release, about October 2025). — [Times Enterprise PR](https://pr.timesenterprise.com/article/Yosi-Health-Launches-AI-Voice-Agent-to-Power-Safer-Smarter-Digital-Front-Door-Experiences/68dd2a3576659e0002a43df4)
- Buoy Health: consumer symptom-checking chatbot; a study reported it decreased uncertainty among patients about what care to seek. — [MobiHealthNews](https://www.mobihealthnews.com/news/new-study-finds-health-chatbot-decreases-uncertainty-among-patients)
- Pre-visit chart summarisation for the doctor is an active area in 2026: a registered trial is evaluating Epic's AI outpatient chart summarisation. — [ClinicalTrials.gov NCT07438743](https://clinicaltrials.gov/study/NCT07438743)
- IKS Health markets a pre-visit summary service claiming almost eight minutes saved per patient visit (vendor claim). — [IKS Health](https://ikshealth.com/clinical-support-solutions/pre-visit-summary/)
- Qventus "Patient Concierge" gathers intake by voice, text or email and schedules appointments. — [Qventus press release](https://qventus.com/qventus-launches-ai-operational-assistants-to-reduce-administrative-burden-and-enhance-patient-care/)

### Inferences
- The intake-to-doctor handoff is the least crowded part of this landscape, especially in India. Indian tools found in this research (Practo Ray, HealthPlix, Eka Care, Halemind) list intake forms or prescription tools but none was described as producing a structured clinical pre-visit brief from the patient's own words.
- Consumer symptom checkers (Ada, Buoy, K Health) are patient-sided: the output usually stays with the patient unless a provider has bought the enterprise integration.
- A pre-visit brief addresses a part of the visit that ambient scribes do not: it moves history-taking before the appointment instead of transcribing it during the appointment. In a short Indian OPD consultation this may matter more than note-drafting. This is an inference; I found no Indian study measuring it.

### Gaps
- No peer-reviewed measurement of doctor time saved by pre-visit AI intake summaries was retrieved. Numbers found (37.5%, 8 minutes, 3 to 5 hours/week) are vendor or blog claims.
- Nothing verified was retrieved on Ada Health's or K Health's clinician handoff features in this pass.
- Could not confirm whether Eka Care or HealthPlix have launched a patient-completed pre-consultation interview as of October 2026.

## 4. No-show prediction, smart scheduling, waitlist backfill and queue management

### Takeaway
No-show prediction and automated waitlist backfill are established products in the US (Epic's built-in model, Luma Health, LeanTaaS, Qventus), with good evidence that prediction-targeted reminders work and weak or uncertain evidence for prediction-based overbooking, which also carries a documented fairness risk. In India the equivalent at scale is government QR-based OPD token registration, not predictive scheduling.

### Cited Findings
- Epic ships a proprietary built-in model that displays a numerical no-show likelihood per appointment; inputs include patient personal information, clinical history, prior no-shows and appointment features such as day of week. — [Health Affairs Forefront, January 2020](https://www.healthaffairs.org/do/10.1377/forefront.20200128.626576/)
- 2022 rapid systematic review: moderate-certainty evidence that predictive-model-targeted phone reminders reduce no-shows (3 RCTs, median relative risk 0.61) and that patient navigators do (1 RCT, relative risk 0.55); the effect of predictive-model-based overbooking was uncertain. — [PMC9933067](https://pmc.ncbi.nlm.nih.gov/articles/PMC9933067)
- Marshfield Clinic rural network model: trained on 1,260,083 appointments from 263,464 patients; AUC 0.83 on test data; sensitivity 0.71 and positive predictive value 0.18 at the chosen cut-off; used to recommend one overbook per six at-risk appointments per provider per day. — [BMC Health Services Research, September 2023](https://dx.doi.org/10.1186/s12913-023-09969-5)
- Fairness problem: a study in Manufacturing & Service Operations Management found that machine-learning schedulers that overbook high-risk slots give Black patients longer waits, because no-show risk correlates with socioeconomic factors such as transport. Co-author Shannon Harris: these systems "are penalizing Black patients for not showing up based on socioeconomic issues that are out of their control." The authors proposed a scheduling method that reduces the disparity. — [Healthcare IT News](https://www.healthcareitnews.com/news/study-scheduling-systems-lead-longer-wait-times-black-patients)
- Luma Health waitlist/reminder case studies (vendor-reported): First Choice Health Centers filled 42.41% of waitlist offers with 21% fewer no-shows; Mile Bluff Medical Center cut no-shows 20%; Village Dermatology went from 2.25% to 0.52% no-show rate with over 36% of waitlisted patients accepting an earlier slot; Maury Regional reduced no-shows 66%; Columbus Regional Health by more than 40%. — [Luma: First Choice](https://www.lumahealth.io/resource/first-choice-health-centers-luma-case-study/); [Luma: Village Dermatology](https://www.lumahealth.io/learn/customer-stories/village-dermatology-reached-almost-zero-no-show-rate-with-lumas-smart-waitlist/); [Luma case studies index](https://lumahealth.io/blog/resource_category/case-studies)
- Luma states its operational AI saved more than 2 million staff hours in 2025 (vendor banner claim). — [Luma Health](https://www.lumahealth.io/resource/village-dermatology-luma-case-study)
- LeanTaaS iQueue for Operating Rooms: used by more than 2,500 operating rooms across 47 health systems; vendor claims average impact of USD 500,000 per OR per year; KLAS satisfaction score 96.5/100 from 20 customer interviews (figures dated June 2022). — [BusinessWire, 7 June 2022](https://www.businesswire.com/news/home/20220607006026/en/KLAS-Research-Spotlight-Report-Reveals-Rare-96.5-out-of-100-Overall-Satisfaction-Score-for-the-LeanTaaS-iQueue-for-Operating-Rooms-Solution)
- Hyro (conversational AI for call centres and websites): claims automation of up to 85% of routine patient interactions and 35 to 45% lower contact-centre cost; at Intermountain, 88% lower call abandonment and 44% of repetitive calls automated within a year. — [MedCity News, October 2025](https://medcitynews.com/2025/10/conversational-ai-agents/)
- India, ABHA "Scan and Share": patient scans a hospital QR code and shares demographics to get an OPD token; launched October 2022. As of November 2024, 17,481 facilities in 35 states/UTs had generated 6.64 crore tokens, about 2 lakh per day, with a government estimate of 3.3 crore person-hours saved; registration queue time reported to fall from 30 to 40 minutes to 5 to 10 minutes. — [MoHFW press release](https://www.mohfw.gov.in/press-info/7908); [News On Air](https://www.newsonair.gov.in/national-health-authority-achieves-milestone-with-over-3-crore-opd-tokens-generated-through-abha-based-scan-and-share-service) (the 6.64 crore figure appeared in the search summary; I did not confirm which of these two pages carries it)
- Halemind lists queue management as a feature for Indian clinics. — [Capterra: Halemind](https://www.capterra.com/p/206523/Halemind/)

### Inferences
- The well-evidenced use of a no-show score is to target extra reminders or a confirmation call at high-risk appointments, not to overbook. That is also the fairer design and the one a college project can defend.
- Waitlist backfill (auto-offering a cancelled slot to the next waiting patient) is a concrete feature that links all three roles: patient cancels, another patient gets an earlier slot, the doctor's slot is not wasted, the admin sees utilisation. It exists commercially in the US but I found no evidence of it as a standard feature in Indian clinic tools.
- Scan and Share solves the registration queue, not the wait for the doctor; patients still do not know how long until they are seen.

### Gaps
- Nothing verified retrieved on Relatient, Qure (Qure.ai is mainly imaging AI, so it may not belong in this category), Notable, MocDoc or Qmatic.
- No published no-show rates or no-show prediction studies for Indian outpatient clinics were retrieved.
- Luma, LeanTaaS and Hyro numbers are all vendor case studies with no independent verification.
- Current (2026) Scan and Share totals were not found; the latest figure retrieved is November 2024.

## 5. Post-visit follow-up automation, care-gap closure and patient outreach

### Takeaway
Follow-up is being automated in the US with SMS/voice outreach and, since 2025, generative voice agents that make outbound calls for missed appointments, post-discharge checks and chronic-disease check-ins. These are enterprise products for large hospital systems; no comparable evidence was found for small clinics in India.

### Cited Findings
- WellSpan Health (reported 30 July 2026) expanded its Hippocratic AI partnership from single use cases to platform-wide deployment across inbound, outbound, ambulatory and inpatient settings. Its voice agent "Ana" handles over 160,000 patient calls and 7,000 conversational hours per month for appointment management and digital-access queries; planned expansions are outbound care-gap closure starting with missed imaging appointments, post-discharge follow-up and chronic-disease check-ins. — [HIT Consultant, 30 July 2026](https://hitconsultant.net/2026/07/30/wellspan-health-expands-hippocratic-ai-partnership-platform-wide-voice-agent/) (page returned 403 on fetch; details from search summary)
- UNC Health (20 hospitals) partnered with Hippocratic AI for inbound phone services, starting with primary care scheduling and specialty pharmacy calls. — [Becker's: health systems expanding agentic AI](https://www.beckershospitalreview.com/healthcare-information-technology/ai/8-health-systems-expanding-their-use-of-agentic-ai/)
- Hippocratic AI positions its agents as non-diagnostic, patient-facing communication. — [Stork.ai profile](https://www.stork.ai/en/hippocratic-ai) (aggregator; this page also gives funding and model figures that I could not corroborate and have not reported)
- CipherHealth post-discharge outreach (vendor-reported): analysis of 38 health systems and 74 outreach programmes, 2017 to 2020, covering 880,000 patients called, claims a 56% reduction in readmission rates and an estimated USD 12.4 million average annual savings per health system. — [CipherHealth case study](https://cipherhealth.com/resource/case-study/cipherhealths-outreach-solutions-reduce-hospital-readmissions-by-56-percent/)
- CipherHealth single-hospital example: 120 readmissions prevented over two years with 72.9% patient engagement on follow-up calls. — [CipherHealth: ROI of outreach](https://cipherhealth.com/resource/case-study/the-high-roi-of-cipherhealths-outreach-solutions/)
- Qventus "AI Operational Assistants" automate administrative tasks around care operations; vendor claims up to 50% productivity gain for care-operations roles; raised USD 105 million Series D led by KKR (January 2025). — [BusinessWire, 18 September 2025](https://www.businesswire.com/news/home/20250918799800/en/Qventus-Drives-Next-Wave-of-Healthcare-AI-Innovation-with-Debut-of-AI-Solution-Factory-and-Releases-New-ROI-Outcomes-from-Health-Systems); [HIT Consultant, 13 January 2025](https://hitconsultant.net/2025/01/13/qventus-secures-105m-to-advance-ai-assistants-for-optimal-health-system-efficiencies/)
- Klara supports personalised post-visit instructions through messaging. — [AVIA Marketplace comparison](https://marketplace.aviahealth.com/compare/25373/25692)
- Eka Care's EMR lets doctors manage follow-ups alongside prescriptions. — [MedBound Times](https://www.medboundtimes.com/amp/story/medicine/emr-ehr-platforms-india-clinical-practice)

### Inferences
- MediBridge already stores a follow-up date in the medical record. In the tools surveyed, the value comes from acting on that field automatically (reminder, one-tap rebooking, a check-in question, escalation to the doctor if the patient reports getting worse). Storing the date without acting on it is the common gap.
- US follow-up automation is driven by hospital readmission penalties and call-centre cost. An Indian clinic has neither incentive, which partly explains why the category is thin there. This is an inference, not a sourced claim.
- Outreach tools are two-sided at most (system to patient). The response rarely reaches the doctor as a structured signal, and the admin sees only aggregate call volume.

### Gaps
- Nothing verified retrieved on Artera or Memora Health (Memora was reportedly acquired by Commure; not confirmed here).
- No independent evaluation of generative voice agents' safety or error rates in patient outreach was retrieved.
- No data on follow-up adherence rates or automated follow-up tools in Indian clinics.
- The CipherHealth 56% figure is a vendor before/after analysis with no control group described.

## 6. Administrator tools: command centres, credential verification, audit, analytics

### Takeaway
For hospital administrators, operations command centres and capacity-prediction tools are established in large US systems. For platform administrators in India, the key finding is that the official doctor-verification infrastructure exists on paper (NMC National Medical Register, ABDM Healthcare Professionals Registry) but coverage is very low, so manual document checking is still the norm.

### Cited Findings
Operations and analytics
- LeanTaaS iQueue for Inpatient Flow: supports over 23,000 beds at 100 hospitals across 28 health systems; vendor claims 10% more discharges per day and 5% more admissions; customers cite bed management, discharge predictability, reduced emergency boarding and command-centre visibility. KLAS satisfaction 95/100. — [LeanTaaS press release](https://leantaas.com/press-releases/klas-research-reveals-outstanding-95-out-of-100-overall-satisfaction-score-for-the-leantaas-iqueue-for-inpatient-flow-solution/)
- KLAS 2026: health systems are redirecting capital from EHR replacement to AI and operational-efficiency tools with immediate financial return. — [Healthcare IT Today, 9 July 2026](https://www.healthcareittoday.com/2026/07/09/the-2026-ehr-market-is-cooling-as-leaders-pivot-to-ai/)
- KareXpert offers role-based permissions, alerts and real-time bed management on a single cloud platform for Indian hospitals. — [Software Advice listing](https://www.softwareadvice.com.au/software/118936/halemind)
- NHA runs a public ABDM dashboard showing ABHA numbers generated, healthcare professionals registered, facilities registered and health records linked, at national and state level. — [OpenGov Asia](https://archive.opengovasia.com/india-national-health-authority-develops-public-dashboard-for-healthcare-data/)

Doctor credential verification in India
- The National Medical Register (NMR), run by the National Medical Commission, is intended to be a single Aadhaar-linked register of India's more than 13 lakh allopathic doctors and to form part of the Healthcare Professionals Registry under ABDM. — [Healthcare IT News](https://www.healthcareitnews.com/news/asia/india-upgrades-national-doctors-database); [Business Standard](https://www.business-standard.com/india-news/govt-to-launch-central-databases-for-citizens-to-track-doctors-credentials-124020701442_1.html)
- The NMR portal went live on 23 August 2024. By May 2025, of 10,411 applications received, 10,237 had not been approved. — [Odisha Bytes](https://odishabytes.com/government-now-says-nmr-is-voluntary-after-less-than-1-doctors-get-enrolled-in-eight-months/)
- Later report: only about 1,800 certificates issued with over 30,000 applications pending at State Medical Councils and NMC; NMC was considering a committee to fast-track. — [Medical Dialogues](https://medicaldialogues.in/health-news/nmc/only-1800-certificates-issued-over-30k-applications-pending-nmc-mulls-committee-to-fast-track-national-medical-register-172862)
- Reason cited for the backlog: doctors must upload Aadhaar and submit an affidavit when their name or the state council's name does not match existing data. — [Odisha Bytes](https://odishabytes.com/government-now-says-nmr-is-voluntary-after-less-than-1-doctors-get-enrolled-in-eight-months/)
- The government said NMR enrolment is voluntary after initially describing it as mandatory. — [Medical Dialogues](https://medicaldialogues.in/mdtv/channels/healthshorts/national-medical-registration-uptake-remains-low-minister-says-registration-voluntary-153266)
- NMC draft regulations in 2026 propose making NMR registration mandatory; doctors' bodies raised implementation concerns. — [Medical Dialogues](https://medicaldialogues.in/health-news/nmc/nmc-draft-proposes-mandatory-nmr-registration-doctors-raise-implementation-concerns-177902)
- Example of state-level coverage: only 75 allopathic doctors in Chhattisgarh were registered in the NMR as of August 2025. — [The Hitavada, 10 August 2025](https://www.thehitavada.com/Encyc/2025/8/10/only-75-allopathic-doctors-at-chhattisgarh-registered-in-national-medical-register-of-nmc.html)
- The Healthcare Professionals Registry (HPR) is described by ABDM as a repository of registered and verified practitioners of modern and traditional medicine, planned to extend to nurses, midwives, community health workers and paramedical staff. — [ABDM HPR consultation paper synopsis](https://abdm.gov.in:8081/uploads/Synopsis_Consultation_Paper_on_Healthcare_Professionals_Registry_2a0d3b2f9c.pdf)
- HPR enrolment figures conflict: one explainer gives "more than 5 lakh enrolled professionals" as of 2026 while the same search surfaced "over 40 lakh professionals registered". Neither was verified against the live ABDM dashboard. Overall ABDM scale is also inconsistent between sources: "over 78 crore ABHA accounts" in early 2026 versus "93 crore ABHA accounts" in another article title from the same site. — [Anantam IAS explainer](https://anantamias.com/ayushman-bharat-digital-mission/?pdf=1); [Anantam IAS current affairs](https://anantamias.com/current-affairs/ayushman-bharat-digital-mission-progress/?pdf=1)
- Bihar required government doctors to register on the ABDM health registry by a February deadline. — [Medical Dialogues](https://medicaldialogues.in/news/health/doctors/bihar-govt-doctors-must-register-on-abdm-health-registry-by-february-164081)

### Inferences
- A platform admin in India cannot yet rely on a single API lookup to verify a doctor: the NMR covers a tiny fraction of doctors and HPR counts are unclear. Verification in practice means checking the State Medical Council registration number and uploaded certificates by hand, which is what MediBridge's "verify doctor" step presumably does.
- A defensible admin-side improvement is a structured verification checklist (registration number, council, year, document upload, optional HPR ID) with an audit-logged decision, designed so that an HPR/NMR lookup can be plugged in when coverage improves. Claiming live NMR integration would overstate what the registry can support today.
- Command centres in the surveyed tools are about beds and operating rooms. For an outpatient platform the analogous admin view is operational signals (no-show rate, unfilled slots, wait-to-appointment time, overdue follow-ups, unresolved reports) that prompt an action, as opposed to static charts.

### Gaps
- No sources retrieved on dedicated healthcare audit/compliance tooling (for example access-log monitoring products) or on what India's Digital Personal Data Protection Act 2023 and its rules require of a health platform's audit log as of October 2026.
- No verified current HPR and ABHA totals from the official dashboard (dashboard.abdm.gov.in was not fetched).
- Whether HPR or NMR offer a public verification API usable by a third-party app was not confirmed.
- No sources on US credentialing tools (for example CAQH, Medallion, Verifiable) were retrieved; these exist but are outside what I verified.
- KareXpert source is weak, as noted in section 1.

## 7. Three-sided loops versus single-sided tools, and documented limitations

### Takeaway
Almost every tool surveyed is single-sided or two-sided. Scribes serve the doctor, intake and outreach tools serve the patient-to-system link, and command centres serve the admin. Only the large integrated EHRs (Epic with its patient portal) and, in India, the EMR-plus-patient-app platforms (Eka Care, Practo) touch all three parties, and even there the pieces are separate modules, not one continuous loop from pre-visit to follow-up.

### Cited Findings
Scope of each tool (from the product descriptions cited above)
- Doctor-only: ambient scribes produce a note for the clinician to review. — [Healthcare Innovation](https://www.hcinnovationgroup.com/analytics-ai/generative-ai/news/55277198/report-ambient-scribes-help-with-burnout-but-financial-impact-unclear)
- Patient-to-doctor: Infermedica Intake passes a structured summary to the physician. — [Infermedica Intake](https://infermedica.com/intake-api)
- Patient-to-front-desk: Phreesia, Yosi and Klara handle forms, check-in and messaging. — [RFP.wiki: Phreesia](https://www.rfp.wiki/vendors/phreesia); [AVIA Marketplace comparison](https://marketplace.aviahealth.com/compare/25373/25692)
- System-to-patient: Luma waitlist offers, CipherHealth post-discharge calls, Hippocratic AI voice agents. — [Luma: First Choice](https://www.lumahealth.io/resource/first-choice-health-centers-luma-case-study/); [CipherHealth case study](https://cipherhealth.com/resource/case-study/cipherhealths-outreach-solutions-reduce-hospital-readmissions-by-56-percent/)
- Admin-only: LeanTaaS capacity and command-centre tools. — [LeanTaaS press release](https://leantaas.com/press-releases/klas-research-reveals-outstanding-95-out-of-100-overall-satisfaction-score-for-the-leantaas-iqueue-for-inpatient-flow-solution/)
- Closest to all three in India: Eka Care combines a doctor EMR, patient health records and ABDM data sharing. — [MedBound Times](https://www.medboundtimes.com/amp/story/medicine/emr-ehr-platforms-india-clinical-practice)

Documented limitations
- Alert fatigue: a systematic review of 23 studies (to March 2019) found average alert override rates of 46.2% to 96.2%. — [JMIR Medical Informatics 2020](https://medinform.jmir.org/2020/7/e15653/PDF)
- A 2024 meta-analysis is reported as finding physicians override about 90% of alerts (95% CI 85 to 95%). Cited via a vendor blog; primary paper not opened. — [Mindbowser](https://www.mindbowser.com/alert-fatigue-healthcare/)
- AI scribe errors: omissions 18%, hallucinations 11.5%, inclusions 9.3% of evaluated notes; 5.3% had significant errors. — [eScholarship record](https://escholarship.org/uc/item/9r89g3sp)
- Uneven scribe adoption (20 to 50% where available) and unclear financial return. — [HealthExec](https://healthexec.com/topics/artificial-intelligence/ambient-scribe-technology-all-rage-despite-uneven-interest-and-still-imperfect-performance); [Axios, 27 March 2025](https://www.axios.com/2025/03/27/ai-scribes-reduce-burnout-financial-improvement)
- Cost: US scribes run about USD 110 to 400 per clinician per month, plus setup. — [Commure comparison](https://www.commure.com/blog-scribe/best-ai-medical-scribes)
- Scheduling bias: prediction-driven overbooking lengthens waits for Black patients. — [Healthcare IT News](https://www.healthcareitnews.com/news/study-scheduling-systems-lead-longer-wait-times-black-patients)
- Small Indian clinics: cost, resistance to change, low awareness, power and internet problems, limited staff training. — [Greenbook](https://greenbook.org/marketing-research/emr-market-india-growth-challenges-40073)
- Language: HealthPlix HALO launched with only English and Hindi; EkaScribe lists several regional languages but with no published accuracy data. — [BioVoice News](https://biovoicenews.com/?p=57611); [MedTech Spectrum](https://www.medtechspectrum.com/news/25/24807/eka-cares-ai-powered-ekascribe-transforms-clinical-documentation-for-doctors-across-india.html)
- Verification infrastructure: NMR approved only a small fraction of applications in its first year. — [Medical Dialogues](https://medicaldialogues.in/health-news/nmc/only-1800-certificates-issued-over-30k-applications-pending-nmc-mulls-committee-to-fast-track-national-medical-register-172862)

### Inferences
- The open space is the connection between the pieces, not any single piece. A plausible "one loop" for MediBridge, built from features that each exist somewhere but were not found together in a small-clinic product: (1) patient answers a short pre-visit interview when booking; (2) doctor opens the appointment to a structured brief and a pre-filled record draft to edit and sign; (3) the follow-up date in the record automatically triggers a reminder, one-tap rebooking and a symptom check-in; (4) a worsening check-in or a missed follow-up is flagged to the doctor; (5) the admin sees the loop's health (unfilled slots, no-shows, overdue follow-ups, flagged cases) and acts on it, with every step in the audit log.
- Design lessons to carry over from the documented failures: keep the doctor as reviewer of anything AI-drafted; limit flags to a few high-value ones to avoid alert fatigue; use any no-show score to target reminders and waitlist offers, not overbooking; support at least Hindi/Marathi-English patient input; make it work on a phone with poor connectivity.
- Novelty should be claimed carefully: the loop is a combination and a fit to small Indian clinics, not a new invention. Each component has a commercial precedent cited above.

### Gaps
- I did not find a published comparison or analyst report that classifies these tools by which parties they connect; the classification above is mine, built from product descriptions.
- Whether Practo, Eka Care or HealthPlix already ship a pre-visit-brief plus automated-follow-up loop in 2026 was not confirmed either way. Absence of evidence in this pass is not proof that it does not exist.
- No Gartner material was retrieved; KLAS and PHTI findings came through trade press, not the original reports.
- No patient-outcome evidence (as opposed to time or cost) was found for any of the categories in an Indian setting.
