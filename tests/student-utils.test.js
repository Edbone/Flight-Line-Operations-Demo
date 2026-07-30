import assert from "node:assert/strict";
import { previewStudentCsv } from "../csv-import.js";
import {
  calculateTotals,
  compareGroups,
  getStudentFlags,
  groupPriority,
  normalizeAvailability,
  normalizeStudent
} from "../student-utils.js";

const student = normalizeStudent({
  studentName: "Test Student",
  activeStatus: "Yes",
  trainingType: "Part 141",
  assignedCFI: "",
  mondayAvailability: "1",
  tuesdayAvailability: "Float",
  wednesdayAvailability: "0.5",
  thursdayAvailability: "",
  fridayAvailability: "1",
  saturdayAvailability: "1",
  sundayAvailability: "0",
  attendanceRate: "76%",
  sessionsPerWeekAttended: "1",
  lastUpdated: "06/01/26",
  notes: "Missing document"
});

assert.equal(normalizeAvailability("float"), "Float");
assert.equal(normalizeAvailability(" 0.5 "), "0.5");
assert.deepEqual(calculateTotals(student), { weekdayTotal: 2.5, weekendTotal: 1, weeklyTotal: 3.5 });

const flags = getStudentFlags(student, new Date("2026-06-10T12:00:00"));
assert.ok(flags.some((flag) => flag.type === "attendance80"));
assert.ok(flags.some((flag) => flag.type === "missingCfi"));
assert.ok(flags.some((flag) => flag.type === "stale"));
assert.ok(flags.some((flag) => flag.type === "note-missing"));

const preview = previewStudentCsv(`Student Name,Active,Part,Mon,Tue,Attendance,Last Updated,CFI,Notes
CSV Student,YES,141,1,Float,0.82,6/8/26,Instructor One,academic warning`);
assert.equal(preview.totalRows, 1);
assert.equal(preview.errors.length, 0);
assert.equal(preview.records[0].student.trainingType, "Part 141");
assert.equal(preview.records[0].student.attendanceRate, 82);
assert.equal(preview.records[0].student.lastUpdated, "2026-06-08");

const korlShape = previewStudentCsv(`Student,Active,Group,141 / 61,Prof PIC,Curriculum,Current Course,Aircraft,CFI ,,,Monday,Tuesday,Wednesday,Thursday,Friday,Total,Saturday,Sunday,Total ,Attendance Rate,Sessions Per Week Attended,Scheduled by,Last Updated,Time Off,Notes,Tuitiion Dispursement Schedule
,,,,,,,,,On Forms?,Student Available Weekends?,4/13,4/14,4/15,4/16,4/17,,4/18,04/19,,,,Initials,Date ,,
KORL Fake,Yes,3,141,yes,VPP + CCP + MAP,PAR,C172,Instructor Example,,,0,1,1,1,1,4,1,0,5,93.8,5.1,ESP,6/8/26,,No call no show,"8/15/25 - $26,839.  11/15/25 - $26,839. ALL SALLIE MAE"
,,,,,,,,,,,0,0,0,0,0,0,0,0,0,,,,,,,
,,,,,,,,Total hour Blocks:,,,,,,,,,,#VALUE!,,,,,,,`);
assert.equal(korlShape.totalRows, 1);
assert.equal(korlShape.errors.length, 0);
assert.equal(korlShape.records[0].student.group, "Group 3");
assert.equal(korlShape.records[0].student.trainingType, "Part 141");
assert.equal(korlShape.records[0].student.sessionsPerWeekAttended, 5.1);
assert.equal(korlShape.records[0].student.tuitionDisbursementSchedule, undefined);
assert.equal(korlShape.records[0].student.tuitionEntries, undefined);

assert.equal(normalizeStudent({ studentName: "Delta", group: "Delta Propel" }).group, "Group 1 / Delta");
assert.equal(groupPriority("Group 1"), 0);
assert.equal(groupPriority("Group 1 / Delta"), 0);
assert.equal(groupPriority("Delta Propel"), 0);
assert.equal(groupPriority("Group 3"), 1);
assert.deepEqual(
  ["Group 6", "Group 1 / Delta", "Group 3", "Part 61"].sort(compareGroups),
  ["Group 1 / Delta", "Group 3", "Group 6", "Part 61"]
);

console.log("student utility tests passed");
