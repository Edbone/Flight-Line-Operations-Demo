import { cacheLocalData, loadCollectionData, saveCollectionData } from "./firebase.js";
import { getStudentDirectory } from "./student-directory.js";
import { canonicalizeAttendanceRecord } from "./student-name-matching.js";

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

const form = document.querySelector("#ground-checkin-form");
const title = document.querySelector("#checkin-title");
const meta = document.querySelector("#checkin-session-meta");
const message = document.querySelector("#checkin-message");

let sessions = [];
let attendance = [];
let studentDirectory = [];
let session = null;
let activeDailyTemplate = null;

function getSessionId() {
  const queryId = new URLSearchParams(window.location.search).get("session");
  if (queryId) return queryId;
  const match = window.location.pathname.match(/\/ground-attendance\/checkin\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getDailyTemplateId() {
  const queryId = new URLSearchParams(window.location.search).get("daily");
  if (queryId) return queryId;
  const match = window.location.pathname.match(/\/ground-attendance\/daily\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function id() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeSession(record = {}) {
  return {
    id: String(record.id || id()),
    date: String(record.date || todayKey()),
    start_time: String(record.start_time || ""),
    end_time: String(record.end_time || ""),
    topic: String(record.topic || "").trim(),
    course_type: String(record.course_type || "Other"),
    instructor: String(record.instructor || "").trim(),
    notes: String(record.notes || "").trim(),
    created_at: record.created_at || new Date().toISOString()
  };
}

function normalizeAttendance(record = {}) {
  return {
    id: String(record.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    session_id: String(record.session_id || ""),
    canonical_student_id: String(record.canonical_student_id || "").trim(),
    student_first_name: String(record.student_first_name || "").trim(),
    student_last_name: String(record.student_last_name || "").trim(),
    student_email_or_id: String(record.student_email_or_id || "").trim(),
    status: record.status || "Present",
    check_in_time: record.check_in_time || new Date().toISOString(),
    notes: String(record.notes || "").trim(),
    created_at: record.created_at || new Date().toISOString()
  };
}

function studentKey(record) {
  const name = `${record.student_first_name} ${record.student_last_name}`.trim().toLowerCase().replace(/\s+/g, " ");
  const canonicalId = String(record.canonical_student_id || "").trim().toLowerCase();
  const idOrEmail = String(record.student_email_or_id || "").trim().toLowerCase();
  return canonicalId || idOrEmail || name;
}

function hasDuplicate(record) {
  return attendance.some((existing) => existing.session_id === record.session_id && studentKey(existing) === studentKey(record));
}

function formatDate(session) {
  const date = new Date(`${session.date}T${session.start_time || "00:00"}`);
  const dateText = Number.isNaN(date.getTime()) ? session.date : date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `${dateText}${session.start_time ? ` at ${formatTime(session.start_time)}` : ""}`;
}

function formatTime(value) {
  const parsed = new Date(`2026-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dateTimeFor(date, time) {
  const parsed = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sessionWindowStatus(targetSession) {
  if (!targetSession?.date || !targetSession?.start_time || !targetSession?.end_time) {
    return { isOpen: true, opensAt: null, closesAt: null };
  }
  const now = new Date();
  const opensAt = dateTimeFor(targetSession.date, targetSession.start_time);
  const closesAt = dateTimeFor(targetSession.date, targetSession.end_time);
  if (!opensAt || !closesAt) return { isOpen: true, opensAt: null, closesAt: null };
  return {
    isOpen: now >= opensAt && now <= closesAt,
    opensAt,
    closesAt
  };
}

function windowText(targetSession) {
  return `${formatTime(targetSession.start_time)} - ${formatTime(targetSession.end_time)}`;
}

function setMessage(text, tone = "info") {
  message.textContent = text;
  message.dataset.tone = tone;
}

async function saveAttendance() {
  cacheLocalData(ATTENDANCE_STORAGE_KEY, attendance);
  attendance = await saveCollectionData(ATTENDANCE_COLLECTION, attendance);
  cacheLocalData(ATTENDANCE_STORAGE_KEY, attendance);
}

async function saveSessions() {
  cacheLocalData(SESSION_STORAGE_KEY, sessions);
  sessions = await saveCollectionData(SESSION_COLLECTION, sessions);
  cacheLocalData(SESSION_STORAGE_KEY, sessions);
}

async function ensureDailySession(templateId) {
  const template = DAILY_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  activeDailyTemplate = template;
  const date = todayKey();
  const templateSession = normalizeSession({
    date,
    start_time: template.start_time,
    end_time: template.end_time,
    topic: template.topic,
    course_type: template.course_type,
    instructor: "Daily Ground School"
  });
  if (!sessionWindowStatus(templateSession).isOpen) return templateSession;

  const existing = sessions.find((item) => (
    item.date === date &&
    item.start_time === template.start_time &&
    item.end_time === template.end_time &&
    item.topic.trim().toLowerCase() === template.topic.toLowerCase()
  ));
  if (existing) return existing;

  const next = normalizeSession({
    id: `daily-${template.id}-${date}`,
    date,
    start_time: template.start_time,
    end_time: template.end_time,
    topic: template.topic,
    course_type: template.course_type,
    instructor: "Daily Ground School",
    notes: "Created automatically from permanent classroom QR code"
  });
  sessions.push(next);
  await saveSessions();
  return next;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const windowStatus = sessionWindowStatus(session);
  if (!windowStatus.isOpen) {
    form.hidden = true;
    setMessage(`Check-in is closed for ${session.topic}. This QR code only accepts attendance from ${windowText(session)}.`, "error");
    return;
  }
  const data = new FormData(form);
  let record = normalizeAttendance({
    session_id: session.id,
    student_first_name: data.get("student_first_name"),
    student_last_name: data.get("student_last_name"),
    student_email_or_id: data.get("student_email_or_id"),
    status: "Present"
  });

  if (!record.student_first_name || !record.student_last_name) {
    form.reportValidity();
    return;
  }
  record = canonicalizeAttendanceRecord(record, studentDirectory).record;
  if (hasDuplicate(record)) {
    setMessage("You are already checked in for this session. Ask staff if this needs to be changed.", "error");
    return;
  }

  attendance.push(record);
  await saveAttendance();
  form.hidden = true;
  title.textContent = "You're checked in";
  setMessage(`Thanks, ${record.student_first_name}. Your attendance was recorded.`, "success");
});

(async () => {
  const sessionId = getSessionId();
  const dailyTemplateId = getDailyTemplateId();
  const [loadedSessions, loadedAttendance, loadedStudents] = await Promise.all([
    loadCollectionData(SESSION_COLLECTION, SESSION_STORAGE_KEY),
    loadCollectionData(ATTENDANCE_COLLECTION, ATTENDANCE_STORAGE_KEY),
    getStudentDirectory({ activeOnly: false })
  ]);
  sessions = Array.isArray(loadedSessions) ? loadedSessions.map(normalizeSession) : [];
  attendance = Array.isArray(loadedAttendance) ? loadedAttendance.map(normalizeAttendance) : [];
  studentDirectory = Array.isArray(loadedStudents) ? loadedStudents : [];
  attendance = attendance.map((record) => canonicalizeAttendanceRecord(record, studentDirectory).record);
  session = dailyTemplateId ? await ensureDailySession(dailyTemplateId) : sessions.find((item) => item.id === sessionId);

  if (!session) {
    title.textContent = "Session not found";
    meta.textContent = "Please check the QR code or ask staff for a current check-in link.";
    setMessage("", "error");
    return;
  }

  title.textContent = session.topic || "Ground school session";
  meta.textContent = `${formatDate(session)} · ${session.course_type || "Ground"} · ${session.instructor || "AOA"}`;
  const windowStatus = sessionWindowStatus(session);
  if (!windowStatus.isOpen) {
    form.hidden = true;
    const className = activeDailyTemplate?.topic || session.topic || "This class";
    setMessage(`${className} check-in is closed. This QR code only accepts attendance from ${windowText(session)}.`, "error");
    return;
  }
  setMessage(`Check-in is open until ${formatTime(session.end_time)}.`, "success");
  form.hidden = false;
})();
