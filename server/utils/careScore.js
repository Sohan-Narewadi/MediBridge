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
const { find, todayStr, shiftDate, daysBetween } = require('../../database/store');

async function computeCareScore(patientId) {
  const today = todayStr();

  // Medication adherence over the last 30 days
  const meds = await find('medications', { patient_id: patientId }, { select: 'id' });
  const logs = await find('medication_logs', {
    medication_id: { $in: meds.map((m) => m.id) }, log_date: { $gte: shiftDate(today, -30) },
  }, { select: 'status' });
  const taken = logs.filter((l) => l.status === 'taken').length;
  const adherencePct = logs.length > 0 ? Math.round((taken / logs.length) * 100) : null;

  // Checkup recency
  const [lastVisit] = await find('appointments', { patient_id: patientId, status: 'completed' }, { sort: { appointment_date: -1 }, limit: 1, select: 'appointment_date' });
  const daysSince = lastVisit ? daysBetween(lastVisit.appointment_date, today) : null;
  let recencyScore;
  if (daysSince === null) recencyScore = 50; // no visit history yet - neutral, not penalized
  else if (daysSince <= 90) recencyScore = 100;
  else if (daysSince >= 365) recencyScore = 0;
  else recencyScore = Math.round(100 - ((daysSince - 90) / (365 - 90)) * 100);

  // Follow-up completion: each due follow-up counts as done if the patient
  // later completed a visit with the same doctor on or after the follow-up date.
  const dueRecords = await find('medical_records', { patient_id: patientId, follow_up_date: { $ne: null, $lte: today } }, { select: 'doctor_id follow_up_date' });
  const completedVisits = await find('appointments', { patient_id: patientId, status: 'completed' }, { select: 'doctor_id appointment_date' });
  const followedUp = dueRecords.filter((r) => completedVisits.some((a) => a.doctor_id === r.doctor_id && a.appointment_date >= r.follow_up_date)).length;
  const followUpScore = dueRecords.length > 0 ? Math.round((followedUp / dueRecords.length) * 100) : 100;

  const weights = { adherence: 0.4, recency: 0.35, followUp: 0.25 };
  const adherenceForScore = adherencePct === null ? 70 : adherencePct; // neutral-ish default if nothing logged yet
  const score = Math.round(
    adherenceForScore * weights.adherence + recencyScore * weights.recency + followUpScore * weights.followUp
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      adherence: { value: adherencePct, label: adherencePct === null ? 'No medications logged yet' : `${adherencePct}% of doses taken (last 30 days)` },
      recency: { value: recencyScore, label: daysSince === null ? 'No completed visits yet' : `${daysSince} days since last visit` },
      followUp: { value: followUpScore, label: dueRecords.length === 0 ? 'No follow-ups due' : `${followedUp}/${dueRecords.length} recommended follow-ups completed` },
    },
  };
}

module.exports = { computeCareScore };
