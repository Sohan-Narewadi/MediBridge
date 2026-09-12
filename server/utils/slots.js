// Turns a doctor's recurring weekly availability + that day's already-booked
// appointments into a concrete list of bookable time slots for one date.
// This is real backend logic - the frontend only ever renders what this
// returns, it never invents slots itself.

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}:00`;
}

/**
 * @param {Array} availabilityRows  rows from doctor_availability for the relevant day_of_week
 * @param {Array} bookedAppointments rows from appointments (status != cancelled) for that doctor+date
 * @param {Date} date  the calendar date being requested
 * @param {Date} now   current time, used to hide past slots for "today"
 */
function buildAvailableSlots(availabilityRows, bookedAppointments, date, now = new Date()) {
  const bookedStarts = new Set(bookedAppointments.map((a) => a.start_time));
  const isToday = date.toDateString() === now.toDateString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (const block of availabilityRows) {
    const start = timeToMinutes(block.start_time);
    const end = timeToMinutes(block.end_time);
    const step = block.slot_duration_mins || 30;
    for (let m = start; m + step <= end; m += step) {
      const startTime = minutesToTime(m);
      if (bookedStarts.has(startTime)) continue;
      if (isToday && m <= nowMinutes) continue; // no booking into the past
      slots.push({ startTime, endTime: minutesToTime(m + step) });
    }
  }
  return slots;
}

module.exports = { buildAvailableSlots, timeToMinutes, minutesToTime };
