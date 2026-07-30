export const STUDENT_STORAGE_KEY = "aoa-korl-students-v1";
export const STUDENT_COLLECTION = "korl-students";
export const AUDIT_STORAGE_KEY = "aoa-korl-student-audit-v1";
export const AUDIT_COLLECTION = "korl-student-audit";

export const DAY_FIELDS = [
  ["mondayAvailability", "Mon"],
  ["tuesdayAvailability", "Tue"],
  ["wednesdayAvailability", "Wed"],
  ["thursdayAvailability", "Thu"],
  ["fridayAvailability", "Fri"],
  ["saturdayAvailability", "Sat"],
  ["sundayAvailability", "Sun"]
];

export const WEEKDAY_FIELDS = DAY_FIELDS.slice(0, 5).map(([field]) => field);
export const WEEKEND_FIELDS = DAY_FIELDS.slice(5).map(([field]) => field);
export const WARNING_TERMS = [
  "academic warning",
  "no call no show",
  "dematriculated",
  "expired",
  "missing",
  "loa"
];

export const GROUP_PRIORITY_ORDER = [
  "Group 1 / Delta",
  "Group 3",
  "Group 4",
  "Group 5",
  "Group 6",
  "Group 7",
  "Part 61",
  "Pre Contract"
];

const DEFAULT_STUDENT = {
  studentName: "",
  photoUrl: "",
  activeStatus: "Yes",
  group: "",
  trainingType: "",
  profPicOnFile: "Unknown",
  curriculum: "",
  currentCourse: "",
  courseStartDate: "",
  enrollmentDate: "",
  projectedGraduationDate: "",
  program: "",
  campus: "",
  lastSapImportDate: "",
  spinTrainingRequired: "No",
  spinTrainingDueDate: "",
  spinTrainingTime: "",
  spinTrainingCompletedAt: "",
  spinTrainingCompletedBy: "",
  aircraft: "C172",
  assignedCFI: "",
  assignedInstructorId: "",
  onForms: "Unknown",
  includeOnAttendanceList: "Yes",
  studentAvailableWeekends: "Unknown",
  mondayAvailability: "",
  tuesdayAvailability: "",
  wednesdayAvailability: "",
  thursdayAvailability: "",
  fridayAvailability: "",
  saturdayAvailability: "",
  sundayAvailability: "",
  attendanceRate: "",
  sessionsPerWeekAttended: "",
  groupGroundAttended: "",
  attendance: null,
  myfboName: null,
  myfboStudentId: null,
  attendanceLastUpdated: null,
  scheduledByInitials: "",
  lastUpdated: "",
  updatedByUserId: "",
  updatedByName: "",
  updatedByInitials: "",
  timeOff: "",
  notes: ""
};

const DEFAULT_ATTENDANCE = {
  lastUpdated: null,
  completedFlights: 0,
  completedGrounds: 0,
  completedTotal: 0,
  avoidableCancellations: 0,
  studentSick: 0,
  studentRequestOrUnprepared: 0,
  weatherCancellations: 0,
  maintenanceCancellations: 0,
  unavoidableCancellations: 0,
  unrecognizedCancellationBlocks: 0,
  totalScheduled: 0,
  attendanceRate: 0,
  unmatchedEvents: 0,
  syncStatus: "never_synced",
  syncError: null
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

export function makeId(prefix = "stu") {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeYesNo(value, fallback = "Unknown") {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["yes", "y", "true", "1", "active"].includes(text)) return "Yes";
  if (["no", "n", "false", "0", "inactive", "not active"].includes(text)) return "No";
  if (["unknown", "unk", "?"].includes(text)) return "Unknown";
  return fallback;
}

export function normalizeTrainingType(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("141")) return "Part 141";
  if (text.includes("61")) return "Part 61";
  return String(value).trim();
}

export function normalizeAvailability(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^float$/i.test(raw)) return "Float";
  const numeric = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(numeric)) return String(numeric);
  return "";
}

export function availabilityToNumber(value) {
  const normalized = normalizeAvailability(value);
  if (!normalized || normalized === "Float") return 0;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function parsePercent(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const numeric = Number(text.replace("%", ""));
  if (!Number.isFinite(numeric)) return "";
  return numeric <= 1 && !text.includes("%") ? Math.round(numeric * 1000) / 10 : numeric;
}

export function parseDateInput(value) {
  const text = String(value ?? "").trim().replace(/\/{2,}/g, "/");
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysSince(value, now = new Date()) {
  const date = value ? new Date(`${value}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - date) / 86400000);
}

export function calculateTotals(student) {
  const weekdayTotal = WEEKDAY_FIELDS.reduce((sum, field) => sum + availabilityToNumber(student[field]), 0);
  const weekendTotal = WEEKEND_FIELDS.reduce((sum, field) => sum + availabilityToNumber(student[field]), 0);
  return {
    weekdayTotal: roundTotal(weekdayTotal),
    weekendTotal: roundTotal(weekendTotal),
    weeklyTotal: roundTotal(weekdayTotal + weekendTotal)
  };
}

function roundTotal(value) {
  return Math.round(value * 100) / 100;
}

export function normalizeStudent(input = {}) {
  const now = new Date().toISOString();
  const student = { ...DEFAULT_STUDENT, ...input };
  student.id = student.id || makeId();
  student.studentName = String(student.studentName ?? "").trim();
  student.photoUrl = String(student.photoUrl ?? "").trim();
  student.assignedInstructorId = String(student.assignedInstructorId ?? "").trim();
  student.activeStatus = normalizeYesNo(student.activeStatus, "Yes") === "No" ? "No" : "Yes";
  student.group = normalizeGroup(student.group);
  student.trainingType = normalizeTrainingType(student.trainingType);
  student.profPicOnFile = normalizeYesNo(student.profPicOnFile);
  student.onForms = normalizeYesNo(student.onForms);
  student.spinTrainingRequired = normalizeYesNo(student.spinTrainingRequired, "No") === "Yes" ? "Yes" : "No";
  student.includeOnAttendanceList = normalizeYesNo(student.includeOnAttendanceList, "Yes") === "No" ? "No" : "Yes";
  student.studentAvailableWeekends = normalizeYesNo(student.studentAvailableWeekends);
  student.courseStartDate = parseDateInput(student.courseStartDate);
  student.enrollmentDate = parseDateInput(student.enrollmentDate);
  student.projectedGraduationDate = parseDateInput(student.projectedGraduationDate);
  student.spinTrainingDueDate = parseDateInput(student.spinTrainingDueDate);
  student.spinTrainingTime = normalizeTimeInput(student.spinTrainingTime);
  student.spinTrainingCompletedAt = nullableString(student.spinTrainingCompletedAt) || "";
  student.spinTrainingCompletedBy = nullableString(student.spinTrainingCompletedBy) || "";
  DAY_FIELDS.forEach(([field]) => { student[field] = normalizeAvailability(student[field]); });
  student.attendanceRate = parsePercent(student.attendanceRate);
  student.sessionsPerWeekAttended = student.sessionsPerWeekAttended === "" ? "" : Number(student.sessionsPerWeekAttended);
  if (!Number.isFinite(student.sessionsPerWeekAttended)) student.sessionsPerWeekAttended = "";
  student.groupGroundAttended = student.groupGroundAttended === "" ? "" : Number(student.groupGroundAttended);
  if (!Number.isFinite(student.groupGroundAttended)) student.groupGroundAttended = "";
  student.attendance = normalizeAttendance(student.attendance);
  student.myfboName = nullableString(student.myfboName);
  student.myfboStudentId = nullableString(student.myfboStudentId);
  student.attendanceLastUpdated = nullableString(student.attendanceLastUpdated);
  student.lastUpdated = parseDateInput(student.lastUpdated);
  delete student.tuitionDisbursementSchedule;
  delete student.tuitionEntries;
  Object.assign(student, calculateTotals(student));
  student.createdAt = student.createdAt || now;
  student.updatedAt = student.updatedAt || now;
  return student;
}

export function normalizeAttendance(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const attendance = { ...DEFAULT_ATTENDANCE, ...source };
  [
    "completedFlights",
    "completedGrounds",
    "completedTotal",
    "avoidableCancellations",
    "studentSick",
    "studentRequestOrUnprepared",
    "weatherCancellations",
    "maintenanceCancellations",
    "unavoidableCancellations",
    "unrecognizedCancellationBlocks",
    "totalScheduled",
    "unmatchedEvents"
  ].forEach((field) => {
    const numeric = Number(attendance[field]);
    attendance[field] = Number.isFinite(numeric) ? numeric : 0;
  });
  const rate = Number(attendance.attendanceRate);
  attendance.attendanceRate = Number.isFinite(rate) ? rate : 0;
  attendance.lastUpdated = nullableString(attendance.lastUpdated);
  attendance.syncStatus = ["never_synced", "synced", "needs_review", "error"].includes(attendance.syncStatus) ? attendance.syncStatus : "never_synced";
  attendance.syncError = nullableString(attendance.syncError);
  return attendance;
}

function nullableString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeGroup(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^group\s*1\s*\/\s*delta$/i.test(text)) return "Group 1 / Delta";
  if (/^group\s*1$/i.test(text)) return "Group 1 / Delta";
  if (/^delta(?:\s*propel)?$/i.test(text)) return "Group 1 / Delta";
  if (/^\d+$/.test(text)) return `Group ${text}`;
  if (/^group\s*\d+$/i.test(text)) return text.replace(/^group/i, "Group").replace(/\s+/, " ");
  if (/^part\s*61$/i.test(text)) return "Part 61";
  if (/^pre\s*contract$/i.test(text) || /^precontract$/i.test(text)) return "Pre Contract";
  return text;
}

export function groupPriority(value) {
  const group = normalizeGroup(value);
  const index = GROUP_PRIORITY_ORDER.indexOf(group);
  if (index >= 0) return index;
  if (!group) return 998;
  return 500;
}

export function compareGroups(a, b) {
  const priority = groupPriority(a) - groupPriority(b);
  if (priority !== 0) return priority;
  const groupA = normalizeGroup(a);
  const groupB = normalizeGroup(b);
  const orderA = GROUP_PRIORITY_ORDER.indexOf(groupA);
  const orderB = GROUP_PRIORITY_ORDER.indexOf(groupB);
  if (orderA >= 0 && orderB >= 0 && orderA !== orderB) return orderA - orderB;
  return String(groupA || "zzz").localeCompare(String(groupB || "zzz"), undefined, { numeric: true, sensitivity: "base" });
}

export function validateStudent(student) {
  const errors = [];
  if (!String(student.studentName || "").trim()) errors.push("studentName is required");
  if (!["Yes", "No"].includes(student.activeStatus)) errors.push("activeStatus must be Yes or No");
  if (student.attendanceRate !== "" && (Number(student.attendanceRate) < 0 || Number(student.attendanceRate) > 100)) errors.push("attendanceRate must be 0-100");
  if (student.sessionsPerWeekAttended !== "" && !Number.isFinite(Number(student.sessionsPerWeekAttended))) errors.push("sessionsPerWeekAttended must be numeric");
  if (student.groupGroundAttended !== "" && !Number.isFinite(Number(student.groupGroundAttended))) errors.push("groupGroundAttended must be numeric");
  DAY_FIELDS.forEach(([field]) => {
    const normalized = normalizeAvailability(student[field]);
    if (String(student[field] ?? "").trim() && !normalized) errors.push(`${field} must be 0, 1, Float, or blank`);
  });
  if (student.lastUpdated && !parseDateInput(student.lastUpdated)) errors.push("lastUpdated must be a valid date");
  if (student.courseStartDate && !parseDateInput(student.courseStartDate)) errors.push("courseStartDate must be a valid date");
  if (student.enrollmentDate && !parseDateInput(student.enrollmentDate)) errors.push("enrollmentDate must be a valid date");
  if (student.projectedGraduationDate && !parseDateInput(student.projectedGraduationDate)) errors.push("projectedGraduationDate must be a valid date");
  if (student.spinTrainingDueDate && !parseDateInput(student.spinTrainingDueDate)) errors.push("spinTrainingDueDate must be a valid date");
  if (student.spinTrainingTime && !normalizeTimeInput(student.spinTrainingTime)) errors.push("spinTrainingTime must be a valid time");
  return errors;
}

function normalizeTimeInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  const amPmMatch = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (amPmMatch) {
    let hours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2] || 0);
    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (/pm/i.test(amPmMatch[3]) && hours !== 12) hours += 12;
      if (/am/i.test(amPmMatch[3]) && hours === 12) hours = 0;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return "";
}

export function getStudentFlags(student, now = new Date()) {
  const flags = [];
  const active = student.activeStatus === "Yes";
  const attendance = Number(student.attendanceRate);
  const weeklyTotal = Number(student.weeklyTotal || calculateTotals(student).weeklyTotal);
  const sessions = Number(student.sessionsPerWeekAttended);
  const staleDays = daysSince(student.lastUpdated, now);
  const notesText = `${student.notes || ""} ${student.timeOff || ""}`.toLowerCase();

  if (Number.isFinite(attendance) && attendance < 70) flags.push({ type: "attendance70", label: "Attendance below 70%", severity: "high" });
  else if (Number.isFinite(attendance) && attendance < 80) flags.push({ type: "attendance80", label: "Attendance below 80%", severity: "medium" });
  if (active && !String(student.assignedCFI || "").trim()) flags.push({ type: "missingCfi", label: "Missing CFI", severity: "high" });
  if (active && (!String(student.photoUrl || "").trim() || student.profPicOnFile === "No")) flags.push({ type: "missingPhoto", label: "Missing profile photo", severity: "medium" });
  if (active && staleDays !== null && staleDays > 7) flags.push({ type: "stale", label: `Updated ${staleDays} days ago`, severity: "medium" });
  if (active && Number.isFinite(sessions) && sessions < expectedMinimum(student)) flags.push({ type: "belowMinimum", label: "Below weekly target", severity: "medium" });
  if (String(student.timeOff || "").trim()) flags.push({ type: "timeOff", label: "Time off", severity: "info" });
  WARNING_TERMS.forEach((term) => {
    if (notesText.includes(term)) flags.push({ type: `note-${term.replace(/\s+/g, "-")}`, label: titleCase(term), severity: term === "loa" ? "medium" : "high" });
  });
  if (flags.length === 0 && student.notes) flags.push({ type: "review", label: "Manual review", severity: "info" });
  return flags;
}

export function expectedMinimum(student) {
  if (student.activeStatus !== "Yes") return 0;
  if (student.trainingType === "Part 141") return 3;
  if (student.trainingType === "Part 61") return 2;
  return 2;
}

export function titleCase(value) {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getDashboardStats(students, now = new Date()) {
  const active = students.filter((student) => student.activeStatus === "Yes");
  const inactive = students.filter((student) => student.activeStatus === "No");
  const flagged = students.map((student) => ({ student, flags: getStudentFlags(student, now) }));
  return {
    activeCount: active.length,
    inactiveCount: inactive.length,
    byGroup: countBy(students, "group"),
    byTrainingType: countBy(students, "trainingType"),
    belowAttendance: flagged.filter(({ flags }) => flags.some((flag) => ["attendance70", "attendance80"].includes(flag.type))).length,
    missingCfi: flagged.filter(({ flags }) => flags.some((flag) => flag.type === "missingCfi")).length,
    missingProfilePhotos: flagged.filter(({ flags }) => flags.some((flag) => flag.type === "missingPhoto")).length,
    timeOff: flagged.filter(({ flags }) => flags.some((flag) => flag.type === "timeOff")).length,
    importantNotes: flagged.filter(({ flags }) => flags.some((flag) => flag.type.startsWith("note-"))).length
  };
}

export function countBy(records, key) {
  return records.reduce((acc, record) => {
    const value = String(record[key] || "Blank").trim() || "Blank";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
