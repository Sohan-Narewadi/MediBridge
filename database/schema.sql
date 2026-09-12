-- MediBridge database schema
-- Normalized relational design for MySQL 8.x (InnoDB, utf8mb4)

CREATE DATABASE IF NOT EXISTS medibridge
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE medibridge;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Core identity: every person who can log in, regardless of role
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('patient', 'doctor', 'admin') NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(20),
  avatar_url      VARCHAR(255),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Patient-specific profile (1:1 with users where role = 'patient')
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS patients;
CREATE TABLE patients (
  user_id               INT PRIMARY KEY,
  date_of_birth         DATE,
  gender                ENUM('female', 'male', 'other', 'prefer_not_to_say') DEFAULT 'prefer_not_to_say',
  blood_group           VARCHAR(5),
  height_cm             DECIMAL(5,1),
  weight_kg             DECIMAL(5,1),
  address               VARCHAR(255),
  city                  VARCHAR(100),
  emergency_contact_name  VARCHAR(120),
  emergency_contact_phone VARCHAR(20),
  allergies             VARCHAR(255),
  chronic_conditions    VARCHAR(255),
  CONSTRAINT fk_patients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Specializations (lookup table, admin-managed)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS specializations;
CREATE TABLE specializations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   VARCHAR(255),
  icon          VARCHAR(50)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Doctor-specific profile (1:1 with users where role = 'doctor')
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS doctors;
CREATE TABLE doctors (
  user_id             INT PRIMARY KEY,
  specialization_id   INT NOT NULL,
  qualifications      VARCHAR(255),
  experience_years    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  consultation_fee    DECIMAL(8,2) NOT NULL DEFAULT 0,
  languages           VARCHAR(150) DEFAULT 'English',
  bio                 TEXT,
  clinic_name         VARCHAR(150),
  clinic_address      VARCHAR(255),
  city                VARCHAR(100),
  latitude            DECIMAL(10,7),
  longitude           DECIMAL(10,7),
  consultation_modes  VARCHAR(50) DEFAULT 'in_person,video',
  rating_avg          DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count        INT NOT NULL DEFAULT 0,
  is_verified         TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doctors_specialization FOREIGN KEY (specialization_id) REFERENCES specializations(id),
  INDEX idx_doctors_specialization (specialization_id),
  INDEX idx_doctors_city (city)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Weekly recurring availability template per doctor
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS doctor_availability;
CREATE TABLE doctor_availability (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id           INT NOT NULL,
  day_of_week         TINYINT NOT NULL, -- 0 = Sunday ... 6 = Saturday
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  slot_duration_mins  SMALLINT NOT NULL DEFAULT 30,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_availability_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  INDEX idx_availability_doctor_day (doctor_id, day_of_week)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Appointments: the backbone transactional table
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS appointments;
CREATE TABLE appointments (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  patient_id          INT NOT NULL,
  doctor_id           INT NOT NULL,
  appointment_date    DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  consultation_mode   ENUM('in_person', 'video') NOT NULL DEFAULT 'in_person',
  status              ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  reason              VARCHAR(255),
  cancelled_by        ENUM('patient', 'doctor', 'admin') NULL,
  cancellation_reason VARCHAR(255),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  UNIQUE KEY uq_doctor_slot (doctor_id, appointment_date, start_time),
  INDEX idx_appt_patient (patient_id, appointment_date),
  INDEX idx_appt_doctor_date (doctor_id, appointment_date),
  INDEX idx_appt_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Medical records: one per consultation, usually tied to an appointment
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS medical_records;
CREATE TABLE medical_records (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  appointment_id        INT NULL,
  patient_id            INT NOT NULL,
  doctor_id             INT NOT NULL,
  record_date           DATE NOT NULL,
  diagnosis             VARCHAR(255),
  consultation_summary  TEXT,
  vitals_bp             VARCHAR(20),
  vitals_pulse          VARCHAR(20),
  vitals_temp           VARCHAR(20),
  follow_up_date        DATE NULL,
  follow_up_notes       VARCHAR(255),
  document_url          VARCHAR(255),
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_record_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_record_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_record_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  INDEX idx_records_patient (patient_id, record_date),
  INDEX idx_records_doctor (doctor_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Prescriptions: line items attached to a medical record
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS prescriptions;
CREATE TABLE prescriptions (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  medical_record_id  INT NOT NULL,
  medicine_name      VARCHAR(150) NOT NULL,
  dosage             VARCHAR(50) NOT NULL,
  frequency          VARCHAR(100) NOT NULL,
  duration_days      SMALLINT,
  instructions       VARCHAR(255),
  CONSTRAINT fk_prescription_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
  INDEX idx_prescriptions_record (medical_record_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Medications: patient-facing reminder tracking (may originate from a
-- prescription or be self-added by the patient)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS medications;
CREATE TABLE medications (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT NOT NULL,
  prescription_id INT NULL,
  medicine_name   VARCHAR(150) NOT NULL,
  dosage          VARCHAR(50) NOT NULL,
  frequency       VARCHAR(100) NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NULL,
  reminder_times  VARCHAR(100) NOT NULL DEFAULT '08:00',
  instructions    VARCHAR(255),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_medication_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_medication_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL,
  INDEX idx_medications_patient (patient_id, is_active)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Medication intake log: used to compute adherence % and the Care Score
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS medication_logs;
CREATE TABLE medication_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  medication_id INT NOT NULL,
  log_date      DATE NOT NULL,
  status        ENUM('taken', 'missed', 'skipped') NOT NULL,
  logged_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_medication FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  UNIQUE KEY uq_medication_day (medication_id, log_date),
  INDEX idx_logs_medication (medication_id, log_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Notifications: in-app notification center for any user
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  type          VARCHAR(40) NOT NULL,
  title         VARCHAR(150) NOT NULL,
  message       VARCHAR(255) NOT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  related_type  VARCHAR(40),
  related_id    INT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Healthcare resources: educational content library
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS healthcare_resources;
CREATE TABLE healthcare_resources (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  category    VARCHAR(60) NOT NULL,
  title       VARCHAR(150) NOT NULL,
  summary     VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  image_url   VARCHAR(255),
  read_mins   SMALLINT NOT NULL DEFAULT 3,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resources_category (category)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Reviews: patient ratings of doctors, tied to a completed appointment
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS reviews;
CREATE TABLE reviews (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id      INT NOT NULL,
  patient_id     INT NOT NULL,
  appointment_id INT NOT NULL,
  rating         TINYINT NOT NULL,
  comment        VARCHAR(500),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_patient FOREIGN KEY (patient_id) REFERENCES patients(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_appointment (appointment_id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Reported issues: content/behavior reports for admin moderation
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS reported_issues;
CREATE TABLE reported_issues (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id      INT NOT NULL,
  category         VARCHAR(60) NOT NULL,
  subject          VARCHAR(150) NOT NULL,
  description      TEXT NOT NULL,
  status           ENUM('open', 'in_review', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  admin_notes      VARCHAR(500),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      DATETIME NULL,
  CONSTRAINT fk_report_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reports_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Audit log: lightweight system activity trail for the admin dashboard
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40),
  entity_id   INT,
  details     VARCHAR(255),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
