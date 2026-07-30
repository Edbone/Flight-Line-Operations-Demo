import { DAY_FIELDS, csvEscape, normalizeStudent, normalizeYesNo, parseDateInput, parsePercent } from "./student-utils.js";

const FIELD_ALIASES = {
  studentName: ["student name", "student", "name"],
  activeStatus: ["active", "active status", "status"],
  group: ["group", "cohort"],
  trainingType: ["training type", "part", "141/61", "141 / 61", "part 141/61"],
  profPicOnFile: ["prof pic", "profile pic", "profile picture", "prof pic on file"],
  curriculum: ["curriculum", "program"],
  currentCourse: ["course", "current course"],
  courseStartDate: ["course start", "course start date", "start date", "attendance start date", "attendance cutoff date"],
  spinTrainingRequired: ["spin training required", "needs spin training", "spin required", "spin training checkbox"],
  spinTrainingDueDate: ["spin training due", "spin training due date", "spin due", "spin due date", "spin training"],
  spinTrainingTime: ["spin training time", "spin time", "spin event time"],
  spinTrainingCompletedAt: ["spin training completed", "spin training completed at", "spin completed", "spin completed date"],
  spinTrainingCompletedBy: ["spin training completed by", "spin completed by"],
  aircraft: ["aircraft", "ac"],
  assignedCFI: ["assigned cfi", "cfi", "instructor"],
  onForms: ["on forms", "forms"],
  includeOnAttendanceList: ["attendance list", "include on attendance list", "include attendance", "track attendance", "attendance tracking"],
  studentAvailableWeekends: ["weekends", "student available weekends", "available weekends"],
  mondayAvailability: ["monday", "mon", "monday availability"],
  tuesdayAvailability: ["tuesday", "tue", "tuesday availability"],
  wednesdayAvailability: ["wednesday", "wed", "wednesday availability"],
  thursdayAvailability: ["thursday", "thu", "thursday availability"],
  fridayAvailability: ["friday", "fri", "friday availability"],
  saturdayAvailability: ["saturday", "sat", "saturday availability"],
  sundayAvailability: ["sunday", "sun", "sunday availability"],
  attendanceRate: ["attendance", "attendance rate", "% attendance"],
  sessionsPerWeekAttended: ["sessions per week", "sessions attended", "sessions/week", "sessions per week attended"],
  groupGroundAttended: ["group ground attended", "ground attended", "ground attendance", "ground sessions attended"],
  scheduledByInitials: ["scheduled by", "initials", "scheduled by initials"],
  lastUpdated: ["last updated", "updated", "date updated"],
  timeOff: ["time off", "pto", "leave"],
  notes: ["notes", "note"]
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

export function previewStudentCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { totalRows: 0, records: [], errors: ["No CSV rows detected."], missingNames: [], unmappedHeaders: [], mappedFields: [] };
  const headerInfo = getHeaderInfo(rows);
  const headers = headerInfo.headers;
  const mapping = mapHeaders(headers);
  const records = [];
  const errors = [];
  const missingNames = [];
  const unmappedHeaders = headers.filter((header, index) => header && !mapping[index]);

  rows.slice(headerInfo.dataStartIndex).forEach((row, rowIndex) => {
    const raw = {};
    row.forEach((value, index) => {
      const field = mapping[index];
      if (field) raw[field] = coerceValue(field, value);
    });
    if (isSpacerRow(raw)) return;
    const normalized = normalizeStudent(raw);
    if (!normalized.studentName) missingNames.push(rowIndex + headerInfo.dataStartIndex + 1);
    const rowErrors = normalized.studentName ? [] : ["Missing student name"];
    if (rowErrors.length) errors.push(`Row ${rowIndex + headerInfo.dataStartIndex + 1}: ${rowErrors.join(", ")}`);
    records.push({ rowNumber: rowIndex + headerInfo.dataStartIndex + 1, student: normalized, errors: rowErrors });
  });

  return {
    totalRows: records.length,
    records,
    errors,
    missingNames,
    unmappedHeaders,
    mappedFields: [...new Set(Object.values(mapping))]
  };
}

function isSpacerRow(raw) {
  if (String(raw.studentName || "").trim()) return false;
  const meaningfulFields = [
    "activeStatus",
    "group",
    "trainingType",
    "curriculum",
    "currentCourse",
    "notes"
  ];
  return meaningfulFields.every((field) => !String(raw[field] || "").trim());
}

function getHeaderInfo(rows) {
  const first = rows[0] || [];
  const second = rows[1] || [];
  const hasSecondHeader = !String(second[0] || "").trim()
    && second.some((value) => /on forms|weekends|initials|date/i.test(String(value || "")));
  if (!hasSecondHeader) {
    return { headers: first.map((header) => normalizeHeader(header)), dataStartIndex: 1 };
  }
  return {
    headers: first.map((header, index) => normalizeHeader(header || second[index] || "")),
    dataStartIndex: 2
  };
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[?]+$/g, "")
    .replace(/\s+/g, " ");
}

function mapHeaders(headers) {
  return headers.reduce((acc, header, index) => {
    const match = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(header));
    if (match) acc[index] = match[0];
    return acc;
  }, {});
}

function coerceValue(field, value) {
  if (["activeStatus", "profPicOnFile", "onForms", "spinTrainingRequired", "includeOnAttendanceList", "studentAvailableWeekends"].includes(field)) {
    const text = String(value ?? "").trim();
    return text ? normalizeYesNo(text, "") : "";
  }
  if (field === "attendanceRate") return parsePercent(value);
  if (["lastUpdated", "courseStartDate", "spinTrainingDueDate"].includes(field)) return parseDateInput(value);
  if (field === "trainingType") {
    const text = String(value ?? "").trim();
    if (text === "141") return "Part 141";
    if (text === "61") return "Part 61";
  }
  return String(value ?? "").trim();
}

export function studentsToCsv(students) {
  const fields = [
    "studentName", "activeStatus", "group", "trainingType", "profPicOnFile", "curriculum", "currentCourse", "courseStartDate", "spinTrainingRequired", "spinTrainingDueDate", "spinTrainingTime", "spinTrainingCompletedAt", "spinTrainingCompletedBy", "aircraft",
    "assignedCFI", "onForms", "includeOnAttendanceList", "studentAvailableWeekends", ...DAY_FIELDS.map(([field]) => field),
    "weekdayTotal", "weekendTotal", "weeklyTotal", "attendanceRate", "sessionsPerWeekAttended", "groupGroundAttended", "scheduledByInitials",
    "lastUpdated", "timeOff", "notes"
  ];
  return [
    fields.map(csvEscape).join(","),
    ...students.map((student) => fields.map((field) => csvEscape(student[field])).join(","))
  ].join("\n");
}
