import { cacheLocalData, loadCollectionData, saveCollectionData } from "./firebase.js";
import { getStudentDirectory, populateStudentSelect, splitStudentName as splitDirectoryStudentName } from "./student-directory.js";
import { canonicalAttendanceFields, canonicalizeAttendanceRecord } from "./student-name-matching.js";

const SESSION_STORAGE_KEY = "aoa-ground-sessions-v1";
const ATTENDANCE_STORAGE_KEY = "aoa-ground-attendance-v1";
const SESSION_COLLECTION = "ground_sessions";
const ATTENDANCE_COLLECTION = "ground_attendance";
const DAILY_TEMPLATES = [
  { id: "prog-check", topic: "Prog Check", course_type: "Other", start_time: "08:00", end_time: "10:00" },
  { id: "written-prep", topic: "Written Prep", course_type: "Written Test Prep", start_time: "10:00", end_time: "12:00" },
  { id: "instrument", topic: "Instrument", course_type: "Instrument", start_time: "12:00", end_time: "14:00" },
  { id: "private", topic: "Private", course_type: "Private", start_time: "14:00", end_time: "16:00" },
  { id: "commercial", topic: "Commercial", course_type: "Commercial", start_time: "16:00", end_time: "18:00" }
];

const studentSearch = document.querySelector("#ground-student-search");
const studentFilter = document.querySelector("#ground-student-filter");
const importPanel = document.querySelector("#ground-import-panel");
const importText = document.querySelector("#ground-csv-text");
const importFile = document.querySelector("#ground-csv-file");
const addDialog = document.querySelector("#ground-add-dialog");
const addForm = document.querySelector("#ground-add-form");
const studentProfileSelect = document.querySelector("#ground-student-profile-select");
const recordDialog = document.querySelector("#ground-record-dialog");
const recordForm = document.querySelector("#ground-record-form");
const nameMatchDialog = document.querySelector("#ground-name-match-dialog");
const nameMatchForm = document.querySelector("#ground-name-match-form");
const nameMatchSelect = document.querySelector("#ground-name-match-select");

let sessions = [];
let attendance = [];
let importPreview = [];
let studentDirectory = [];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function id() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return raw;
}

function normalizeSession(session = {}) {
  const template = DAILY_TEMPLATES.find((item) => item.id === session.template_id)
    || DAILY_TEMPLATES.find((item) => String(item.topic).toLowerCase() === String(session.topic || "").trim().toLowerCase());
  return {
    id: String(session.id || id()),
    date: normalizeDateKey(session.date || todayKey()),
    start_time: String(session.start_time || template?.start_time || ""),
    end_time: String(session.end_time || template?.end_time || ""),
    topic: String(session.topic || template?.topic || "").trim(),
    course_type: String(session.course_type || template?.course_type || "Other").trim(),
    instructor: String(session.instructor || "").trim(),
    notes: String(session.notes || "").trim(),
    created_at: session.created_at || session.createdAt || new Date().toISOString()
  };
}

function normalizeAttendance(record = {}) {
  const fullName = String(record["Student Name"] || record.student_name || "").trim();
  const splitName = fullName.split(/\s+/);
  return {
    id: String(record.id || id()),
    session_id: String(record.session_id || ""),
    canonical_student_id: String(record.canonical_student_id || "").trim(),
    student_first_name: String(record.student_first_name || splitName.slice(0, -1).join(" ") || splitName[0] || "").trim(),
    student_last_name: String(record.student_last_name || splitName.slice(-1)[0] || "").trim(),
    student_email_or_id: String(record.student_email_or_id || "").trim(),
    status: "Attended",
    check_in_time: record.check_in_time || record.checkInTime || "",
    notes: String(record.notes || "").trim(),
    created_at: record.created_at || record.createdAt || new Date().toISOString()
  };
}

async function loadData() {
  const [loadedSessions, loadedAttendance] = await Promise.all([
    loadCollectionData(SESSION_COLLECTION, SESSION_STORAGE_KEY),
    loadCollectionData(ATTENDANCE_COLLECTION, ATTENDANCE_STORAGE_KEY)
  ]);
  sessions = Array.isArray(loadedSessions) ? loadedSessions.map(normalizeSession) : [];
  attendance = Array.isArray(loadedAttendance) ? loadedAttendance.map(normalizeAttendance) : [];
  await saveAll();
}

async function saveSessions(options = {}) {
  sessions = sessions.map(normalizeSession);
  cacheLocalData(SESSION_STORAGE_KEY, sessions);
  sessions = await saveCollectionData(SESSION_COLLECTION, sessions, options);
  cacheLocalData(SESSION_STORAGE_KEY, sessions);
}

async function saveAttendance(options = {}) {
  attendance = attendance.map(normalizeAttendance);
  cacheLocalData(ATTENDANCE_STORAGE_KEY, attendance);
  attendance = await saveCollectionData(ATTENDANCE_COLLECTION, attendance, options);
  cacheLocalData(ATTENDANCE_STORAGE_KEY, attendance);
}

async function saveAll() {
  await Promise.all([saveSessions(), saveAttendance()]);
}

function sessionDateTime(session) {
  return new Date(`${session.date}T${session.start_time || "00:00"}`);
}

function formatSessionDate(session) {
  const date = sessionDateTime(session);
  if (Number.isNaN(date.getTime())) return session.date;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimeRange(session) {
  const start = formatTime(session.start_time);
  const end = formatTime(session.end_time);
  return [start, end].filter(Boolean).join(" - ");
}

function formatTime(value) {
  if (!value) return "";
  const parsed = new Date(`2026-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "Manual record";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function checkinPagePath() {
  const path = window.location.pathname;
  if (path.endsWith("/ground-attendance.html")) return path.replace(/ground-attendance\.html$/, "ground-attendance-checkin.html");
  if (path.endsWith("/ground-attendance")) return path.replace(/ground-attendance$/, "ground-attendance-checkin.html");
  return "/ground-attendance-checkin.html";
}

function dailyCheckinUrl(templateId) {
  return `${window.location.origin}${checkinPagePath()}?daily=${encodeURIComponent(templateId)}`;
}

function qrImageUrl(url) {
  const label = `DEMO CHECK-IN\\n${new URL(url).searchParams.get("daily") || "SESSION"}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="100%" height="100%" fill="white"/><rect x="22" y="22" width="276" height="276" rx="20" fill="#eef3fb" stroke="#173c78" stroke-width="8"/><text x="160" y="145" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#173c78">PORTFOLIO DEMO</text><text x="160" y="182" text-anchor="middle" font-family="Arial" font-size="18" fill="#173c78">${label.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function setMessage(elementId, message, tone = "info") {
  const element = document.querySelector(elementId);
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function sessionForRecord(record) {
  return sessions.find((session) => session.id === record.session_id) || null;
}

function studentKey(record) {
  const name = `${record.student_first_name} ${record.student_last_name}`.trim().toLowerCase().replace(/\s+/g, " ");
  const canonicalId = String(record.canonical_student_id || "").trim().toLowerCase();
  const idOrEmail = String(record.student_email_or_id || "").trim().toLowerCase();
  return canonicalId || idOrEmail || name;
}

function hasDuplicate(record, ignoreId = "") {
  return attendance.some((existing) => (
    existing.session_id === record.session_id &&
    existing.id !== ignoreId &&
    studentKey(existing) === studentKey(record)
  ));
}

function canonicalizeRecord(record) {
  return canonicalizeAttendanceRecord(record, studentDirectory).record;
}

async function reconcileAttendanceNames() {
  let changed = false;
  attendance = attendance.map((record) => {
    const result = canonicalizeAttendanceRecord(record, studentDirectory);
    changed ||= result.changed;
    return result.record;
  });
  if (changed) await saveAttendance();
  return changed;
}

function findTemplateBySession(session) {
  return DAILY_TEMPLATES.find((template) => (
    template.start_time === session.start_time &&
    template.end_time === session.end_time &&
    template.topic.toLowerCase() === String(session.topic || "").trim().toLowerCase()
  )) || DAILY_TEMPLATES.find((template) => template.topic.toLowerCase() === String(session.topic || "").trim().toLowerCase());
}

function findSessionByDateTemplate(date, templateId) {
  const template = DAILY_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  return sessions.find((session) => (
    session.id === `daily-${template.id}-${date}` ||
    (
      session.date === date &&
      session.start_time === template.start_time &&
      session.end_time === template.end_time &&
      session.topic.trim().toLowerCase() === template.topic.toLowerCase()
    )
  )) || null;
}

function findSessionByDateTopic(date, topic) {
  const template = DAILY_TEMPLATES.find((item) => item.topic.toLowerCase() === topic.trim().toLowerCase());
  return template ? findSessionByDateTemplate(date, template.id) : sessions.find((session) => session.date === date && session.topic.trim().toLowerCase() === topic.trim().toLowerCase());
}

function ensureTemplateSession(date, templateId) {
  const template = DAILY_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  const existing = findSessionByDateTemplate(date, template.id);
  if (existing) return existing;
  const session = normalizeSession({
    id: `daily-${template.id}-${date}`,
    date,
    start_time: template.start_time,
    end_time: template.end_time,
    topic: template.topic,
    course_type: template.course_type,
    instructor: "Daily Ground School",
    notes: "Created automatically from permanent classroom QR code"
  });
  sessions.push(session);
  return session;
}

function studentAttendanceSummaries() {
  const groups = new Map();
  attendance.forEach((record) => {
    const key = studentKey(record);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: `${record.student_first_name} ${record.student_last_name}`.trim(),
        student_first_name: record.student_first_name,
        student_last_name: record.student_last_name,
        student_email_or_id: record.student_email_or_id,
        total: 0,
        records: []
      });
    }
    const group = groups.get(key);
    group.total += 1;
    group.records.push({ ...record, session: sessionForRecord(record) });
  });
  return [...groups.values()].map((group) => {
    group.records.sort((a, b) => recordTime(b) - recordTime(a));
    group.latest = group.records[0] || null;
    group.classNames = [...new Set(group.records.map((record) => record.session?.topic).filter(Boolean))];
    return group;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function recordTime(record) {
  const explicit = new Date(record.check_in_time || "");
  if (!Number.isNaN(explicit.getTime())) return explicit;
  const session = record.session || sessionForRecord(record);
  const sessionTime = session ? sessionDateTime(session) : new Date(record.created_at || "");
  return Number.isNaN(sessionTime.getTime()) ? new Date(0) : sessionTime;
}

function currentSessionStatus() {
  const now = new Date();
  const today = todayKey();
  const templateSessions = DAILY_TEMPLATES.map((template) => ({
    ...template,
    date: today,
    start: new Date(`${today}T${template.start_time}`),
    end: new Date(`${today}T${template.end_time}`)
  }));
  const active = templateSessions.find((template) => now >= template.start && now <= template.end);
  if (active) {
    const session = findSessionByDateTemplate(today, active.id);
    const count = session ? attendance.filter((record) => record.session_id === session.id).length : 0;
    return {
      title: active.topic,
      detail: `${formatTimeRange(active)} · ${count} checked in`
    };
  }

  const next = templateSessions.find((template) => now < template.start);
  if (next) {
    return {
      title: `Next: ${next.topic}`,
      detail: `Starts at ${formatTime(next.start_time)}`
    };
  }

  return {
    title: "Closed",
    detail: "No active ground class"
  };
}

function renderStats() {
  document.querySelector("#ground-session-count").textContent = sessions.length;
  document.querySelector("#ground-attendance-count").textContent = attendance.length;
  const current = currentSessionStatus();
  document.querySelector("#ground-current-session").textContent = current.title;
  document.querySelector("#ground-current-session-detail").textContent = current.detail;

  const repeat = studentAttendanceSummaries().filter((student) => student.total >= 2);
  document.querySelector("#ground-low-count").textContent = repeat.length;
  document.querySelector("#ground-low-detail").textContent = repeat.length ? repeat.slice(0, 2).map((student) => `${student.name} ${student.total}`).join(", ") : "Students with multiple sessions";
}

function renderStudentAttendance() {
  const term = studentSearch.value.trim().toLowerCase();
  const mode = studentFilter.value;
  const today = todayKey();
  const summaries = studentAttendanceSummaries()
    .filter((student) => mode !== "repeat" || student.total >= 2)
    .filter((student) => mode !== "today" || student.records.some((record) => record.session?.date === today || String(record.check_in_time || "").startsWith(today)))
    .filter((student) => {
      if (!term) return true;
      const haystack = [
        student.name,
        student.student_email_or_id,
        ...student.classNames,
        ...student.records.map((record) => record.session?.course_type || "")
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    })
    .sort((a, b) => {
      if (mode === "repeat") return b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  document.querySelector("#ground-student-table-body").innerHTML = summaries.map((student) => {
    const latestSession = student.latest?.session;
    const latestLabel = latestSession ? `${latestSession.topic} · ${formatSessionDate(latestSession)}` : "Session not found";
    const recent = student.records.map((record) => {
      const session = record.session;
      const title = session ? `${session.topic} · ${session.date}` : "Session not found";
      return `
        <article class="ground-record-item">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(formatDateTime(record.check_in_time))}${record.notes ? ` · ${escapeHtml(record.notes)}` : ""}</small>
          </div>
          <div class="ground-record-actions">
            <button class="row-action edit-action" type="button" data-edit-student-record="${escapeHtml(record.id)}">Edit</button>
            <button class="row-action" type="button" data-delete-student-record="${escapeHtml(record.id)}">Remove</button>
          </div>
        </article>
      `;
    }).join("");

    return `
      <tr class="ground-student-summary-row">
        <td>
          <button class="ground-student-name-button" type="button" data-toggle-student="${escapeHtml(student.key)}" aria-expanded="false">
            <strong>${escapeHtml(student.name)}</strong>
            <small>${escapeHtml(student.student_email_or_id || "No ID/email")}</small>
          </button>
        </td>
        <td><strong>${student.total}</strong><small>${student.total === 1 ? "ground session" : "ground sessions"}</small></td>
        <td>
          <strong>${escapeHtml(latestLabel)}</strong>
          <small>${escapeHtml(student.latest ? formatDateTime(student.latest.check_in_time) : "")}</small>
          <div class="ground-record-actions">
            <button class="row-action edit-action" type="button" data-add-ground-student="${escapeHtml(student.key)}">Add ground</button>
            <button class="row-action" type="button" data-match-ground-student="${escapeHtml(student.key)}">Match name</button>
          </div>
        </td>
      </tr>
      <tr class="ground-student-history-row" data-student-history="${escapeHtml(student.key)}" hidden>
        <td colspan="3"><div class="ground-history-list">${recent}</div></td>
      </tr>
    `;
  }).join("");
  document.querySelector("#ground-student-empty").hidden = summaries.length > 0;
}

function renderPermanentCodes() {
  const grid = document.querySelector("#ground-permanent-grid");
  grid.innerHTML = DAILY_TEMPLATES.map((template) => {
    const url = dailyCheckinUrl(template.id);
    return `
      <article class="ground-permanent-card">
        <img src="${qrImageUrl(url)}" alt="${escapeHtml(template.topic)} permanent check-in QR code" />
        <div class="ground-permanent-copy">
          <strong>${escapeHtml(template.topic)}</strong>
          <span>${formatTimeRange(template)}</span>
          <small>${escapeHtml(template.course_type)}</small>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
          <button class="button quiet" type="button" data-copy-daily="${escapeHtml(template.id)}">Copy link</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderImportPreview() {
  const body = document.querySelector("#ground-import-preview-body");
  body.innerHTML = importPreview.map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.topic)}</td>
      <td>${escapeHtml(row.studentName)}</td>
      <td>${escapeHtml(row.action)}</td>
    </tr>
  `).join("");
  document.querySelector("#ground-import-preview-wrap").hidden = importPreview.length === 0;
  document.querySelector("#commit-import-button").disabled = importPreview.length === 0;
}

function render() {
  renderStats();
  renderStudentAttendance();
  renderPermanentCodes();
}

function fillTemplateOptions() {
  const select = document.querySelector("#ground-add-template");
  select.innerHTML = DAILY_TEMPLATES.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.topic)} · ${formatTimeRange(template)}</option>`).join("");
}

function openAddDialog(studentKeyValue = "") {
  const student = studentKeyValue ? studentAttendanceSummaries().find((item) => item.key === studentKeyValue) : null;
  addForm.reset();
  studentProfileSelect.value = "";
  addForm.elements.student_first_name.value = student?.student_first_name || "";
  addForm.elements.student_last_name.value = student?.student_last_name || "";
  addForm.elements.student_email_or_id.value = student?.student_email_or_id || "";
  addForm.elements.date.value = todayKey();
  const current = currentSessionStatus();
  const activeTemplate = DAILY_TEMPLATES.find((template) => template.topic === current.title);
  const latestTemplate = student?.latest?.session ? findTemplateBySession(student.latest.session) : null;
  addForm.elements.template_id.value = latestTemplate?.id || activeTemplate?.id || DAILY_TEMPLATES[0].id;
  document.querySelector("#ground-add-dialog-title").textContent = student ? `Add ground for ${student.name}` : "Add missed QR attendance";
  document.querySelector("#ground-add-context").textContent = student
    ? "Choose one of the fixed ground blocks. The session will be created automatically if it does not already exist."
    : "Enter the student who missed the QR code and choose the ground block they attended.";
  setMessage("#ground-add-message", "");
  addDialog.showModal();
  if (!student) addForm.elements.student_first_name.focus();
}

function fillGroundStudentFromProfile() {
  const selected = studentDirectory.find((student) => student.id === studentProfileSelect.value);
  if (!selected) return;
  const name = splitDirectoryStudentName(selected.studentName);
  addForm.elements.student_first_name.value = name.first;
  addForm.elements.student_last_name.value = name.last;
  addForm.elements.student_email_or_id.value = selected.studentId || selected.email || "";
}

function closeAddDialog() {
  addForm.reset();
  addDialog.close();
}

function openRecordDialog(recordId) {
  const record = attendance.find((item) => item.id === recordId);
  if (!record) return;
  const session = sessionForRecord(record);
  recordForm.elements.id.value = record.id;
  recordForm.elements.session_id.value = record.session_id;
  recordForm.elements.student_first_name.value = record.student_first_name;
  recordForm.elements.student_last_name.value = record.student_last_name;
  recordForm.elements.student_email_or_id.value = record.student_email_or_id;
  recordForm.elements.check_in_time.value = toDateTimeLocal(record.check_in_time || record.created_at || new Date().toISOString());
  recordForm.elements.notes.value = record.notes;
  document.querySelector("#ground-record-dialog-title").textContent = `${record.student_first_name} ${record.student_last_name}`.trim() || "Edit record";
  document.querySelector("#ground-record-context").textContent = session ? `${session.topic} · ${formatSessionDate(session)} · ${formatTimeRange(session)}` : "Session not found";
  setMessage("#ground-record-message", "");
  recordDialog.showModal();
}

function closeRecordDialog() {
  recordForm.reset();
  recordDialog.close();
}

function openNameMatchDialog(studentKeyValue) {
  const student = studentAttendanceSummaries().find((item) => item.key === studentKeyValue);
  if (!student) return;
  nameMatchForm.reset();
  nameMatchForm.elements.source_key.value = student.key;
  document.querySelector("#ground-name-match-title").textContent = `Match ${student.name}`;
  document.querySelector("#ground-name-match-context").textContent = `Choose the saved student profile that should own all ${student.total} attendance record${student.total === 1 ? "" : "s"}.`;
  setMessage("#ground-name-match-message", "");
  nameMatchDialog.showModal();
  nameMatchSelect.focus();
}

function closeNameMatchDialog() {
  nameMatchForm.reset();
  nameMatchDialog.close();
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  return value ? new Date(value).toISOString() : "";
}

async function deleteAttendanceRecord(recordId) {
  if (!recordId || !confirm("Remove this attendance record?")) return;
  attendance = attendance.filter((record) => record.id !== recordId);
  await saveAttendance({ allowDeletes: true });
  if (recordDialog.open) closeRecordDialog();
  render();
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      field += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function buildImportPreview(source) {
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one attendance row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const indexes = {
    date: headers.indexOf("date"),
    topic: headers.indexOf("topic"),
    studentName: headers.indexOf("student name")
  };
  const missing = Object.entries(indexes).filter(([, value]) => value < 0).map(([key]) => key);
  if (missing.length) throw new Error("Missing required columns: Date, Topic, Student Name.");

  return rows.slice(1).map((row) => {
    const date = normalizeDateKey(row[indexes.date]);
    const topic = String(row[indexes.topic] || "").trim();
    const studentName = String(row[indexes.studentName] || "").trim();
    if (!date || !topic || !studentName) return null;
    const matchingSession = findSessionByDateTopic(date, topic);
    return { date, topic, studentName, action: matchingSession ? "Add to existing session" : "Create session" };
  }).filter(Boolean);
}

function splitStudentName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.slice(0, -1).join(" ") || parts[0] || "",
    last: parts.length > 1 ? parts.slice(-1)[0] : ""
  };
}

document.querySelector("#ground-student-table-body").addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-toggle-student]");
  const add = event.target.closest("[data-add-ground-student]");
  const match = event.target.closest("[data-match-ground-student]");
  const editId = event.target.dataset.editStudentRecord;
  const deleteId = event.target.dataset.deleteStudentRecord;
  if (toggle) {
    const key = toggle.dataset.toggleStudent;
    const row = document.querySelector(`[data-student-history="${CSS.escape(key)}"]`);
    if (row) {
      const nextOpen = row.hidden;
      row.hidden = !nextOpen;
      toggle.setAttribute("aria-expanded", String(nextOpen));
    }
  }
  if (add) openAddDialog(add.dataset.addGroundStudent);
  if (match) openNameMatchDialog(match.dataset.matchGroundStudent);
  if (editId) openRecordDialog(editId);
  if (deleteId) await deleteAttendanceRecord(deleteId);
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(addForm);
  const date = normalizeDateKey(data.get("date"));
  const session = ensureTemplateSession(date, String(data.get("template_id") || ""));
  if (!session) {
    setMessage("#ground-add-message", "Choose a valid ground block.", "error");
    return;
  }
  const record = canonicalizeRecord(normalizeAttendance({
    session_id: session.id,
    student_first_name: data.get("student_first_name"),
    student_last_name: data.get("student_last_name"),
    student_email_or_id: data.get("student_email_or_id"),
    check_in_time: new Date(`${session.date}T${session.start_time || "00:00"}`).toISOString(),
    notes: data.get("notes") || "Added by ops"
  }));
  if (!record.student_first_name || !record.student_last_name) {
    addForm.reportValidity();
    return;
  }
  if (hasDuplicate(record)) {
    setMessage("#ground-add-message", "That student already has a record for this ground block.", "error");
    return;
  }
  attendance.push(record);
  await saveAll();
  closeAddDialog();
  render();
});

recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(recordForm);
  const recordId = String(data.get("id") || "");
  const existing = attendance.find((record) => record.id === recordId);
  if (!existing) return;
  const next = canonicalizeRecord(normalizeAttendance({
    ...existing,
    student_first_name: data.get("student_first_name"),
    student_last_name: data.get("student_last_name"),
    student_email_or_id: data.get("student_email_or_id"),
    check_in_time: fromDateTimeLocal(data.get("check_in_time")),
    notes: data.get("notes")
  }));
  if (!next.student_first_name || !next.student_last_name) {
    recordForm.reportValidity();
    return;
  }
  if (hasDuplicate(next, recordId)) {
    setMessage("#ground-record-message", "That student already has a record for this session.", "error");
    return;
  }
  attendance = attendance.map((record) => record.id === recordId ? next : record);
  await saveAttendance();
  closeRecordDialog();
  render();
});

document.querySelector("#delete-ground-record").addEventListener("click", async () => {
  await deleteAttendanceRecord(recordForm.elements.id.value);
});

document.querySelector("#close-ground-add-dialog").addEventListener("click", closeAddDialog);
document.querySelector("#cancel-ground-add-dialog").addEventListener("click", closeAddDialog);
document.querySelector("#close-ground-record-dialog").addEventListener("click", closeRecordDialog);
document.querySelector("#cancel-ground-record-dialog").addEventListener("click", closeRecordDialog);
document.querySelector("#close-ground-name-match-dialog").addEventListener("click", closeNameMatchDialog);
document.querySelector("#cancel-ground-name-match-dialog").addEventListener("click", closeNameMatchDialog);

nameMatchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const sourceKey = String(nameMatchForm.elements.source_key.value || "");
  const selected = studentDirectory.find((student) => student.id === nameMatchSelect.value);
  if (!sourceKey || !selected) {
    setMessage("#ground-name-match-message", "Choose the correct student profile.", "error");
    return;
  }

  const fields = canonicalAttendanceFields(selected);
  let changedCount = 0;
  const affectedKeys = new Set();
  let nextAttendance = attendance.map((record) => {
    if (studentKey(record) !== sourceKey) return record;
    changedCount += 1;
    const next = normalizeAttendance({ ...record, ...fields });
    affectedKeys.add(`${next.session_id}::${studentKey(next)}`);
    return next;
  });
  const seen = new Set();
  let duplicateCount = 0;
  nextAttendance = nextAttendance.filter((record) => {
    const key = `${record.session_id}::${studentKey(record)}`;
    if (!affectedKeys.has(key)) return true;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    duplicateCount += 1;
    return false;
  });

  const duplicateMessage = duplicateCount ? ` and remove ${duplicateCount} duplicate check-in${duplicateCount === 1 ? "" : "s"}` : "";
  if (!confirm(`Rename ${changedCount} attendance record${changedCount === 1 ? "" : "s"} to ${selected.studentName}${duplicateMessage}?`)) return;
  attendance = nextAttendance;
  await saveAttendance({ allowDeletes: duplicateCount > 0 });
  closeNameMatchDialog();
  render();
});

document.querySelector("#print-ground-qr-codes").addEventListener("click", () => {
  window.print();
});

document.querySelector("#open-ground-add-attendance").addEventListener("click", () => openAddDialog());

document.querySelector("#ground-permanent-grid").addEventListener("click", async (event) => {
  const templateId = event.target.dataset.copyDaily;
  if (!templateId) return;
  const url = dailyCheckinUrl(templateId);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    setMessage("#ground-import-message", url, "error");
  }
});

document.querySelector("#show-import-button").addEventListener("click", () => {
  importPanel.hidden = false;
  importPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#hide-import-button").addEventListener("click", () => {
  importPanel.hidden = true;
});

studentSearch.addEventListener("input", renderStudentAttendance);
studentFilter.addEventListener("change", renderStudentAttendance);
studentProfileSelect.addEventListener("change", fillGroundStudentFromProfile);

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  importText.value = await file.text();
});

document.querySelector("#preview-import-button").addEventListener("click", () => {
  try {
    importPreview = buildImportPreview(importText.value);
    renderImportPreview();
    setMessage("#ground-import-message", `${importPreview.length} rows ready to import.`, "success");
  } catch (error) {
    importPreview = [];
    renderImportPreview();
    setMessage("#ground-import-message", error.message, "error");
  }
});

document.querySelector("#commit-import-button").addEventListener("click", async () => {
  let added = 0;
  importPreview.forEach((row) => {
    let session = findSessionByDateTopic(row.date, row.topic);
    if (!session) {
      const template = DAILY_TEMPLATES.find((item) => item.topic.toLowerCase() === row.topic.toLowerCase());
      session = template ? ensureTemplateSession(row.date, template.id) : normalizeSession({
        id: id(),
        date: row.date,
        start_time: "00:00",
        end_time: "00:30",
        topic: row.topic,
        course_type: "Other",
        instructor: "Imported",
        notes: "Created from historical attendance import"
      });
      if (!template) sessions.push(session);
    }
    const name = splitStudentName(row.studentName);
    const record = canonicalizeRecord(normalizeAttendance({
      session_id: session.id,
      student_first_name: name.first,
      student_last_name: name.last,
      notes: "Imported historical record"
    }));
    if (!record.student_first_name || !record.student_last_name || hasDuplicate(record)) return;
    attendance.push(record);
    added += 1;
  });
  await saveAll();
  importPreview = [];
  importText.value = "";
  importFile.value = "";
  renderImportPreview();
  setMessage("#ground-import-message", `Imported ${added} attendance records.`, "success");
  render();
});

(async () => {
  fillTemplateOptions();
  const [students] = await Promise.all([
    getStudentDirectory({ activeOnly: false }),
    loadData()
  ]);
  studentDirectory = students;
  await populateStudentSelect(studentProfileSelect, { students: studentDirectory, placeholder: "Choose from saved students" });
  await populateStudentSelect(nameMatchSelect, { students: studentDirectory, placeholder: "Choose the correct student" });
  await reconcileAttendanceNames();
  render();
})();
