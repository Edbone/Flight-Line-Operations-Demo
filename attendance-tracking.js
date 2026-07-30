import {
  subscribeFirestoreCollection,
  subscribeFirestoreDocument,
  subscribeCollectionData,
  loadFirestoreCollection,
  loadFirestoreDocument,
  loadCollectionData
} from "./firebase.js";
import { loadStudents } from "./student-data.js";
import { groundAttendanceCountForStudent, groundAttendanceCounts } from "./ground-attendance-utils.js";
import { normalizeAttendanceName, verifiedTrainerAttendanceCounts, verifiedTrainerSessionCount } from "./trainer-attendance-utils.js";

const GROUND_ATTENDANCE_STORAGE_KEY = "aoa-ground-attendance-v1";
const GROUND_ATTENDANCE_COLLECTION = "ground_attendance";
const TRAINER_BOOKINGS_STORAGE_KEY = "aoa-ground-trainer-bookings-v2";
const TRAINER_BOOKINGS_COLLECTION = "trainer-bookings";

const appConfig = {
  attendanceTracking: true
};

const state = {
  records: [],
  meta: null,
  groundAttendance: [],
  groundAttendanceCounts: groundAttendanceCounts(),
  trainerBookings: [],
  trainerAttendanceByStudentId: new Map(),
  trainerAttendanceByName: new Map(),
  rosterStudents: [],
  rosterById: new Map(),
  rosterByName: new Map(),
  loading: true,
  loadError: null,
  sort: { key: "attendanceRate", direction: "asc" }
};

const elements = {
  banner: document.querySelector("#attendance-update-banner"),
  search: document.querySelector("#attendance-search"),
  warningFilter: document.querySelector("#attendance-warning-filter"),
  resultCount: document.querySelector("#attendance-result-count"),
  loading: document.querySelector("#attendance-loading-state"),
  error: document.querySelector("#attendance-error-state"),
  errorMessage: document.querySelector("#attendance-error-message"),
  tableBody: document.querySelector("#attendance-table-body"),
  empty: document.querySelector("#attendance-empty-state"),
  goodCount: document.querySelector("#attendance-good-count"),
  cautionCount: document.querySelector("#attendance-caution-count"),
  attentionCount: document.querySelector("#attendance-attention-count"),
  errorCount: document.querySelector("#attendance-error-count")
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function metric(record, key) {
  if (key === "attendanceRate") return adjustedAttendanceRate(record);
  if (key === "extraCurricularCount") return adjustedExtraCurricularCount(record);
  const value = record?.metrics?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rawMetric(record, key) {
  const value = record?.metrics?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function adjustedExtraCurricularCount(record) {
  return Math.max(rawMetric(record, "extraCurricularCount"), groundSchoolCount(record)) + trainerSessionCount(record);
}

function adjustedAttendanceRate(record) {
  const totalScheduled = rawMetric(record, "totalScheduled");
  if (!totalScheduled) return 0;
  const attended = rawMetric(record, "completedTotal") + adjustedExtraCurricularCount(record);
  return Math.min(100, Math.round((attended / totalScheduled) * 1000) / 10);
}

function groundSchoolCount(record) {
  const student = rosterStudentForRecord(record) || { studentName: record?.studentName, studentId: record?.studentId, id: record?.id };
  return groundAttendanceCountForStudent(student, state.groundAttendanceCounts);
}

function trainerSessionCount(record) {
  const student = rosterStudentForRecord(record);
  return verifiedTrainerSessionCount(record, student, {
    byStudentId: state.trainerAttendanceByStudentId,
    byName: state.trainerAttendanceByName
  });
}

function supplementalAttendanceCount(record) {
  return groundSchoolCount(record) + trainerSessionCount(record);
}

function normalizeFirstLastKey(value) {
  return normalizeAttendanceName(value);
}

function setRosterStudents(students) {
  state.rosterStudents = Array.isArray(students) ? students : [];
  state.rosterById = new Map();
  state.rosterByName = new Map();
  state.rosterStudents.forEach((student) => {
    [student.id, student.myfboStudentId, student.studentId].filter(Boolean).forEach((id) => {
      state.rosterById.set(String(id), student);
    });
    const nameKey = normalizeFirstLastKey(student.studentName);
    if (nameKey) state.rosterByName.set(nameKey, student);
  });
}

function rosterStudentForRecord(record) {
  const ids = [record?.studentId, record?.id].filter(Boolean).map(String);
  for (const id of ids) {
    const student = state.rosterById.get(id);
    if (student) return student;
  }
  return state.rosterByName.get(normalizeFirstLastKey(record?.studentName)) || null;
}

function attendanceListRecords() {
  return state.records.filter((record) => {
    const student = rosterStudentForRecord(record);
    return student?.activeStatus === "Yes" && student?.includeOnAttendanceList !== "No";
  });
}

function dateFromFirestore(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = dateFromFirestore(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)}%` : "No rate";
}

function warningLevel(record) {
  if (!isOk(record)) return "error";
  const rate = metric(record, "attendanceRate");
  if (rate < 80) return "attention";
  if (rate < 90) return "caution";
  return "good";
}

function warningLabel(level) {
  return {
    attention: "Needs attention",
    caution: "Caution",
    good: "Good",
    error: "Sync error"
  }[level] || "Unknown";
}

function isOk(record) {
  return String(record?.status || "").toLowerCase() === "ok" && !record?.error;
}

function recordText(record) {
  return [
    record.studentName,
    record.studentId,
    record.status,
    record.error,
    record.runId
  ].join(" ").toLowerCase();
}

function setGroundAttendance(records) {
  state.groundAttendance = Array.isArray(records) ? records : [];
  state.groundAttendanceCounts = groundAttendanceCounts(state.groundAttendance);
}

function setTrainerBookings(records) {
  state.trainerBookings = Array.isArray(records) ? records : [];
  const counts = verifiedTrainerAttendanceCounts(state.trainerBookings);
  state.trainerAttendanceByStudentId = counts.byStudentId;
  state.trainerAttendanceByName = counts.byName;
}

function sortValue(record, key) {
  if (key === "studentName") return String(record.studentName || "").toLowerCase();
  if (key === "attendanceRate") return metric(record, "attendanceRate");
  if (key === "completedTotal") return metric(record, "completedTotal");
  if (key === "avoidableCancellations") return metric(record, "avoidableCancellations");
  if (key === "weatherMaintenance") return metric(record, "weatherCancellations") + metric(record, "maintenanceCancellations");
  if (key === "excludedBlocks") return metric(record, "extraCurricularCount") + metric(record, "unrecognizedCancellationBlocks");
  if (key === "status") return `${isOk(record) ? "ok" : "error"} ${record.status || ""} ${record.error || ""}`.toLowerCase();
  if (key === "updatedAt") return dateFromFirestore(record.updatedAt)?.getTime() || dateFromFirestore(record.localUpdatedAt)?.getTime() || 0;
  return "";
}

function filteredRecords() {
  const term = elements.search.value.trim().toLowerCase();
  const warning = elements.warningFilter.value;
  const direction = state.sort.direction === "asc" ? 1 : -1;
  return attendanceListRecords()
    .filter((record) => !warning || warningLevel(record) === warning)
    .filter((record) => !term || recordText(record).includes(term))
    .sort((a, b) => {
      const aValue = sortValue(a, state.sort.key);
      const bValue = sortValue(b, state.sort.key);
      if (typeof aValue === "number" && typeof bValue === "number") return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
}

function renderBanner() {
  if (!elements.banner) return;
  if (!state.meta) {
    elements.banner.innerHTML = "<strong>Student attendance last ran --</strong><span>No attendanceMeta/current document was found yet.</span>";
    elements.banner.dataset.tone = "warn";
    return;
  }

  const updated = state.meta.localCreatedAt || state.meta.createdAt;
  const counts = [
    `${Number(state.meta.okStudents || 0)} ok`,
    `${Number(state.meta.errorStudents || 0)} errors`,
    `${Number(state.meta.totalStudents || 0)} total`
  ].join(" / ");
  elements.banner.innerHTML = `
    <strong>Student attendance last ran ${escapeHtml(formatDateTime(updated))}</strong>
    <span>${escapeHtml(counts)}${state.meta.window ? ` · Window ${escapeHtml(state.meta.window)}` : ""}${state.meta.cutoff ? ` · Cutoff ${escapeHtml(state.meta.cutoff)}` : ""}</span>
  `;
  elements.banner.dataset.tone = Number(state.meta.errorStudents || 0) > 0 ? "warn" : "ok";
}

function renderMetrics() {
  const counts = attendanceListRecords().reduce((totals, record) => {
    totals[warningLevel(record)] += 1;
    return totals;
  }, { good: 0, caution: 0, attention: 0, error: 0 });
  elements.goodCount.textContent = counts.good;
  elements.cautionCount.textContent = counts.caution;
  elements.attentionCount.textContent = counts.attention;
  elements.errorCount.textContent = counts.error;
}

function renderTable() {
  const records = filteredRecords();
  elements.tableBody.innerHTML = records.map((record) => {
    const level = warningLevel(record);
    const weatherMaintenance = metric(record, "weatherCancellations") + metric(record, "maintenanceCancellations");
    const excludedBlocks = metric(record, "extraCurricularCount") + metric(record, "unrecognizedCancellationBlocks");
    const status = record.status || (record.error ? "error" : "unknown");
    return `
      <tr class="attendance-row-${level}">
        <td><strong>${escapeHtml(record.studentName || "Unnamed student")}</strong><small>${escapeHtml(record.studentId || record.id || "")}</small></td>
        <td><span class="attendance-rate attendance-rate-${level}">${escapeHtml(formatPercent(metric(record, "attendanceRate")))}</span><small>${escapeHtml(warningLabel(level))} · ${supplementalAttendanceCount(record)} verified extra (${trainerSessionCount(record)} trainer)</small></td>
        <td><strong>${metric(record, "completedTotal")}</strong><small>${metric(record, "totalScheduled")} scheduled · ${adjustedExtraCurricularCount(record)} extra</small></td>
        <td><strong>${metric(record, "avoidableCancellations")}</strong><small>${metric(record, "studentSick")} sick · ${metric(record, "studentRequestOrUnprepared")} request/unprepared</small></td>
        <td><strong>${weatherMaintenance}</strong><small>${metric(record, "weatherCancellations")} weather · ${metric(record, "maintenanceCancellations")} maintenance</small></td>
        <td><strong>${excludedBlocks}</strong><small>${metric(record, "extraCurricularCount")} excluded · ${metric(record, "unrecognizedCancellationBlocks")} unrecognized</small></td>
        <td class="wrap-cell"><span class="status-badge status-${isOk(record) ? "on-time" : "delayed"}">${escapeHtml(status)}</span>${record.error ? `<small class="attendance-error-text">${escapeHtml(record.error)}</small>` : ""}</td>
        <td><time>${escapeHtml(formatDateTime(record.localUpdatedAt || record.updatedAt))}</time><small>${escapeHtml(record.runId || "")}</small></td>
      </tr>`;
  }).join("");

  elements.empty.hidden = records.length > 0 || state.loading || Boolean(state.loadError);
  elements.resultCount.textContent = `${records.length} of ${attendanceListRecords().length} roster students`;
}

function render() {
  elements.loading.hidden = !state.loading;
  elements.error.hidden = !state.loadError;
  elements.errorMessage.textContent = state.loadError || "";
  renderBanner();
  renderMetrics();
  renderTable();
}

function setLoadError(error) {
  state.loading = false;
  state.loadError = error?.message || String(error || "Unknown Firestore error");
  render();
}

async function start() {
  if (!appConfig.attendanceTracking) {
    state.loading = false;
    state.loadError = "Attendance tracking is disabled by app config.";
    render();
    return;
  }

  elements.search.addEventListener("input", render);
  elements.warningFilter.addEventListener("change", render);
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      state.sort = {
        key,
        direction: state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc"
      };
      render();
    });
  });

  try {
    const [records, meta, groundAttendance, trainerBookings, rosterStudents] = await Promise.all([
      loadFirestoreCollection("attendanceLatest"),
      loadFirestoreDocument("attendanceMeta", "current"),
      loadCollectionData(GROUND_ATTENDANCE_COLLECTION, GROUND_ATTENDANCE_STORAGE_KEY),
      loadCollectionData(TRAINER_BOOKINGS_COLLECTION, TRAINER_BOOKINGS_STORAGE_KEY),
      loadStudents()
    ]);
    state.records = records;
    state.meta = meta;
    setGroundAttendance(groundAttendance);
    setTrainerBookings(trainerBookings);
    setRosterStudents(rosterStudents);
    state.loading = false;
    state.loadError = null;
    render();
  } catch (error) {
    setLoadError(error);
  }

  subscribeFirestoreCollection("attendanceLatest", (records) => {
    state.records = records;
    state.loading = false;
    state.loadError = null;
    render();
  }, setLoadError);

  subscribeFirestoreDocument("attendanceMeta", "current", (meta) => {
    state.meta = meta;
    render();
  }, setLoadError);

  subscribeCollectionData(GROUND_ATTENDANCE_COLLECTION, (records) => {
    setGroundAttendance(records);
    render();
  }, (error) => {
    console.warn("Ground school attendance could not be applied to attendance rates", error);
  });

  subscribeCollectionData(TRAINER_BOOKINGS_COLLECTION, (records) => {
    setTrainerBookings(records);
    render();
  }, (error) => {
    console.warn("Ground trainer check-ins could not be applied to attendance rates", error);
  });
}

start();
