import assert from "node:assert/strict";
import test from "node:test";
import { groundAttendanceCountForStudent, groundAttendanceCounts } from "../ground-attendance-utils.js";

test("ground attendance matches canonical student IDs when saved names differ", () => {
  const student = { id: "student-8", studentName: "Robert James Pilot" };
  const counts = groundAttendanceCounts(Array.from({ length: 8 }, (_, index) => ({
    id: `attendance-${index}`,
    canonical_student_id: "student-8",
    student_first_name: "Bobby",
    student_last_name: "Pilot",
    status: "Attended"
  })));
  assert.equal(groundAttendanceCountForStudent(student, counts), 8);
});

test("ground attendance supports middle names, legacy name-only rows, and email identifiers", () => {
  const records = [
    { student_first_name: "Jane", student_last_name: "Pilot", status: "Attended" },
    { studentName: "Jane Q. Pilot", status: "Present" },
    { student_email_or_id: "jane@example.com", student_first_name: "J.", student_last_name: "Pilot" }
  ];
  const counts = groundAttendanceCounts(records);
  assert.equal(groundAttendanceCountForStudent({ studentName: "Jane Marie Pilot" }, counts), 2);
  assert.equal(groundAttendanceCountForStudent({ studentName: "Jane Marie Pilot", email: "jane@example.com" }, counts), 3);
});

test("ground attendance matches a shortened first name on legacy ID-less rows", () => {
  const counts = groundAttendanceCounts(Array.from({ length: 8 }, (_, index) => ({
    id: `attendance-${index}`,
    student_first_name: "Max",
    student_last_name: "Pickert",
    status: "Attended"
  })));
  assert.equal(groundAttendanceCountForStudent({
    id: "student-maxwell",
    studentName: "Maxwell Austin Pickert"
  }, counts), 8);
  assert.equal(groundAttendanceCountForStudent({ studentName: "Mason Pickert" }, counts), 0);
});

test("ground attendance does not use a name fallback when a record belongs to another student ID", () => {
  const counts = groundAttendanceCounts([
    { canonical_student_id: "student-2", student_first_name: "Alex", student_last_name: "Pilot" }
  ]);
  assert.equal(groundAttendanceCountForStudent({ id: "student-1", studentName: "Alex Pilot" }, counts), 0);
});

test("ground attendance does not count deleted records", () => {
  const counts = groundAttendanceCounts([
    { canonical_student_id: "student-1", student_first_name: "Alex", student_last_name: "Pilot" },
    { canonical_student_id: "student-1", student_first_name: "Alex", student_last_name: "Pilot", deletedAt: "2026-07-21" }
  ]);
  assert.equal(groundAttendanceCountForStudent({ id: "student-1", studentName: "Alex Pilot" }, counts), 1);
});
