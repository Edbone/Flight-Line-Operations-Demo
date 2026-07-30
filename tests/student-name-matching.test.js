import assert from "node:assert/strict";
import {
  canonicalizeAttendanceRecord,
  findCanonicalStudent,
  splitCanonicalStudentName
} from "../student-name-matching.js";

const students = [
  { id: "1", studentName: "John Michael Doe", studentId: "AOA-1" },
  { id: "2", studentName: "Jane Marie Smith", studentId: "AOA-2" },
  { id: "3", studentName: "John Allen Smith", studentId: "AOA-3" },
  { id: "4", studentName: "John Robert Smith", studentId: "AOA-4" }
];

assert.equal(findCanonicalStudent(students, "John Doe")?.id, "1");
assert.equal(findCanonicalStudent(students, "Michael Doe")?.id, "1");
assert.equal(findCanonicalStudent(students, "Jane Smith")?.id, "2");
assert.equal(findCanonicalStudent(students, "Jon Doe"), null);
assert.equal(findCanonicalStudent(students, "John Smith"), null);
assert.equal(findCanonicalStudent(students, "Jnae Smith"), null);
assert.deepEqual(splitCanonicalStudentName("John Michael Doe"), { first: "John Michael", last: "Doe" });

const result = canonicalizeAttendanceRecord({
  student_first_name: "Michael",
  student_last_name: "Doe",
  student_email_or_id: ""
}, students);
assert.equal(result.changed, true);
assert.equal(result.record.student_first_name, "John Michael");
assert.equal(result.record.student_last_name, "Doe");
assert.equal(result.record.student_email_or_id, "AOA-1");
assert.equal(result.record.canonical_student_id, "1");

console.log("student name matching tests passed");
