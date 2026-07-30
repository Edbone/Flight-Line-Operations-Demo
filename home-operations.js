import { loadStudents, saveStudents } from "./student-data.js";
import { escapeHtml, formatDate, getDashboardStats, getStudentFlags } from "./student-utils.js";

const SPIN_ALERT_WINDOW_DAYS = 7;

const elements = {
  today: document.querySelector("#home-today"),
  spinCount: document.querySelector("#home-spin-alert-count"),
  studentCount: document.querySelector("#home-active-student-count"),
  watchCount: document.querySelector("#home-student-watch-count"),
  spinList: document.querySelector("#home-spin-alert-list"),
  watchList: document.querySelector("#home-student-watch-list"),
  spinBox: document.querySelector("#home-spin-title")?.closest(".home-alert-box"),
  spinDialog: document.querySelector("#spin-event-dialog"),
  spinForm: document.querySelector("#spin-event-form"),
  spinStudent: document.querySelector("#spin-event-student"),
  spinDate: document.querySelector("#spin-event-date"),
  spinTime: document.querySelector("#spin-event-time"),
  spinMessage: document.querySelector("#spin-event-message"),
  openSpinDialog: document.querySelector("#open-spin-event-dialog"),
  closeSpinDialog: document.querySelector("#close-spin-event-dialog"),
  cancelSpinDialog: document.querySelector("#cancel-spin-event-dialog")
};

let homeStudents = [];

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const due = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due - startOfToday(now)) / 86400000);
}

function spinAlertLevel(days) {
  if (days < 0) return { className: "overdue", label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` };
  if (days === 0) return { className: "today", label: "Today" };
  if (days === 1) return { className: "tomorrow", label: "Tomorrow" };
  return { className: "soon", label: `In ${days} days` };
}

function formatSpinEvent(student) {
  const date = formatDate(student.spinTrainingDueDate);
  const time = formatTimeLabel(student.spinTrainingTime);
  return [date, time].filter(Boolean).join(" at ");
}

function formatTimeLabel(value) {
  if (!value) return "";
  const [hoursRaw, minutesRaw] = String(value).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(value);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getSpinAlerts(students) {
  return students
    .filter((student) => student.activeStatus === "Yes" && student.spinTrainingRequired === "Yes" && student.spinTrainingDueDate)
    .map((student) => ({ student, days: daysUntil(student.spinTrainingDueDate) }))
    .filter((item) => item.days !== null && item.days <= SPIN_ALERT_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days || a.student.studentName.localeCompare(b.student.studentName));
}

function currentStaffName() {
  const staff = window.AOAAuth?.getCurrentUser?.();
  return staff?.name || staff?.initials || "";
}

function currentStaffStudentFields() {
  const staff = window.AOAAuth?.getCurrentUser?.();
  return staff ? {
    updatedByUserId: staff.id,
    updatedByName: staff.name,
    updatedByInitials: staff.initials
  } : {};
}

function importantWatchItems(students) {
  const priority = ["attendance70", "attendance80", "missingCfi", "missingPhoto", "belowMinimum", "stale", "timeOff"];
  return students
    .filter((student) => student.activeStatus === "Yes")
    .map((student) => ({ student, flags: getStudentFlags(student).filter((flag) => priority.includes(flag.type)) }))
    .filter((item) => item.flags.length)
    .sort((a, b) => {
      const severityScore = { high: 0, medium: 1, info: 2 };
      return severityScore[a.flags[0].severity] - severityScore[b.flags[0].severity] ||
        a.student.studentName.localeCompare(b.student.studentName);
    })
    .slice(0, 6);
}

function renderSpinAlerts(alerts) {
  elements.spinCount.textContent = alerts.length;
  elements.spinBox?.classList.toggle("has-spin-events", alerts.length > 0);
  elements.spinList.innerHTML = alerts.length ? alerts.map(({ student, days }) => {
    const level = spinAlertLevel(days);
    return `
      <div class="home-alert-row home-spin-row home-alert-${level.className}">
        <a class="home-alert-link" href="student-detail.html?id=${encodeURIComponent(student.id)}">
          <span>
            <strong>${escapeHtml(student.studentName)}</strong>
            <small>${escapeHtml(student.assignedCFI || "No CFI")} · ${escapeHtml(student.currentCourse || "No course")}</small>
          </span>
          <span>
            <b>${escapeHtml(level.label)}</b>
            <small>${escapeHtml(formatSpinEvent(student))}</small>
          </span>
        </a>
        <button class="home-complete-button" type="button" data-complete-spin="${escapeHtml(student.id)}">Completed</button>
      </div>
    `;
  }).join("") : `<div class="home-empty-state">No spin training events in the next ${SPIN_ALERT_WINDOW_DAYS} days.</div>`;
}

async function completeSpinEvent(studentId, button) {
  const index = homeStudents.findIndex((student) => student.id === studentId);
  if (index < 0) return;
  button.disabled = true;
  button.textContent = "Saving...";
  const completedAt = new Date().toISOString();
  const completedBy = currentStaffName();
  const nextStudents = homeStudents.map((student, studentIndex) => studentIndex === index ? {
    ...student,
    spinTrainingRequired: "No",
    spinTrainingDueDate: "",
    spinTrainingTime: "",
    spinTrainingCompletedAt: completedAt,
    spinTrainingCompletedBy: completedBy,
    lastUpdated: completedAt.slice(0, 10),
    ...currentStaffStudentFields(),
    updatedAt: completedAt
  } : student);
  try {
    homeStudents = await saveStudents(nextStudents);
    renderHomeOperations();
  } catch (error) {
    console.warn("Spin training completion could not be saved", error);
    button.disabled = false;
    button.textContent = "Completed";
  }
}

function renderSpinStudentOptions() {
  if (!elements.spinStudent) return;
  const activeStudents = homeStudents
    .filter((student) => student.activeStatus === "Yes")
    .sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || ""), undefined, { sensitivity: "base" }));
  elements.spinStudent.innerHTML = `<option value="">Select student</option>` + activeStudents.map((student) => {
    const detail = [student.group, student.assignedCFI].filter(Boolean).join(" | ");
    return `<option value="${escapeHtml(student.id)}">${escapeHtml(student.studentName)}${detail ? ` - ${escapeHtml(detail)}` : ""}</option>`;
  }).join("");
}

function openSpinEventDialog() {
  renderSpinStudentOptions();
  const now = new Date();
  elements.spinDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  elements.spinTime.value = "";
  elements.spinMessage.hidden = true;
  elements.spinMessage.textContent = "";
  elements.spinDialog?.showModal();
  elements.spinStudent?.focus();
}

async function saveSpinEvent(event) {
  event.preventDefault();
  const studentId = elements.spinStudent.value;
  const date = elements.spinDate.value;
  const time = elements.spinTime.value;
  const index = homeStudents.findIndex((student) => student.id === studentId);
  if (index < 0 || !date || !time) {
    elements.spinMessage.textContent = "Choose a student, date, and time.";
    elements.spinMessage.hidden = false;
    return;
  }

  const nextStudents = homeStudents.map((student, studentIndex) => studentIndex === index ? {
    ...student,
    spinTrainingRequired: "Yes",
    spinTrainingDueDate: date,
    spinTrainingTime: time,
    lastUpdated: new Date().toISOString().slice(0, 10),
    ...currentStaffStudentFields(),
    updatedAt: new Date().toISOString()
  } : student);

  elements.spinForm.querySelector('button[type="submit"]').disabled = true;
  try {
    homeStudents = await saveStudents(nextStudents);
    elements.spinDialog.close();
    renderHomeOperations();
  } catch (error) {
    console.warn("Spin training event could not be saved", error);
    elements.spinMessage.textContent = "Spin training event could not be saved. Try again.";
    elements.spinMessage.hidden = false;
  } finally {
    elements.spinForm.querySelector('button[type="submit"]').disabled = false;
  }
}

function renderWatchList(items) {
  elements.watchCount.textContent = items.length;
  elements.watchList.innerHTML = items.length ? items.map(({ student, flags }) => `
    <a class="home-watch-row" href="student-detail.html?id=${encodeURIComponent(student.id)}">
      <span>
        <strong>${escapeHtml(student.studentName)}</strong>
        <small>${escapeHtml(student.group || "No group")} · ${escapeHtml(student.assignedCFI || "No CFI")}</small>
      </span>
      <b>${escapeHtml(flags[0].label)}</b>
    </a>
  `).join("") : `<div class="home-empty-state">No urgent student watch items right now.</div>`;
}

async function renderHomeOperations() {
  if (elements.today) {
    elements.today.textContent = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(new Date());
  }

  try {
    const students = await loadStudents();
    homeStudents = students;
    renderSpinStudentOptions();
    const stats = getDashboardStats(students);
    elements.studentCount.textContent = stats.activeCount;
    renderSpinAlerts(getSpinAlerts(students));
    renderWatchList(importantWatchItems(students));
  } catch (error) {
    console.warn("Home operations failed to load student data", error);
    elements.spinList.innerHTML = `<div class="home-empty-state">Student alerts could not load.</div>`;
    elements.watchList.innerHTML = `<div class="home-empty-state">Student watch could not load.</div>`;
  }
}

elements.openSpinDialog?.addEventListener("click", openSpinEventDialog);
elements.closeSpinDialog?.addEventListener("click", () => elements.spinDialog.close());
elements.cancelSpinDialog?.addEventListener("click", () => elements.spinDialog.close());
elements.spinForm?.addEventListener("submit", saveSpinEvent);
elements.spinList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-complete-spin]");
  if (!button) return;
  completeSpinEvent(button.dataset.completeSpin, button);
});
renderHomeOperations();
window.addEventListener("focus", renderHomeOperations);
