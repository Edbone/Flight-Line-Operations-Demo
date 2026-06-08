import { loadCollectionData, saveCollectionData } from "./firebase.js";

const STORAGE_KEY = "aoa-stage-check-requests-v2";

const IMPORTED_TSV = `Thursday 4/16/2026	Jeffrey Garrity	IRA	Stage 2 Phase 4		Friday 4/17/2026	Wednesday 4/22/2026	24		Delayed	Student Not Available	Student declined scheduling on 4/19
Friday 4/17/2026	Will Wood	PPL	EOC		Friday 4/17/2026	Friday 4/24/2026	0	168	Delayed	Student Not Available	Student not available until 4/22
Friday 4/17/2026	Ryan Castleberry	IRA	Phase 4		Friday 4/17/2026	Saturday 4/18/2026	0	24	On-time		
Saturday 4/18/2026	Drew Kelly	IRA	Stage 3	6-8 PM, 8-10 PM	Sunday 4/19/2026	Monday 4/20/2026	24	24	On-time		Drew Kelly has limited availability
Sunday 4/19/2026	Bella Pena	PPL	20 hour Eval	Only her time slots	Sunday 4/19/2026	Wednesday 4/22/2026	0	72	Delayed	Student Not Available	Scheduled in her next time slot; she is not available outside allotted slots
Monday 4/20/2026	Lauren Bourret	PPL	Stage 2 phase 5 pre solo	Open availability					On-time		
Tuesday 4/21/2026	Ryan Drozd	IRA	EOC recheck	24th, 26th, or 30th	Tuesday 4/21/2026	Thursday 4/30/2026	0	216	Delayed	Student Not Available	Was scheduled within 48 hours, but check is not until next week due to limited availability
Wednesday 4/22/2026	Nick Peteas	IRA	Phase 2	25th-29th anytime	Wednesday 4/22/2026	Thursday 4/23/2026	0	24	Delayed	Student Not Available	Scheduled within 24 hours, but student availability did not start until Saturday
Friday 4/24/2026	Kevin Abi	CFI	EOC	27th-29th anytime	Friday 4/24/2026	Friday 4/24/2026	0	96	Delayed	Student Not Available	Student unavailable until 4/27
Friday 4/24/2026	Ryan Callan	IRA	Stage 1	Weekend; after 4 PM Mon-Wed	Friday 4/24/2026	Friday 4/24/2026	0	72	Delayed	Other	Airport closed on weekend, no planes, limited evening availability
Friday 4/24/2026	Justin Garrow	IRA	EOC	Full	Friday 4/24/2026	Friday 4/24/2026	0	0	On-time		
Sunday 4/26/2026	Edwin Garcia	IRA	EOC	Open availability starting Monday	Sunday 4/26/2026	Tuesday 4/28/2026	0	48	Delayed	Check Instructor Availability	Technically past 48; scheduled ASAP given availability and instructor schedule
Sunday 4/26/2026	Alysha Andrade	IRA	Stage 2 IRA	Tuesday limited; Wednesday all day	Sunday 4/26/2026	Wednesday 4/29/2026	0	72	Delayed	Student Not Available	Availability and student requested this time
Monday 4/27/2026	Fernando Neves	PPL	EOC part 61	Wed, Fri, Sat all day	Tuesday 4/28/2026	Friday 5/1/2026	24	72	Delayed	Check Instructor Availability	Emma and Ryan do not have good availability until weekend
Monday 4/27/2026	Daniel Weis	IRA	Stage 3 Phase 6	Every day after 4 PM	Tuesday 4/28/2026	Wednesday 4/29/2026	24	24	On-time		
Tuesday 4/28/2026	Justin Garrow	IRA	EOC	Open May 1; May 4 noon onward	Friday 5/1/2026	Wednesday 5/6/2026	72	120	Delayed	Student Not Available	Availability started on 5/4
Friday 5/1/2026	Trevor Kwiatkowski	PPL	Phase 5	Open	Friday 5/1/2026	Saturday 5/2/2026	0	24	On-time		
Monday 5/4/2026	Conor Riegel-Madden	PPL	Phase 2 Stage check	All day tomorrow; Wed-Sun until 6 PM	Monday 5/4/2026	Tuesday 5/5/2026	0	24	On-time		
Monday 5/4/2026	Daniel Weis	IRA	Stage 3 phase 6 recheck	Available every day after 4 PM	Tuesday 5/5/2026	Tuesday 5/5/2026	24	0	On-time		
Tuesday 5/5/2026	Preston Lovin	PPL	Stage 2 Flight Recheck	12-4 PM next 3 days	Wednesday 5/6/2026	Thursday 5/7/2026	24	24	On-time		Scheduled for Friday 5/8 right at 48 hours
Wednesday 5/6/2026	Trevor Kwiatkowski	IRA	Phase 5	Thursday-Saturday 6-10 AM	Wednesday 5/6/2026	Friday 5/8/2026	0	48	On-time		Early availability
Friday 5/15/2026	Edwin Garcia	IRA	EOC	Tuesday 10 AM; Wednesday and Thursday all day	Monday 5/11/2026	Thursday 5/14/2026	-96	72	Delayed	Check Instructor Availability	Brady had EOC and spin trainings; scheduled with Evan
Friday 5/15/2026	Tyler Wobschall	PPL	Pre solo 141	Open availability	Tuesday 5/12/2026	Wednesday 5/13/2026	-72	24	On-time		
Monday 5/11/2026	Sophia Monk	PPL	Presolo stage check	Available all week except Wed after 3 PM and Sat after 2 PM	Tuesday 5/12/2026	Wednesday 5/13/2026	24	24	On-time		
Monday 5/11/2026	Chris Freeman	IRA	EOC	Mon 11-5; Tue 1-6; Wed-Thu 11-6	Thursday 5/14/2026	Thursday 5/14/2026	72	0	On-time	Student Not Available	Availability changed due to a family emergency
Monday 5/11/2026	Michael Dicembre	CAX	EOC	After 10 AM on 5/13, 5/14, 5/16	Thursday 5/14/2026	Thursday 5/14/2026	72	0	On-time	Student Not Available	Student wanted to fly with Peter one last time before progress check
Friday 5/15/2026	Roy Jones	IRA	Stage 2	After 6 PM; Fri-Sat after 4 PM	Friday 5/15/2026	Saturday 5/16/2026	0	24	On-time		
Friday 5/15/2026	Max Olsen	PPL	Phase 7	Any day except Monday	Friday 5/15/2026	Tuesday 5/19/2026	0	96	Delayed	Student Not Available	Originally scheduled for 5/16; student declined and requested Tuesday
Monday 5/18/2026	Nik Olsen	PPL	Phase 5	Open after Tuesday	Monday 5/18/2026	Thursday 5/21/2026		72	Delayed	Check Instructor Availability	Brady is fully booked with progress checks until that point
Sunday 5/17/2026	Lauren Bourret	PPL	Stage 2 phase 5	Open availability	Sunday 5/17/2026	Tuesday 5/19/2026	6	48	Delayed	Check Instructor Availability	Had to move things around to schedule it
Thursday 5/21/2026	Max Olsen	PPL	Phase 7 recheck	Open except Mondays	Thursday 5/21/2026	Friday 5/22/2026	10		On-time		
Sunday 5/24/2026	Will Wood	PPL	EOC flight recheck	Open Thursday 5/28 and Friday 5/29	Sunday 5/24/2026	Thursday 5/28/2026	6	0	Delayed	Student Not Available	Student availability
Sunday 5/24/2026	Cory Sitler	PPL	EOC	5/29 12-6; 5/30 and 5/31 open	Monday 5/25/2026	Saturday 5/30/2026		0	Delayed	Student Not Available	Student availability
Monday 5/25/2026	Bailey Dean	PPL	Phase 2 Stage check	Open	Monday 5/25/2026	Wednesday 5/27/2026	0	48	On-time		
Monday 5/25/2026	Chris Batchelor	CFI	Phase 2 141 student	Open except Saturday and Sunday	Monday 5/25/2026	Wednesday 5/27/2026	0	48	On-time		
Monday 5/25/2026	Sam Trawick	IRA	EOC Mock recheck	Open 5/29 and June 2-5	Monday 5/25/2026	Friday 5/29/2026	0	96	Delayed	Student Not Available	Student availability
Thursday 5/28/2026	Trevor Kwiatkowski	PPL	Phase 7	Open	Wednesday 5/27/2026	Thursday 5/28/2026	1	21	Delayed	Student Not Available	Opening for Friday but student requested Saturday
Thursday 5/28/2026	Ethan Winkler	IRA	EOC	29th before 5; 30th unavailable; 31st after 2; June 1-6 varied	Thursday 5/28/2026	Thursday 5/28/2026	18	2	Delayed	Check Instructor Availability	Instructor schedule full and student availability did not allow mornings
Friday 5/29/2026	Roy Jones	IRA	Phase 2	After 4 PM; Friday and Saturday after 6 AM		Friday 5/29/2026	12	0.27	On-time		
Monday 6/1/2026	Alysha Andrade	IRA	Stage 3	6 AM-12 PM on listed dates	Monday 6/1/2026	Monday 6/1/2026	1		On-time		
Thursday 6/4/2026	Nik Olsen	PPL	Stage 5 recheck									`;

const rows = document.querySelector("#request-rows");
const emptyState = document.querySelector("#empty-state");
const dialog = document.querySelector("#request-dialog");
const form = document.querySelector("#request-form");
const searchInput = document.querySelector("#search-input");
const courseFilter = document.querySelector("#course-filter");
const statusFilter = document.querySelector("#status-filter");
const deleteButton = document.querySelector("#delete-request-button");
const dialogTitle = document.querySelector("#request-dialog-title");
const toast = document.querySelector("#stage-toast");
let requests = [];

function parseImportedRequests() {
  return IMPORTED_TSV.trim().split("\n").map((line, index) => {
    const columns = line.split("\t");
    while (columns.length < 12) columns.push("");
    const [requestedRaw, student, course, checkType, availability, approvedRaw, scheduledRaw, approvalHours, scheduleHours, status, delayReason, notes] = columns;
    return {
      id: `import-${index + 1}`,
      requestedAt: parseSourceDate(requestedRaw),
      approvedAt: parseSourceDate(approvedRaw),
      scheduledAt: parseSourceDate(scheduledRaw),
      requestedRaw, approvedRaw, scheduledRaw,
      student, course: course.toUpperCase(), checkType, availability, delayReason, notes,
      approvalHoursOverride: parseHours(approvalHours),
      scheduleHoursOverride: parseHours(scheduleHours),
      statusOverride: status === "Delayed" ? "delayed" : status === "On-time" ? "on-time" : ""
    };
  });
}

function parseSourceDate(value) {
  if (!value) return "";
  const match = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return "";
  const year = match[3] ? Number(match[3]) + (Number(match[3]) < 100 ? 2000 : 0) : 2026;
  return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}T12:00`;
}

function parseHours(value) {
  if (value === "" || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadRequests() {
  try {
    const loaded = await loadCollectionData("stage-check-requests", STORAGE_KEY);
    return Array.isArray(loaded) && loaded.length > 0 ? loaded : parseImportedRequests();
  } catch {
    return parseImportedRequests();
  }
}

async function saveRequests() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  await saveCollectionData("stage-check-requests", requests);
}

function hoursBetween(start, end) {
  if (!start || !end) return null;
  const value = (new Date(end) - new Date(start)) / 36e5;
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function approvalHours(request) {
  return request.approvalHoursOverride ?? hoursBetween(request.requestedAt, request.approvedAt);
}

function scheduleHours(request) {
  return request.scheduleHoursOverride ?? hoursBetween(request.approvedAt, request.scheduledAt);
}

function formatHours(value) {
  if (value === null || value === undefined) return "—";
  if (value < 1 && value >= 0) return `${Math.round(value * 60)} min`;
  return `${Math.round(value)} hrs`;
}

function formatDate(value, rawValue = "") {
  if (!value) return rawValue || "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function getStatus(request) {
  if (request.statusOverride) return request.statusOverride;
  if (!request.approvedAt || !request.scheduledAt) return "pending";
  return scheduleHours(request) <= 48 ? "on-time" : "delayed";
}

function getFilterStatus(request) {
  if (!request.requestedAt || !request.student || !request.checkType) return "incomplete";
  return getStatus(request);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = requests
    .filter((request) => !courseFilter.value || request.course === courseFilter.value)
    .filter((request) => !statusFilter.value || getFilterStatus(request) === statusFilter.value)
    .filter((request) => [request.student, request.course, request.checkType, request.availability, request.delayReason, request.notes]
      .some((value) => (value || "").toLowerCase().includes(term)))
    .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));

  rows.innerHTML = filtered.map((request) => {
    const approveTime = approvalHours(request);
    const scheduleTime = scheduleHours(request);
    const status = getStatus(request);
    const statusLabel = status === "on-time" ? "Scheduled ≤ 48 hrs" : status === "delayed" ? "Scheduled > 48 hrs" : "Pending";
    return `
      <tr class="${!request.approvedAt || !request.scheduledAt ? "request-incomplete" : ""}">
        <td><time>${formatDate(request.requestedAt, request.requestedRaw)}</time></td>
        <td><strong>${escapeHtml(request.student)}</strong><span class="course-chip">${escapeHtml(request.course)}</span><small>${escapeHtml(request.checkType)}</small></td>
        <td class="wrap-cell">${escapeHtml(request.availability || "Not provided")}</td>
        <td><time>${formatDate(request.approvedAt, request.approvedRaw)}</time><small>${approveTime === null ? "Awaiting approval" : `${formatHours(approveTime)} to approve`}</small></td>
        <td><time>${formatDate(request.scheduledAt, request.scheduledRaw)}</time><small>${scheduleTime === null ? "Awaiting schedule" : `${formatHours(scheduleTime)} to schedule`}</small></td>
        <td><strong>${formatHours(scheduleTime)}</strong><small>approval → scheduled</small></td>
        <td class="wrap-cell"><span class="status-badge status-${status}">${statusLabel}</span>${request.delayReason ? `<small class="delay-reason">${escapeHtml(request.delayReason)}</small>` : ""}${request.notes ? `<small title="${escapeHtml(request.notes)}">${escapeHtml(request.notes)}</small>` : ""}</td>
        <td><button class="row-action edit-action" type="button" data-edit="${request.id}">Edit</button></td>
      </tr>`;
  }).join("");

  emptyState.hidden = filtered.length > 0;
  document.querySelector("#result-count").textContent = `${filtered.length} of ${requests.length} requests`;
  renderMetrics();
}

function renderMetrics() {
  const scheduled = requests.filter((request) => getStatus(request) !== "pending");
  const onTime = scheduled.filter((request) => getStatus(request) === "on-time").length;
  const delayed = scheduled.filter((request) => getStatus(request) === "delayed").length;
  const studentDelayed = scheduled.filter((request) => {
    if (getStatus(request) !== "delayed") return false;
    return `${request.delayReason || ""} ${request.notes || ""}`.toLowerCase().includes("student") &&
      `${request.delayReason || ""} ${request.notes || ""}`.toLowerCase().includes("availab");
  }).length;
  const open = requests.filter((request) => !request.approvedAt || !request.scheduledAt).length;
  const times = scheduled.map(scheduleHours).filter((value) => value !== null && value >= 0);
  const average = times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0;
  document.querySelector("#open-count").textContent = open;
  document.querySelector("#on-time-rate").textContent = scheduled.length ? `${Math.round((onTime / scheduled.length) * 100)}%` : "0%";
  document.querySelector("#on-time-detail").textContent = `${onTime} of ${scheduled.length} recorded`;
  document.querySelector("#average-hours").textContent = formatHours(average);
  document.querySelector("#delayed-count").textContent = delayed;
  document.querySelector("#student-delay-count").textContent = studentDelayed;
  document.querySelector("#student-delay-detail").textContent = delayed
    ? `${Math.round((studentDelayed / delayed) * 100)}% of delayed requests`
    : "0% of delayed requests";
}

function localDateTimeNow() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function openForm(request = null) {
  form.reset();
  form.elements.requestId.value = request?.id || "";
  form.elements.requestedAt.value = request?.requestedAt || localDateTimeNow();
  ["student", "course", "checkType", "availability", "approvedAt", "scheduledAt", "statusOverride", "delayReason", "notes"]
    .forEach((name) => { if (request) form.elements[name].value = request[name] || ""; });
  dialogTitle.textContent = request ? "Edit stage check" : "Add a stage check";
  deleteButton.hidden = !request;
  dialog.showModal();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function exportCsv() {
  const columns = ["Timestamp", "Student Name", "Course", "Progress Check Type", "Student Availability", "Approved", "Scheduled", "Time to Approval (hrs)", "Time to Schedule (hrs)", "Scheduling Status", "Delay Reason", "Notes"];
  const csvRows = requests.map((request) => [
    request.requestedAt, request.student, request.course, request.checkType, request.availability, request.approvedAt,
    request.scheduledAt, approvalHours(request), scheduleHours(request), getStatus(request), request.delayReason, request.notes
  ]);
  const csv = [columns, ...csvRows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `stage-checks-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const request = { ...data, id: data.requestId || crypto.randomUUID() };
  delete request.requestId;
  if (getStatus(request) === "delayed" && !request.delayReason.trim()) {
    showToast("Add a delay reason for requests over 48 hours.");
    form.elements.delayReason.focus();
    return;
  }
  const index = requests.findIndex((item) => item.id === request.id);
  if (index >= 0) requests[index] = request;
  else requests.push(request);
  saveRequests();
  dialog.close();
  render();
  showToast(index >= 0 ? "Stage check updated." : "Stage check added.");
});

rows.addEventListener("click", (event) => {
  const request = requests.find((item) => item.id === event.target.dataset.edit);
  if (request) openForm(request);
});

deleteButton.addEventListener("click", () => {
  const id = form.elements.requestId.value;
  if (!id || !confirm("Delete this stage check request?")) return;
  requests = requests.filter((request) => request.id !== id);
  saveRequests();
  dialog.close();
  render();
  showToast("Stage check deleted.");
});

[searchInput, courseFilter, statusFilter].forEach((element) => element.addEventListener("input", render));
document.querySelector("#open-form-button").addEventListener("click", () => openForm());
document.querySelector("#close-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#export-button").addEventListener("click", exportCsv);
document.querySelector("#restore-import-button").addEventListener("click", () => {
  if (!confirm("Replace current stage-check data with the original imported history?")) return;
  requests = parseImportedRequests();
  saveRequests();
  render();
  showToast("Imported stage-check history restored.");
});

(async () => {
  requests = await loadRequests();
  render();
})();
