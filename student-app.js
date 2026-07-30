import { previewStudentCsv, studentsToCsv } from "./csv-import.js";
import { loadCollectionData, loadFirestoreCollection, loadFirestoreDocument, subscribeFirestoreCollection, subscribeFirestoreDocument, uploadStudentProfilePhoto } from "./firebase.js";
import { activeInstructorNames, loadInstructors } from "./instructor-data.js";
import { groundAttendanceCountForStudent, groundAttendanceCounts } from "./ground-attendance-utils.js";
import { appendAuditLog, loadAuditLog, loadStudents, saveStudents } from "./student-data.js";
import { SAP_MILESTONE_TYPES, evaluateMilestone, normalizeCourseName, normalizedKey } from "./sap-core.mjs";
import { isCountedTrainerNoShow, isTrainerBookingCoveredByCheckinPolicy } from "./trainer-attendance-utils.js";
import {
  DAY_FIELDS,
  calculateTotals,
  compareGroups,
  escapeHtml,
  formatDate,
  getDashboardStats,
  getStudentFlags,
  groupPriority,
  normalizeStudent,
  validateStudent
} from "./student-utils.js";

const GROUND_ATTENDANCE_STORAGE_KEY = "aoa-ground-attendance-v1";
const GROUND_ATTENDANCE_COLLECTION = "ground_attendance";
const TRAINER_BOOKING_STORAGE_KEY = "aoa-ground-trainer-bookings-v2";
const TRAINER_BOOKING_COLLECTION = "trainer-bookings";
const WRITTEN_CUSTOM_STORAGE_KEY = "aoa-written-test-custom-scores-v1";
const WRITTEN_CUSTOM_COLLECTION = "written-test-custom";
const WRITTEN_SCHEDULE_STORAGE_KEY = "aoa-written-test-schedule-v1";
const WRITTEN_SCHEDULE_COLLECTION = "written-test-schedule";
const MASTER_SCHEDULE_STORAGE_KEY = "aoa-master-schedule-v1";
const MASTER_SCHEDULE_COLLECTION = "master-schedule";
const MASTER_SCHEDULE_CONFIG_STORAGE_KEY = "aoa-master-schedule-config-v1";
const MASTER_SCHEDULE_CONFIG_COLLECTION = "master-schedule-config";
const STANDARD_STUDENT_COURSES = [
  "Private Pilot Certificate",
  "Instrument Rating",
  "Single Engine Commercial",
  "Certified Flight Instructor",
  "Certified Flight Instructor - Instrument",
  "Multi-Engine Academy Program",
  "Multi-Engine Add On",
  "Multi-Engine Instructor"
];
const state = {
  students: [],
  audit: [],
  groundAttendance: [],
  trainerBookings: [],
  writtenAttempts: [],
  writtenScheduled: [],
  stageRequests: [],
  sapMilestones: [],
  sapImports: [],
  masterScheduleBookings: [],
  masterScheduleConfig: {},
  instructorProfiles: [],
  groundAttendanceCounts: groundAttendanceCounts(),
  myfboAttendance: [],
  myfboAttendanceById: new Map(),
  myfboAttendanceByName: new Map(),
  myfboAttendanceMeta: null,
  myfboAttendanceError: null,
  filters: { search: "", active: "Yes", group: "", trainingType: "", course: "", cfi: "", initials: "" },
  sort: { key: "currentCourse", direction: "asc" },
  view: "cards",
  importPreview: null,
  saveInFlight: false,
  photoMigrationInFlight: false,
  photoMigrationMessage: ""
};

const page = document.body.dataset.studentPage;

init();

async function init() {
  await waitForAuthUser();
  const user = window.AOAAuth?.getCurrentUser?.();
  const instructorOnly = Boolean(user?.isInstructor && !user?.isStaff && !user?.isAdmin);
  if (instructorOnly) {
    const [students, audit, instructorProfiles, trainerBookings, groundAttendance, attendanceLatest, attendanceMeta, sapMilestones, sapImports] = await Promise.all([
      loadStudents(),
      loadAuditLog(),
      loadInstructors(),
      loadCollectionData(TRAINER_BOOKING_COLLECTION, TRAINER_BOOKING_STORAGE_KEY),
      loadCollectionData(GROUND_ATTENDANCE_COLLECTION, GROUND_ATTENDANCE_STORAGE_KEY),
      loadMyfboAttendanceLatest(),
      loadMyfboAttendanceMeta(),
      loadOptionalFirestoreCollection("sap_milestones"),
      loadOptionalFirestoreCollection("sap_imports")
    ]);
    state.students = students;
    state.audit = audit;
    state.instructorProfiles = instructorProfiles;
    state.trainerBookings = Array.isArray(trainerBookings) ? trainerBookings : [];
    state.groundAttendance = Array.isArray(groundAttendance) ? groundAttendance : [];
    state.groundAttendanceCounts = groundAttendanceCounts(state.groundAttendance);
    setMyfboAttendance(attendanceLatest);
    state.myfboAttendanceMeta = attendanceMeta;
    state.sapMilestones = sapMilestones;
    state.sapImports = sapImports;
    bindSharedEvents();
    render();
    return;
  }
  const [students, audit, groundAttendance, trainerBookings, writtenCustom, writtenScheduled, writtenImported, scheduleBookings, scheduleConfig, instructorProfiles, attendanceLatest, attendanceMeta, stageRequests, sapMilestones, sapImports] = await Promise.all([
    loadStudents(),
    loadAuditLog(),
    loadCollectionData(GROUND_ATTENDANCE_COLLECTION, GROUND_ATTENDANCE_STORAGE_KEY),
    loadCollectionData(TRAINER_BOOKING_COLLECTION, TRAINER_BOOKING_STORAGE_KEY),
    loadCollectionData(WRITTEN_CUSTOM_COLLECTION, WRITTEN_CUSTOM_STORAGE_KEY),
    loadCollectionData(WRITTEN_SCHEDULE_COLLECTION, WRITTEN_SCHEDULE_STORAGE_KEY),
    loadWrittenImportedAttempts(),
    loadCollectionData(MASTER_SCHEDULE_COLLECTION, MASTER_SCHEDULE_STORAGE_KEY),
    loadCollectionData(MASTER_SCHEDULE_CONFIG_COLLECTION, MASTER_SCHEDULE_CONFIG_STORAGE_KEY),
    loadInstructors(),
    loadMyfboAttendanceLatest(),
    loadMyfboAttendanceMeta(),
    loadCollectionData("stage-check-requests", "aoa-stage-check-requests-v2"),
    loadOptionalFirestoreCollection("sap_milestones"),
    loadOptionalFirestoreCollection("sap_imports")
  ]);
  state.students = students;
  state.audit = audit;
  state.groundAttendance = Array.isArray(groundAttendance) ? groundAttendance : [];
  state.trainerBookings = Array.isArray(trainerBookings) ? trainerBookings : [];
  state.writtenAttempts = [...(Array.isArray(writtenImported) ? writtenImported : []), ...(Array.isArray(writtenCustom) ? writtenCustom : [])];
  state.writtenScheduled = Array.isArray(writtenScheduled) ? writtenScheduled : [];
  state.stageRequests = Array.isArray(stageRequests) ? stageRequests : [];
  state.sapMilestones = Array.isArray(sapMilestones) ? sapMilestones : [];
  state.sapImports = Array.isArray(sapImports) ? sapImports : [];
  state.masterScheduleBookings = Array.isArray(scheduleBookings) ? scheduleBookings : [];
  state.masterScheduleConfig = normalizeScheduleConfig(scheduleConfig);
  state.instructorProfiles = Array.isArray(instructorProfiles) ? instructorProfiles : [];
  state.groundAttendanceCounts = groundAttendanceCounts(state.groundAttendance);
  setMyfboAttendance(attendanceLatest);
  state.myfboAttendanceMeta = attendanceMeta;
  bindSharedEvents();
  subscribeMyfboAttendance();
  render();
}

async function waitForAuthUser() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.AOAAuth?.ready) {
      await window.AOAAuth.ready;
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
}

async function loadOptionalFirestoreCollection(name) {
  try { return await loadFirestoreCollection(name); } catch (error) { console.warn(`Optional ${name} data could not be loaded`, error); return []; }
}

async function loadMyfboAttendanceLatest() {
  try {
    state.myfboAttendanceError = null;
    return await loadFirestoreCollection("attendanceLatest");
  } catch (error) {
    state.myfboAttendanceError = attendanceConnectionMessage(error);
    return [];
  }
}

async function loadMyfboAttendanceMeta() {
  try {
    return await loadFirestoreDocument("attendanceMeta", "current");
  } catch (error) {
    state.myfboAttendanceError = state.myfboAttendanceError || attendanceConnectionMessage(error);
    return null;
  }
}

function subscribeMyfboAttendance() {
  if (page !== "students") return;
  subscribeFirestoreCollection("attendanceLatest", (records) => {
    state.myfboAttendanceError = null;
    setMyfboAttendance(records);
    renderStudents();
  }, (error) => {
    state.myfboAttendanceError = attendanceConnectionMessage(error);
    renderStudents();
  });

  subscribeFirestoreDocument("attendanceMeta", "current", (meta) => {
    state.myfboAttendanceMeta = meta;
    renderStudents();
  }, (error) => {
    state.myfboAttendanceError = state.myfboAttendanceError || attendanceConnectionMessage(error);
    renderStudents();
  });
}

function setMyfboAttendance(records) {
  state.myfboAttendance = Array.isArray(records) ? records : [];
  state.myfboAttendanceById = new Map();
  state.myfboAttendanceByName = new Map();
  state.myfboAttendance.forEach((record) => {
    [record.studentId, record.id].filter(Boolean).forEach((id) => {
      state.myfboAttendanceById.set(String(id), record);
    });
    const nameKey = normalizeFirstLastKey(record.studentName);
    if (nameKey) state.myfboAttendanceByName.set(nameKey, record);
  });
}

function bindSharedEvents() {
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("click", handleClick);
  document.addEventListener("dragstart", handleSapTimelineDragStart);
  document.addEventListener("dragover", handleSapTimelineDragOver);
  document.addEventListener("drop", handleSapTimelineDrop);
  document.addEventListener("dragend", handleSapTimelineDragEnd);
  document.addEventListener("submit", handleSubmit);
  window.addEventListener("beforeunload", handleBeforeUnload);
}

function handleBeforeUnload(event) {
  if (!state.saveInFlight) return;
  event.preventDefault();
  event.returnValue = "";
}

function render() {
  if (page === "dashboard") renderDashboard();
  if (page === "students") renderStudents();
  if (page === "detail") renderDetail();
  if (page === "availability") renderAvailability();
  if (page === "alerts") renderAlerts();
  if (page === "import") renderImport();
}

function currentStaffAuditFields() {
  const staff = window.AOAAuth?.getCurrentUser?.();
  return staff ? {
    initials: staff.initials,
    staffUserId: staff.id,
    staffName: staff.name
  } : {};
}

function currentStaffStudentFields() {
  const staff = window.AOAAuth?.getCurrentUser?.();
  return staff ? {
    updatedByUserId: staff.id,
    updatedByName: staff.name,
    updatedByInitials: staff.initials
  } : {};
}

function markStudentModified(student) {
  student.lastUpdated = new Date().toISOString().slice(0, 10);
  student.updatedAt = new Date().toISOString();
  Object.assign(student, currentStaffStudentFields());
  return student;
}

function handleInput(event) {
  const target = event.target;
  if (target.matches("[data-filter]")) {
    state.filters[target.dataset.filter] = target.value;
    renderStudents();
  }
  if (target.matches("#student-csv-text")) renderImportPreview();
}

async function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-inline]")) {
    const student = findStudent(target.dataset.id);
    if (!student) return;
    student[target.dataset.inline] = target.dataset.inline === "currentCourse" ? canonicalCourseLabel(target.value) : target.value;
    await saveStudentChange(student, target.dataset.inline);
    render();
  }
  if (target.matches("#student-csv-file")) {
    const file = target.files?.[0];
    if (file) {
      document.querySelector("#student-csv-text").value = await file.text();
      renderImportPreview();
    }
  }
  if (target.matches("#student-photo-file")) await loadStudentPhoto(target);
}

async function handleClick(event) {
  const sortButton = event.target.closest("[data-sort]");
  if (sortButton) {
    const key = sortButton.dataset.sort;
    state.sort.direction = state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc";
    state.sort.key = key;
    renderStudents();
  }

  const exportButton = event.target.closest("#export-students");
  if (exportButton) downloadCsv();

  const migratePhotosButton = event.target.closest("#migrate-student-photos");
  if (migratePhotosButton) await migrateStudentPhotos();

  const viewButton = event.target.closest("[data-student-view]");
  if (viewButton) {
    state.view = viewButton.dataset.studentView;
    renderStudents();
  }

  const statusFilter = event.target.closest("[data-status-filter]");
  if (statusFilter) {
    state.filters.active = statusFilter.dataset.statusFilter;
    renderStudents();
  }

  const courseFilter = event.target.closest("[data-course-filter]");
  if (courseFilter) {
    state.filters.course = courseFilter.dataset.courseFilter === "__blank" ? "__blank" : courseFilter.dataset.courseFilter;
    const select = document.querySelector("#filter-course");
    if (select && state.filters.course !== "__blank") select.value = state.filters.course;
    renderStudents();
  }

  const confirmImport = event.target.closest("#confirm-student-import");
  if (confirmImport) await commitImport();

  const resetImport = event.target.closest("#reset-student-import");
  if (resetImport) {
    document.querySelector("#student-csv-text").value = "";
    state.importPreview = null;
    renderImport();
  }

  const removePhoto = event.target.closest("#remove-student-photo");
  if (removePhoto) {
    const input = document.querySelector("#student-photo-url");
    if (input) input.value = "";
    const photoStatus = document.querySelector('[name="profPicOnFile"]');
    if (photoStatus) photoStatus.value = "No";
    const preview = document.querySelector("#student-photo-preview");
    if (preview) preview.innerHTML = defaultStudentAvatar(document.querySelector('[name="studentName"]')?.value || "");
    clearStudentFormError();
    setStudentPhotoStatus("Photo removed. Save student to finish.", "ready");
  }

  const deleteStudent = event.target.closest("#delete-student-button");
  if (deleteStudent) await removeCurrentStudent();

  const detailStatus = event.target.closest("[data-detail-status]");
  if (detailStatus) await setCurrentDetailStatus(detailStatus.dataset.detailStatus);

  const sourceButton = event.target.closest("[data-open-sap-source]");
  if (sourceButton) await openSapSource(sourceButton.dataset.openSapSource);

  const milestoneButton = event.target.closest("[data-sap-milestone-complete]");
  if (milestoneButton) await updateSapMilestoneCompletion(milestoneButton);

  const sapEditButton = event.target.closest("[data-sap-milestone-edit]");
  if (sapEditButton) await editSapMilestone(sapEditButton.dataset.sapMilestoneEdit);

  const sapAddButton = event.target.closest("[data-sap-milestone-add]");
  if (sapAddButton) await addSapMilestone(sapAddButton.dataset.sapMilestoneAdd || "");

  const sapRemoveButton = event.target.closest("[data-remove-sap-matrix]");
  if (sapRemoveButton) await removeSapMatrix(sapRemoveButton.dataset.removeSapMatrix || "");
}

async function handleSubmit(event) {
  if (!event.target.matches("#student-form")) return;
  event.preventDefault();
  if (state.saveInFlight) return;
  const form = event.target;
  const formData = new FormData(form);
  const id = formData.get("id") || crypto.randomUUID();
  const existing = findStudent(id);
  const raw = { ...(existing || {}), id };
  formData.forEach((value, key) => { raw[key] = value; });
  raw.currentCourse = canonicalCourseLabel(raw.currentCourse);
  const linkedInstructor = state.instructorProfiles.find((instructor) => instructor.id === raw.assignedInstructorId);
  if (linkedInstructor) raw.assignedCFI = linkedInstructor.name;
  raw.scheduledByInitials = raw.scheduledByInitials || window.AOAAuth?.getCurrentUserInitials?.() || "";
  markStudentModified(raw);
  const student = normalizeStudent(raw);
  const errors = validateStudent(student);
  if (errors.length) {
    showStudentFormError(errors);
    return;
  }
  clearStudentFormError();
  setStudentFormSaving(true, "Saving student...");
  try {
    const index = state.students.findIndex((item) => item.id === id);
    if (index >= 0) state.students[index] = student;
    else state.students.push(student);
    await saveStudents(state.students);
    await appendAuditLog({ studentId: student.id, studentName: student.studentName, field: "detail", ...currentStaffAuditFields(), summary: "Saved student detail" });
    setStudentFormSaving(true, "Saved. Opening profile...");
    state.saveInFlight = false;
    location.href = `student-detail.html?id=${encodeURIComponent(student.id)}`;
  } catch (error) {
    console.warn("Student profile save failed", error);
    const latestIndex = state.students.findIndex((item) => item.id === id);
    if (existing && latestIndex >= 0) state.students[latestIndex] = existing;
    if (!existing && latestIndex >= 0) state.students.splice(latestIndex, 1);
    showStudentFormError(studentSaveErrorMessage(error, "Student profile could not be saved. Please stay on this page and try again."));
    setStudentFormSaving(false);
  }
}

function renderDashboard() {
  const stats = getDashboardStats(state.students);
  renderDashboardCards(state.students);
  renderCountList("#students-by-group", stats.byGroup);
  renderCountList("#students-by-training", stats.byTrainingType);
  document.querySelector("#student-watch-list").innerHTML = [...state.students]
    .sort(compareStudentsByPriority)
    .map((student) => ({ student, flags: getStudentFlags(student) }))
    .filter(({ flags }) => flags.length)
    .slice(0, 10)
    .map(({ student, flags }) => studentAlertRow(student, flags.slice(0, 3)))
    .join("") || emptyBlock("No student flags right now.");
}

function renderCountList(selector, counts) {
  const isGroupList = selector.includes("group");
  document.querySelector(selector).innerHTML = Object.entries(counts)
    .sort((a, b) => isGroupList ? compareGroups(a[0], b[0]) : b[1] - a[1])
    .map(([label, count]) => {
      const labelMarkup = isGroupList ? groupBadge(label) : `<strong>${escapeHtml(label)}</strong>`;
      const isTopPriority = label === "Group 1 / Delta";
      const isSecondPriority = label === "Group 3";
      const priorityClass = isTopPriority ? "priority-group-row top-priority-group-row" : isSecondPriority ? "priority-group-row next-priority-group-row" : "";
      const priorityNote = isTopPriority ? "<small>Highest dispatch priority</small>" : isSecondPriority ? "<small>Next dispatch priority</small>" : "";
      return `<div class="student-count-row ${priorityClass}"><span>${labelMarkup}${priorityNote}</span><strong>${count}</strong></div>`;
    })
    .join("");
}

function renderStudents() {
  fillFilters();
  const students = sortStudents(filterStudents(state.students));
  const courseSource = sortStudents(filterStudents(state.students, { ignoreCourse: true }));
  renderStudentHome(students, courseSource);
  updateStudentView();
  updatePhotoMigrationStatus();
  document.querySelector("#student-result-count").textContent = `${students.length} of ${state.students.length} students`;
  document.querySelector("#student-table-body").innerHTML = students.map(studentTableRow).join("");
  document.querySelector("#student-empty").hidden = students.length > 0;
  const canEdit = canEditStudentProfiles();
  document.querySelector('a[href="student-detail.html"]')?.toggleAttribute("hidden", !canEdit);
  document.querySelector("#export-students")?.toggleAttribute("hidden", !canEdit);
}

function renderStudentHome(students, courseSource = students) {
  if (!document.querySelector("#student-dashboard-cards")) return;
  renderDashboardCards(state.students);
  renderCourseList(courseSource);
  document.querySelector("#student-card-count").textContent = `${students.length} shown`;
  document.querySelector("#student-course-sections").innerHTML = studentCourseSections(students);
}

function renderDashboardCards(students) {
  const stats = getDashboardStats(students);
  const part141 = students.filter((student) => student.trainingType === "Part 141").length;
  const part61 = students.filter((student) => student.trainingType === "Part 61").length;
  const missingPhotos = students.filter((student) => !student.photoUrl).length;
  const embeddedPhotos = students.filter((student) => isEmbeddedPhoto(student.photoUrl)).length;
  const cards = [
    ["Active students", stats.activeCount, "metric-green", `${students.length} total profiles`],
    ["Part 141", part141, "metric-blue", "Training type"],
    ["Part 61", part61, "metric-yellow", "Training type"],
    ["Need photos", missingPhotos, "metric-orange", embeddedPhotos ? `${embeddedPhotos} need migration` : "Profile pictures"]
  ];
  document.querySelector("#student-dashboard-cards").innerHTML = cards.map(([label, value, klass, detail]) => `
    <article class="metric-card ${klass}"><span>${label}</span><strong>${value}</strong><small>${escapeHtml(detail)}</small></article>
  `).join("");
}

function updatePhotoMigrationStatus(message = null) {
  const button = document.querySelector("#migrate-student-photos");
  const status = document.querySelector("#student-photo-migration-status");
  if (!button || !status) return;
  if (message !== null) state.photoMigrationMessage = message;
  const embeddedCount = state.students.filter((student) => isEmbeddedPhoto(student.photoUrl)).length;
  const statusMessage = state.photoMigrationMessage;
  button.hidden = !embeddedCount && !statusMessage;
  button.disabled = state.photoMigrationInFlight || !embeddedCount;
  button.textContent = state.photoMigrationInFlight ? "Moving photos..." : `Move ${embeddedCount || "old"} photos to Storage`;
  status.hidden = !statusMessage && !embeddedCount;
  status.textContent = statusMessage || (embeddedCount ? `${embeddedCount} existing profile photo${embeddedCount === 1 ? "" : "s"} can be moved out of the student database.` : "");
}

function updateStudentView() {
  const homeView = document.querySelector("#student-home-view");
  const tableView = document.querySelector("#student-table-view");
  if (!homeView || !tableView) return;
  const showingTable = state.view === "table";
  homeView.hidden = showingTable;
  tableView.hidden = !showingTable;
  document.querySelectorAll("[data-student-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.studentView === state.view);
  });
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.statusFilter === state.filters.active);
  });
}

function fillFilters() {
  [["group", "#filter-group"], ["trainingType", "#filter-training"], ["currentCourse", "#filter-course"], ["assignedCFI", "#filter-cfi"], ["scheduledByInitials", "#filter-initials"]].forEach(([field, selector]) => {
    const select = document.querySelector(selector);
    if (!select || select.dataset.ready) return;
    const sourceValues = field === "assignedCFI"
      ? [...masterScheduleInstructors(), ...state.students.map((student) => student.assignedCFI)]
      : field === "currentCourse"
        ? state.students.map((student) => canonicalCourseLabel(student.currentCourse))
        : state.students.map((student) => student[field]);
    const values = unique(sourceValues.filter(Boolean))
      .sort(field === "group" ? compareGroups : undefined);
    select.insertAdjacentHTML("beforeend", values.map((value) => `<option>${escapeHtml(value)}</option>`).join(""));
    select.dataset.ready = "true";
  });
}

function filterStudents(students, options = {}) {
  const term = state.filters.search.toLowerCase();
  return students
    .filter((student) => !term || [student.studentName, student.assignedCFI, student.currentCourse, student.curriculum, student.notes].some((value) => String(value || "").toLowerCase().includes(term)))
    .filter((student) => !state.filters.active || student.activeStatus === state.filters.active)
    .filter((student) => !state.filters.group || student.group === state.filters.group)
    .filter((student) => !state.filters.trainingType || student.trainingType === state.filters.trainingType)
    .filter((student) => options.ignoreCourse || !state.filters.course || (state.filters.course === "__blank" ? !student.currentCourse : canonicalCourseLabel(student.currentCourse) === state.filters.course))
    .filter((student) => !state.filters.cfi || student.assignedCFI === state.filters.cfi)
    .filter((student) => !state.filters.initials || student.scheduledByInitials === state.filters.initials);
}

function sortStudents(students) {
  const direction = state.sort.direction === "asc" ? 1 : -1;
  return [...students].sort((a, b) => {
    if (state.sort.key === "groupPriority") return compareStudentsByPriority(a, b) * direction;
    if (state.sort.key === "currentCourse") return compareStudentsByCourse(a, b) * direction;
    if (state.sort.key === "group") {
      const groupSort = compareGroups(a.group, b.group);
      if (groupSort !== 0) return groupSort * direction;
      return compareStudentsByPriority(a, b);
    }
    if (state.sort.key === "groupGroundAttended") return (groundAttendanceValue(a) - groundAttendanceValue(b)) * direction;
    if (state.sort.key === "myfboAttendance") return (myfboAttendanceRate(a) - myfboAttendanceRate(b)) * direction;
    return String(a[state.sort.key] ?? "").localeCompare(String(b[state.sort.key] ?? ""), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}

function compareStudentsByCourse(a, b) {
  return coursePriority(courseLabel(a)) - coursePriority(courseLabel(b))
    || courseLabel(a).localeCompare(courseLabel(b), undefined, { numeric: true, sensitivity: "base" })
    || groupPriority(a.group) - groupPriority(b.group)
    || String(a.studentName || "").localeCompare(String(b.studentName || ""), undefined, { sensitivity: "base" });
}

function compareStudentsByPriority(a, b) {
  return groupPriority(a.group) - groupPriority(b.group)
    || String(a.activeStatus === "Yes" ? 0 : 1).localeCompare(String(b.activeStatus === "Yes" ? 0 : 1))
    || String(a.studentName || "").localeCompare(String(b.studentName || ""), undefined, { sensitivity: "base" });
}

function studentTableRow(student) {
  const attendance = myfboAttendanceForStudent(student);
  const flags = displayStudentFlags(student, attendance);
  const attendanceLevel = myfboAttendanceLevel(attendance, student);
  const flagClass = attendanceLevel === "attention" || attendanceLevel === "error" || flags.some((flag) => flag.severity === "high")
    ? "student-row-high"
    : attendanceLevel === "caution" || flags.length ? "student-row-warn" : "";
  return `
    <tr class="${flagClass}">
      <td class="sticky-name"><a href="student-detail.html?id=${encodeURIComponent(student.id)}"><strong>${escapeHtml(student.studentName)}</strong></a><small>${groupBadge(student.group)}${flagBadges(flags.slice(0, 2))}</small></td>
      <td>${inlineSelect(student, "activeStatus", ["Yes", "No"])}</td>
      <td class="student-group-cell">${groupBadge(student.group)}${inlineText(student, "group")}</td>
      <td>${inlineSelect(student, "trainingType", ["", "Part 141", "Part 61"])}</td>
      <td>${inlineSelect(student, "currentCourse", studentCourseOptions(student.currentCourse), canonicalCourseLabel(student.currentCourse))}</td>
      <td>${inlineText(student, "assignedCFI")}</td>
      <td>${student.weeklyTotal}</td>
      <td>${myfboAttendanceCell(student)}</td>
      <td>${groundAttendanceCell(student)}</td>
      <td>${inlineText(student, "scheduledByInitials")}</td>
      <td>${rosterLastUpdatedCell(student, attendance)}</td>
      <td>${inlineText(student, "notes")}</td>
    </tr>
  `;
}

function studentCard(student) {
  const attendance = myfboAttendanceForStudent(student);
  const rosterBadges = [
    student.spinTrainingRequired === "Yes" ? badge(spinTrainingBadgeLabel(student), "red") : "",
    student.includeOnAttendanceList === "No" ? badge("No attendance list", "yellow") : ""
  ].filter(Boolean).join(" ");
  return `
    <a class="student-profile-card ${student.activeStatus === "No" ? "inactive" : ""}" href="student-detail.html?id=${encodeURIComponent(student.id)}">
      ${studentPhoto(student)}
      <span class="student-profile-content">
        <span class="student-profile-topline">${badge(student.activeStatus === "Yes" ? "Active" : "Inactive", student.activeStatus === "Yes" ? "green" : "blue")} ${groupBadge(student.group)} ${badge(student.trainingType || "No part", "blue")}</span>
        <strong>${escapeHtml(student.studentName || "Unnamed student")}</strong>
        ${rosterBadges ? `<span class="student-profile-topline">${rosterBadges}</span>` : ""}
        <span class="student-profile-meta">${escapeHtml(student.assignedCFI || "No CFI")} | ${escapeHtml(student.aircraft || "No aircraft")}</span>
        ${myfboAttendanceSummary(attendance, student)}
      </span>
    </a>
  `;
}

function studentCourseSections(students) {
  if (!students.length) return emptyBlock("No students found.");
  return groupedByCourse(students).map(([course, courseStudents]) => `
    <section class="student-course-section ${courseToneClass(course)}">
      <header><h3>${escapeHtml(course)}</h3><span>${courseStudents.length}</span></header>
      <div class="student-card-grid">${courseStudents.map(studentCard).join("")}</div>
    </section>
  `).join("");
}

function courseToneClass(course) {
  const text = String(course || "").toLowerCase();
  if (text.includes("private") || text.includes("ppl")) return "course-tone-sky";
  if (text.includes("instrument") || text.includes("ira")) return "course-tone-indigo";
  if (text.includes("commercial") || text.includes("cax") || text.includes("com")) return "course-tone-amber";
  if (text.includes("instructor") || text.includes("cfi") || text.includes("cfii")) return "course-tone-emerald";
  if (text.includes("multi") || text.includes("mei")) return "course-tone-rose";
  if (text.includes("no course")) return "course-tone-slate";
  return "course-tone-blue";
}

function renderCourseList(students) {
  const groups = groupedByCourse(students);
  document.querySelector("#student-course-count").textContent = `${groups.length} courses`;
  const rows = groups.map(([course, courseStudents]) => {
    const value = course === "No course" ? "__blank" : course;
    const active = state.filters.course === value;
    return `
    <button class="student-course-row ${active ? "active" : ""}" type="button" data-course-filter="${escapeHtml(value)}">
      <span><strong>${escapeHtml(course)}</strong><small>${courseStudents.filter((student) => student.activeStatus === "Yes").length} active</small></span>
      <b>${courseStudents.length}</b>
    </button>
  `;
  }).join("");
  document.querySelector("#students-by-course").innerHTML = `
    <button class="student-course-row ${state.filters.course ? "" : "active"}" type="button" data-course-filter="">
      <span><strong>All courses</strong><small>Full roster</small></span>
      <b>${students.length}</b>
    </button>
    ${rows || emptyBlock("No courses yet.")}
  `;
}

function groupedByCourse(students) {
  const byCourse = new Map();
  students.forEach((student) => {
    const course = courseLabel(student);
    if (!byCourse.has(course)) byCourse.set(course, []);
    byCourse.get(course).push(student);
  });
  return [...byCourse.entries()].sort((a, b) => coursePriority(a[0]) - coursePriority(b[0])
    || a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }));
}

function courseLabel(student) {
  return canonicalCourseLabel(student.currentCourse) || "No course";
}

function canonicalCourseLabel(value) {
  return normalizeCourseName(String(value || "").trim());
}

function coursePriority(course) {
  const text = String(course || "").toLowerCase();
  if (/\bpar\b/.test(text) || text.includes("private")) return 0;
  if (text.includes("instrument") || /\bira\b/.test(text) || /\bir\b/.test(text)) return 1;
  if (text.includes("commercial") || /\bcax\b/.test(text) || /\bcom\b/.test(text)) return 2;
  if (/\bcfii\b/.test(text)) return 4;
  if (/\bcfi\b/.test(text) || text.includes("instructor")) return 3;
  if (text.includes("no course")) return 998;
  return 500;
}

function studentProfileOverviewMarkup(student) {
  const attendance = myfboAttendanceForStudent(student);
  const attendanceText = attendanceListEligible(student)
    ? attendance
      ? `${formatMyfboPercent(myfboAttendanceMetric(attendance, "attendanceRate", student))} · ${myfboAttendanceLevelLabel(myfboAttendanceLevel(attendance, student))}`
      : "No MyFBO match"
    : "Not on attendance list";
  const trainerNoShows = trainerBookingsForStudent(student).filter(isCountedTrainerNoShow).length;
  const glanceText = (value, fallback = "Not set") => {
    const text = String(value || "").trim();
    if (!text) return fallback;
    return text.length > 58 ? `${text.slice(0, 57).trimEnd()}…` : text;
  };
  const facts = [
    ["Current course", courseLabel(student), "#training-section"],
    ["Assigned CFI", student.assignedCFI || "Not assigned", "#training-section"],
    ["Aircraft", student.aircraft || "Not assigned", "#training-section"],
    ["MyFBO attendance", attendanceText, "#attendance-section"],
    ["Ground attendance", `${groundAttendanceValue(student)} check-ins`, "#attendance-section"],
    ["Ground trainer no-shows", String(trainerNoShows), "#activity-section"],
    ["Weekly availability", `${student.weeklyTotal || 0} sessions`, "#availability-section"],
    ["Course started", formatDate(student.courseStartDate) || "Not set", "#training-section"],
    ["Projected graduation", formatDate(student.projectedGraduationDate) || "Not set", "#training-section"],
    ["Time off", glanceText(student.timeOff, "None listed"), "#notes-section"],
    ["Staff notes", glanceText(student.notes, "None listed"), "#notes-section"]
  ];
  return `
    <div class="student-overview-identity">
      ${studentPhoto(student, "large")}
      <div><span class="student-section-kicker">At a glance</span><h2>${escapeHtml(student.studentName || "New student")}</h2><p>${escapeHtml(student.group || "No group")} · ${escapeHtml(student.trainingType || "Training type not set")}</p><a class="button quiet" href="#profile-section">Edit profile</a></div>
    </div>
    <div class="student-overview-facts">${facts.map(([label, value, href]) => `<a href="${href}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></a>`).join("")}</div>
  `;
}

function trainerBookingsForStudent(student) {
  const studentIds = [student?.id, student?.myfboStudentId, student?.studentId].filter(Boolean).map(String);
  const nameKey = normalizeFirstLastKey(student?.studentName);
  return state.trainerBookings.filter((booking) => {
    if (booking.deletedAt) return false;
    if (booking.studentId) return studentIds.includes(String(booking.studentId));
    return normalizeFirstLastKey(booking.studentName || booking.name) === nameKey;
  });
}

function studentActivity(student) {
  const key = normalizeFirstLastKey(student.studentName);
  const trainerBookings = trainerBookingsForStudent(student);
  const trainerNoShows = trainerBookings.filter(isCountedTrainerNoShow);
  const latestTrainer = [...trainerBookings]
    .sort((a, b) => `${b.date || ""}-${Number(b.startHour) || 0}`.localeCompare(`${a.date || ""}-${Number(a.startHour) || 0}`))
    .slice(0, 5);
  const writtenAttempts = state.writtenAttempts.filter((attempt) => normalizeFirstLastKey(attempt.student) === key);
  const writtenScheduled = state.writtenScheduled.filter((entry) => normalizeFirstLastKey(entry.student) === key);
  const writtenTests = [...new Set(writtenAttempts.map((attempt) => attempt.test).filter(Boolean))].sort();
  const latestWritten = [...writtenAttempts]
    .sort((a, b) => String(b.takenAt || "").localeCompare(String(a.takenAt || "")))
    .slice(0, 5);
  return {
    trainerBookings: trainerBookings.length,
    trainerNoShows: trainerNoShows.length,
    latestTrainer,
    writtenAttempts: writtenAttempts.length,
    writtenScheduled: writtenScheduled.length,
    writtenTests,
    latestWritten
  };
}

function studentActivityMarkup(student) {
  const activity = studentActivity(student);
  return `
    <div class="student-activity-grid">
      <article><span>Ground trainer bookings</span><strong>${activity.trainerBookings}</strong></article>
      <article class="${activity.trainerNoShows ? "student-activity-alert" : ""}"><span>Trainer no-shows</span><strong>${activity.trainerNoShows}</strong></article>
      <article><span>Written tests taken</span><strong>${activity.writtenAttempts}</strong></article>
      <article><span>Written bookings</span><strong>${activity.writtenScheduled}</strong></article>
    </div>
    <div class="student-activity-list">
      <strong>Recent ground trainer sessions</strong>
      ${activity.latestTrainer.length ? activity.latestTrainer.map((booking) => `
        <div class="student-activity-row ${isCountedTrainerNoShow(booking) ? "no-show" : booking.checkedInAt ? "checked-in" : ""}">
          <span>${escapeHtml(formatDate(booking.date) || booking.date || "Ground trainer")}</span>
          <b>${isCountedTrainerNoShow(booking) ? "Ground trainer no-show" : booking.checkedInAt ? "Checked in" : isTrainerBookingCoveredByCheckinPolicy(booking) ? "Not checked in" : "Grandfathered (not counted)"}</b>
          <small>${escapeHtml(booking.trainer === "trainer2" ? "Ground Trainer 2" : "Ground Trainer 1")} · ${escapeHtml(formatHourRange(booking))}${isCountedTrainerNoShow(booking) ? ` · Marked ${escapeHtml(formatDateTime(booking.noShowAt))}` : ""}</small>
        </div>
      `).join("") : `<div class="empty-state compact"><strong>No ground trainer sessions found.</strong></div>`}
      <strong>Recent written scores</strong>
      ${activity.latestWritten.length ? activity.latestWritten.map((attempt) => `
        <div class="student-activity-row">
          <span>${escapeHtml(attempt.test || "Written")}</span>
          <b>${attempt.score === null || attempt.score === undefined || attempt.score === "" ? "No score" : escapeHtml(attempt.score)}</b>
          <small>${formatDateTime(attempt.takenAt)}</small>
        </div>
      `).join("") : `<div class="empty-state compact"><strong>No written-test attempts found.</strong></div>`}
    </div>
  `;
}

function formatHourRange(booking) {
  const formatHour = (value) => {
    const hour = Math.floor(Number(value));
    const minutes = Number(value) % 1 ? "30" : "00";
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };
  return `${formatHour(booking.startHour)}–${formatHour(Number(booking.startHour) + Number(booking.duration))}`;
}

function renderDetail() {
  const id = new URLSearchParams(location.search).get("id");
  const student = findStudent(id) || normalizeStudent({ activeStatus: "Yes" });
  const isExisting = Boolean(findStudent(id));
  if (!isExisting && !canEditStudentProfiles()) {
    window.location.replace("students.html");
    return;
  }
  const sapUpload = document.querySelector("#student-sap-upload");
  if (sapUpload && isExisting && window.AOAAuth?.getCurrentUser?.()?.isAdmin) {
    sapUpload.hidden = false;
    sapUpload.href = `sap-import.html?studentId=${encodeURIComponent(student.id)}`;
  }
  document.querySelector("#student-detail-title").textContent = student.studentName || "New student";
  const breadcrumbName = document.querySelector("#student-breadcrumb-name");
  if (breadcrumbName) breadcrumbName.textContent = student.studentName || "New student";
  const profileTrainerNoShows = trainerBookingsForStudent(student).filter(isCountedTrainerNoShow).length;
  document.querySelector("#student-detail-subtitle").innerHTML = `${badge(student.activeStatus, student.activeStatus === "Yes" ? "green" : "blue")} ${groupBadge(student.group)} ${badge(student.trainingType || "No part", "yellow")} ${badge(courseLabel(student), "blue")} ${badge(student.assignedCFI || "No CFI", "blue")} ${badge(`${student.weeklyTotal || 0} weekly`, "green")} ${profileTrainerNoShows ? badge(`${profileTrainerNoShows} trainer no-show${profileTrainerNoShows === 1 ? "" : "s"}`, "red") : ""} ${student.spinTrainingRequired === "Yes" ? badge(spinTrainingBadgeLabel(student), "red") : ""} ${student.includeOnAttendanceList === "No" ? badge("Hidden from attendance", "yellow") : ""}`;
  const overview = document.querySelector("#student-profile-overview");
  if (overview) overview.innerHTML = studentProfileOverviewMarkup(student);
  renderStudentRecordNav(student, isExisting);
  const deleteButton = document.querySelector("#delete-student-button");
  if (deleteButton) {
    deleteButton.hidden = !isExisting || !canEditStudentProfiles();
    deleteButton.dataset.studentId = isExisting ? student.id : "";
    deleteButton.dataset.studentName = isExisting ? student.studentName : "";
  }
  document.querySelector("#student-form-wrap").innerHTML = studentForm(student);
  if (!canEditStudentProfiles()) {
    document.querySelectorAll("#student-form input, #student-form select, #student-form textarea, #student-form button").forEach((control) => {
      control.disabled = true;
    });
  }
  const activity = studentActivity(student);
  document.querySelector("#student-activity-summary").innerHTML = studentActivityMarkup(student);
  const activityGlance = document.querySelector("#student-activity-glance");
  if (activityGlance) activityGlance.textContent = activity.trainerNoShows ? `${activity.trainerNoShows} trainer no-show${activity.trainerNoShows === 1 ? "" : "s"}` : `${activity.writtenAttempts + activity.writtenScheduled + activity.trainerBookings} records`;
  const activityPanel = document.querySelector("#activity-section");
  if (activityPanel && activity.trainerNoShows) activityPanel.open = true;
  const attendanceBox = document.querySelector("#student-detail-attendance");
  if (attendanceBox) attendanceBox.innerHTML = studentAttendanceDetailMarkup(student);
  const attendanceGlance = document.querySelector("#student-attendance-glance");
  if (attendanceGlance) attendanceGlance.textContent = studentAttendanceGlance(student);
  renderStudentSapSummary(student);
  const studentFlags = displayStudentFlags(student);
  document.querySelector("#student-detail-flags").innerHTML = flagBadges(studentFlags) || emptyBlock("No automatic flags.");
  const flagsGlance = document.querySelector("#student-flags-glance");
  if (flagsGlance) flagsGlance.textContent = studentFlags.length ? `${studentFlags.length} to review` : "None";
  const flagsPanel = document.querySelector("#flags-section");
  if (flagsPanel) flagsPanel.open = true;
  const auditEntries = state.audit.filter((entry) => entry.studentId === student.id).slice(0, 12);
  const historyGlance = document.querySelector("#student-history-glance");
  if (historyGlance) historyGlance.textContent = auditEntries.length ? `${auditEntries.length} recent` : "None";
  document.querySelector("#student-audit-log").innerHTML = auditEntries
    .map((entry) => `<div class="student-count-row"><span>${escapeHtml(entry.summary || entry.field)}<small>${new Date(entry.at).toLocaleString()} ${entry.initials ? `· ${escapeHtml(entry.initials)}` : ""}</small></span></div>`)
    .join("") || emptyBlock("No audit entries yet.");
  renderStudentSapTimeline(student);
  bindStudentDetailNavigation();
}

function renderStudentRecordNav(student, isExisting) {
  const container = document.querySelector("#student-record-nav");
  if (!container) return;
  if (!isExisting) {
    container.innerHTML = `<span class="student-record-position">New profile</span>`;
    return;
  }
  const students = [...state.students].sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || ""), undefined, { sensitivity: "base" }));
  const index = students.findIndex((candidate) => sameRecordId(candidate.id, student.id));
  const previous = index > 0 ? students[index - 1] : null;
  const next = index >= 0 && index < students.length - 1 ? students[index + 1] : null;
  const link = (candidate, label, rel) => candidate
    ? `<a class="student-record-arrow" href="student-detail.html?id=${encodeURIComponent(candidate.id)}" aria-label="${label}: ${escapeHtml(candidate.studentName)}" title="${escapeHtml(candidate.studentName)}" rel="${rel}">${label}</a>`
    : `<span class="student-record-arrow disabled" aria-hidden="true">${label}</span>`;
  container.innerHTML = `${link(previous, "Previous", "prev")}<span class="student-record-position">${index + 1} of ${students.length}</span>${link(next, "Next", "next")}`;
}

function bindStudentDetailNavigation() {
  const nav = document.querySelector(".student-detail-nav");
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = "true";
  const links = [...nav.querySelectorAll("a[href^='#']")];
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    links.forEach((candidate) => candidate.classList.toggle("active", candidate === link));
    const target = document.querySelector(link.getAttribute("href"));
    if (target instanceof HTMLDetailsElement) target.open = true;
  });
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    if (link.closest(".student-detail-nav")) return;
    link.addEventListener("click", () => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target instanceof HTMLDetailsElement) target.open = true;
      links.forEach((candidate) => candidate.classList.toggle("active", candidate.getAttribute("href") === link.getAttribute("href")));
    });
  });
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
}

function renderStudentSapTimeline(student) {
  const container = document.querySelector("#student-sap-timeline");
  if (!container) return;
  const imports = sapImportsForStudent(student);
  const allMilestones = sapMilestonesForStudent(student, imports);
  const canAdminEdit = Boolean(window.AOAAuth?.getCurrentUser?.()?.isAdmin);
  if (!allMilestones.length) {
    container.innerHTML = `<div class="empty-state"><strong>No SAP Matrix imported.</strong><span>Upload a matrix to build this student’s projected training timeline.</span>${canAdminEdit ? `<a class="button primary" href="sap-import.html?studentId=${encodeURIComponent(student.id)}">Upload SAP Matrix</a>` : ""}</div>`;
    return;
  }
  if (!student.currentCourse) {
    container.innerHTML = `<div class="empty-state"><strong>Current course is not set.</strong><span>Set the student’s current course to show the relevant SAP milestones.</span>${canAdminEdit ? sapMatrixAdminActions(student, imports) : ""}</div>`;
    return;
  }
  const currentMilestones = currentCourseMilestones(student, allMilestones);
  if (!currentMilestones.length) {
    const availableCourses = [...new Set(allMilestones.map((item) => item.course).filter(Boolean))].join(", ");
    container.innerHTML = `<div class="empty-state"><strong>No milestones match ${escapeHtml(student.currentCourse)}.</strong><span>${availableCourses ? `The imported matrix contains: ${escapeHtml(availableCourses)}. Update the student’s current course if needed.` : "The imported matrix does not contain a named course."}</span>${canAdminEdit ? sapMatrixAdminActions(student, imports) : ""}</div>`;
    return;
  }
  const evaluated = orderedSapMilestones(currentMilestones).map((item) => evaluateMilestone({ ...item, rawLabel: item.originalLabel || item.rawLabel }, { student, writtenAttempts: state.writtenAttempts, writtenScheduled: state.writtenScheduled, stageRequests: state.stageRequests }));
  const latestImport = imports[0];
  container.innerHTML = `<div class="sap-timeline-summary">
    <article><span>Current course</span><strong>${escapeHtml(courseLabel(student))}</strong></article>
    <article><span>Enrollment</span><strong>${escapeHtml(formatDate(student.enrollmentDate) || "Not set")}</strong></article>
    <article><span>Projected graduation</span><strong>${escapeHtml(formatDate(student.projectedGraduationDate) || "Not set")}</strong></article>
    <article><span>Last SAP import</span><strong>${escapeHtml(formatDateTime(student.lastSapImportDate || timestampValue(latestImport?.confirmedAt)) || "Not set")}</strong></article>
  </div><section class="sap-course-group"><header><h3>${escapeHtml(courseLabel(student))}</h3><div class="sap-course-actions"><span>${evaluated.length} milestones</span>${canAdminEdit ? `<button class="button quiet sap-header-action" type="button" data-sap-milestone-add="">Add milestone</button><button class="button quiet sap-header-action danger" type="button" data-remove-sap-matrix="">Remove matrix</button>` : ""}</div></header><div class="sap-milestone-list" data-sap-milestone-list>${evaluated.map((item, index) => sapMilestoneMarkup(item, index, evaluated.length)).join("")}</div></section>
  ${imports.length ? `<details class="sap-import-history"><summary>SAP imports (${imports.length})</summary>${imports.map((item) => `<div class="student-count-row"><span><strong>${escapeHtml(item.originalFilename || "SAP Matrix")}</strong><small>${escapeHtml(formatDateTime(timestampValue(item.confirmedAt) || timestampValue(item.uploadedAt)))} · ${escapeHtml(item.confirmedBy?.name || item.uploadedBy?.name || "Staff")}</small></span>${canAdminEdit ? `<span class="sap-import-actions"><button class="row-action edit-action" type="button" data-open-sap-source="${escapeHtml(item.id)}">Source PDF</button><button class="row-action edit-action danger" type="button" data-remove-sap-matrix="${escapeHtml(item.id)}">Remove</button></span>` : ""}</div>`).join("")}</details>` : ""}`;
}

function renderStudentSapSummary(student) {
  const container = document.querySelector("#student-detail-sap-summary");
  if (!container) return;
  const imports = sapImportsForStudent(student);
  const allMilestones = sapMilestonesForStudent(student, imports);
  const glance = document.querySelector("#student-sap-glance");
  if (glance) glance.textContent = allMilestones.length ? `${allMilestones.length} milestones` : "No matrix";
  if (!allMilestones.length) {
    container.innerHTML = `<div class="empty-state compact"><strong>No matrix connected</strong><span>Import a SAP Matrix for this roster student.</span>${window.AOAAuth?.getCurrentUser?.()?.isAdmin ? `<a class="button quiet" href="sap-import.html?studentId=${encodeURIComponent(student.id)}">Import matrix</a>` : ""}</div>`;
    return;
  }
  if (!student.currentCourse) {
    container.innerHTML = `<div class="empty-state compact"><strong>Current course not set</strong><span>Set the current course to show relevant milestones.</span></div>`;
    return;
  }
  const milestones = currentCourseMilestones(student, allMilestones);
  if (!milestones.length) {
    container.innerHTML = `<div class="empty-state compact"><strong>No current-course milestones</strong><span>No imported milestones match ${escapeHtml(student.currentCourse)}.</span></div>`;
    return;
  }
  const latestImport = imports[0];
  const urgent = milestones.filter((item) => item.completionStatus !== "completed").length;
  container.innerHTML = `<a class="student-alert-row" href="#sap-training-timeline"><strong>${milestones.length} ${escapeHtml(courseLabel(student))} milestones</strong><span>${urgent} active</span><small>${escapeHtml(formatDateTime(student.lastSapImportDate || timestampValue(latestImport?.confirmedAt)) || "Imported SAP Matrix")}</small></a>`;
}

function sapImportsForStudent(student) {
  return state.sapImports.filter((item) => !item.removedAt && item.status !== "removed" && sameRecordId(item.selectedStudentId, student.id)).sort((a, b) => timestampValue(b.confirmedAt).localeCompare(timestampValue(a.confirmedAt)));
}

function sapMilestonesForStudent(student, imports = sapImportsForStudent(student)) {
  const importIds = new Set(imports.map((item) => String(item.id || "")).filter(Boolean));
  return state.sapMilestones.filter((item) => !item.removedAt && (sameRecordId(item.studentId, student.id) || importIds.has(String(item.sourceImportId || ""))));
}

function currentCourseMilestones(student, milestones) {
  const currentCourseKey = normalizedKey(normalizeCourseName(student.currentCourse));
  if (!currentCourseKey) return [];
  return milestones.filter((item) => normalizedKey(normalizeCourseName(item.course)) === currentCourseKey);
}

function orderedSapMilestones(milestones) {
  return [...milestones].sort((a, b) => (a.courseOrder ?? 999) - (b.courseOrder ?? 999) || String(a.projectedDate || "9999").localeCompare(String(b.projectedDate || "9999")) || String(a.originalLabel || a.rawLabel || "").localeCompare(String(b.originalLabel || b.rawLabel || "")));
}

function sameRecordId(left, right) {
  return String(left ?? "") !== "" && String(left) === String(right ?? "");
}

function sapMilestoneMarkup(item) {
  const dayText = item.daysRemaining === null ? item.status === "tbd" ? "TBD" : "Unscheduled" : item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)} days overdue` : item.daysRemaining === 0 ? "Due today" : `${item.daysRemaining} days remaining`;
  const linked = item.written?.length ? item.written.map((test) => `${test.test}: ${test.status.replaceAll("_", " ")}${test.practice.attempts ? ` · practice high ${test.practice.highestScore}%${test.practice.ready ? " ready" : ""}` : " · no practice"}`).join("; ") : item.stage ? `Check ${item.stage.status}${item.stage.result ? ` · ${item.stage.result}` : ""}` : "";
  const completedBy = item.completedBy?.name || item.completedBy?.initials || "Linked training record";
  const isManual = Boolean(item.manuallyCompleted);
  const student = state.students.find((candidate) => sameRecordId(candidate.id, item.studentId));
  const user = window.AOAAuth?.getCurrentUser?.();
  const canComplete = Boolean(user?.isAdmin || (student && canManageStudentMilestones(student)));
  const canAdminEdit = Boolean(user?.isAdmin);
  return `<article class="sap-milestone sap-priority-${item.priority} sap-status-${item.status}" data-sap-milestone-id="${escapeHtml(item.id)}"><div><span class="sap-type">${escapeHtml(item.normalizedType.replaceAll("_", " "))}</span><strong>${escapeHtml(item.originalLabel || item.rawLabel)}</strong><small>${escapeHtml(linked || item.warnings.join(" · ") || "Projected SAP milestone")}</small>${canAdminEdit ? `<div class="sap-edit-actions"><span class="sap-drag-handle" draggable="true" data-sap-drag-handle title="Drag to reorder">Drag</span><button class="row-action edit-action" type="button" data-sap-milestone-edit="${escapeHtml(item.id)}">Edit</button><button class="row-action edit-action" type="button" data-sap-milestone-add="${escapeHtml(item.id)}">Add below</button></div>` : ""}</div><div class="sap-milestone-dates"><span>Projected <b>${escapeHtml(formatDate(item.projectedDate) || item.dateStatus?.toUpperCase() || "Blank")}</b></span><span>Actual <b>${escapeHtml(formatDate(item.actualCompletionDate) || "Not complete")}</b>${item.completionStatus === "completed" ? `<small>Marked by ${escapeHtml(completedBy)}</small>` : ""}</span></div><div class="sap-alert-chip"><strong>${escapeHtml(item.status.replaceAll("_", " "))}</strong><small>${escapeHtml(dayText)}</small>${canComplete ? `<button class="sap-complete-button ${isManual ? "is-complete" : ""}" type="button" data-sap-milestone-complete="${escapeHtml(item.id)}" data-completed="${isManual}">${isManual ? "Reopen" : "Mark complete"}</button>` : ""}</div></article>`;
}

function sapMatrixAdminActions(student, imports = []) {
  return `<div class="sap-empty-actions"><a class="button primary" href="sap-import.html?studentId=${encodeURIComponent(student.id)}">Upload SAP Matrix</a>${imports.length ? `<button class="button quiet danger" type="button" data-remove-sap-matrix="">Remove matrix</button>` : ""}</div>`;
}

async function updateSapMilestoneCompletion(button) {
  const completed = button.dataset.completed !== "true";
  if (!completed && !confirm("Reopen this milestone and remove its manual completion date?")) return;
  let completionDate = null;
  if (completed) {
    const enteredDate = prompt("Completion date (YYYY-MM-DD)", orlandoDateKey());
    if (enteredDate === null) return;
    completionDate = enteredDate.trim();
    if (!isValidPastOrPresentDateKey(completionDate, orlandoDateKey())) {
      alert("Enter a valid completion date that is not in the future.");
      return;
    }
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = completed ? "Saving..." : "Reopening...";
  try {
    const token = await window.AOAAuth.getIdToken();
    const response = await fetch("/api/sap-milestone-complete", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ milestoneId: button.dataset.sapMilestoneComplete, completed, completionDate }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.details || payload.error || "The milestone could not be updated.");
    const index = state.sapMilestones.findIndex((item) => sameRecordId(item.id, payload.milestone.id));
    if (index >= 0) state.sapMilestones[index] = payload.milestone;
    renderDetail();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    alert(error.message);
  }
}

function orlandoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isValidPastOrPresentDateKey(value, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today;
}

async function editSapMilestone(milestoneId) {
  const milestone = state.sapMilestones.find((item) => sameRecordId(item.id, milestoneId));
  if (!milestone) return alert("That SAP milestone could not be found. Refresh and try again.");
  const reviewed = promptSapMilestone(milestone);
  if (!reviewed) return;
  try {
    const payload = await postSapMilestoneEdit({ action: "update", milestoneId, milestone: reviewed });
    const index = state.sapMilestones.findIndex((item) => sameRecordId(item.id, payload.milestone.id));
    if (index >= 0) state.sapMilestones[index] = payload.milestone;
    renderDetail();
  } catch (error) {
    alert(error.message);
  }
}

async function addSapMilestone(insertAfterId = "") {
  const student = currentDetailStudent();
  if (!student?.id || !student.currentCourse) return alert("Set the student's current course before adding a SAP milestone.");
  const seed = insertAfterId ? state.sapMilestones.find((item) => sameRecordId(item.id, insertAfterId)) : null;
  const reviewed = promptSapMilestone({ course: student.currentCourse, normalizedType: seed?.normalizedType || "other", dateStatus: "blank" }, "Add SAP milestone");
  if (!reviewed) return;
  try {
    const payload = await postSapMilestoneEdit({ action: "create", studentId: student.id, course: student.currentCourse, insertAfterId, milestone: reviewed });
    mergeSapMilestones(payload.milestones || [payload.milestone]);
    renderDetail();
  } catch (error) {
    alert(error.message);
  }
}

async function saveSapMilestoneOrder(orderedIds) {
  const student = currentDetailStudent();
  if (!student || !orderedIds.length) return;
  try {
    const payload = await postSapMilestoneEdit({ action: "reorder", studentId: student.id, course: student.currentCourse, orderedIds });
    mergeSapMilestones(payload.milestones || []);
    renderDetail();
  } catch (error) {
    alert(error.message);
  }
}

function handleSapTimelineDragStart(event) {
  if (!event.target.matches("[data-sap-drag-handle]")) return;
  const milestone = event.target.closest("[data-sap-milestone-id]");
  if (!milestone) return;
  milestone.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", milestone.dataset.sapMilestoneId || "");
}

function handleSapTimelineDragOver(event) {
  const list = event.target.closest("[data-sap-milestone-list]");
  const dragging = document.querySelector("[data-sap-milestone-id].is-dragging");
  if (!list || !dragging || !list.contains(dragging)) return;
  event.preventDefault();
  const target = event.target.closest("[data-sap-milestone-id]");
  if (!target || target === dragging || !list.contains(target)) return;
  const rect = target.getBoundingClientRect();
  if (event.clientY < rect.top + rect.height / 2) target.before(dragging);
  else target.after(dragging);
}

async function handleSapTimelineDrop(event) {
  const list = event.target.closest("[data-sap-milestone-list]");
  const dragging = document.querySelector("[data-sap-milestone-id].is-dragging");
  if (!list || !dragging || !list.contains(dragging)) return;
  event.preventDefault();
  const orderedIds = [...list.querySelectorAll("[data-sap-milestone-id]")].map((item) => item.dataset.sapMilestoneId).filter(Boolean);
  handleSapTimelineDragEnd();
  await saveSapMilestoneOrder(orderedIds);
}

function handleSapTimelineDragEnd() {
  document.querySelectorAll("[data-sap-milestone-id].is-dragging").forEach((item) => item.classList.remove("is-dragging"));
}

async function removeSapMatrix(importId = "") {
  const student = currentDetailStudent();
  if (!student?.id) return;
  const label = importId ? "this SAP Matrix import" : "all SAP Matrix milestones from this student profile";
  if (!confirm(`Remove ${label}? This detaches the matrix from the profile so you can reupload it, but keeps the audit record.`)) return;
  try {
    const payload = await postSapMatrixRemove({ studentId: student.id, importId });
    mergeSapMilestones(payload.milestones || []);
    mergeSapImports(payload.imports || []);
    if (payload.student) {
      const index = state.students.findIndex((item) => sameRecordId(item.id, payload.student.id));
      if (index >= 0) state.students[index] = { ...state.students[index], ...payload.student };
    }
    renderDetail();
  } catch (error) {
    alert(error.message);
  }
}

function promptSapMilestone(seed = {}, title = "Edit SAP milestone") {
  const label = prompt(`${title}\nMilestone label`, seed.originalLabel || seed.rawLabel || "");
  if (label === null) return null;
  const rawLabel = label.trim();
  if (!rawLabel) return alert("Milestone label is required."), null;
  const projectedDateInput = prompt("Projected date (YYYY-MM-DD, or leave blank)", seed.projectedDate || "");
  if (projectedDateInput === null) return null;
  const projectedDate = projectedDateInput.trim();
  if (projectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(projectedDate)) return alert("Use YYYY-MM-DD for the projected date."), null;
  const typeInput = prompt(`Milestone type\n${SAP_MILESTONE_TYPES.join(", ")}`, seed.normalizedType || "other");
  if (typeInput === null) return null;
  const normalizedType = typeInput.trim();
  if (!SAP_MILESTONE_TYPES.includes(normalizedType)) return alert("Choose one of the listed milestone types."), null;
  return { course: seed.course || currentDetailStudent()?.currentCourse || "", rawLabel, projectedDate: projectedDate || null, normalizedType, dateStatus: projectedDate ? "projected" : (seed.dateStatus || "blank") };
}

async function postSapMilestoneEdit(body) {
  const token = await window.AOAAuth.getIdToken();
  const response = await fetch("/api/sap-milestone-edit", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.details || payload.error || "The SAP milestone could not be updated.");
  return payload;
}

function mergeSapMilestones(milestones) {
  milestones.filter(Boolean).forEach((milestone) => {
    const index = state.sapMilestones.findIndex((item) => sameRecordId(item.id, milestone.id));
    if (index >= 0) state.sapMilestones[index] = { ...state.sapMilestones[index], ...milestone };
    else state.sapMilestones.push(milestone);
  });
}

function mergeSapImports(imports) {
  imports.filter(Boolean).forEach((sapImport) => {
    const index = state.sapImports.findIndex((item) => sameRecordId(item.id, sapImport.id));
    if (index >= 0) state.sapImports[index] = { ...state.sapImports[index], ...sapImport };
    else state.sapImports.push(sapImport);
  });
}

async function postSapMatrixRemove(body) {
  const token = await window.AOAAuth.getIdToken();
  const response = await fetch("/api/sap-matrix-remove", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.details || payload.error || "The SAP Matrix could not be removed.");
  return payload;
}

function currentDetailStudent() {
  return findStudent(new URLSearchParams(location.search).get("id"));
}

function timestampValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return "";
}

async function openSapSource(importId) {
  try {
    const token = await window.AOAAuth.getIdToken();
    const response = await fetch(`/api/sap-document?id=${encodeURIComponent(importId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("The source SAP PDF could not be opened.");
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { alert(error.message); }
}

function studentForm(student) {
  const dayFields = DAY_FIELDS.map(([field, label]) => fieldControl(label, field, student[field], "availability")).join("");
  return `
    <form id="student-form" class="student-form">
      <input type="hidden" name="id" value="${escapeHtml(student.id)}" />
      <input type="hidden" id="student-photo-url" name="photoUrl" value="${escapeHtml(student.photoUrl)}" />
      <div class="tuition-alert tuition-alert-error" id="student-form-errors" hidden></div>
      ${detailStatusControl(student)}
      <details class="student-form-section" id="profile-section" open><summary class="student-form-section-heading"><span class="student-section-kicker">Identity &amp; roster</span><h2>Profile</h2><p>Photo, roster status, group, and scheduling details.</p></summary><div class="student-form-grid">
        <div class="student-photo-field">
          <div class="student-photo-preview" id="student-photo-preview">${studentPhoto(student, "large")}</div>
          <label class="student-photo-upload">Profile photo <input id="student-photo-file" type="file" accept="image/*" /></label>
          <span class="student-photo-status" id="student-photo-status" role="status" aria-live="polite" hidden><span class="student-save-spinner" aria-hidden="true"></span><span></span></span>
          <button class="button quiet" id="remove-student-photo" type="button">Remove photo</button>
        </div>
        ${fieldControl("Student name", "studentName", student.studentName, "text", true)}
        ${selectControl("Active", "activeStatus", student.activeStatus, ["Yes", "No"])}
        ${fieldControl("Group", "group", student.group)}
        ${selectControl("Training type", "trainingType", student.trainingType, ["", "Part 141", "Part 61"])}
        ${selectControl("Profile pic", "profPicOnFile", student.profPicOnFile, ["Yes", "No", "Unknown"])}
        ${checkboxControl("Include on attendance list", "includeOnAttendanceList", student.includeOnAttendanceList, "Show this student on MyFBO attendance screens")}
        ${fieldControl("Scheduled by", "scheduledByInitials", student.scheduledByInitials)}
        ${studentLastModifiedControl(student)}
      </div></details>
      <details class="student-form-section" id="training-section"><summary class="student-form-section-heading"><span class="student-section-kicker">Program details</span><h2>Training</h2><p>${escapeHtml(courseLabel(student))} · ${escapeHtml(student.assignedCFI || "No CFI assigned")}</p></summary><div class="student-form-grid">
        ${fieldControl("Curriculum", "curriculum", student.curriculum)}
        ${fieldControl("SAP program", "program", student.program)}
        ${fieldControl("Campus", "campus", student.campus)}
        ${fieldControl("Enrollment date", "enrollmentDate", student.enrollmentDate, "date")}
        ${fieldControl("Projected graduation", "projectedGraduationDate", student.projectedGraduationDate, "date")}
        ${selectControl("Current course", "currentCourse", canonicalCourseLabel(student.currentCourse), studentCourseOptions(student.currentCourse))}
        ${fieldControl("Course start date", "courseStartDate", student.courseStartDate, "date")}
        ${checkboxControl("Spin training event", "spinTrainingRequired", student.spinTrainingRequired, "Show this roster student on the home spin training watch")}
        ${fieldControl("Spin training date", "spinTrainingDueDate", student.spinTrainingDueDate, "date")}
        ${fieldControl("Spin training time", "spinTrainingTime", student.spinTrainingTime, "time")}
        ${spinTrainingCompletedControl(student)}
        ${fieldControl("Aircraft", "aircraft", student.aircraft)}
        ${instructorControl("Assigned CFI", student)}
        ${selectControl("On Forms", "onForms", student.onForms, ["Yes", "No", "Unknown"])}
        ${selectControl("Available weekends", "studentAvailableWeekends", student.studentAvailableWeekends, ["Yes", "No", "Unknown"])}
      </div></details>
      <details class="student-form-section" id="availability-section"><summary class="student-form-section-heading"><span class="student-section-kicker">Weekly schedule</span><h2>Availability</h2><p>${student.weeklyTotal || 0} sessions per week · select to edit</p></summary><div class="student-form-grid day-grid">${dayFields}</div><p class="student-total-line">Weekday ${student.weekdayTotal} · Weekend ${student.weekendTotal} · Weekly ${student.weeklyTotal}</p></details>
      <details class="student-form-section" id="notes-section"><summary class="student-form-section-heading"><span class="student-section-kicker">Staff context</span><h2>Notes</h2><p>Time off and operational details.</p></summary><div class="student-form-grid">
        ${textAreaControl("Time off", "timeOff", student.timeOff)}
        ${textAreaControl("Notes", "notes", student.notes)}
      </div></details>
      <div class="student-form-actions" ${canEditStudentProfiles() ? "" : "hidden"}>
        <button class="button primary student-save-button" type="submit"><span class="student-save-spinner" aria-hidden="true"></span><span data-save-label>Save student</span></button>
        <span class="student-save-state" id="student-save-state" role="status" aria-live="polite" hidden><span class="student-save-spinner" aria-hidden="true"></span><span>Saving student...</span></span>
        <a class="button quiet" href="students.html">Back to Students</a>
      </div>
    </form>
  `;
}

function detailStatusControl(student) {
  const active = student.activeStatus === "Yes";
  return `
    <section class="student-status-card ${active ? "is-active" : "is-inactive"}" aria-label="Roster status">
      <div>
        <span>Roster status</span>
        <strong>${active ? "Active" : "Inactive"}</strong>
      </div>
      <div class="student-status-actions">
        <button class="button ${active ? "primary" : "quiet"}" type="button" data-detail-status="Yes" aria-pressed="${active}">Active</button>
        <button class="button ${active ? "quiet" : "primary"}" type="button" data-detail-status="No" aria-pressed="${!active}">Inactive</button>
      </div>
    </section>
  `;
}

function renderAvailability() {
  document.querySelector("#availability-body").innerHTML = sortStudents(state.students).map((student) => {
    const flags = getStudentFlags(student).filter((flag) => flag.type === "belowMinimum");
    return `<tr class="${flags.length ? "student-row-warn" : ""}"><td class="sticky-name"><a href="student-detail.html?id=${encodeURIComponent(student.id)}"><strong>${escapeHtml(student.studentName)}</strong></a><small>${groupBadge(student.group)}${flagBadges(flags)}</small></td>${DAY_FIELDS.map(([field]) => `<td>${inlineSelect(student, field, ["", "0", "1", "Float"])}</td>`).join("")}<td><strong>${student.weeklyTotal}</strong></td></tr>`;
  }).join("");
}

function renderAlerts() {
  const groups = [
    ["Attendance below 80%", "attendance80"],
    ["Attendance below 70%", "attendance70"],
    ["Missing CFI", "missingCfi"],
    ["Stale update older than 7 days", "stale"],
    ["Students on time off", "timeOff"],
    ["Expired or missing documentation", ["note-expired", "note-missing"]],
    ["Academic warning or no call no show", ["note-academic-warning", "note-no-call-no-show"]],
    ["Manual review", "review"]
  ];
  document.querySelector("#alerts-list").innerHTML = groups.map(([title, type]) => {
    const matches = [...state.students]
      .sort(compareStudentsByPriority)
      .map((student) => ({ student, flags: getStudentFlags(student).filter((flag) => Array.isArray(type) ? type.includes(flag.type) : flag.type === type) }))
      .filter(({ flags }) => flags.length);
    return `<section class="student-alert-section"><div class="student-panel-heading"><h2>${title}</h2><span>${matches.length}</span></div>${matches.map(({ student, flags }) => studentAlertRow(student, flags)).join("") || emptyBlock("No students in this category.")}</section>`;
  }).join("");
}

function renderImport() {
  document.querySelector("#student-import-preview").innerHTML = state.importPreview ? importPreviewMarkup(state.importPreview) : emptyBlock("Paste a CSV or choose a file to preview import mapping.");
}

function renderImportPreview() {
  const text = document.querySelector("#student-csv-text").value;
  state.importPreview = text.trim() ? previewStudentCsv(text) : null;
  renderImport();
}

async function commitImport() {
  const preview = state.importPreview;
  if (!preview) return;
  const valid = preview.records.filter((record) => record.student.studentName);
  const byName = new Map(state.students.map((student) => [student.studentName.toLowerCase(), student]));
  valid.forEach(({ student }) => {
    const existing = byName.get(student.studentName.toLowerCase());
    if (existing) Object.assign(existing, normalizeStudent(markStudentModified({ ...existing, ...student, id: existing.id })));
    else state.students.push(normalizeStudent(markStudentModified({ ...student })));
  });
  state.students = await saveStudents(state.students);
  await appendAuditLog({ studentName: "CSV import", field: "import", ...currentStaffAuditFields(), summary: `Imported ${valid.length} student rows` });
  state.importPreview = null;
  document.querySelector("#student-csv-text").value = "";
  renderImport();
}

function importPreviewMarkup(preview) {
  return `
    <div class="student-import-summary">
      <article><span>Rows detected</span><strong>${preview.totalRows}</strong></article>
      <article><span>Rows with errors</span><strong>${preview.errors.length}</strong></article>
      <article><span>Missing names</span><strong>${preview.missingNames.length}</strong></article>
      <article><span>Mapped fields</span><strong>${preview.mappedFields.length}</strong></article>
    </div>
    <div class="tuition-alert ${preview.errors.length ? "tuition-alert-warning" : "tuition-alert-success"}">${escapeHtml(preview.errors.slice(0, 8).join(" | ") || "CSV is ready to import.")}</div>
    <p class="student-muted">Unmapped headers: ${escapeHtml(preview.unmappedHeaders.join(", ") || "none")}</p>
    <button class="button primary" id="confirm-student-import" type="button" ${preview.totalRows ? "" : "disabled"}>Confirm import</button>
    <button class="button quiet" id="reset-student-import" type="button">Clear</button>
  `;
}

async function saveStudentChange(student, field) {
  markStudentModified(student);
  Object.assign(student, normalizeStudent(student));
  state.students = await saveStudents(state.students);
  await appendAuditLog({ studentId: student.id, studentName: student.studentName, field, ...currentStaffAuditFields(), summary: `Updated ${field}` });
}

async function setCurrentDetailStatus(status) {
  if (!["Yes", "No"].includes(status)) return;
  const form = document.querySelector("#student-form");
  const statusSelect = form?.querySelector('[name="activeStatus"]');
  if (statusSelect) statusSelect.value = status;
  const id = form ? new FormData(form).get("id") : "";
  const existing = findStudent(id);
  if (!form || !existing) {
    document.querySelectorAll("[data-detail-status]").forEach((button) => {
      const active = button.dataset.detailStatus === status;
      button.classList.toggle("primary", active);
      button.classList.toggle("quiet", !active);
      button.setAttribute("aria-pressed", String(active));
    });
    return;
  }
  const formData = new FormData(form);
  const raw = { ...existing, id };
  formData.forEach((value, key) => { raw[key] = value; });
  raw.activeStatus = status;
  markStudentModified(raw);
  const student = normalizeStudent(raw);
  const errors = validateStudent(student);
  if (errors.length) {
    showStudentFormError(errors);
    return;
  }
  setStudentFormSaving(true, `Saving ${status === "Yes" ? "active" : "inactive"} status...`);
  try {
    const index = state.students.findIndex((item) => item.id === id);
    if (index >= 0) state.students[index] = student;
    state.students = await saveStudents(state.students);
    await appendAuditLog({
      studentId: student.id,
      studentName: student.studentName,
      field: "activeStatus",
      ...currentStaffAuditFields(),
      summary: `Marked ${status === "Yes" ? "active" : "inactive"}`
    });
    setStudentFormSaving(false);
    renderDetail();
  } catch (error) {
    console.warn("Student status save failed", error);
    showStudentFormError(studentSaveErrorMessage(error, "Student status could not be saved. Please try again before leaving this page."));
    setStudentFormSaving(false);
  }
}

function setStudentFormSaving(isSaving, message = "Saving student...") {
  state.saveInFlight = isSaving;
  const form = document.querySelector("#student-form");
  const button = form?.querySelector(".student-save-button");
  const label = button?.querySelector("[data-save-label]");
  const status = form?.querySelector("#student-save-state");
  if (form) form.classList.toggle("is-saving", isSaving);
  if (button) {
    button.disabled = isSaving;
    button.setAttribute("aria-busy", String(isSaving));
  }
  document.querySelectorAll("[data-detail-status]").forEach((statusButton) => {
    statusButton.disabled = isSaving;
  });
  if (label) label.textContent = isSaving ? "Saving..." : "Save student";
  if (status) {
    status.hidden = !isSaving;
    const text = status.querySelector("span:last-child");
    if (text) text.textContent = message;
  }
}

function showStudentFormError(errors) {
  const errorBox = document.querySelector("#student-form-errors");
  if (!errorBox) return;
  const messages = Array.isArray(errors) ? errors : [errors];
  errorBox.hidden = false;
  errorBox.innerHTML = messages.map((error) => `<div>${escapeHtml(error)}</div>`).join("");
}

function clearStudentFormError() {
  const errorBox = document.querySelector("#student-form-errors");
  if (!errorBox) return;
  errorBox.hidden = true;
  errorBox.innerHTML = "";
}

function studentSaveErrorMessage(error, fallback) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  if (text.includes("permission-denied")) {
    return "Firebase blocked this student save. Approved staff should be allowed to edit student data, so firestore.rules may need to be published.";
  }
  return fallback;
}

async function removeCurrentStudent() {
  const button = document.querySelector("#delete-student-button");
  const id = button?.dataset.studentId;
  const student = findStudent(id);
  if (!student) return;
  const name = student.studentName || "this student";
  if (!confirm(`Remove ${name} from the student dataset? This cannot be undone from this page.`)) return;
  state.students = state.students.filter((item) => item.id !== id);
  await saveStudents(state.students, { allowDeletes: true });
  await appendAuditLog({ studentId: id, studentName: name, field: "delete", ...currentStaffAuditFields(), summary: "Removed student profile" });
  location.href = "students.html";
}

function downloadCsv() {
  const blob = new Blob([studentsToCsv(state.students)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `korl-students-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function findStudent(id) {
  const lookupId = String(id ?? "");
  if (!lookupId) return null;
  return state.students.find((student) => String(student.id ?? "") === lookupId) || null;
}

function inlineText(student, field) {
  return `<input class="student-inline" data-id="${student.id}" data-inline="${field}" value="${escapeHtml(student[field])}" />`;
}

function inlineNumber(student, field) {
  return `<input class="student-inline small" type="number" data-id="${student.id}" data-inline="${field}" value="${escapeHtml(student[field])}" />`;
}

function inlineSelect(student, field, options, selectedValue = student[field]) {
  return `<select class="student-inline" data-id="${student.id}" data-inline="${field}">${options.map((option) => `<option value="${escapeHtml(option)}" ${String(selectedValue || "") === option ? "selected" : ""}>${escapeHtml(option || "Blank")}</option>`).join("")}</select>`;
}

function attendanceConnectionMessage(error) {
  const text = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  if (text.includes("permission-denied")) {
    return "Firestore blocked the attendance paths. Publish firestore.rules with approved-staff read access for attendanceLatest/{studentId}, attendanceMeta/current, attendanceRuns/{runId}, and attendanceRuns/{runId}/students/{studentId}.";
  }
  if (text.includes("not-found") || text.includes("missing")) {
    return "The attendance Firestore paths are missing. Run the server scraper with uploads enabled so it creates attendanceLatest/{studentId} and attendanceMeta/current.";
  }
  return `Could not read attendanceLatest or attendanceMeta/current: ${error?.message || error || "unknown error"}`;
}

function displayStudentFlags(student, attendance = myfboAttendanceForStudent(student)) {
  const flags = getStudentFlags(student);
  const nextFlags = flags.filter((flag) => !["attendance70", "attendance80", "stale"].includes(flag.type));
  if (!attendance) return nextFlags;
  const scrapeDays = attendanceUpdatedDays(attendance);
  if (student.activeStatus === "Yes" && scrapeDays !== null && scrapeDays > 7) {
    nextFlags.push({ type: "stale", label: `Attendance updated ${scrapeDays} days ago`, severity: "medium" });
  }
  return nextFlags;
}

function myfboAttendanceForStudent(student) {
  if (!attendanceListEligible(student)) return null;
  const ids = [student.myfboStudentId, student.studentId, student.id].filter(Boolean).map(String);
  for (const id of ids) {
    const record = state.myfboAttendanceById.get(id);
    if (record) return record;
  }
  return state.myfboAttendanceByName.get(normalizeFirstLastKey(student.studentName)) || null;
}

function rosterLastUpdatedCell(student, attendance = myfboAttendanceForStudent(student)) {
  if (!attendance) return `${formatDate(student.lastUpdated)}<small>${lastUpdatedLabel(student)}</small>`;
  const updated = attendanceUpdatedAt(attendance);
  return `${escapeHtml(formatMyfboDateTime(updated))}<small>Attendance scrape</small>`;
}

function attendanceUpdatedAt(attendance) {
  return attendance?.localUpdatedAt || attendance?.updatedAt || state.myfboAttendanceMeta?.localCreatedAt || state.myfboAttendanceMeta?.createdAt || null;
}

function attendanceUpdatedDays(attendance) {
  const date = myfboDateFromFirestore(attendanceUpdatedAt(attendance));
  if (!date) return null;
  const today = new Date();
  return Math.max(0, Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000));
}

function myfboAttendanceMetric(record, key, student = null) {
  if (key === "attendanceRate") return adjustedMyfboAttendanceRate(record, student);
  if (key === "extraCurricularCount") return adjustedMyfboExtraCurricularCount(record, student);
  const value = record?.metrics?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function myfboAttendanceRate(student) {
  return myfboAttendanceMetric(myfboAttendanceForStudent(student), "attendanceRate", student);
}

function myfboAttendanceOk(record) {
  return String(record?.status || "").toLowerCase() === "ok" && !record?.error;
}

function myfboAttendanceLevel(record, student = null) {
  if (!record) return "missing";
  if (!myfboAttendanceOk(record)) return "error";
  const rate = myfboAttendanceMetric(record, "attendanceRate", student);
  if (rate < 80) return "attention";
  if (rate < 90) return "caution";
  return "good";
}

function myfboAttendanceSummary(record, student = null) {
  if (student && !attendanceListEligible(student)) return `<span class="student-attendance-chip attendance-missing">Not on attendance list</span>`;
  if (!record) return `<span class="student-attendance-chip attendance-missing">MyFBO attendance not matched</span>`;
  const level = myfboAttendanceLevel(record, student);
  const rate = formatMyfboPercent(myfboAttendanceMetric(record, "attendanceRate", student));
  const label = level === "attention" ? "needs attention" : level === "caution" ? "caution" : level === "good" ? "good" : "sync error";
  const error = record.error ? ` - ${record.error}` : "";
  const groundExtras = groundAttendanceValue(student || {});
  const extraText = groundExtras > 0 ? `<span>${groundExtras} ground school extra</span>` : "";
  return `<span class="student-profile-meta student-myfbo-line"><span class="student-attendance-chip attendance-${level}">MyFBO ${escapeHtml(rate)} · ${escapeHtml(label)}</span>${extraText}</span>${error ? `<small class="student-attendance-error">${escapeHtml(error)}</small>` : ""}`;
}

function myfboAttendanceCell(student) {
  if (!attendanceListEligible(student)) return `<span class="student-attendance-chip attendance-missing">Hidden</span><small>Not on attendance list</small>`;
  const record = myfboAttendanceForStudent(student);
  if (!record) return `<span class="student-attendance-chip attendance-missing">No match</span><small>Check studentId/name</small>`;
  const level = myfboAttendanceLevel(record, student);
  const rate = formatMyfboPercent(myfboAttendanceMetric(record, "attendanceRate", student));
  const status = record.status || (record.error ? "error" : "unknown");
  const updated = record.localUpdatedAt || record.updatedAt;
  return `
    <span class="student-attendance-chip attendance-${level}">${escapeHtml(rate)}</span>
    <small>${escapeHtml(status)} · ${myfboAttendanceMetric(record, "completedTotal")} complete / ${myfboAttendanceMetric(record, "totalScheduled")} scheduled</small>
    <small>${adjustedMyfboExtraCurricularCount(record, student)} extra · ${groundAttendanceValue(student)} ground school</small>
    ${record.error ? `<small class="student-attendance-error">${escapeHtml(record.error)}</small>` : ""}
    <small>${escapeHtml(formatMyfboDateTime(updated))}</small>
  `;
}

function studentAttendanceDetailMarkup(student) {
  const groundExtras = groundAttendanceValue(student);
  const groundOnlyMarkup = `
    <div class="student-attendance-breakdown student-ground-attendance-summary">
      <article><span>Ground attendance</span><strong>${groundExtras}</strong><small>QR / ground-school check-ins</small></article>
    </div>`;
  if (!attendanceListEligible(student)) {
    return `<div class="student-attendance-detail">${groundOnlyMarkup}${emptyBlock("This student is not included on the MyFBO attendance list.")}</div>`;
  }
  const record = myfboAttendanceForStudent(student);
  if (!record) {
    return `<div class="student-attendance-detail">${groundOnlyMarkup}${emptyBlock("No MyFBO attendance record matched this student.")}</div>`;
  }
  const level = myfboAttendanceLevel(record, student);
  const rate = myfboAttendanceMetric(record, "attendanceRate", student);
  const rawRate = rawMyfboAttendanceMetric(record, "attendanceRate");
  const adjustedExtras = adjustedMyfboExtraCurricularCount(record, student);
  const status = record.status || (record.error ? "error" : "unknown");
  return `
    <div class="student-attendance-detail attendance-detail-${level}">
      <div class="student-attendance-hero">
        <span class="student-attendance-chip attendance-${level}">${escapeHtml(formatMyfboPercent(rate))}</span>
        <strong>${escapeHtml(myfboAttendanceLevelLabel(level))}</strong>
        <small>Raw MyFBO ${escapeHtml(formatMyfboPercent(rawRate))} · ${groundExtras} ground school extra</small>
      </div>
      <div class="student-attendance-breakdown">
        <article><span>Completed</span><strong>${myfboAttendanceMetric(record, "completedTotal")}</strong><small>${myfboAttendanceMetric(record, "completedFlights")} flight · ${myfboAttendanceMetric(record, "completedGrounds")} ground</small></article>
        <article><span>Scheduled</span><strong>${myfboAttendanceMetric(record, "totalScheduled")}</strong><small>Rate denominator</small></article>
        <article><span>Avoidable</span><strong>${myfboAttendanceMetric(record, "avoidableCancellations")}</strong><small>${myfboAttendanceMetric(record, "studentSick")} sick · ${myfboAttendanceMetric(record, "studentRequestOrUnprepared")} request/unprepared</small></article>
        <article><span>Weather / MX</span><strong>${myfboAttendanceMetric(record, "weatherCancellations") + myfboAttendanceMetric(record, "maintenanceCancellations")}</strong><small>${myfboAttendanceMetric(record, "weatherCancellations")} weather · ${myfboAttendanceMetric(record, "maintenanceCancellations")} maintenance</small></article>
        <article><span>Extracurricular</span><strong>${adjustedExtras}</strong><small>${groundExtras} ground school attended</small></article>
        <article><span>Unrecognized</span><strong>${myfboAttendanceMetric(record, "unrecognizedCancellationBlocks")}</strong><small>Review cancellation blocks</small></article>
      </div>
      <div class="student-attendance-status">
        <strong>${escapeHtml(status)}</strong>
        <small>${escapeHtml(record.error || "No sync error")} · Updated ${escapeHtml(formatMyfboDateTime(record.localUpdatedAt || record.updatedAt))}</small>
      </div>
    </div>
  `;
}

function studentAttendanceGlance(student) {
  const ground = groundAttendanceValue(student);
  if (!attendanceListEligible(student)) return `MyFBO not included · ${ground} ground`;
  const record = myfboAttendanceForStudent(student);
  if (!record) return `No MyFBO match · ${ground} ground`;
  const level = myfboAttendanceLevel(record, student);
  return `${formatMyfboPercent(myfboAttendanceMetric(record, "attendanceRate", student))} · ${ground} ground`;
}

function myfboAttendanceLevelLabel(level) {
  if (level === "attention") return "Needs attention";
  if (level === "caution") return "Caution";
  if (level === "good") return "Good";
  if (level === "error") return "Sync error";
  return "No match";
}

function rawMyfboAttendanceMetric(record, key) {
  const value = record?.metrics?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function adjustedMyfboExtraCurricularCount(record, student = null) {
  const groundCount = groundAttendanceValue(student || {
    id: record?.id,
    studentId: record?.studentId,
    studentName: record?.studentName
  });
  return Math.max(rawMyfboAttendanceMetric(record, "extraCurricularCount"), groundCount);
}

function adjustedMyfboAttendanceRate(record, student = null) {
  const totalScheduled = rawMyfboAttendanceMetric(record, "totalScheduled");
  if (!totalScheduled) return 0;
  const attended = rawMyfboAttendanceMetric(record, "completedTotal") + adjustedMyfboExtraCurricularCount(record, student);
  return Math.min(100, Math.round((attended / totalScheduled) * 1000) / 10);
}

function latestMyfboAttendanceUpdatedAt() {
  return state.myfboAttendance
    .map((record) => myfboDateFromFirestore(record.localUpdatedAt || record.updatedAt))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
}

function formatMyfboPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)}%` : "No rate";
}

function formatMyfboDateTime(value) {
  if (!value) return "not updated";
  const date = myfboDateFromFirestore(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function myfboDateFromFirestore(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function groundAttendanceCell(student) {
  const autoCount = automaticGroundAttendanceValue(student);
  const count = groundAttendanceValue(student);
  const source = autoCount ? `${autoCount} QR/check-in` : "No ground records";
  return `<strong>${count || ""}</strong><small>${escapeHtml(source)}</small>`;
}

function groundAttendanceValue(student) {
  return automaticGroundAttendanceValue(student);
}

function automaticGroundAttendanceValue(student) {
  return groundAttendanceCountForStudent(student, state.groundAttendanceCounts);
}

async function loadWrittenImportedAttempts() {
  try {
    const response = await fetch("assets/written-test-history.tsv");
    if (!response.ok) return [];
    const text = await response.text();
    return text.split(/\r?\n/).slice(1).map((line, index) => {
      if (!line.trim()) return null;
      const [studentRaw = "", dateRaw = "", timeRaw = "", testRaw = "", scoreRaw = "", initialsRaw = ""] = line.split("\t");
      const student = cleanStudentName(studentRaw);
      const test = String(testRaw || "").trim().toUpperCase();
      if (!student || !test) return null;
      const scoreMatch = String(scoreRaw || "").match(/(\d+(?:\.\d+)?)/);
      return {
        id: `imported-${index}`,
        student,
        test,
        score: scoreMatch ? Number(scoreMatch[1]) : null,
        takenAt: buildWrittenDateTime(dateRaw, timeRaw),
        initials: String(initialsRaw || "").trim().toUpperCase(),
        imported: true
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function cleanStudentName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildWrittenDateTime(dateRaw, timeRaw) {
  if (!dateRaw) return "";
  const parsed = new Date(`${dateRaw} ${timeRaw || "12:00 PM"}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function formatDateTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeFirstLastKey(value) {
  const parts = String(value || "").trim().toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function attendanceListEligible(student) {
  return student?.activeStatus === "Yes" && student?.includeOnAttendanceList !== "No";
}

function spinTrainingBadgeLabel(student) {
  if (!student?.spinTrainingDueDate) return "Spin training";
  const time = formatTimeLabel(student.spinTrainingTime);
  return `Spin ${formatDate(student.spinTrainingDueDate)}${time ? ` ${time}` : ""}`;
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

function fieldControl(label, name, value, type = "text", required = false) {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} /></label>`;
}

function checkboxControl(label, name, value, help = "") {
  const checked = value === "Yes";
  return `
    <label class="checkbox-field student-checkbox-field">
      <input type="hidden" name="${name}" value="No" />
      <input name="${name}" type="checkbox" value="Yes" ${checked ? "checked" : ""} />
      <span>${escapeHtml(label)}${help ? `<small>${escapeHtml(help)}</small>` : ""}</span>
    </label>
  `;
}

function spinTrainingCompletedControl(student) {
  const completedText = student.spinTrainingCompletedAt ? formatDateTime(student.spinTrainingCompletedAt) : "Not completed yet";
  const byText = student.spinTrainingCompletedBy ? `Completed by ${student.spinTrainingCompletedBy}` : "Completed from the home dispatch watch";
  return `
    <div class="student-readonly-meta">
      <strong>Last spin completed</strong>
      <small>${escapeHtml(completedText)}${student.spinTrainingCompletedAt ? ` · ${escapeHtml(byText)}` : ""}</small>
    </div>
  `;
}

function studentLastModifiedControl(student) {
  const auditEntry = state.audit.find((entry) => entry.studentId === student.id);
  const modifiedAt = student.updatedAt || auditEntry?.at || (student.lastUpdated ? `${student.lastUpdated}T00:00:00` : "");
  const modifiedBy = student.updatedByName || auditEntry?.staffName || student.updatedByInitials || auditEntry?.initials || "Unknown";
  const initials = student.updatedByInitials || auditEntry?.initials || "";
  const dateText = formatDateTime(modifiedAt);
  const byText = initials && modifiedBy !== initials ? `${modifiedBy} (${initials})` : modifiedBy;
  return `
    <label>Last modified
      <span class="student-readonly-meta">
        <strong>${escapeHtml(dateText)}</strong>
        <small>${escapeHtml(byText)}</small>
      </span>
    </label>
  `;
}

function textAreaControl(label, name, value) {
  return `<label class="wide-field">${label}<textarea name="${name}" rows="4">${escapeHtml(value)}</textarea></label>`;
}

function selectControl(label, name, value, options) {
  return `<label>${label}<select name="${name}">${options.map((option) => `<option value="${escapeHtml(option)}" ${String(value || "") === option ? "selected" : ""}>${escapeHtml(option || "Blank")}</option>`).join("")}</select></label>`;
}

function studentCourseOptions(currentCourse = "") {
  const normalizedCurrent = canonicalCourseLabel(currentCourse);
  return unique(["", ...STANDARD_STUDENT_COURSES, normalizedCurrent].filter((value, index) => index === 0 || value));
}

function instructorControl(label, student) {
  const profiles = state.instructorProfiles.filter((item) => item.activeStatus !== "No" || item.id === student.assignedInstructorId);
  const linked = profiles.some((item) => item.id === student.assignedInstructorId);
  const legacyLabel = student.assignedCFI && !linked ? `Unlinked: ${student.assignedCFI}` : "Not assigned";
  return `<label>${label}<select name="assignedInstructorId"><option value="">${escapeHtml(legacyLabel)}</option>${profiles.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === student.assignedInstructorId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><input type="hidden" name="assignedCFI" value="${escapeHtml(student.assignedCFI)}" /></label>`;
}

function canEditStudentProfiles() {
  const user = window.AOAAuth?.getCurrentUser?.();
  return Boolean(user?.isAdmin || user?.isStaff);
}

function canManageStudentMilestones(student) {
  const user = window.AOAAuth?.getCurrentUser?.();
  if (!user?.isInstructor || !user.instructorProfileId) return false;
  if (student.assignedInstructorId === user.instructorProfileId) return true;
  const profile = state.instructorProfiles.find((item) => item.id === user.instructorProfileId);
  return Boolean(profile?.name && String(student.assignedCFI || "").trim().toLowerCase() === profile.name.trim().toLowerCase());
}

function studentAlertRow(student, flags) {
  return `<a class="student-alert-row" href="student-detail.html?id=${encodeURIComponent(student.id)}"><strong>${escapeHtml(student.studentName)}</strong><span>${groupBadge(student.group)}${flagBadges(flags)}</span><small>${escapeHtml(student.assignedCFI || "No CFI")} · ${escapeHtml(courseLabel(student))}</small></a>`;
}

function flagBadges(flags) {
  return (flags || []).map((flag) => badge(flag.label, flag.severity === "high" ? "red" : flag.severity === "medium" ? "yellow" : "blue")).join(" ");
}

function badge(label, tone = "blue") {
  return `<span class="student-badge ${tone}">${escapeHtml(label)}</span>`;
}

function groupBadge(group) {
  const label = group || "No group";
  const tone = label === "Group 1 / Delta" ? "gold" : label === "Group 3" || label.startsWith("Group") ? "navy" : "blue";
  return `<span class="student-badge group-badge ${tone}">${escapeHtml(label)}</span>`;
}

function studentPhoto(student, size = "") {
  const className = `student-photo ${size ? `student-photo-${size}` : ""}`.trim();
  if (student.photoUrl) return `<img class="${className}" src="${escapeHtml(student.photoUrl)}" alt="${escapeHtml(student.studentName || "Student")} profile photo" />`;
  return `<span class="${className} student-photo-fallback">${studentInitials(student.studentName)}</span>`;
}

function defaultStudentAvatar(name) {
  return `<span class="student-photo student-photo-large student-photo-fallback">${studentInitials(name)}</span>`;
}

function studentInitials(name) {
  const parts = String(name || "Student").trim().split(/\s+/).filter(Boolean);
  return escapeHtml((parts[0]?.[0] || "S") + (parts.length > 1 ? parts[parts.length - 1][0] : ""));
}

async function loadStudentPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showStudentFormError("Profile photo must be an image file.");
    setStudentPhotoStatus("Choose an image file.", "error");
    input.value = "";
    return;
  }
  input.disabled = true;
  clearStudentFormError();
  setStudentPhotoStatus("Preparing image...", "saving");
  try {
    const studentId = ensureStudentFormId();
    const dataUrl = await resizeImageFile(file, 720, 0.86);
    const blob = dataUrlToBlob(dataUrl);
    setStudentPhotoStatus("Uploading photo...", "saving");
    const photoUrl = await uploadStudentProfilePhoto(studentId, blob, { contentType: blob.type || "image/jpeg" });
    document.querySelector("#student-photo-url").value = photoUrl;
    const photoStatus = document.querySelector('[name="profPicOnFile"]');
    if (photoStatus) photoStatus.value = "Yes";
    const preview = document.querySelector("#student-photo-preview");
    if (preview) preview.innerHTML = `<img class="student-photo student-photo-large" src="${escapeHtml(photoUrl)}" alt="Profile photo preview" />`;
    setStudentPhotoStatus("Photo uploaded. Save student to finish.", "ready");
  } catch (error) {
    console.warn("Profile photo processing failed", error);
    input.value = "";
    showStudentFormError("Profile photo could not be uploaded. If this is the first photo upload after the Storage change, deploy storage.rules and try again.");
    setStudentPhotoStatus("Photo upload failed.", "error");
  } finally {
    input.disabled = false;
  }
}

async function migrateStudentPhotos() {
  if (state.photoMigrationInFlight) return;
  const studentsWithEmbeddedPhotos = state.students.filter((student) => isEmbeddedPhoto(student.photoUrl));
  if (!studentsWithEmbeddedPhotos.length) {
    updatePhotoMigrationStatus("No embedded photos need to be moved.");
    return;
  }

  state.photoMigrationInFlight = true;
  updatePhotoMigrationStatus(`Moving 0 of ${studentsWithEmbeddedPhotos.length} profile photos...`);
  try {
    const migratedUrls = new Map();
    for (const [index, student] of studentsWithEmbeddedPhotos.entries()) {
      updatePhotoMigrationStatus(`Moving ${index + 1} of ${studentsWithEmbeddedPhotos.length}: ${student.studentName || "student"}...`);
      const blob = dataUrlToBlob(student.photoUrl);
      const photoUrl = await uploadStudentProfilePhoto(student.id, blob, { contentType: blob.type || "image/jpeg" });
      migratedUrls.set(student.id, photoUrl);
    }

    state.students = state.students.map((student) => {
      const photoUrl = migratedUrls.get(student.id);
      return photoUrl ? normalizeStudent(markStudentModified({ ...student, photoUrl, profPicOnFile: "Yes" })) : student;
    });
    await saveStudents(state.students, { skipRemoteBackup: true });
    await appendAuditLog({ field: "photo-migration", ...currentStaffAuditFields(), summary: `Moved ${migratedUrls.size} student profile photos to Firebase Storage` });
    updatePhotoMigrationStatus(`Moved ${migratedUrls.size} profile photo${migratedUrls.size === 1 ? "" : "s"} to Storage.`);
    renderStudents();
  } catch (error) {
    console.warn("Student photo migration failed", error);
    updatePhotoMigrationStatus("Photo migration stopped. Deploy storage.rules if needed, then try again.");
  } finally {
    state.photoMigrationInFlight = false;
    updatePhotoMigrationStatus();
  }
}

function setStudentPhotoStatus(message, tone = "ready") {
  const status = document.querySelector("#student-photo-status");
  if (!status) return;
  status.hidden = !message;
  status.dataset.tone = tone;
  status.classList.toggle("is-saving", tone === "saving");
  const text = status.querySelector("span:last-child");
  if (text) text.textContent = message;
}

function resizeImageFile(file, maxSize = 420, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read image file."));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = String(dataUrl || "").split(",");
  if (!header || !data) throw new Error("Invalid image data.");
  const contentType = header.match(/^data:([^;]+);base64$/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

function isEmbeddedPhoto(value) {
  return String(value || "").startsWith("data:image/");
}

function ensureStudentFormId() {
  const input = document.querySelector('[name="id"]');
  if (!input) return crypto.randomUUID();
  if (!input.value) input.value = crypto.randomUUID();
  return input.value;
}

function lastUpdatedLabel(student) {
  const days = student.lastUpdated ? Math.max(0, Math.floor((new Date() - new Date(`${student.lastUpdated}T00:00:00`)) / 86400000)) : null;
  return days === null ? "No date" : `${days} days ago`;
}

function emptyBlock(text) {
  return `<div class="empty-state compact"><strong>${escapeHtml(text)}</strong></div>`;
}

function masterScheduleInstructors() {
  const config = state.masterScheduleConfig || {};
  const removed = Array.isArray(config.removedInstructors) ? config.removedInstructors : [];
  return unique([
    ...activeInstructorNames(state.instructorProfiles),
    ...(Array.isArray(config.instructors) ? config.instructors : []),
    ...Object.keys(config.instructorProfiles || {}),
    ...state.masterScheduleBookings.map((booking) => booking?.instructor).filter(Boolean)
  ].map((name) => String(name || "").trim()).filter(Boolean))
    .filter((name) => !removed.includes(name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeScheduleConfig(loadedConfig) {
  if (Array.isArray(loadedConfig)) return loadedConfig[0] || readScheduleConfig();
  if (loadedConfig && typeof loadedConfig === "object") return loadedConfig;
  return readScheduleConfig();
}

function readScheduleConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MASTER_SCHEDULE_CONFIG_STORAGE_KEY) || "{}");
    if (Array.isArray(parsed)) return parsed[0] || {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function unique(values) {
  return [...new Set(values)];
}
