import { cacheLocalData, loadCollectionData, saveCollectionData, subscribeCollectionData } from "./firebase.js";
import { DEFAULT_INSTRUCTORS, activeInstructorNames, loadInstructors, subscribeInstructors } from "./instructor-data.js";
import { loadStudents } from "./student-data.js";
import { escapeHtml, makeId } from "./student-utils.js";

const STORAGE_KEY = "aoa-master-schedule-v1";
const COLLECTION = "master-schedule";
const CONFIG_STORAGE_KEY = "aoa-master-schedule-config-v1";
const CONFIG_COLLECTION = "master-schedule-config";
const LIVE_FALLBACK_INTERVAL_MS = 15000;
const LAST_INSTRUCTOR_KEY = "aoa-master-schedule-last-instructor-v1";
const UNSYNCED_KEY = "aoa-master-schedule-unsynced-v1";
const DEFAULT_BOOKING_MINUTES = 120;
const VIEW_LABELS = {
  "instructor-day": "Instructor by day",
  "airplane-day": "Daily by airplane",
  "instructor-daily": "Daily by instructor"
};

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wed"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"]
];
const CATEGORIES = [
  ["private", "Private", "#19a9dc"],
  ["commercial", "Commercial", "#0906f5"],
  ["instrument", "Instrument", "#50b38a"],
  ["vfr-checkout", "VFR Checkout", "#6f8a92"],
  ["pending", "Pending", "#dc9696"],
  ["floating", "Floating", "#10f24b"],
  ["cfi", "CFI", "#4caec4"],
  ["cfii", "CFII", "#9dbbeb"],
  ["multi", "Multi", "#ef00e8"],
  ["prog-check", "Prog Check", "#f40d0d"],
  ["ground", "Ground", "#e58a2b"]
];
const DEFAULT_AIRPLANES = ["N174TH", "N24108", "N6064R", "N464ER", "N52522", "N55297", "N505FM"];
const OVERBOOKED_AIRPLANE = "__overbooked__";
const SLOT_START = 6 * 60;
const SLOT_END = 21 * 60 + 30;
const SLOT_STEP = 30;

const state = {
  bookings: [],
  students: [],
  instructors: [...DEFAULT_INSTRUCTORS],
  instructorDirectory: [],
  view: "instructor-day",
  instructorFilter: "all",
  configInstructors: [],
  lastInstructor: readLocalString(LAST_INSTRUCTOR_KEY),
  airplanes: [...DEFAULT_AIRPLANES],
  offDays: {},
  removedInstructors: [],
  instructorProfiles: {},
  progressBlocks: [],
  pendingProgressBlocks: [],
  draggingId: "",
  dragMoved: false,
  liveUnsubscribers: [],
  liveFallbackTimer: 0,
  unsyncedWrites: readUnsyncedWrites(),
  hasLocalUnsynced: false,
  canEdit: false,
  saving: false,
  lastStatusAt: 0,
  lastSavedAtByCollection: {}
};

state.hasLocalUnsynced = Object.values(state.unsyncedWrites).some(Boolean);

const els = {
  board: document.getElementById("schedule-board"),
  instructorFilter: document.getElementById("schedule-instructor-filter"),
  saveState: document.getElementById("schedule-save-state"),
  exportButton: document.getElementById("schedule-export-current"),
  printButton: document.getElementById("schedule-print-current"),
  legend: document.getElementById("schedule-legend"),
  dialog: document.getElementById("schedule-dialog"),
  form: document.getElementById("schedule-form"),
  batchDialog: document.getElementById("schedule-batch-dialog"),
  batchForm: document.getElementById("schedule-batch-form"),
  instructorDialog: document.getElementById("schedule-instructor-dialog"),
  instructorForm: document.getElementById("schedule-instructor-form"),
  batchDeleteDialog: document.getElementById("schedule-batch-delete-dialog"),
  batchDeleteForm: document.getElementById("schedule-batch-delete-form")
};

init();

async function init() {
  const user = await window.AOAAuth?.ready;
  state.canEdit = Boolean(user?.isAdmin);
  document.body.classList.toggle("schedule-readonly", !state.canEdit);
  document.getElementById("schedule-readonly-note").hidden = state.canEdit;
  hydrateControls();
  bindEvents();
  await loadData();
  renderAll();
  startLiveSync();
}

async function loadData() {
  const [loadedBookings, loadedConfig, loadedStudents, loadedInstructors] = await Promise.all([
    loadCollectionData(COLLECTION, STORAGE_KEY),
    loadCollectionData(CONFIG_COLLECTION, CONFIG_STORAGE_KEY),
    loadStudents().catch(() => []),
    loadInstructors().catch(() => [])
  ]);
  state.instructorDirectory = Array.isArray(loadedInstructors) ? loadedInstructors : [];
  applyBookings(loadedBookings);
  applyConfig(loadedConfig);
  state.students = Array.isArray(loadedStudents) ? loadedStudents : [];
  els.saveState.textContent = "Ready";
}

function applyBookings(loadedBookings) {
  state.bookings = Array.isArray(loadedBookings) ? loadedBookings.map(normalizeBooking).filter(Boolean) : [];
  syncInstructorRows();
}

function applyConfig(loadedConfig) {
  const config = normalizeConfig(loadedConfig);
  state.configInstructors = config.instructors || [];
  state.airplanes = normalizeAirplanes(config.airplanes, !Array.isArray(config.airplanes));
  state.offDays = config.offDays || {};
  state.removedInstructors = Array.isArray(config.removedInstructors) ? config.removedInstructors : [];
  state.instructorProfiles = config.instructorProfiles || {};
  state.progressBlocks = Array.isArray(config.progressBlocks) ? config.progressBlocks.map(normalizeProgressBlock).filter(Boolean) : [];
  syncInstructorRows();
}

function syncInstructorRows() {
  state.instructors = unique([
    ...activeInstructorNames(state.instructorDirectory),
    ...state.configInstructors,
    ...state.bookings.map((item) => item.instructor).filter(Boolean)
  ]).filter((name) => !state.removedInstructors.includes(name));
}

function startLiveSync() {
  state.liveUnsubscribers.forEach((unsubscribe) => unsubscribe());
  if (state.liveFallbackTimer) {
    window.clearInterval(state.liveFallbackTimer);
    state.liveFallbackTimer = 0;
  }
  state.liveUnsubscribers = [
    subscribeCollectionData(COLLECTION, (items, meta) => {
      if (!Array.isArray(items) || shouldDeferRemoteApply()) return;
      if (isStaleCollectionSnapshot(COLLECTION, meta)) return;
      applyBookings(items);
      renderAll();
      updateLiveStatus(meta);
    }, (error) => showLiveSyncError(error, COLLECTION)),
    subscribeCollectionData(CONFIG_COLLECTION, (items, meta) => {
      if (!Array.isArray(items) || shouldDeferRemoteApply()) return;
      if (isStaleCollectionSnapshot(CONFIG_COLLECTION, meta)) return;
      applyConfig(items);
      renderAll();
      updateLiveStatus(meta);
    }, (error) => showLiveSyncError(error, CONFIG_COLLECTION)),
    subscribeInstructors((items) => {
      if (!Array.isArray(items) || shouldDeferRemoteApply()) return;
      state.instructorDirectory = items;
      syncInstructorRows();
      renderAll();
    }, (error) => showLiveSyncError(error, "instructor-profiles"))
  ];
}

function updateLiveStatus(meta) {
  if (state.saving) return;
  const updatedAt = parseTimestamp(meta?.updatedAt);
  if (updatedAt && updatedAt < state.lastStatusAt - 1000) return;
  state.lastStatusAt = updatedAt || Date.now();
  const date = updatedAt ? new Date(updatedAt) : null;
  const suffix = date
    ? ` ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "";
  els.saveState.textContent = `Live${suffix}`;
}

function isStaleCollectionSnapshot(collectionName, meta) {
  const updatedAt = parseTimestamp(meta?.updatedAt);
  const lastSavedAt = state.lastSavedAtByCollection[collectionName] || 0;
  return Boolean(updatedAt && lastSavedAt && updatedAt < lastSavedAt - 1000);
}

function parseTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 0 : date.getTime();
}

function shouldDeferRemoteApply() {
  return state.saving || state.hasLocalUnsynced || [els.dialog, els.batchDialog, els.instructorDialog, els.batchDeleteDialog].some((dialog) => dialog?.open);
}

function showLiveSyncError(error, collectionName = "") {
  if (state.saving) return;
  startLivePollingFallback();
  els.saveState.textContent = `Live sync error${errorCodeText(error)}`;
  console.warn(`Master schedule live sync error${collectionName ? ` for ${collectionName}` : ""}`, error);
}

function startLivePollingFallback() {
  if (state.liveFallbackTimer) return;
  state.liveFallbackTimer = window.setInterval(refreshFromDatabaseFallback, LIVE_FALLBACK_INTERVAL_MS);
  refreshFromDatabaseFallback();
}

async function refreshFromDatabaseFallback() {
  if (shouldDeferRemoteApply()) return;
  const [bookingsResult, configResult] = await Promise.all([
    loadCollectionData(COLLECTION, STORAGE_KEY, { returnStatus: true }),
    loadCollectionData(CONFIG_COLLECTION, CONFIG_STORAGE_KEY, { returnStatus: true })
  ]);
  const remoteRead = bookingsResult.source !== "local" || configResult.source !== "local";
  if (remoteRead) {
    if (Array.isArray(bookingsResult.items)) applyBookings(bookingsResult.items);
    if (Array.isArray(configResult.items)) applyConfig(configResult.items);
    renderAll();
    els.saveState.textContent = `Polling database ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    return;
  }
  const error = bookingsResult.error || configResult.error;
  els.saveState.textContent = `Database read failed${errorCodeText(error)}`;
}

function errorCodeText(error) {
  const code = error?.code || error?.name || "";
  return code ? `: ${code}` : "";
}

function hydrateControls() {
  fillSelect(document.getElementById("schedule-day"), DAYS.map(([value, label]) => [value, label]));
  fillSelect(document.getElementById("schedule-category"), CATEGORIES.map(([value, label]) => [value, label]));
  fillSelect(document.getElementById("batch-category"), CATEGORIES.map(([value, label]) => [value, label]));
  fillSelect(document.getElementById("progress-day"), DAYS.map(([value, label]) => [value, label]));
  fillSelect(document.getElementById("delete-day"), [["all", "All days"], ...DAYS.map(([value, label]) => [value, label])]);
  fillSelect(document.getElementById("delete-category"), [["all", "All categories"], ...CATEGORIES.map(([value, label]) => [value, label])]);
  fillTimeSelect(document.getElementById("schedule-start"));
  fillTimeSelect(document.getElementById("schedule-end"));
  fillTimeSelect(document.getElementById("batch-start"));
  fillTimeSelect(document.getElementById("batch-end"));
  fillTimeSelect(document.getElementById("progress-start"));
  fillTimeSelect(document.getElementById("progress-end"));
  document.getElementById("schedule-start").value = "08:00";
  document.getElementById("schedule-end").value = "10:00";
  document.getElementById("batch-start").value = "08:00";
  document.getElementById("batch-end").value = "10:00";
  document.getElementById("progress-start").value = "08:00";
  document.getElementById("progress-end").value = "09:00";
}

function bindEvents() {
  document.querySelectorAll("[data-schedule-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.scheduleView;
      document.querySelectorAll("[data-schedule-view]").forEach((item) => item.classList.toggle("active", item === button));
      renderExportControl();
      renderBoard();
    });
  });
  els.instructorFilter.addEventListener("change", () => {
    state.instructorFilter = els.instructorFilter.value;
    renderBoard();
  });
  document.getElementById("schedule-instructor").addEventListener("change", (event) => rememberInstructor(event.target.value));
  document.getElementById("batch-instructor").addEventListener("change", (event) => rememberInstructor(event.target.value));
  document.getElementById("schedule-new-booking").addEventListener("click", () => {
    if (requireAdminEdit()) openBookingDialog();
  });
  document.getElementById("schedule-batch-open").addEventListener("click", () => {
    if (!requireAdminEdit()) return;
    applyLastInstructorToSelect(document.getElementById("batch-instructor"));
    els.batchDialog.showModal();
  });
  document.getElementById("schedule-batch-delete-open").addEventListener("click", openBatchDeleteDialog);
  document.getElementById("schedule-close-dialog").addEventListener("click", () => els.dialog.close());
  document.getElementById("schedule-close-batch").addEventListener("click", () => els.batchDialog.close());
  document.getElementById("schedule-close-instructor").addEventListener("click", () => els.instructorDialog.close());
  document.getElementById("schedule-close-batch-delete").addEventListener("click", () => els.batchDeleteDialog.close());
  document.getElementById("schedule-delete").addEventListener("click", deleteCurrentBooking);
  document.getElementById("schedule-add-instructor").addEventListener("click", openInstructorDialog);
  document.getElementById("schedule-edit-instructor").addEventListener("click", openSelectedInstructorDialog);
  document.getElementById("schedule-remove-instructor").addEventListener("click", removeInstructor);
  els.exportButton.addEventListener("click", exportCurrentScheduleView);
  els.printButton.addEventListener("click", printCurrentScheduleView);
  document.getElementById("progress-add").addEventListener("click", addPendingProgressBlock);
  els.form.addEventListener("submit", saveBookingFromForm);
  els.batchForm.addEventListener("submit", saveBatchFromForm);
  els.instructorForm.addEventListener("submit", saveInstructorFromForm);
  els.batchDeleteForm.addEventListener("submit", deleteBatchFromForm);
  els.batchDeleteForm.addEventListener("input", updateBatchDeleteCount);
  els.board.addEventListener("click", handleBoardClick);
  els.board.addEventListener("dragstart", handleDragStart);
  els.board.addEventListener("dragend", handleDragEnd);
  els.board.addEventListener("dragover", handleDragOver);
  els.board.addEventListener("dragleave", handleDragLeave);
  els.board.addEventListener("drop", handleDrop);
  window.addEventListener("beforeunload", (event) => {
    if (!state.saving && !state.hasLocalUnsynced) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("beforeprint", prepareSchedulePrint);
  window.addEventListener("afterprint", finishSchedulePrint);
}

function renderAll() {
  renderEditAccess();
  renderInstructorControls();
  renderStudents();
  renderAirplaneOptions();
  renderLegend();
  renderExportControl();
  renderBoard();
}

function renderExportControl() {
  const label = VIEW_LABELS[state.view] || "Current schedule";
  els.exportButton.textContent = "Export CSV";
  els.exportButton.title = `Download the ${label.toLowerCase()} tab as a CSV file`;
  els.printButton.textContent = `Print ${label}`;
  els.printButton.title = `Print or save the ${label.toLowerCase()} tab as a styled PDF`;
}

function printCurrentScheduleView() {
  prepareSchedulePrint();
  try {
    // Keep this synchronous with the button click. Mobile Safari blocks print
    // dialogs that are started later from a timer or other async callback.
    window.print();
  } catch (error) {
    finishSchedulePrint();
    console.warn("Schedule print failed", error);
    window.alert("The print dialog could not open. Try the browser menu and choose Print.");
  }
}

function prepareSchedulePrint() {
  const label = VIEW_LABELS[state.view] || "Master schedule";
  const filter = state.instructorFilter === "all" ? "All instructors" : state.instructorFilter;
  document.getElementById("schedule-print-title").textContent = label;
  document.getElementById("schedule-print-meta").textContent = `${filter} · Printed ${new Date().toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  })}`;
  document.body.classList.add("schedule-print-mode");
}

function finishSchedulePrint() {
  document.body.classList.remove("schedule-print-mode");
}

function exportCurrentScheduleView() {
  const columns = [
    "View", "Day", "Grouped by", "Schedule lane", "Start", "End",
    "Student / activity", "Instructor", "Airplane", "Category", "Notes", "Status"
  ];
  const records = [];

  getRowsForView().filter((row) => row.type === "schedule").forEach((row) => {
    const bookings = (Array.isArray(row.bookings) ? row.bookings : bookingsForRow(row))
      .slice()
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const groupedBy = state.view === "airplane-day" ? "Airplane" : "Instructor";
    const lane = row.overbooked ? "Overbooked" : (row.airplane || row.instructor || row.label || "Unassigned");

    bookings.forEach((booking) => {
      const displayedAirplane = state.view === "airplane-day" && !row.overbooked
        ? lane
        : booking.airplane || booking.displayAirplane || "";
      records.push([
        VIEW_LABELS[state.view] || state.view,
        dayLabel(row.day),
        groupedBy,
        lane,
        displayTime(toMinutes(booking.start)),
        displayTime(toMinutes(booking.end)),
        booking.student || categoryMeta(booking.category).label,
        booking.instructor || "",
        displayedAirplane,
        categoryMeta(booking.category).label,
        booking.notes || "",
        booking.overbooked || row.overbooked ? "Overbooked" : booking.systemBlock ? "Scheduled block" : "Scheduled"
      ]);
    });

    if (!bookings.length && row.instructor && isOffDay(row.instructor, row.day)) {
      records.push([
        VIEW_LABELS[state.view] || state.view,
        dayLabel(row.day),
        groupedBy,
        lane,
        "", "", "", row.instructor, "", "", "", "Day off"
      ]);
    }
  });

  const csv = [columns, ...records].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `master-schedule-${slug(VIEW_LABELS[state.view] || state.view)}-${todayFileKey()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function slug(value) {
  return String(value || "schedule").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function todayFileKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderEditAccess() {
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = !state.canEdit;
    element.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = !state.canEdit;
    });
    if ("disabled" in element) element.disabled = !state.canEdit;
  });
}

function renderInstructorControls() {
  const instructorOptions = state.instructors.map((name) => [name, name]);
  fillSelect(els.instructorFilter, [["all", "All instructors"], ...instructorOptions]);
  els.instructorFilter.value = state.instructorFilter;
  fillSelect(document.getElementById("schedule-instructor"), instructorOptions);
  fillSelect(document.getElementById("batch-instructor"), instructorOptions);
  fillSelect(document.getElementById("schedule-instructor-remove"), instructorOptions);
  fillSelect(document.getElementById("delete-instructor"), [["all", "All instructors"], ...instructorOptions]);
  applyLastInstructorToSelect(document.getElementById("schedule-instructor"));
  applyLastInstructorToSelect(document.getElementById("batch-instructor"));
}

function renderStudents() {
  document.getElementById("schedule-student-options").innerHTML = state.students
    .map((student) => student.studentName)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
}

function renderAirplaneOptions() {
  document.getElementById("schedule-airplane-options").innerHTML = state.airplanes
    .map((airplane) => `<option value="${escapeHtml(airplane)}"></option>`)
    .join("");
}

function renderLegend() {
  els.legend.innerHTML = CATEGORIES.map(([, label, color]) => `<span><i style="background:${color}"></i>${escapeHtml(label)}</span>`).join("");
}

function renderBoard() {
  const rows = getRowsForView();
  els.board.innerHTML = `<table class="schedule-table">
    <thead>${renderTimeHeader()}</thead>
    <tbody>${rows.map(renderScheduleRow).join("")}</tbody>
  </table>`;
}

function getRowsForView() {
  if (state.view === "instructor-day") {
    return filteredInstructors().flatMap((instructor) => ([
      { type: "group", label: instructor },
      ...DAYS.map(([day, label]) => ({ type: "schedule", label, day, instructor, lane: instructor }))
    ]));
  }
  if (state.view === "airplane-day") {
    return buildAirplaneRows();
  }
  return DAYS.flatMap(([day, label], index) => ([
    ...(index === 0 ? [] : [{ type: "spacer" }]),
    { type: "group", label },
    ...filteredInstructors().map((instructor) => ({ type: "schedule", label: instructor, day, instructor, lane: instructor }))
  ]));
}

function buildAirplaneRows() {
  const airplanes = unique([
    ...state.airplanes,
    ...airplaneVisibleBookings().map((item) => item.airplane).filter(Boolean)
  ]);
  return DAYS.flatMap(([day, label], index) => {
    const assignments = assignAirplaneRows(day, airplanes);
    const overbooked = assignments.get(OVERBOOKED_AIRPLANE) || [];
    return [
      ...(index === 0 ? [] : [{ type: "spacer" }]),
      { type: "group", label },
      ...airplanes.map((airplane) => ({
        type: "schedule",
        label: airplane,
        day,
        airplane,
        lane: airplane,
        bookings: assignments.get(airplane) || []
      })),
      ...(overbooked.length ? [{
        type: "schedule",
        label: "Overbooked",
        day,
        airplane: OVERBOOKED_AIRPLANE,
        lane: OVERBOOKED_AIRPLANE,
        overbooked: true,
        bookings: overbooked
      }] : [])
    ];
  });
}

function assignAirplaneRows(day, airplanes) {
  const assignments = new Map(airplanes.map((airplane) => [airplane, []]));
  assignments.set(OVERBOOKED_AIRPLANE, []);
  const dayBookings = uniqueAirplaneCapacityBookings(airplaneVisibleBookings()
    .filter((booking) => booking.day === day))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end));

  dayBookings.forEach((booking) => {
    const requestedAirplane = booking.airplane && airplanes.includes(booking.airplane) ? booking.airplane : "";
    if (requestedAirplane) {
      if (!hasOverlap(assignments.get(requestedAirplane), booking)) assignments.get(requestedAirplane).push(booking);
      else assignments.get(OVERBOOKED_AIRPLANE).push({ ...booking, overbooked: true });
      return;
    }

    const openAirplane = airplanes.find((airplane) => !hasOverlap(assignments.get(airplane), booking));
    if (openAirplane) assignments.get(openAirplane).push({ ...booking, displayAirplane: openAirplane });
    else assignments.get(OVERBOOKED_AIRPLANE).push({ ...booking, overbooked: true });
  });

  return assignments;
}

function uniqueAirplaneCapacityBookings(bookings) {
  const seen = new Set();
  return bookings.filter((booking) => {
    if (booking.airplane) return true;
    const key = [
      booking.day,
      booking.student,
      booking.instructor,
      booking.category,
      booking.start,
      booking.end,
      booking.notes
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasOverlap(bookings, booking) {
  const start = toMinutes(booking.start);
  const end = toMinutes(booking.end);
  return bookings.some((item) => start < toMinutes(item.end) && end > toMinutes(item.start));
}

function confirmBookingConflicts(candidates, excludeId = "") {
  const conflicts = bookingConflicts(candidates, excludeId);
  if (!conflicts.length) return true;
  const preview = conflicts.slice(0, 8).map((conflict) => `- ${conflict}`).join("\n");
  const extra = conflicts.length > 8 ? `\n- ${conflicts.length - 8} more conflict${conflicts.length - 8 === 1 ? "" : "s"}` : "";
  return window.confirm(`This time is already occupied:\n\n${preview}${extra}\n\nSchedule anyway?`);
}

function bookingConflicts(candidates, excludeId = "") {
  const existingBookings = state.bookings.filter((booking) => booking.id !== excludeId);
  const conflicts = [];
  candidates.forEach((candidate) => {
    existingBookings.forEach((booking) => {
      if (booking.id === candidate.id || booking.day !== candidate.day) return;
      if (!hasOverlap([booking], candidate)) return;
      const sameInstructor = booking.instructor && booking.instructor === candidate.instructor;
      const sameAirplane = booking.airplane && candidate.airplane && booking.airplane === candidate.airplane;
      if (!sameInstructor && !sameAirplane) return;
      const resources = [
        sameInstructor ? `instructor ${booking.instructor}` : "",
        sameAirplane ? `airplane ${booking.airplane}` : ""
      ].filter(Boolean).join(" and ");
      conflicts.push(`${dayLabel(candidate.day)} ${displayTime(toMinutes(candidate.start))}-${displayTime(toMinutes(candidate.end))}: ${resources} overlaps ${booking.student}`);
    });
  });
  return unique(conflicts);
}

function renderTimeHeader() {
  const cells = [`<th class="schedule-corner"></th>`];
  for (let minutes = SLOT_START; minutes <= SLOT_END; minutes += SLOT_STEP) {
    cells.push(`<th>${timeHeaderLabel(minutes)}</th>`);
  }
  return `<tr>${cells.join("")}</tr>`;
}

function renderInlineTimeRow() {
  return `<tr class="schedule-inline-time-row">${renderTimeHeader().replace(/^<tr>|<\/tr>$/g, "")}</tr>`;
}

function renderScheduleRow(row) {
  if (row.type === "spacer") return `<tr class="schedule-spacer-row"><th colspan="${slotCount() + 1}"></th></tr>`;
  if (row.type === "group") return `<tr class="schedule-group-row"><th colspan="${slotCount() + 1}">${escapeHtml(row.label)}</th></tr>${renderInlineTimeRow()}`;
  const offDay = Boolean(row.instructor && isOffDay(row.instructor, row.day));
  const bookings = (Array.isArray(row.bookings) ? row.bookings : bookingsForRow(row)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const checkInstructor = Boolean(row.instructor && getInstructorProfile(row.instructor)?.checkInstructor);
  const labelClasses = [
    "schedule-row-label",
    offDay ? "schedule-off-label" : "",
    checkInstructor ? "schedule-check-instructor-label" : ""
  ].filter(Boolean).join(" ");
  const cells = [`<th class="${labelClasses}"><span>${escapeHtml(row.label)}</span></th>`];
  let cursor = SLOT_START;
  bookings.forEach((booking) => {
    const start = Math.max(SLOT_START, toMinutes(booking.start));
    const end = Math.min(SLOT_END + SLOT_STEP, toMinutes(booking.end));
    if (end <= cursor || start < SLOT_START || start > SLOT_END) return;
    for (; cursor < start; cursor += SLOT_STEP) cells.push(emptyCell(row, cursor));
    const span = Math.max(1, Math.round((end - start) / SLOT_STEP));
    cells.push(bookingCell(booking, span));
    cursor = start + span * SLOT_STEP;
  });
  for (; cursor <= SLOT_END; cursor += SLOT_STEP) cells.push(emptyCell(row, cursor));
  return `<tr class="${offDay ? "schedule-off-row" : ""} ${row.overbooked ? "schedule-overbook-row" : ""}">${cells.join("")}</tr>`;
}

function emptyCell(row, minutes) {
  const offDay = Boolean(row.instructor && isOffDay(row.instructor, row.day));
  const airplane = row.airplane === OVERBOOKED_AIRPLANE ? "" : row.airplane || "";
  return `<td class="schedule-empty-cell ${offDay ? "schedule-off-cell" : ""}" data-day="${row.day}" data-instructor="${escapeHtml(row.instructor || "")}" data-airplane="${escapeHtml(airplane)}" data-time="${minutesToTime(minutes)}"></td>`;
}

function bookingCell(booking, span) {
  const category = categoryMeta(booking.category);
  const title = [booking.student, booking.instructor, booking.airplane, booking.notes, bookingMetaText(booking)].filter(Boolean).join(" | ");
  const draggable = state.canEdit && !booking.systemBlock;
  const idAttr = booking.systemBlock ? "" : ` data-booking-id="${escapeHtml(booking.id)}"`;
  return `<td colspan="${span}" class="schedule-booking-cell ${booking.overbooked ? "schedule-overbook-cell" : ""} ${booking.systemBlock ? "schedule-system-block-cell" : ""}"${idAttr} draggable="${draggable ? "true" : "false"}">
    <button type="button" class="schedule-booking" draggable="${draggable ? "true" : "false"}" title="${escapeHtml(title)}" style="--booking-color:${category.color}">
      <strong>${escapeHtml(booking.student || category.label)}</strong>
      <span>${escapeHtml(booking.instructor || "")}${booking.airplane ? ` / ${escapeHtml(booking.airplane)}` : booking.displayAirplane ? ` / ${escapeHtml(booking.displayAirplane)}` : ""}${booking.overbooked ? " / no plane available" : ""}</span>
    </button>
  </td>`;
}

function bookingsForRow(row) {
  const bookings = visibleBookings().filter((booking) => {
    if (booking.day !== row.day) return false;
    if (row.instructor && booking.instructor !== row.instructor) return false;
    if (row.airplane) return (booking.airplane || "Unassigned") === row.airplane;
    return true;
  });
  if (state.view !== "instructor-day" || !row.instructor) return bookings;
  return [...bookings, ...progressBlocksForRow(row)];
}

function progressBlocksForRow(row) {
  return state.progressBlocks
    .filter((block) => block.instructor === row.instructor && block.day === row.day)
    .map((block) => ({
      id: block.id,
      student: "Progress Checks",
      instructor: row.instructor,
      category: "prog-check",
      day: block.day,
      start: block.start,
      end: block.end,
      notes: "Instructor progress check block",
      systemBlock: true
    }));
}

function visibleBookings() {
  return state.bookings;
}

function airplaneVisibleBookings() {
  return visibleBookings().filter((booking) => !isGroundSchoolBooking(booking));
}

function isGroundSchoolBooking(booking = {}) {
  const text = `${booking.student || ""} ${booking.notes || ""} ${booking.category || ""}`.toLowerCase();
  return text.includes("ground school") || booking.category === "ground";
}

function getInstructorProfile(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return state.instructorDirectory.find((profile) => String(profile.name || "").trim().toLowerCase() === key)
    || state.instructorProfiles[name]
    || null;
}

function filteredInstructors() {
  if (state.instructorFilter !== "all") return state.instructors.filter((name) => name === state.instructorFilter);
  return state.instructors;
}

function handleBoardClick(event) {
  if (state.dragMoved) {
    state.dragMoved = false;
    return;
  }
  const bookingButton = event.target.closest("[data-booking-id]");
  if (bookingButton) {
    if (!state.canEdit) return;
    const booking = state.bookings.find((item) => item.id === bookingButton.dataset.bookingId);
    if (booking) openBookingDialog(booking);
    return;
  }
  const cell = event.target.closest(".schedule-empty-cell");
  if (!cell) return;
  if (!requireAdminEdit()) return;
  openBookingDialog({
    day: cell.dataset.day,
    instructor: cell.dataset.instructor || preferredInstructor(),
    airplane: cell.dataset.airplane === "Unassigned" ? "" : cell.dataset.airplane,
    start: cell.dataset.time,
    end: defaultEndTime(cell.dataset.time),
    category: "private"
  });
}

function openBookingDialog(booking = {}) {
  document.getElementById("schedule-dialog-title").textContent = booking.id ? "Edit booking" : "New booking";
  document.getElementById("schedule-booking-id").value = booking.id || "";
  document.getElementById("schedule-student").value = booking.student || "";
  document.getElementById("schedule-category").value = booking.category || "private";
  document.getElementById("schedule-instructor").value = booking.instructor || preferredInstructor();
  document.getElementById("schedule-airplane").value = booking.airplane || "";
  document.getElementById("schedule-day").value = booking.day || "monday";
  document.getElementById("schedule-start").value = booking.start || "08:00";
  document.getElementById("schedule-end").value = booking.end || "10:00";
  document.getElementById("schedule-notes").value = booking.notes || "";
  document.getElementById("schedule-booking-meta").textContent = bookingMetaText(booking);
  document.getElementById("schedule-delete").hidden = !booking.id;
  els.dialog.showModal();
}

async function saveBookingFromForm(event) {
  event.preventDefault();
  if (!requireAdminEdit()) return;
  const submitButton = event.submitter;
  setSavingButton(submitButton, true);
  const id = document.getElementById("schedule-booking-id").value || makeId("booking");
  document.getElementById("schedule-booking-id").value = id;
  const existing = state.bookings.find((item) => item.id === id);
  const booking = normalizeBooking({
    ...existing,
    id,
    touchMeta: true,
    student: document.getElementById("schedule-student").value,
    category: document.getElementById("schedule-category").value,
    instructor: document.getElementById("schedule-instructor").value,
    airplane: document.getElementById("schedule-airplane").value,
    day: document.getElementById("schedule-day").value,
    start: document.getElementById("schedule-start").value,
    end: document.getElementById("schedule-end").value,
    notes: document.getElementById("schedule-notes").value
  });
  if (!booking) {
    setSavingButton(submitButton, false);
    return;
  }
  if (!confirmBookingConflicts([booking], id)) {
    setSavingButton(submitButton, false);
    return;
  }
  try {
    rememberInstructor(booking.instructor);
    upsertBooking(booking);
    const saved = await persist();
    if (saved) els.dialog.close();
  } finally {
    setSavingButton(submitButton, false);
  }
}

async function saveBatchFromForm(event) {
  event.preventDefault();
  if (!requireAdminEdit()) return;
  const submitButton = event.submitter;
  setSavingButton(submitButton, true);
  const days = [...els.batchForm.querySelectorAll("[name='batch-days']:checked")].map((input) => input.value);
  if (!days.length) {
    setSavingButton(submitButton, false);
    return;
  }
  const bookings = [];
  days.forEach((day) => {
    const booking = normalizeBooking({
      id: makeId("booking"),
      touchMeta: true,
      student: document.getElementById("batch-student").value,
      category: document.getElementById("batch-category").value,
      instructor: document.getElementById("batch-instructor").value,
      airplane: document.getElementById("batch-airplane").value,
      day,
      start: document.getElementById("batch-start").value,
      end: document.getElementById("batch-end").value,
      notes: document.getElementById("batch-notes").value
    });
    if (booking) bookings.push(booking);
  });
  if (!confirmBookingConflicts(bookings)) {
    setSavingButton(submitButton, false);
    return;
  }
  try {
    if (bookings[0]?.instructor) rememberInstructor(bookings[0].instructor);
    bookings.forEach(upsertBooking);
    const saved = await persist();
    if (saved) els.batchDialog.close();
  } finally {
    setSavingButton(submitButton, false);
  }
}

function openBatchDeleteDialog() {
  if (!requireAdminEdit()) return;
  document.getElementById("delete-student").value = "";
  document.getElementById("delete-instructor").value = state.instructorFilter === "all" ? "all" : state.instructorFilter;
  document.getElementById("delete-day").value = "all";
  document.getElementById("delete-category").value = "all";
  updateBatchDeleteCount();
  els.batchDeleteDialog.showModal();
}

async function deleteBatchFromForm(event) {
  event.preventDefault();
  if (!requireAdminEdit()) return;
  if (event.submitter?.value !== "delete") {
    els.batchDeleteDialog.close();
    return;
  }
  const matches = batchDeleteMatches();
  if (!matches.length) return;
  const confirmed = window.confirm(`Delete ${matches.length} matching booking${matches.length === 1 ? "" : "s"} from the master schedule?`);
  if (!confirmed) return;
  const ids = new Set(matches.map((booking) => booking.id));
  state.bookings = state.bookings.filter((booking) => !ids.has(booking.id));
  els.batchDeleteDialog.close();
  await persist();
}

function updateBatchDeleteCount() {
  const count = batchDeleteMatches().length;
  document.getElementById("schedule-delete-count").textContent = `${count} booking${count === 1 ? "" : "s"} match.`;
}

function batchDeleteMatches() {
  const student = document.getElementById("delete-student").value.trim().toLowerCase();
  const instructor = document.getElementById("delete-instructor").value;
  const day = document.getElementById("delete-day").value;
  const category = document.getElementById("delete-category").value;
  return visibleBookings().filter((booking) => {
    if (student && !booking.student.toLowerCase().includes(student)) return false;
    if (instructor !== "all" && booking.instructor !== instructor) return false;
    if (day !== "all" && booking.day !== day) return false;
    if (category !== "all" && booking.category !== category) return false;
    return true;
  });
}

async function deleteCurrentBooking() {
  if (!requireAdminEdit()) return;
  const id = document.getElementById("schedule-booking-id").value;
  if (!id) return;
  state.bookings = state.bookings.filter((booking) => booking.id !== id);
  els.dialog.close();
  await persist();
}

function openInstructorDialog(instructorName = "") {
  if (!requireAdminEdit()) return;
  const name = typeof instructorName === "string" ? instructorName.trim() : "";
  state.pendingProgressBlocks = name ? state.progressBlocks.filter((block) => block.instructor === name).map((block) => ({ ...block })) : [];
  els.instructorDialog.querySelector("h2").textContent = name ? "Edit instructor" : "Add instructor";
  document.getElementById("instructor-original-name").value = name;
  document.getElementById("instructor-name").value = name;
  document.getElementById("instructor-check").checked = Boolean(name && getInstructorProfile(name)?.checkInstructor);
  const offDays = new Set(name ? state.offDays[name] || [] : []);
  els.instructorForm.querySelectorAll('[name="instructor-days-off"]').forEach((input) => {
    input.checked = offDays.has(input.value);
  });
  document.getElementById("progress-day").value = "monday";
  document.getElementById("progress-start").value = "08:00";
  document.getElementById("progress-end").value = "09:00";
  renderPendingProgressBlocks();
  els.instructorDialog.showModal();
}

function openSelectedInstructorDialog() {
  const name = document.getElementById("schedule-instructor-remove").value;
  if (name) openInstructorDialog(name);
}

function addPendingProgressBlock() {
  if (!requireAdminEdit()) return;
  const block = normalizeProgressBlock({
    id: makeId("progress"),
    day: document.getElementById("progress-day").value,
    start: document.getElementById("progress-start").value,
    end: document.getElementById("progress-end").value
  });
  if (!block) return;
  state.pendingProgressBlocks.push(block);
  renderPendingProgressBlocks();
}

function renderPendingProgressBlocks() {
  const list = document.getElementById("progress-list");
  if (!state.pendingProgressBlocks.length) {
    list.innerHTML = `<p class="schedule-progress-empty">No progress check blocks added.</p>`;
    return;
  }
  list.innerHTML = state.pendingProgressBlocks.map((block) => `
    <button type="button" data-progress-remove="${escapeHtml(block.id)}">
      ${escapeHtml(dayLabel(block.day))} ${escapeHtml(displayTime(toMinutes(block.start)))}-${escapeHtml(displayTime(toMinutes(block.end)))}
      <span>Remove</span>
    </button>
  `).join("");
  list.querySelectorAll("[data-progress-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingProgressBlocks = state.pendingProgressBlocks.filter((block) => block.id !== button.dataset.progressRemove);
      renderPendingProgressBlocks();
    });
  });
}

async function saveInstructorFromForm(event) {
  event.preventDefault();
  if (!requireAdminEdit()) return;
  const originalName = document.getElementById("instructor-original-name").value.trim();
  const name = document.getElementById("instructor-name").value.trim();
  if (!name) return;
  if (originalName && originalName !== name) {
    state.instructors = state.instructors.map((instructor) => instructor === originalName ? name : instructor);
    state.bookings = state.bookings.map((booking) => booking.instructor === originalName ? { ...booking, instructor: name } : booking);
    if (state.offDays[originalName]) {
      state.offDays[name] = state.offDays[originalName];
      delete state.offDays[originalName];
    }
    delete state.instructorProfiles[originalName];
    if (state.instructorFilter === originalName) state.instructorFilter = name;
  }
  state.instructors = unique([...state.instructors, name]);
  state.removedInstructors = state.removedInstructors.filter((instructor) => instructor !== name);
  state.instructorProfiles[name] = {
    ...(state.instructorProfiles[name] || {}),
    name,
    checkInstructor: document.getElementById("instructor-check").checked
  };
  const selectedOffDays = Array.from(els.instructorForm.querySelectorAll('[name="instructor-days-off"]:checked'))
    .map((input) => input.value);
  if (selectedOffDays.length) state.offDays[name] = selectedOffDays;
  else delete state.offDays[name];
  const blocks = state.pendingProgressBlocks.map((block) => ({ ...block, instructor: name }));
  state.progressBlocks = [
    ...state.progressBlocks.filter((block) => block.instructor !== name && block.instructor !== originalName),
    ...blocks
  ];
  state.pendingProgressBlocks = [];
  await saveConfig();
  if (originalName && originalName !== name) await persist();
  els.instructorDialog.close();
  renderAll();
}

async function removeInstructor() {
  if (!requireAdminEdit()) return;
  const select = document.getElementById("schedule-instructor-remove");
  const name = select.value;
  if (!name) return;
  const assignedCount = state.bookings.filter((booking) => booking.instructor === name).length;
  const message = assignedCount
    ? `Remove ${name} from planner rows and dropdowns? ${assignedCount} existing booking${assignedCount === 1 ? "" : "s"} will stay in schedule data.`
    : `Remove ${name} from planner rows and dropdowns?`;
  if (!window.confirm(message)) return;
  state.instructors = state.instructors.filter((instructor) => instructor !== name);
  state.removedInstructors = unique([...state.removedInstructors, name]);
  delete state.offDays[name];
  delete state.instructorProfiles[name];
  state.progressBlocks = state.progressBlocks.filter((block) => block.instructor !== name);
  if (state.instructorFilter === name) state.instructorFilter = "all";
  await saveConfig();
  renderAll();
}

function upsertBooking(booking) {
  state.bookings = [booking, ...state.bookings.filter((item) => item.id !== booking.id)];
  if (booking.instructor && !state.instructors.includes(booking.instructor)) state.instructors.push(booking.instructor);
  renderAll();
}

async function persist() {
  if (!requireAdminEdit()) return false;
  state.saving = true;
  els.saveState.textContent = "Saving...";
  markLocalUnsynced(COLLECTION, true);
  cacheLocalData(STORAGE_KEY, state.bookings);
  let result = { remoteSaved: false, items: state.bookings };
  try {
    result = await saveCollectionData(COLLECTION, state.bookings, { allowDeletes: true, returnStatus: true });
    state.bookings = Array.isArray(result.items) ? result.items.map(normalizeBooking).filter(Boolean) : state.bookings;
    if (result.remoteSaved) {
      const savedAt = Date.now();
      state.lastSavedAtByCollection[COLLECTION] = savedAt;
      state.lastStatusAt = savedAt;
      markLocalUnsynced(COLLECTION, false);
      els.saveState.textContent = `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else {
      els.saveState.textContent = `Local only - database save failed${errorCodeText(result.error)}`;
    }
  } catch (error) {
    result = { remoteSaved: false, error };
    els.saveState.textContent = `Local only - database save failed${errorCodeText(error)}`;
    console.warn("Master schedule save failed", error);
  } finally {
    state.saving = false;
    renderBoard();
  }
  return Boolean(result.remoteSaved);
}

function handleDragStart(event) {
  if (!state.canEdit) return;
  const bookingCell = event.target.closest("[data-booking-id]");
  if (!bookingCell) return;
  state.draggingId = bookingCell.dataset.bookingId;
  state.dragMoved = false;
  bookingCell.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggingId);
}

function handleDragEnd(event) {
  event.target.closest("[data-booking-id]")?.classList.remove("dragging");
  document.querySelectorAll(".schedule-drop-target").forEach((cell) => cell.classList.remove("schedule-drop-target"));
  state.draggingId = "";
}

function handleDragOver(event) {
  if (!state.canEdit) return;
  const cell = event.target.closest(".schedule-empty-cell");
  if (!cell || !state.draggingId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  cell.classList.add("schedule-drop-target");
}

function handleDragLeave(event) {
  event.target.closest(".schedule-empty-cell")?.classList.remove("schedule-drop-target");
}

async function handleDrop(event) {
  if (!requireAdminEdit()) return;
  const cell = event.target.closest(".schedule-empty-cell");
  const id = state.draggingId || event.dataTransfer.getData("text/plain");
  if (!cell || !id) return;
  event.preventDefault();
  cell.classList.remove("schedule-drop-target");
  const booking = state.bookings.find((item) => item.id === id);
  if (!booking) return;
  const duration = toMinutes(booking.end) - toMinutes(booking.start);
  const start = cell.dataset.time;
  const moved = normalizeBooking({
    ...booking,
    touchMeta: true,
    day: cell.dataset.day,
    instructor: cell.dataset.instructor || booking.instructor,
    airplane: cell.dataset.airplane === "Unassigned" ? "" : (cell.dataset.airplane || booking.airplane),
    start,
    end: minutesToTime(toMinutes(start) + duration)
  });
  if (!moved) return;
  state.dragMoved = true;
  state.bookings = state.bookings.filter((item) => item.id !== booking.id && bookingSessionKey(item) !== bookingSessionKey(booking));
  upsertBooking(moved);
  await persist();
}

function toggleOffDay(instructor, day) {
  if (!requireAdminEdit()) return;
  if (!instructor || !day) return;
  const days = new Set(state.offDays[instructor] || []);
  if (days.has(day)) days.delete(day);
  else days.add(day);
  state.offDays[instructor] = [...days];
  if (!state.offDays[instructor].length) delete state.offDays[instructor];
  saveConfig();
  renderBoard();
}

function isOffDay(instructor, day) {
  return (state.offDays[instructor] || []).includes(day);
}

function normalizeBooking(input = {}) {
  const start = cleanTime(input.start || "08:00");
  const end = cleanTime(input.end || "10:00");
  if (!input.student || !input.instructor || !input.day || toMinutes(end) <= toMinutes(start)) return null;
  const staff = window.AOAAuth?.getCurrentUser?.();
  const now = new Date().toISOString();
  const touchMeta = input.touchMeta === true;
  return {
    id: input.id || makeId("booking"),
    student: String(input.student).trim(),
    category: categoryMeta(input.category).key,
    instructor: String(input.instructor).trim(),
    airplane: String(input.airplane || "").trim(),
    day: DAYS.some(([day]) => day === input.day) ? input.day : "monday",
    start,
    end,
    notes: String(input.notes || "").trim(),
    createdAt: input.createdAt || (touchMeta ? now : ""),
    createdByUserId: input.createdByUserId || (touchMeta ? staff?.id || "" : ""),
    createdByName: input.createdByName || (touchMeta ? staff?.name || "" : ""),
    createdByInitials: input.createdByInitials || (touchMeta ? staff?.initials || "" : ""),
    updatedAt: touchMeta ? now : input.updatedAt || "",
    updatedByUserId: touchMeta ? staff?.id || "" : input.updatedByUserId || "",
    updatedByName: touchMeta ? staff?.name || "" : input.updatedByName || "",
    updatedByInitials: touchMeta ? staff?.initials || "" : input.updatedByInitials || ""
  };
}

function bookingMetaText(booking = {}) {
  const created = booking.createdByName || booking.createdByInitials;
  const updated = booking.updatedByName || booking.updatedByInitials;
  const createdText = created ? `Scheduled by ${created}${booking.createdAt ? ` ${formatDateTime(booking.createdAt)}` : ""}` : "";
  const updatedText = updated ? `Last updated by ${updated}${booking.updatedAt ? ` ${formatDateTime(booking.updatedAt)}` : ""}` : "";
  return [createdText, updatedText && updatedText !== createdText ? updatedText : ""].filter(Boolean).join(" | ");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bookingSessionKey(booking = {}) {
  return [
    booking.day,
    booking.student,
    booking.instructor,
    booking.airplane,
    booking.category,
    booking.start,
    booking.end,
    booking.notes
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function categoryMeta(value) {
  const [key, label, color] = CATEGORIES.find(([categoryKey]) => categoryKey === value) || CATEGORIES[0];
  return { key, label, color };
}

function fillSelect(select, options) {
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function fillTimeSelect(select) {
  const options = [];
  for (let minutes = SLOT_START; minutes <= SLOT_END + SLOT_STEP; minutes += SLOT_STEP) options.push([minutesToTime(minutes), displayTime(minutes)]);
  fillSelect(select, options);
}

function slotCount() {
  return ((SLOT_END - SLOT_START) / SLOT_STEP) + 1;
}

function timeHeaderLabel(minutes) {
  return minutes % 60 === 0 ? String(Math.floor(minutes / 60)) : "30";
}

function displayTime(minutes) {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function defaultEndTime(start) {
  return minutesToTime(Math.min(SLOT_END + SLOT_STEP, toMinutes(start) + DEFAULT_BOOKING_MINUTES));
}

function minutesToTime(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function cleanTime(value) {
  const minutes = toMinutes(value);
  return minutesToTime(Math.round(minutes / SLOT_STEP) * SLOT_STEP);
}

function normalizeProgressBlock(input = {}) {
  const start = cleanTime(input.start || "08:00");
  const end = cleanTime(input.end || "09:00");
  if (toMinutes(end) <= toMinutes(start)) return null;
  return {
    id: input.id || makeId("progress"),
    instructor: String(input.instructor || "").trim(),
    day: DAYS.some(([day]) => day === input.day) ? input.day : "monday",
    start,
    end
  };
}

function dayLabel(value) {
  return DAYS.find(([day]) => day === value)?.[1] || value;
}

function toMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function preferredInstructor() {
  return state.instructors.includes(state.lastInstructor) ? state.lastInstructor : state.instructors[0] || "";
}

function rememberInstructor(name) {
  const instructor = String(name || "").trim();
  if (!instructor) return;
  state.lastInstructor = instructor;
  cacheLocalData(LAST_INSTRUCTOR_KEY, instructor);
}

function applyLastInstructorToSelect(select) {
  if (!select || !state.lastInstructor) return;
  if ([...select.options].some((option) => option.value === state.lastInstructor)) select.value = state.lastInstructor;
}

function setSavingButton(button, saving) {
  if (!button) return;
  if (saving) {
    button.dataset.originalText = button.textContent;
    button.textContent = "Saving...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function markLocalUnsynced(collectionName, value) {
  if (value) state.unsyncedWrites[collectionName] = true;
  else delete state.unsyncedWrites[collectionName];
  state.hasLocalUnsynced = Object.values(state.unsyncedWrites).some(Boolean);
  if (state.hasLocalUnsynced) cacheLocalData(UNSYNCED_KEY, state.unsyncedWrites);
  else localStorage.removeItem(UNSYNCED_KEY);
}

function readLocalString(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function readUnsyncedWrites() {
  try {
    const raw = localStorage.getItem(UNSYNCED_KEY);
    if (raw === "true") return { [COLLECTION]: true };
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

async function saveConfig() {
  if (!state.canEdit) return;
  const config = {
    id: "config",
    instructors: state.instructors,
    airplanes: normalizeAirplanes(state.airplanes),
    removedInstructors: state.removedInstructors,
    offDays: state.offDays,
    instructorProfiles: state.instructorProfiles,
    progressBlocks: state.progressBlocks
  };
  markLocalUnsynced(CONFIG_COLLECTION, true);
  cacheLocalData(CONFIG_STORAGE_KEY, config);
  const result = await saveCollectionData(CONFIG_COLLECTION, [config], { allowDeletes: true, returnStatus: true });
  if (result.remoteSaved) {
    const savedAt = Date.now();
    state.lastSavedAtByCollection[CONFIG_COLLECTION] = savedAt;
    state.lastStatusAt = savedAt;
    markLocalUnsynced(CONFIG_COLLECTION, false);
    els.saveState.textContent = `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } else {
    els.saveState.textContent = "Local only - database save failed";
  }
}

function requireAdminEdit() {
  if (state.canEdit) return true;
  els.saveState.textContent = "View only";
  return false;
}

function normalizeConfig(loadedConfig) {
  if (Array.isArray(loadedConfig)) return loadedConfig[0] || readConfig();
  if (loadedConfig && typeof loadedConfig === "object") return loadedConfig;
  return readConfig();
}

function normalizeAirplanes(values, withDefaults = false) {
  const source = Array.isArray(values) ? values : [];
  const base = withDefaults ? [...DEFAULT_AIRPLANES, ...source] : source;
  return unique(base.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean));
}
