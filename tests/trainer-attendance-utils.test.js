import test from "node:test";
import assert from "node:assert/strict";
import {
  isCountedTrainerNoShow,
  isTrainerBookingCoveredByCheckinPolicy,
  normalizeTrainerLessonType,
  trainerBookingBlocksTime,
  verifiedTrainerAttendanceCounts,
  verifiedTrainerSessionCount
} from "../trainer-attendance-utils.js";

test("only checked-in active trainer bookings count toward attendance and no-show flags do not alter credit", () => {
  const counts = verifiedTrainerAttendanceCounts([
    { id: "booking-1", studentId: "student-1", name: "Avery Pilot", checkedInAt: "2026-07-17T14:00:00Z" },
    { id: "booking-2", studentId: "student-1", name: "Avery Pilot", checkedInAt: "" },
    { id: "booking-no-show", studentId: "student-1", name: "Avery Pilot", checkedInAt: "2026-07-18T14:00:00Z", noShowAt: "2026-07-18T14:05:00Z" },
    { id: "booking-3", studentId: "student-1", name: "Avery Pilot", checkedInAt: "2026-07-18T14:00:00Z", deletedAt: "2026-07-18T15:00:00Z" }
  ]);

  assert.equal(verifiedTrainerSessionCount({ studentId: "student-1", studentName: "Avery Pilot" }, null, counts), 2);
});

test("marking a no-show without a check-in does not change attendance credit", () => {
  const before = verifiedTrainerAttendanceCounts([
    { id: "booking-1", studentId: "student-1", date: "2026-07-20", checkedInAt: "" }
  ]);
  const after = verifiedTrainerAttendanceCounts([
    { id: "booking-1", studentId: "student-1", date: "2026-07-20", checkedInAt: "", noShowAt: "2026-07-20T15:00:00Z" }
  ]);

  assert.equal(verifiedTrainerSessionCount({ studentId: "student-1" }, null, before), 0);
  assert.equal(verifiedTrainerSessionCount({ studentId: "student-1" }, null, after), 0);
});

test("legacy checked-in bookings can match a roster student by name", () => {
  const counts = verifiedTrainerAttendanceCounts([
    { id: "booking-1", name: "Jordan Q. Student", checkedInAt: "2026-07-17T14:00:00Z" }
  ]);

  assert.equal(verifiedTrainerSessionCount({ studentName: "Jordan Student" }, null, counts), 1);
});

test("trainer check-in policy grandfathers bookings before July 20, 2026", () => {
  const historical = { date: "2026-07-19", noShowAt: "2026-07-20T14:00:00Z" };
  const covered = { date: "2026-07-20", noShowAt: "2026-07-20T14:00:00Z" };

  assert.equal(isTrainerBookingCoveredByCheckinPolicy(historical), false);
  assert.equal(isCountedTrainerNoShow(historical), false);
  assert.equal(isTrainerBookingCoveredByCheckinPolicy(covered), true);
  assert.equal(isCountedTrainerNoShow(covered), true);
});

test("historical verified check-ins remain positive attendance credit", () => {
  const counts = verifiedTrainerAttendanceCounts([
    { date: "2026-07-19", studentId: "student-1", checkedInAt: "2026-07-19T14:00:00Z" }
  ]);

  assert.equal(verifiedTrainerSessionCount({ studentId: "student-1" }, null, counts), 1);
});

test("instructor-led trainer lessons do not add duplicate attendance credit", () => {
  const counts = verifiedTrainerAttendanceCounts([
    { id: "solo", type: "without_instructor", studentId: "student-1", checkedInAt: "2026-07-21T14:00:00Z" },
    { id: "instructor", type: "with_instructor", studentId: "student-1", checkedInAt: "2026-07-22T14:00:00Z" }
  ]);

  assert.equal(verifiedTrainerSessionCount({ studentId: "student-1" }, null, counts), 1);
  assert.equal(normalizeTrainerLessonType({ type: "reservation" }), "without_instructor");
});

test("no-shows remain records but no longer block their scheduled time", () => {
  assert.equal(trainerBookingBlocksTime({ id: "active" }), true);
  assert.equal(trainerBookingBlocksTime({ id: "no-show", noShowAt: "2026-07-22T14:00:00Z" }), false);
  assert.equal(trainerBookingBlocksTime({ id: "deleted", deletedAt: "2026-07-22T14:00:00Z" }), false);
});
