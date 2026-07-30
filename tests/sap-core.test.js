import assert from "node:assert/strict";
import test from "node:test";
import {
  compareImport,
  evaluateMilestone,
  isSignatureCertificatePage,
  matchStudent,
  normalizeCourseName,
  normalizeMilestoneType,
  parseDateOnly,
  parseSapPages,
  preserveActualCompletion,
  requiredWrittenTests,
  stageCrossReference,
  writtenCrossReference
} from "../sap-core.mjs";

test("date and label normalization handles supported variations without inventing dates", () => {
  assert.equal(parseDateOnly("6/15/2026"), "2026-06-15");
  assert.equal(parseDateOnly("06-15-26"), "2026-06-15");
  assert.equal(parseDateOnly("2026-06-15"), "2026-06-15");
  assert.equal(parseDateOnly("June 15, 2026"), "2026-06-15");
  assert.equal(parseDateOnly("TBD"), null);
  assert.equal(parseDateOnly("To Be Discussed"), null);
  assert.equal(parseDateOnly(""), null);
  assert.equal(parseDateOnly("2/31/2027"), null);
  assert.equal(normalizeCourseName("CFII"), "Certified Flight Instructor - Instrument");
  assert.equal(normalizeCourseName("Commercial Pilot"), "Single Engine Commercial");
  assert.equal(normalizeCourseName("Single Engine Comm."), "Single Engine Commercial");
  assert.equal(normalizeCourseName("COMM"), "Single Engine Commercial");
  assert.equal(normalizeCourseName("PAR"), "Private Pilot Certificate");
  assert.equal(normalizeCourseName("PPL"), "Private Pilot Certificate");
  assert.equal(normalizeCourseName("IRA"), "Instrument Rating");
  assert.equal(normalizeCourseName("Instrument"), "Instrument Rating");
  assert.equal(normalizeCourseName("IFR"), "Instrument Rating");
  assert.equal(normalizeMilestoneType("Stage 1 Phase 2A"), "stage_check");
  assert.equal(normalizeMilestoneType("End-of-Course"), "end_of_course");
  assert.deepEqual(requiredWrittenTests("IRA & FII Written", "Instrument"), ["IRA", "FII"]);
});

test("signature certificate pages are excluded by multiple independent signals", () => {
  assert.equal(isSignatureCertificatePage("DOCUMENT COMPLETED BY ALL PARTIES\nSIGNER TIMESTAMP SIGNATURE\nRECIPIENT VERIFICATION\nEMAIL VERIFIED\nIP ADDRESS\nSigned with PandaDoc"), true);
  assert.equal(isSignatureCertificatePage("Satisfactory Academic Performance Matrix\nStudent: Test Student\nMilestones"), false);
});

test("coordinate parser tolerates spacing, annotated milestone headings, course aliases, en dashes, TBD, and blank cells", () => {
  const item = (str, x, y, width = str.length * 4) => ({ str, x, y, width });
  const pages = [{
    pageNumber: 1,
    extractionMethod: "native",
    text: "Satisfactory Academic Performance Matrix\nStudent:   Doe Jane Q\nEnrollment Date:  06-01-26\nCampus: KORL\nGraduation Date: 7/1/2027\nProgram: VPP\nCourse: Private-Pilot\nLength: 4 Months\nMilestones: Please discuss with your CFI",
    items: [
      item("Student:", 40, 700), item("Doe Jane Q", 120, 700), item("Enrollment Date:", 300, 700), item("06-01-26", 430, 700),
      item("Campus:", 40, 680), item("KORL", 120, 680), item("Graduation Date:", 300, 680), item("7/1/2027", 430, 680),
      item("Program", 40, 660), item("VPP", 120, 660), item("Course:", 40, 600), item("Private-Pilot", 120, 600), item("Length:", 300, 600), item("4 Months", 380, 600),
      item("Milestones: Please discuss with your CFI", 120, 580), item("Stage 1   Phase 2A", 120, 560), item("PAR Written", 240, 560), item("Checkride – Endorsement", 360, 560),
      item("6-15-2026", 140, 540), item("TBD", 260, 540)
    ]
  }, { pageNumber: 2, text: "DOCUMENT COMPLETED BY ALL PARTIES\nRECIPIENT VERIFICATION\nEMAIL VERIFIED\nIP ADDRESS\nSigned with PandaDoc", items: [] }];
  const parsed = parseSapPages(pages);
  assert.equal(parsed.studentName, "Doe Jane Q");
  assert.equal(parsed.enrollmentDate, "2026-06-01");
  assert.equal(parsed.courses[0].name, "Private Pilot Certificate");
  assert.equal(parsed.milestones[0].projectedDate, "2026-06-15");
  assert.equal(parsed.milestones[1].dateStatus, "tbd");
  assert.equal(parsed.milestones[2].dateStatus, "blank");
  assert.deepEqual(parsed.ignoredPages, [2]);
});

test("student matching supports order and middle-name variations but blocks ambiguity and enrollment conflict", () => {
  const students = [
    { id: "a", studentName: "Austin Maxwell Pickert", enrollmentDate: "2026-06-15" },
    { id: "b", studentName: "Max Pickert", enrollmentDate: "2026-06-15" }
  ];
  const reordered = matchStudent({ studentName: "Maxwell Austin Pickert", enrollmentDate: "2026-06-15" }, students);
  assert.equal(reordered.proposedStudentId, "a");
  assert.equal(reordered.confidence, "high");
  const ambiguous = matchStudent({ studentName: "Jane Q Smith" }, [{ id: "1", studentName: "Jane A Smith" }, { id: "2", studentName: "Jane B Smith" }]);
  assert.equal(ambiguous.requiresManualSelection, true);
  assert.equal(ambiguous.proposedStudentId, null);
  const conflict = matchStudent({ studentName: "Austin Maxwell Pickert", enrollmentDate: "2026-07-01" }, students);
  assert.equal(conflict.requiresManualSelection, true);
  assert.equal(conflict.bestCandidate.enrollmentConflict, true);
  const none = matchStudent({ studentName: "Nobody Here" }, students);
  assert.equal(none.confidence, "none");
});

test("practice scores never become an actual FAA written pass and combined tests remain partial", () => {
  const student = { id: "s", studentName: "Test Student" };
  const milestone = { rawLabel: "IRA and FII Written", course: "Instrument Rating", requiredWrittenTests: ["IRA", "FII"], projectedDate: "2026-07-20", normalizedType: "written_test" };
  const attempts = [
    { student: "Test Student", test: "IRA", score: 94, takenAt: "2026-07-01" },
    { student: "Test Student", test: "IRA", score: 95, takenAt: "2026-07-02" },
    { student: "Test Student", test: "IRA", score: 96, takenAt: "2026-07-03" },
    { student: "Test Student", test: "IRA", score: 80, takenAt: "2026-07-04", passed: true, recordType: "actual_written" },
    { student: "Test Student", test: "FII", score: 88, takenAt: "2026-07-04" }
  ];
  const results = writtenCrossReference(milestone, student, attempts, []);
  assert.equal(results[0].status, "passed");
  assert.equal(results[0].practice.ready, true);
  assert.equal(results[1].status, "no_record");
  assert.equal(results[1].practice.ready, false);
  const evaluated = evaluateMilestone(milestone, { student, writtenAttempts: attempts }, new Date("2026-07-15T12:00:00"));
  assert.equal(evaluated.completionStatus, "incomplete");
  assert.ok(evaluated.warnings.some((warning) => warning.includes("partially complete")));
});

test("written and practice cross-reference covers failed, scheduled, missing, readiness, and trends", () => {
  const student = { studentName: "Practice Pilot" };
  const milestone = { rawLabel: "PAR Written", course: "Private", requiredWrittenTests: ["PAR"] };
  const failed = writtenCrossReference(milestone, student, [{ student: "Practice Pilot", test: "PPL", score: 75, result: "failed", passed: false, takenAt: "2026-01-01" }], []);
  assert.equal(failed[0].status, "not_passed");
  assert.equal(failed[0].practice.highestScore, 75);
  const scheduled = writtenCrossReference(milestone, student, [], [{ student: "Practice Pilot", test: "PAR", date: "2026-02-01" }]);
  assert.equal(scheduled[0].status, "scheduled");
  const improving = writtenCrossReference(milestone, student, [{ student: "Practice Pilot", test: "PAR", score: 70 }, { student: "Practice Pilot", test: "PAR", score: 85 }], []);
  assert.equal(improving[0].practice.trend, "improving");
});

test("stage and progress checks distinguish completed, scheduled, and unscheduled records", () => {
  const student = { studentName: "Stage Student" };
  const milestone = { course: "Instrument Rating", rawLabel: "Stage 3 Phase 6A" };
  assert.equal(stageCrossReference(milestone, student, []).status, "unscheduled");
  assert.equal(stageCrossReference(milestone, student, [{ student: "Stage Student", course: "IRA", checkType: "Stage 3 Phase 6A", scheduledAt: "2026-08-01" }]).status, "scheduled");
  const completed = stageCrossReference(milestone, student, [{ student: "Stage Student", course: "IRA", checkType: "Stage 3 Phase 6A", completedAt: "2026-08-02", result: "satisfactory" }]);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result, "satisfactory");
});

test("date-only alert logic assigns windows, overdue status, and readiness warnings", () => {
  const base = { course: "Private", rawLabel: "PAR Written", normalizedType: "written_test", requiredWrittenTests: ["PAR"], dateStatus: "projected" };
  assert.equal(evaluateMilestone({ ...base, projectedDate: "2026-07-14" }, { student: { studentName: "A B" } }, new Date("2026-07-15T23:50:00-04:00")).status, "overdue");
  assert.equal(evaluateMilestone({ ...base, projectedDate: "2026-07-15" }, { student: { studentName: "A B" } }, new Date("2026-07-15T23:50:00-04:00")).status, "due_today");
  assert.equal(evaluateMilestone({ ...base, projectedDate: "2026-07-22" }, { student: { studentName: "A B" } }, new Date("2026-07-15T12:00:00")).priority, "high");
  assert.equal(evaluateMilestone({ ...base, projectedDate: "2026-07-29" }, { student: { studentName: "A B" } }, new Date("2026-07-15T12:00:00")).priority, "medium");
  assert.equal(evaluateMilestone({ ...base, projectedDate: null, dateStatus: "tbd" }, { student: { studentName: "A B" } }).status, "tbd");
});

test("updated imports report changes without duplicating unchanged milestones", () => {
  const existing = [{ course: "Private", originalLabel: "Written", projectedDate: "2026-08-01", actualCompletionDate: "2026-07-20" }, { course: "Private", rawLabel: "Stage 1", projectedDate: "2026-07-01" }];
  const updated = [{ course: "Private", rawLabel: "Written", projectedDate: "2026-08-10" }, { course: "Private", rawLabel: "Stage 1", projectedDate: "2026-07-01" }, { course: "Private", rawLabel: "Stage 2", projectedDate: "2026-09-01" }];
  const comparison = compareImport(existing, updated);
  assert.equal(comparison.changed.length, 1);
  assert.equal(comparison.unchanged.length, 1);
  assert.equal(comparison.added.length, 1);
  assert.equal(comparison.changed[0].previous.actualCompletionDate, "2026-07-20");
});

test("projected SAP updates never overwrite actual completion results or instructor notes", () => {
  const merged = preserveActualCompletion({ actualCompletionDate: "2026-07-01", completionStatus: "completed", manuallyCompleted: true, completedAt: "2026-07-01T15:00:00.000Z", completedBy: { name: "Instructor A" }, completionHistory: [{ action: "completed" }], actualResult: "satisfactory", instructorNotes: "Passed with Instructor A" }, { projectedDate: "2026-08-15", actualCompletionDate: null, completionStatus: "incomplete", actualResult: null, instructorNotes: null });
  assert.equal(merged.projectedDate, "2026-08-15");
  assert.equal(merged.actualCompletionDate, "2026-07-01");
  assert.equal(merged.completionStatus, "completed");
  assert.equal(merged.manuallyCompleted, true);
  assert.equal(merged.completedBy.name, "Instructor A");
  assert.equal(merged.completionHistory.length, 1);
  assert.equal(merged.actualResult, "satisfactory");
  assert.equal(merged.instructorNotes, "Passed with Instructor A");
});
