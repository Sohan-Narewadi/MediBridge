// MediBridge's signature feature: the Care Score.
//
// A single 0-100 number that summarizes how "on track" a patient's
// healthcare engagement is, computed from three real, queryable signals:
//   - Medication adherence (40%): % of logged doses actually taken, last 30 days
//   - Checkup recency (35%): how long since their last completed visit
//   - Follow-up completion (25%): whether doctor-recommended follow-ups happened
//
// This is explicitly NOT a medical risk score or diagnosis - it measures
// engagement with the platform's own care plan, and every score ships with
// its breakdown so the patient can see exactly why it is what it is.

async function computeCareScore(pool, patientId) {
  const [[adherenceRow]] = await pool.query(
    `SELECT
        SUM(CASE WHEN ml.status = 'taken' THEN 1 ELSE 0 END) AS taken,
        COUNT(*) AS total
     FROM medication_logs ml
     JOIN medications m ON m.id = ml.medication_id
     WHERE m.patient_id = ? AND ml.log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    [patientId]
  );
  const adherencePct = adherenceRow.total > 0 ? Math.round((adherenceRow.taken / adherenceRow.total) * 100) : null;

  const [[recencyRow]] = await pool.query(
    `SELECT DATEDIFF(CURDATE(), MAX(appointment_date)) AS days_since
     FROM appointments WHERE patient_id = ? AND status = 'completed'`,
    [patientId]
  );
  let recencyScore;
  if (recencyRow.days_since === null) recencyScore = 50; // no visit history yet - neutral, not penalized
  else if (recencyRow.days_since <= 90) recencyScore = 100;
  else if (recencyRow.days_since >= 365) recencyScore = 0;
  else recencyScore = Math.round(100 - ((recencyRow.days_since - 90) / (365 - 90)) * 100);

  const [[followUpRow]] = await pool.query(
    `SELECT
        COUNT(*) AS due,
        SUM(CASE WHEN EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.patient_id = mr.patient_id AND a2.doctor_id = mr.doctor_id
                AND a2.status = 'completed' AND a2.appointment_date >= mr.follow_up_date
            ) THEN 1 ELSE 0 END) AS completed
     FROM medical_records mr
     WHERE mr.patient_id = ? AND mr.follow_up_date IS NOT NULL AND mr.follow_up_date <= CURDATE()`,
    [patientId]
  );
  const followUpScore = followUpRow.due > 0 ? Math.round((followUpRow.completed / followUpRow.due) * 100) : 100;

  const weights = { adherence: 0.4, recency: 0.35, followUp: 0.25 };
  const adherenceForScore = adherencePct === null ? 70 : adherencePct; // neutral-ish default if nothing logged yet
  const score = Math.round(
    adherenceForScore * weights.adherence + recencyScore * weights.recency + followUpScore * weights.followUp
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      adherence: { value: adherencePct, label: adherencePct === null ? 'No medications logged yet' : `${adherencePct}% of doses taken (last 30 days)` },
      recency: { value: recencyScore, label: recencyRow.days_since === null ? 'No completed visits yet' : `${recencyRow.days_since} days since last visit` },
      followUp: { value: followUpScore, label: followUpRow.due === 0 ? 'No follow-ups due' : `${followUpRow.completed}/${followUpRow.due} recommended follow-ups completed` },
    },
  };
}

module.exports = { computeCareScore };
