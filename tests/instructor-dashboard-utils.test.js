import assert from "node:assert/strict";
import test from "node:test";
import { addDaysToDateKey, civilTwilightTimes, instructorStudentAttendance, nightCurrencyStatus } from "../instructor-dashboard-utils.js";

test("night currency uses date-only 90-day arithmetic", () => {
  assert.equal(addDaysToDateKey("2026-07-16", 90), "2026-10-14");
  assert.deepEqual(nightCurrencyStatus("2026-07-16", "2026-10-01"), {
    expirationDate: "2026-10-14",
    daysRemaining: 13,
    state: "current"
  });
  assert.equal(nightCurrencyStatus("2026-07-16", "2026-10-14").state, "expires_today");
  assert.equal(nightCurrencyStatus("2026-07-16", "2026-10-16").daysRemaining, -2);
});

test("KORL civil dawn occurs before civil dusk", () => {
  const times = civilTwilightTimes(new Date("2026-07-16T12:00:00Z"));
  assert.ok(times.dawn instanceof Date && !Number.isNaN(times.dawn.getTime()));
  assert.ok(times.dusk instanceof Date && !Number.isNaN(times.dusk.getTime()));
  assert.ok(times.dawn < times.dusk);
});

test("instructor attendance matches assigned students by IDs or normalized names", () => {
  const student = { id: "roster-1", myfboStudentId: "mfbo-9", studentName: "Jane Q. Pilot" };
  const ground = [
    { student_first_name: "Jane", student_last_name: "Pilot" },
    { studentName: "Jane Pilot" },
    { studentName: "Other Student" }
  ];
  const myfbo = [{ studentId: "mfbo-9", studentName: "Pilot, Jane", metrics: { attendanceRate: 87.5 } }];
  const result = instructorStudentAttendance(student, ground, myfbo);
  assert.equal(result.groundSchoolCount, 2);
  assert.equal(result.myfboRate, 87.5);
  assert.equal(result.myfbo, myfbo[0]);
});

test("instructor ground attendance uses canonical IDs when a check-in name differs", () => {
  const student = { id: "roster-8", studentName: "Robert Pilot" };
  const ground = Array.from({ length: 8 }, (_, index) => ({
    id: `ground-${index}`,
    canonical_student_id: "roster-8",
    student_first_name: "Bobby",
    student_last_name: "Pilot",
    status: "Attended"
  }));
  assert.equal(instructorStudentAttendance(student, ground, []).groundSchoolCount, 8);
});
