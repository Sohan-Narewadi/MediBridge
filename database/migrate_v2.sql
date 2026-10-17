-- MediBridge v2 additions: Smart Brief intake, Visit Loop, Discharge Flow, TransferConnect.
-- Safe to re-run: it only drops/recreates the NEW tables and widens users.role.
-- Run with: npm run db:v2   (applies this file, then seeds the v2 demo data)

USE medibridge;
SET FOREIGN_KEY_CHECKS = 0;

-- Hospital staff (department users) are a fourth login role.
ALTER TABLE users MODIFY role ENUM('patient', 'doctor', 'admin', 'staff') NOT NULL;

-- ---------------------------------------------------------------------------
-- Hospitals and what each one can handle (TransferConnect matching input)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS hospital_capabilities;
DROP TABLE IF EXISTS hospitals;
CREATE TABLE hospitals (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  city         VARCHAR(100) NOT NULL,
  address      VARCHAR(255),
  latitude     DECIMAL(10,7),
  longitude    DECIMAL(10,7),
  phone        VARCHAR(30),
  is_home      TINYINT(1) NOT NULL DEFAULT 0,   -- the hospital whose workflows we run (discharge)
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE hospital_capabilities (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  hospital_id        INT NOT NULL,
  specialization_id  INT NOT NULL,
  beds_available     SMALLINT NOT NULL DEFAULT 0,
  icu_available      SMALLINT NOT NULL DEFAULT 0,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cap_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_cap_spec FOREIGN KEY (specialization_id) REFERENCES specializations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_cap (hospital_id, specialization_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Staff profile: which hospital + which department a staff login belongs to
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS staff;
CREATE TABLE staff (
  user_id      INT PRIMARY KEY,
  hospital_id  INT NOT NULL,
  department   ENUM('billing', 'insurance', 'pharmacy', 'nursing', 'documentation', 'transfer_desk') NOT NULL,
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Smart Brief: what the patient tells us before a visit (entered once)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS intake_forms;
CREATE TABLE intake_forms (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id     INT NOT NULL UNIQUE,
  patient_id         INT NOT NULL,
  chief_complaint    VARCHAR(255) NOT NULL,
  symptoms           VARCHAR(255),               -- comma separated tags
  symptom_duration   VARCHAR(60),
  severity           TINYINT NULL,               -- 1 (mild) .. 5 (severe)
  medication_changes VARCHAR(255),
  new_allergies      VARCHAR(255),
  questions_for_doctor VARCHAR(500),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_intake_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_intake_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Visit Loop: plain-language care plan + shared open commitments
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS commitments;
DROP TABLE IF EXISTS care_plans;
CREATE TABLE care_plans (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  patient_id        INT NOT NULL,
  doctor_id         INT NOT NULL,
  medical_record_id INT NULL,
  admission_id      INT NULL,                      -- set when the plan is a discharge plan
  plain_summary     TEXT NOT NULL,                 -- "what happened / what to do", written for the patient
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_plan_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  INDEX idx_plan_patient (patient_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE commitments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  care_plan_id  INT NOT NULL,
  patient_id    INT NOT NULL,
  owner_role    ENUM('patient', 'doctor', 'hospital') NOT NULL DEFAULT 'patient',
  kind          ENUM('follow_up', 'test', 'medication', 'lifestyle', 'other') NOT NULL DEFAULT 'other',
  title         VARCHAR(200) NOT NULL,
  due_date      DATE NULL,
  status        ENUM('open', 'done', 'skipped') NOT NULL DEFAULT 'open',
  completed_at  DATETIME NULL,
  CONSTRAINT fk_commit_plan FOREIGN KEY (care_plan_id) REFERENCES care_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_commit_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  INDEX idx_commit_patient_status (patient_id, status),
  INDEX idx_commit_due (due_date, status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Discharge Flow
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS discharge_events;
DROP TABLE IF EXISTS discharge_tasks;
DROP TABLE IF EXISTS admissions;
CREATE TABLE admissions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT NOT NULL,
  hospital_id         INT NOT NULL,
  doctor_id           INT NOT NULL,                 -- attending doctor
  ward                VARCHAR(60),
  bed                 VARCHAR(20),
  diagnosis           VARCHAR(255),
  insurance_provider  VARCHAR(100),                 -- NULL = self-pay
  insurance_policy_no VARCHAR(60),
  admitted_at         DATETIME NOT NULL,
  status              ENUM('admitted', 'cleared', 'discharged', 'transferred') NOT NULL DEFAULT 'admitted',
  cleared_at          DATETIME NULL,                -- doctor says "medically fit to leave"; the clock starts here
  discharged_at       DATETIME NULL,
  CONSTRAINT fk_adm_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_adm_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_adm_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  INDEX idx_adm_status (status),
  INDEX idx_adm_patient (patient_id)
) ENGINE=InnoDB;

CREATE TABLE discharge_tasks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  admission_id   INT NOT NULL,
  department     ENUM('billing', 'insurance', 'pharmacy', 'nursing', 'documentation') NOT NULL,
  title          VARCHAR(150) NOT NULL,
  status         ENUM('pending', 'in_progress', 'blocked', 'done') NOT NULL DEFAULT 'pending',
  blocked_reason VARCHAR(255) NULL,
  sla_minutes    SMALLINT NOT NULL DEFAULT 60,      -- target time from "cleared" to done
  started_at     DATETIME NULL,
  completed_at   DATETIME NULL,
  completed_by   INT NULL,
  last_nudged_at DATETIME NULL,
  CONSTRAINT fk_task_adm FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_user FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_task_adm (admission_id),
  INDEX idx_task_dept_status (department, status)
) ENGINE=InnoDB;

CREATE TABLE discharge_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  admission_id  INT NOT NULL,
  task_id       INT NULL,
  actor_id      INT NULL,
  message       VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ev_adm FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE,
  INDEX idx_ev_adm (admission_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- TransferConnect
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS transfer_offers;
DROP TABLE IF EXISTS transfer_requests;
CREATE TABLE transfer_requests (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT NOT NULL,
  admission_id        INT NULL,
  from_hospital_id    INT NOT NULL,
  requested_by        INT NOT NULL,                 -- user id (doctor / staff / admin)
  specialization_id   INT NOT NULL,                 -- care needed that the sender cannot provide
  needs_icu           TINYINT(1) NOT NULL DEFAULT 0,
  urgency             ENUM('routine', 'urgent', 'critical') NOT NULL DEFAULT 'urgent',
  reason              VARCHAR(255) NOT NULL,
  clinical_summary    TEXT NOT NULL,                -- snapshot shared with receiving hospital
  consent_given       TINYINT(1) NOT NULL DEFAULT 0,
  consent_note        VARCHAR(160),
  status              ENUM('open', 'accepted', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  accepted_hospital_id INT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at         DATETIME NULL,
  CONSTRAINT fk_tr_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_from FOREIGN KEY (from_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_spec FOREIGN KEY (specialization_id) REFERENCES specializations(id),
  INDEX idx_tr_status (status)
) ENGINE=InnoDB;

CREATE TABLE transfer_offers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  request_id     INT NOT NULL,
  hospital_id    INT NOT NULL,
  match_score    TINYINT NOT NULL DEFAULT 0,        -- 0..100, computed at send time
  status         ENUM('pending', 'accepted', 'declined', 'withdrawn') NOT NULL DEFAULT 'pending',
  responded_by   INT NULL,
  response_note  VARCHAR(255),
  sent_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at   DATETIME NULL,
  summary_viewed_at DATETIME NULL,                  -- first time the receiver opened the clinical summary
  CONSTRAINT fk_off_req FOREIGN KEY (request_id) REFERENCES transfer_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_off_hosp FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  UNIQUE KEY uq_offer (request_id, hospital_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
