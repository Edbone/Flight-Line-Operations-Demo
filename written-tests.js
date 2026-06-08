import { loadCollectionData, saveCollectionData } from "./firebase.js";

const STORAGE_KEY = "aoa-written-test-custom-scores-v1";
const DELETED_STUDENTS_KEY = "aoa-written-test-deleted-students-v1";
const SCHEDULE_STORAGE_KEY = "aoa-written-test-schedule-v1";
const SCORE_TARGET = 90;
const STREAK_TARGET = 3;
const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 18;
const SCHEDULE_SLOT_INCREMENT = 0.5;
const SCHEDULE_SLOT_HEIGHT = 34;

const TEST_OPTIONS = ["PPL", "IRA", "CAX", "COM", "FOI", "FIA", "CFII", "IFR", "Other"];

const studentList = document.querySelector("#written-student-list");
const emptyState = document.querySelector("#written-empty-state");
const searchInput = document.querySelector("#written-search");
const testFilter = document.querySelector("#written-test-filter");
const statusFilter = document.querySelector("#written-status-filter");
const dialog = document.querySelector("#score-dialog");
const form = document.querySelector("#score-form");
const bookingDialog = document.querySelector("#written-booking-dialog");
const dayDialog = document.querySelector("#written-day-dialog");
const dayDialogTitle = document.querySelector("#written-day-title");
const dayDialogList = document.querySelector("#written-day-dialog-list");
const scheduleForm = document.querySelector("#written-schedule-form");
const scheduleCalendar = document.querySelector("#written-schedule-calendar");
const scheduleMonthLabel = document.querySelector("#written-schedule-month-label");
const toast = document.querySelector("#written-toast");

let importedAttempts = [];
let customAttempts = [];
let deletedStudents = [];
let scheduledTests = [];
let scheduleMonthAnchor = startOfMonth(new Date());

async function loadCustomAttempts() {
  const loaded = await loadCollectionData("written-test-custom", STORAGE_KEY);
  return Array.isArray(loaded) ? loaded : [];
}

async function saveCustomAttempts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customAttempts));
  await saveCollectionData("written-test-custom", customAttempts);
}

async function loadDeletedStudents() {
  try {
    const loaded = await loadCollectionData("written-test-deleted", DELETED_STUDENTS_KEY);
    return Array.isArray(loaded) ? loaded : [];
  } catch {
    return [];
  }
}

async function saveDeletedStudents() {
  localStorage.setItem(DELETED_STUDENTS_KEY, JSON.stringify(deletedStudents));
  await saveCollectionData("written-test-deleted", deletedStudents);
}

async function loadScheduledTests() {
  const loaded = await loadCollectionData("written-test-schedule", SCHEDULE_STORAGE_KEY);
  return Array.isArray(loaded) ? loaded : [];
}

async function saveScheduledTests() {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(scheduledTests));
  await saveCollectionData("written-test-schedule", scheduledTests);
}

async function loadImportedAttempts() {
  const response = await fetch("assets/written-test-history.tsv");
  if (!response.ok) throw new Error(`Could not load written-test history (${response.status})`);
  const source = await response.text();
  return source
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => parseImportedAttempt(line, index))
    .filter(Boolean);
}

function parseImportedAttempt(line, index) {
  if (!line.trim()) return null;
  const [studentRaw = "", dateRaw = "", timeRaw = "", testRaw = "", scoreRaw = "", initialsRaw = ""] = line.split("\t");
  const student = cleanName(studentRaw);
  const test = cleanTest(testRaw);
  if (!student || !test) return null;

  const scoreText = scoreRaw.trim();
  const scoreMatch = scoreText.match(/(\d+(?:\.\d+)?)/);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const takenAt = buildImportedDateTime(dateRaw.trim(), timeRaw.trim());
  const notes = score !== null || !scoreText ? "" : scoreText;

  return {
    id: `imported-${index}`,
    student,
    test,
    score,
    takenAt,
    initials: initialsRaw.trim().toUpperCase(),
    notes,
    imported: true,
    order: index
  };
}

function buildImportedDateTime(dateRaw, timeRaw) {
  if (!dateRaw) return "";
  const parsed = new Date(`${dateRaw} ${timeRaw || "12:00 PM"}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function allAttempts() {
  const deletedKeys = deletedStudentKeys();
  return [...importedAttempts, ...customAttempts].filter((attempt) => !deletedKeys.has(studentKey(attempt.student)));
}

function allScheduledTests() {
  const deletedKeys = deletedStudentKeys();
  return scheduledTests.filter((entry) => !deletedKeys.has(studentKey(entry.student)));
}

function groupProgress() {
  const groups = new Map();
  allAttempts().forEach((attempt) => {
    const key = `${studentKey(attempt.student)}|||${attempt.test}`;
    if (!groups.has(key)) groups.set(key, { student: attempt.student, test: attempt.test, attempts: [] });
    groups.get(key).attempts.push(attempt);
  });

  return [...groups.values()].map((group) => {
    group.attempts.sort((a, b) => (a.takenAt || "").localeCompare(b.takenAt || "") || (a.order || 0) - (b.order || 0));
    let streak = 0;
    let completedAt = "";
    group.attempts.forEach((attempt) => {
      if (attempt.score === null) return;
      streak = attempt.score >= SCORE_TARGET ? streak + 1 : 0;
      if (streak >= STREAK_TARGET && !completedAt) completedAt = attempt.takenAt;
    });
    group.scoredAttempts = group.attempts.filter((attempt) => attempt.score !== null);
    group.streak = streak;
    group.complete = Boolean(completedAt);
    group.completedAt = completedAt;
    group.latest = group.scoredAttempts.slice(-3);
    return group;
  });
}

function statusFor(group) {
  if (group.complete) return "complete";
  if (group.streak === 2) return "close";
  return "progress";
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const groups = groupProgress()
    .filter((group) => !testFilter.value || group.test === testFilter.value)
    .filter((group) => !statusFilter.value || statusFor(group) === statusFilter.value)
    .filter((group) => `${group.student} ${group.test}`.toLowerCase().includes(term))
    .sort((a, b) => Number(b.complete) - Number(a.complete) || b.streak - a.streak || a.student.localeCompare(b.student, undefined, { sensitivity: "base" }));

  studentList.innerHTML = groups.map((group) => {
    const status = statusFor(group);
    const statusLabel = status === "complete" ? "Complete" : status === "close" ? "One score away" : `${group.streak} of 3`;
    const scoreChips = group.latest.length
      ? group.latest.map((attempt) => `<span class="score-chip ${attempt.score >= SCORE_TARGET ? "passing" : "below"}">${formatScore(attempt.score)}</span>`).join("")
      : '<span class="no-scores">No scores recorded</span>';
    const history = [...group.attempts].reverse().map((attempt) => `
      <tr><td>${formatDate(attempt.takenAt)}</td><td>${attempt.score === null ? escapeHtml(attempt.notes || "No score") : formatScore(attempt.score)}</td><td>${escapeHtml(attempt.initials || "—")}</td><td>${escapeHtml(attempt.notes || "")}</td><td>${attempt.imported ? "" : `<button class="row-action" type="button" data-delete-score="${attempt.id}">Delete</button>`}</td></tr>`).join("");
    return `<details class="written-student-card status-${status}">
      <summary>
        <span class="written-student-name"><strong>${escapeHtml(group.student)}</strong><small>${escapeHtml(group.test)} · ${group.scoredAttempts.length} scored attempts</small></span>
        <span class="score-streak">${scoreChips}</span>
        <span class="written-progress-track"><i style="width:${Math.min(group.streak, 3) / 3 * 100}%"></i></span>
        <span class="status-badge written-status-${status}">${statusLabel}</span>
      </summary>
      <div class="written-history">
        <div class="written-history-actions"><strong>${escapeHtml(group.student)} · ${escapeHtml(group.test)} history</strong><button class="button danger-button delete-written-student" type="button" data-delete-student="${escapeHtml(group.student)}">Delete student</button></div>
        <table><thead><tr><th>Date</th><th>Score</th><th>SSR</th><th>Source notes</th><th></th></tr></thead><tbody>${history}</tbody></table>
      </div>
    </details>`;
  }).join("");

  emptyState.hidden = groups.length > 0;
  document.querySelector("#written-result-count").textContent = `${groups.length} student/test records`;
  renderMetrics();
  renderFilters();
  renderStudentOptions();
  renderSchedule();
}

function renderMetrics() {
  const groups = groupProgress();
  document.querySelector("#written-student-count").textContent = new Set(groups.map((group) => studentKey(group.student))).size;
  document.querySelector("#written-complete-count").textContent = groups.filter((group) => group.complete).length;
  document.querySelector("#written-close-count").textContent = groups.filter((group) => !group.complete && group.streak === 2).length;
  document.querySelector("#written-progress-count").textContent = groups.filter((group) => !group.complete && group.streak < 2).length;
}

function renderFilters() {
  const previousValue = testFilter.value;
  const tests = [...new Set([...allAttempts().map((attempt) => attempt.test), ...allScheduledTests().map((entry) => entry.test)].filter(Boolean))].sort();
  testFilter.innerHTML = '<option value="">All tests</option>' + tests.map((test) => `<option>${escapeHtml(test)}</option>`).join("");
  if (!previousValue || tests.includes(previousValue)) testFilter.value = previousValue;
}

function renderStudentOptions() {
  const namesByKey = new Map();
  [...allAttempts().map((attempt) => attempt.student), ...allScheduledTests().map((entry) => entry.student)].filter(Boolean).forEach((name) => {
    const key = studentKey(name);
    if (!namesByKey.has(key)) namesByKey.set(key, name);
  });
  const names = [...namesByKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  document.querySelector("#written-students").innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderSchedule() {
  const monthEntries = monthScheduledTests();
  const calendarDays = buildMonthCalendarDays(scheduleMonthAnchor);

  scheduleMonthLabel.textContent = formatMonthLabel(scheduleMonthAnchor);
  scheduleCalendar.innerHTML = `
    <div class="written-month-weekdays">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="written-month-grid">
      ${calendarDays.map((day) => renderMonthDay(day, monthEntries)).join("")}
    </div>
  `;
}

function renderMonthDay(day, monthEntries) {
  const date = dateKey(day.date);
  const entries = monthEntries.filter((entry) => entry.date === date);
  return `<button class="written-month-day ${day.inMonth ? "" : "outside-month"} ${day.isToday ? "today" : ""}" type="button" data-open-day="${date}">
    <div class="written-month-day-header">
      <span>${day.date.getDate()}</span>
      ${entries.length ? `<small>${entries.length} booking${entries.length === 1 ? "" : "s"}</small>` : ""}
    </div>
    <div class="written-month-day-list">
      ${entries.slice(0, 3).map((entry) => `
        <div class="written-month-booking">
          <strong>${escapeHtml(entry.student)}</strong>
          <span>${escapeHtml(entry.test)} · ${entry.time}</span>
        </div>
      `).join("")}
      ${entries.length > 3 ? `<small class="written-month-more">+${entries.length - 3} more</small>` : ""}
    </div>
  </button>`;
}

function buildMonthCalendarDays(anchorDate) {
  const firstDay = startOfMonth(anchorDate);
  const lastDay = endOfMonth(anchorDate);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay());
  const days = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push({
      date: new Date(cursor),
      inMonth: cursor.getMonth() === anchorDate.getMonth(),
      isToday: dateKey(cursor) === dateKey(new Date())
    });
  }
  return days;
}

function monthScheduledTests() {
  const monthStartKey = dateKey(startOfMonth(scheduleMonthAnchor));
  const monthEndKey = dateKey(endOfMonth(scheduleMonthAnchor));
  return allScheduledTests().filter((entry) => entry.date >= monthStartKey && entry.date <= monthEndKey);
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatScore(score) {
  return `${Number(score.toFixed(1))}%`;
}

function formatDate(value) {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value) {
  const hour = Math.floor(value);
  const minutes = value % 1 ? 30 : 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function timeValueToHour(value) {
  const [hour = "0", minute = "0"] = String(value).split(":");
  return Number(hour) + Number(minute) / 60;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function cleanName(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function studentKey(value = "") {
  return cleanName(value).toLowerCase();
}

function deletedStudentKeys() {
  return new Set(deletedStudents.map(studentKey));
}

function cleanTest(value = "") {
  const cleaned = String(value).trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const matchedOption = TEST_OPTIONS.find((option) => option.toLowerCase() === cleaned.toLowerCase());
  return matchedOption || cleaned.toUpperCase();
}

function overlapsScheduledTest(candidate, ignoreId = "") {
  const candidateStart = timeValueToHour(candidate.time);
  const candidateEnd = candidateStart + Number(candidate.duration);
  return scheduledTests.some((entry) => {
    if (entry.id === ignoreId || entry.date !== candidate.date) return false;
    const entryStart = timeValueToHour(entry.time);
    const entryEnd = entryStart + Number(entry.duration);
    return candidateStart < entryEnd && candidateEnd > entryStart;
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function openForm() {
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  dialog.showModal();
  form.elements.student.focus();
}

function resetScheduleForm() {
  scheduleForm.reset();
  scheduleForm.elements.date.value = dateKey(scheduleMonthAnchor);
  scheduleForm.elements.time.value = "09:00";
  scheduleForm.elements.duration.value = "1";
}

function openBookingDialog() {
  resetScheduleForm();
  bookingDialog.showModal();
  scheduleForm.elements.student.focus();
}

function formatEntryDate(entry) {
  return new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatEntryRange(entry) {
  const start = timeValueToHour(entry.time);
  return `${formatTime(start)} - ${formatTime(start + Number(entry.duration))}`;
}

function openDayDialog(dateValue) {
  const entries = allScheduledTests()
    .filter((entry) => entry.date === dateValue)
    .sort((a, b) => a.time.localeCompare(b.time) || a.student.localeCompare(b.student, undefined, { sensitivity: "base" }));
  const displayDate = entries[0]
    ? formatEntryDate(entries[0])
    : new Date(`${dateValue}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  dayDialogTitle.textContent = displayDate;
  dayDialogList.dataset.date = dateValue;
  dayDialogList.innerHTML = entries.length
    ? entries.map((entry) => `
      <article class="written-day-dialog-card">
        <div>
          <strong>${escapeHtml(entry.student)}</strong>
          <small>${escapeHtml(entry.test)} · ${formatEntryRange(entry)}</small>
          <small>${escapeHtml(entry.initials)}${entry.notes ? ` · ${escapeHtml(entry.notes)}` : ""}</small>
        </div>
        <button class="button quiet" type="button" data-delete-schedule="${entry.id}">Delete</button>
      </article>
    `).join("")
    : '<div class="empty-state"><strong>No bookings on this day</strong><p>Use Add booking to create one.</p></div>';
  dayDialog.showModal();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const takenAt = `${data.date}T${data.time || "12:00"}`;
  customAttempts.push({
    id: crypto.randomUUID(),
    student: cleanName(data.student),
    test: cleanTest(data.test),
    score: Number(data.score),
    takenAt,
    initials: data.initials.trim().toUpperCase(),
    notes: data.notes.trim(),
    imported: false,
    order: Date.now()
  });
  saveCustomAttempts();
  render();
  dialog.close();
  showToast(Number(data.score) >= SCORE_TARGET ? "Passing score added." : "Score added. Streak reset.");
});

scheduleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(scheduleForm));
  const entry = {
    id: crypto.randomUUID(),
    student: cleanName(data.student),
    test: cleanTest(data.test),
    date: data.date,
    time: data.time,
    duration: Number(data.duration),
    initials: data.initials.trim().toUpperCase(),
    notes: data.notes.trim()
  };

  if (!entry.student || !entry.test || !entry.date || !entry.time || !entry.initials) {
    showToast("Student, test, date, time, and initials are required.");
    return;
  }

  const startHour = timeValueToHour(entry.time);
  if (startHour < SCHEDULE_START_HOUR || startHour + entry.duration > SCHEDULE_END_HOUR) {
    showToast(`Written tests must stay between ${formatTime(SCHEDULE_START_HOUR)} and ${formatTime(SCHEDULE_END_HOUR)}.`);
    return;
  }

  if (overlapsScheduledTest(entry)) {
    showToast("That written-test time overlaps another scheduled booking.");
    return;
  }

  scheduledTests.push(entry);
  saveScheduledTests();
  scheduleMonthAnchor = startOfMonth(new Date(`${entry.date}T12:00:00`));
  render();
  bookingDialog.close();
  showToast("Written test scheduled.");
});

studentList.addEventListener("click", (event) => {
  const student = event.target.dataset.deleteStudent;
  if (student) {
    event.preventDefault();
    if (!confirm(`Delete ${student} and all of their written-test history?`)) return;
    const deletedKey = studentKey(student);
    deletedStudents = [...new Set([...deletedStudents, student].map(cleanName))];
    customAttempts = customAttempts.filter((attempt) => studentKey(attempt.student) !== deletedKey);
    scheduledTests = scheduledTests.filter((entry) => studentKey(entry.student) !== deletedKey);
    saveDeletedStudents();
    saveCustomAttempts();
    saveScheduledTests();
    render();
    showToast(`${student} deleted.`);
    return;
  }

  const id = event.target.dataset.deleteScore;
  if (!id || !confirm("Delete this written test score?")) return;
  customAttempts = customAttempts.filter((attempt) => attempt.id !== id);
  saveCustomAttempts();
  render();
  showToast("Score deleted.");
});

scheduleCalendar.addEventListener("click", (event) => {
  const dateValue = event.target.closest("[data-open-day]")?.dataset.openDay;
  if (dateValue) openDayDialog(dateValue);
});
dayDialogList.addEventListener("click", handleScheduleDelete);

function handleScheduleDelete(event) {
  const id = event.target.closest("[data-delete-schedule]")?.dataset.deleteSchedule;
  if (!id || !confirm("Delete this scheduled written test?")) return;
  scheduledTests = scheduledTests.filter((entry) => entry.id !== id);
  saveScheduledTests();
  render();
  if (dayDialog.open) {
    const openDate = dayDialogList.dataset.date;
    if (openDate && allScheduledTests().some((entry) => entry.date === openDate)) openDayDialog(openDate);
    else dayDialog.close();
  }
  showToast("Scheduled written test deleted.");
}

[searchInput, testFilter, statusFilter].forEach((element) => element.addEventListener("input", render));
document.querySelector("#open-score-form-button").addEventListener("click", openForm);
document.querySelector("#close-score-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-score-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#open-written-booking-button").addEventListener("click", openBookingDialog);
document.querySelector("#close-written-booking-button").addEventListener("click", () => bookingDialog.close());
document.querySelector("#cancel-written-booking-button").addEventListener("click", () => bookingDialog.close());
document.querySelector("#close-written-day-button").addEventListener("click", () => dayDialog.close());
document.querySelector("#close-written-day-footer-button").addEventListener("click", () => dayDialog.close());
document.querySelector("#previous-written-month").addEventListener("click", () => {
  scheduleMonthAnchor = startOfMonth(new Date(scheduleMonthAnchor.getFullYear(), scheduleMonthAnchor.getMonth() - 1, 1));
  renderSchedule();
});
document.querySelector("#next-written-month").addEventListener("click", () => {
  scheduleMonthAnchor = startOfMonth(new Date(scheduleMonthAnchor.getFullYear(), scheduleMonthAnchor.getMonth() + 1, 1));
  renderSchedule();
});
document.querySelector("#today-written-month").addEventListener("click", () => {
  scheduleMonthAnchor = startOfMonth(new Date());
  renderSchedule();
});

(async () => {
  try {
    importedAttempts = await loadImportedAttempts();
  } catch {
    showToast("Could not load imported score history.");
  }
  customAttempts = await loadCustomAttempts();
  deletedStudents = await loadDeletedStudents();
  scheduledTests = await loadScheduledTests();
  resetScheduleForm();
  render();
})();
