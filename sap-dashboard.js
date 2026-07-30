import { loadCollectionData, loadFirestoreCollection, saveFirestoreDocument } from "./firebase.js";
import { loadStudents } from "./student-data.js";
import { escapeHtml, formatDate } from "./student-utils.js";
import { evaluateMilestone } from "./sap-core.mjs";
import { loadWrittenTestHistory } from "./written-test-data.mjs";

const state = { students: [], milestones: [], imports: [], notifications: [], attempts: [], scheduled: [], checks: [], evaluated: [], filters: { campus: "", instructor: "", student: "", course: "", type: "", priority: "", status: "", ready: "" } };
await window.AOAAuth?.ready;
const [students, milestones, imports, notifications, customAttempts, importedAttempts, scheduled, checks] = await Promise.all([
  loadStudents(), safeCollection("sap_milestones"), safeCollection("sap_imports"), safeCollection("sap_notifications"), loadCollectionData("written-test-custom", "aoa-written-test-custom-scores-v1"), loadWrittenTestHistory(), loadCollectionData("written-test-schedule", "aoa-written-test-schedule-v1"), loadCollectionData("stage-check-requests", "aoa-stage-check-requests-v2")
]);
const attempts = [...importedAttempts, ...customAttempts];
Object.assign(state, { students, milestones, imports, notifications, attempts, scheduled, checks });
const studentById = new Map(students.map((student) => [String(student.id), student]));
state.evaluated = milestones.map((milestone) => {
  const student = studentById.get(String(milestone.studentId)) || { id: milestone.studentId, studentName: milestone.studentName || "Unknown student" };
  return { ...evaluateMilestone({ ...milestone, rawLabel: milestone.originalLabel || milestone.rawLabel }, { student, writtenAttempts: attempts, writtenScheduled: scheduled, stageRequests: checks }), student };
});
students.filter((student) => student.projectedGraduationDate).forEach((student) => state.evaluated.push({ ...evaluateMilestone({ id: `graduation-${student.id}`, studentId: student.id, course: "Program", courseOrder: 999, rawLabel: "Projected graduation", originalLabel: "Projected graduation", normalizedType: "other", projectedDate: student.projectedGraduationDate, dateStatus: "projected", completionStatus: "incomplete" }, { student }), student, isGraduation: true }));
await createDashboardNotifications();
fillFilters();
render();

async function safeCollection(name) { try { return await loadFirestoreCollection(name); } catch { return []; } }

document.querySelectorAll("[data-sap-filter]").forEach((control) => control.addEventListener("input", () => { state.filters[control.dataset.sapFilter] = control.value; render(); }));

function fillFilters() {
  fill("campus", students.map((item) => item.campus));
  fill("instructor", students.map((item) => item.assignedCFI));
  fill("student", students.map((item) => item.studentName));
  fill("course", state.evaluated.map((item) => item.course));
  fill("type", state.evaluated.map((item) => item.normalizedType));
}

function fill(name, values) {
  const select = document.querySelector(`[data-sap-filter="${name}"]`);
  [...new Set(values.filter(Boolean))].sort().forEach((value) => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(String(value).replaceAll("_", " "))}</option>`));
}

function filtered() {
  return state.evaluated.filter((item) => !state.filters.campus || item.student.campus === state.filters.campus)
    .filter((item) => !state.filters.instructor || item.student.assignedCFI === state.filters.instructor)
    .filter((item) => !state.filters.student || item.student.studentName === state.filters.student)
    .filter((item) => !state.filters.course || item.course === state.filters.course)
    .filter((item) => !state.filters.type || item.normalizedType === state.filters.type)
    .filter((item) => !state.filters.priority || item.priority === state.filters.priority)
    .filter((item) => !state.filters.status || item.completionStatus === state.filters.status)
    .filter((item) => !state.filters.ready || item.written?.length && (state.filters.ready === "ready" ? item.written.every((test) => test.practice.ready || test.status === "passed") : item.written.some((test) => !test.practice.ready && test.status !== "passed")))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999) || a.student.studentName.localeCompare(b.student.studentName));
}

function render() {
  const items = filtered();
  const studentGroups = groupByStudent(items);
  const overdue = state.evaluated.filter((item) => item.status === "overdue" && item.completionStatus !== "completed").length;
  const due7 = state.evaluated.filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= 7 && item.completionStatus !== "completed").length;
  const due14 = state.evaluated.filter((item) => item.daysRemaining > 7 && item.daysRemaining <= 14 && item.completionStatus !== "completed").length;
  const due30 = state.evaluated.filter((item) => item.daysRemaining > 14 && item.daysRemaining <= 30 && item.completionStatus !== "completed").length;
  const notReady = state.evaluated.filter((item) => item.written?.some((test) => test.status !== "passed" && !test.practice.ready)).length;
  document.querySelector("#sap-dashboard-metrics").innerHTML = [["Overdue", overdue, "metric-red"], ["Due in 7 days", due7, "metric-orange"], ["Due in 14 days", due14, "metric-yellow"], ["Due in 30 days", due30, "metric-blue"], ["Written not ready", notReady, "metric-purple"]].map(([label, count, tone]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${count}</strong><small>Current SAP timelines</small></article>`).join("");
  document.querySelector("#sap-alert-count").textContent = `${items.length} milestones · ${studentGroups.length} ${studentGroups.length === 1 ? "student" : "students"}`;
  document.querySelector("#sap-dashboard-alerts").innerHTML = items.length ? studentGroups.map((group) => studentGroupMarkup(group, studentGroups.length === 1)).join("") : `<div class="empty-state"><strong>No milestones match these filters.</strong></div>`;
  renderImports();
  renderNotifications();
}

function groupByStudent(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.student.id || item.student.studentName;
    if (!groups.has(key)) groups.set(key, { student: item.student, items: [] });
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
}

function studentGroupMarkup(group, open) {
  const counts = group.items.reduce((result, item) => ({ ...result, [item.priority]: (result[item.priority] || 0) + 1 }), {});
  const highestPriority = group.items[0]?.priority || "informational";
  const nextItem = group.items.find((item) => item.completionStatus !== "completed") || group.items[0];
  const summary = ["critical", "high", "medium", "informational"]
    .filter((priority) => counts[priority])
    .map((priority) => `<span class="sap-student-priority"><span class="sap-priority-dot ${priority}"></span>${counts[priority]} ${priority === "informational" ? "info" : priority}</span>`)
    .join("");
  const nextLabel = nextItem ? `${formatDate(nextItem.projectedDate) || nextItem.dateStatus || "Unscheduled"} · ${nextItem.originalLabel || nextItem.rawLabel}` : "No upcoming milestone";
  return `<details class="sap-student-alert-group sap-priority-${highestPriority}"${open ? " open" : ""}><summary><span class="sap-student-chevron" aria-hidden="true"></span><span class="sap-student-alert-name"><strong>${escapeHtml(group.student.studentName)}</strong><small>${group.items.length} ${group.items.length === 1 ? "milestone" : "milestones"}</small></span><span class="sap-student-priorities">${summary}</span><span class="sap-student-next"><small>Most urgent</small><b>${escapeHtml(nextLabel)}</b></span></summary><div class="sap-student-alert-items">${group.items.map(alertMarkup).join("")}</div></details>`;
}

function alertMarkup(item) {
  const days = item.daysRemaining === null ? item.status === "tbd" ? "TBD" : "Unscheduled" : item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)} days overdue` : item.daysRemaining === 0 ? "Due today" : `${item.daysRemaining} days remaining`;
  const linked = item.written?.length ? item.written.map((test) => `${test.test}: ${test.status.replaceAll("_", " ")}; practice ${test.practice.highestScore ?? "none"}${test.practice.ready ? " ready" : ""}`).join(" · ") : item.stage ? `Check ${item.stage.status}` : item.warnings.join(" · ");
  return `<a class="sap-dashboard-alert sap-priority-${item.priority}" href="student-detail.html?id=${encodeURIComponent(item.student.id)}#sap-training-timeline"><span class="sap-priority-dot ${item.priority}"></span><div><strong>${escapeHtml(item.originalLabel || item.rawLabel)}</strong><span>${escapeHtml(item.course)}</span><small>${escapeHtml(linked || item.status.replaceAll("_", " "))}</small></div><div><b>${escapeHtml(formatDate(item.projectedDate) || item.dateStatus || "Blank")}</b><small>${escapeHtml(days)}</small></div><span class="sap-alert-priority">${escapeHtml(item.priority)}</span></a>`;
}

function renderImports() {
  const needsReview = state.imports.filter((item) => ["pending_review", "parse_failed"].includes(item.status)).sort((a, b) => timestamp(b.uploadedAt).localeCompare(timestamp(a.uploadedAt)));
  document.querySelector("#sap-import-review-list").innerHTML = needsReview.length ? needsReview.map((item) => `<a class="student-alert-row" href="sap-import?resume=${encodeURIComponent(item.id)}"><strong>${escapeHtml(item.extracted?.studentName || item.originalFilename || "SAP import")}</strong><span>${escapeHtml(item.status.replaceAll("_", " "))}</span><small>${escapeHtml(timestamp(item.uploadedAt) ? new Date(timestamp(item.uploadedAt)).toLocaleString() : "Awaiting review")}</small></a>`).join("") : `<div class="empty-state compact"><strong>No imports need review.</strong></div>`;
}

function renderNotifications() {
  const grouped = new Map();
  [...state.notifications]
    .sort((a, b) => timestamp(b.createdAt).localeCompare(timestamp(a.createdAt)))
    .forEach((item) => {
      const key = item.studentId || item.studentName || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
  const students = [...grouped.values()].slice(0, 12);
  document.querySelector("#sap-notification-list").innerHTML = students.length ? students.map(notificationStudentMarkup).join("") : `<div class="empty-state compact"><strong>No SAP notifications yet.</strong></div>`;
}

function notificationStudentMarkup(items) {
  const latest = items[0];
  const highestPriority = [...items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0]?.priority || "informational";
  const message = latest.message || latest.milestoneLabel || String(latest.type || "SAP update").replaceAll("_", " ");
  const date = timestamp(latest.createdAt) ? new Date(timestamp(latest.createdAt)).toLocaleString() : "";
  return `<a class="sap-notification-student" href="student-detail.html?id=${encodeURIComponent(latest.studentId || "")}#sap-training-timeline"><span class="sap-notification-heading"><span class="sap-priority-dot ${escapeHtml(highestPriority)}"></span><strong>${escapeHtml(latest.studentName || "Student")}</strong><b>${items.length} ${items.length === 1 ? "alert" : "alerts"}</b></span><span class="sap-notification-message">${escapeHtml(message)}</span><small>${escapeHtml(latest.course || "SAP timeline")}${date ? ` · ${escapeHtml(date)}` : ""}</small></a>`;
}

function timestamp(value) { if (!value) return ""; if (typeof value === "string") return value; if (value.toDate) return value.toDate().toISOString(); if (value._seconds) return new Date(value._seconds * 1000).toISOString(); return ""; }
function priorityRank(value) { return ({ critical: 0, high: 1, medium: 2, informational: 3 })[value] ?? 4; }

async function createDashboardNotifications() {
  if (!window.AOAAuth?.getCurrentUser?.()?.isAdmin) return;
  const existingIds = new Set(state.notifications.map((item) => item.id));
  const candidates = state.evaluated.flatMap(notificationEvents);
  const createdAt = new Date().toISOString();
  const pending = [];
  for (const candidate of candidates) {
    const id = await notificationId(candidate.dedupeKey);
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    const record = { ...candidate, id, read: false, createdAt };
    pending.push(saveFirestoreDocument("sap_notifications", id, record, { merge: false }).then(() => record));
  }
  if (!pending.length) return;
  const results = await Promise.allSettled(pending);
  state.notifications.push(...results.filter((result) => result.status === "fulfilled").map((result) => result.value));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) console.warn(`${failed.length} SAP notification(s) could not be saved.`, failed[0].reason);
}

function notificationEvents(item) {
  const notifyStatuses = new Set(["due_30", "due_14", "due_7", "due_today", "overdue"]);
  const events = [];
  if (notifyStatuses.has(item.status) && item.completionStatus !== "completed") events.push(notificationEvent(item, item.status, item.originalLabel || item.rawLabel));
  (item.warnings || []).forEach((warning) => events.push(notificationEvent(item, `${item.status}:${warning.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, warning)));
  return events;
}

function notificationEvent(item, kind, message) {
  return { type: kind, milestoneId: item.id, studentId: item.student.id, studentName: item.student.studentName, course: item.course, milestoneLabel: item.originalLabel || item.rawLabel, projectedDate: item.projectedDate || null, priority: item.priority, message, dedupeKey: `${item.id}:${kind}` };
}

async function notificationId(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
