export const TRAINER_CHECKIN_POLICY_START_DATE = "2026-07-20";
export const TRAINER_LESSON_WITH_INSTRUCTOR = "with_instructor";
export const TRAINER_LESSON_WITHOUT_INSTRUCTOR = "without_instructor";

export function normalizeTrainerLessonType(booking) {
  const value = String(booking?.lessonType || booking?.type || "").trim().toLowerCase();
  return [TRAINER_LESSON_WITH_INSTRUCTOR, "lesson_with_instructor", "instructor"].includes(value)
    ? TRAINER_LESSON_WITH_INSTRUCTOR
    : TRAINER_LESSON_WITHOUT_INSTRUCTOR;
}

export function trainerBookingBlocksTime(booking) {
  return Boolean(booking) && !booking.deletedAt && !booking.noShowAt;
}

export function normalizeAttendanceName(value) {
  const parts = String(value || "").trim().toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function isTrainerBookingCoveredByCheckinPolicy(booking) {
  const bookingDate = String(booking?.date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)
    && bookingDate >= TRAINER_CHECKIN_POLICY_START_DATE;
}

export function isCountedTrainerNoShow(booking) {
  return Boolean(booking?.noShowAt)
    && !booking?.deletedAt
    && isTrainerBookingCoveredByCheckinPolicy(booking);
}

export function verifiedTrainerAttendanceCounts(bookings) {
  const byStudentId = new Map();
  const byName = new Map();
  (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
    // No-shows are a usage-tracking flag only. They never add to or subtract
    // from attendance; only the independently recorded check-in controls credit.
    if (!booking?.checkedInAt || booking.deletedAt) return;
    // Instructor-led lessons are already captured by the main attendance sync.
    // Only independent trainer sessions add supplemental attendance credit.
    if (normalizeTrainerLessonType(booking) === TRAINER_LESSON_WITH_INSTRUCTOR) return;
    const studentId = String(booking.studentId || "").trim();
    const nameKey = normalizeAttendanceName(booking.studentName || booking.name);
    if (studentId) byStudentId.set(studentId, (byStudentId.get(studentId) || 0) + 1);
    if (nameKey) byName.set(nameKey, (byName.get(nameKey) || 0) + 1);
  });
  return { byStudentId, byName };
}

export function verifiedTrainerSessionCount(record, rosterStudent, counts) {
  const ids = [rosterStudent?.id, rosterStudent?.myfboStudentId, rosterStudent?.studentId, record?.studentId, record?.id]
    .filter(Boolean)
    .map(String);
  for (const id of ids) {
    if (counts.byStudentId.has(id)) return counts.byStudentId.get(id);
  }
  return counts.byName.get(normalizeAttendanceName(rosterStudent?.studentName || record?.studentName)) || 0;
}
