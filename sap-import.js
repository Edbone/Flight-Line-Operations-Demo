import { loadCollectionData, loadFirestoreCollection, uploadSapMatrixPdf } from "./firebase.js";
import { loadStudents } from "./student-data.js";
import { escapeHtml, formatDate } from "./student-utils.js";
import { evaluateMilestone, SAP_MILESTONE_TYPES } from "./sap-core.mjs";
import { loadWrittenTestHistory } from "./written-test-data.mjs";

const state = { file: null, import: null, students: [], milestones: [], imports: [], writtenAttempts: [], writtenScheduled: [], stageRequests: [] };
const expectedStudentId = new URLSearchParams(location.search).get("studentId") || "";
const resumeImportId = new URLSearchParams(location.search).get("resume") || "";
const fileInput = document.querySelector("#sap-file");
const uploadButton = document.querySelector("#sap-upload-button");
const reviewForm = document.querySelector("#sap-review-form");
const studentSelect = document.querySelector("#sap-student-select");

await window.AOAAuth?.ready;
const staff = window.AOAAuth?.getCurrentUser?.();
if (!staff?.isAdmin) {
  document.querySelector("#sap-access-error").hidden = false;
  document.querySelector("#sap-access-error").textContent = "Administrator access is required to upload or confirm SAP Matrix documents.";
  document.querySelector("#sap-upload-section").hidden = true;
} else {
  await loadPageData();
}

async function loadPageData() {
  const [students, milestones, imports, writtenCustom, writtenImported, writtenScheduled, stageRequests] = await Promise.all([
    loadStudents(), safeCollection("sap_milestones"), safeCollection("sap_imports"), loadCollectionData("written-test-custom", "aoa-written-test-custom-scores-v1"), loadWrittenTestHistory(), loadCollectionData("written-test-schedule", "aoa-written-test-schedule-v1"), loadCollectionData("stage-check-requests", "aoa-stage-check-requests-v2")
  ]);
  Object.assign(state, { students, milestones, imports, writtenAttempts: [...writtenImported, ...writtenCustom], writtenScheduled, stageRequests });
  if (expectedStudentId) document.querySelector("#sap-back-student").href = `student-detail.html?id=${encodeURIComponent(expectedStudentId)}`;
  if (resumeImportId) {
    state.import = imports.find((item) => item.id === resumeImportId) || null;
    if (state.import?.status === "pending_review") renderReview(false, "Resumed pending SAP review.");
    else if (state.import?.status === "parse_failed") {
      state.import.extracted = { studentName: "", enrollmentDate: null, projectedGraduationDate: null, program: "", campus: "", milestones: [], ignoredPages: [] };
      state.import.match = { confidence: "none", requiresManualSelection: true, candidates: [] };
      renderReview(false, "Automatic parsing failed. Select the student and enter the milestones manually from the protected source PDF.");
    }
    else setStatus("That SAP import is no longer awaiting review.", true);
  }
}

async function safeCollection(name) {
  try { return await loadFirestoreCollection(name); } catch { return []; }
}

fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
const dropZone = document.querySelector("#sap-drop-zone");
["dragenter", "dragover"].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove("is-dragging"); }));
dropZone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));
uploadButton.addEventListener("click", uploadPdf);

function selectFile(file) {
  state.file = file || null;
  document.querySelector("#sap-file-name").textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected";
  uploadButton.disabled = !file;
}

async function uploadPdf() {
  if (!state.file) return;
  if (!/\.pdf$/i.test(state.file.name) || state.file.type !== "application/pdf") return setStatus("Choose a valid PDF file.", true);
  if (state.file.size > 10 * 1024 * 1024) return setStatus("The PDF exceeds the 10 MB limit.", true);
  toggleBusy(true);
  try {
    const checksum = await sha256(state.file);
    await uploadSapMatrixPdf(checksum, state.file);
    const result = await apiFetch("/api/sap-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checksum, filename: state.file.name, mimeType: state.file.type, studentId: expectedStudentId })
    });
    state.import = result.import;
    renderReview(Boolean(result.duplicate), result.message || "");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    toggleBusy(false);
  }
}

function renderReview(duplicate = false, message = "") {
  const record = state.import;
  if (!record?.extracted) {
    setStatus(message || "This duplicate import is already confirmed. Open its student profile to review the timeline.", true);
    return;
  }
  document.querySelector("#sap-review").hidden = false;
  document.querySelector("#sap-upload-section").hidden = true;
  document.querySelector("#sap-review-banner").innerHTML = `<strong>${duplicate ? "Duplicate detected" : "Extraction complete"}</strong><span>${escapeHtml(message || `${record.extracted.milestones.length} milestones found; ${record.extracted.ignoredPages.length} signature certificate page ignored.`)}</span><button class="button quiet" type="button" id="sap-open-source">View source PDF</button>`;
  document.querySelector("#sap-open-source").addEventListener("click", openSourcePdf);
  document.querySelector("#sap-extracted-name").value = record.extracted.studentName || "";
  const best = record.match?.bestCandidate;
  document.querySelector("#sap-confidence").textContent = `${record.match?.confidence || "none"} confidence${record.match?.requiresManualSelection ? " · manual selection required" : ""}`;
  document.querySelector("#sap-confidence").className = `sap-confidence confidence-${record.match?.confidence || "none"}`;
  document.querySelector("#sap-match-summary").textContent = best ? `${best.studentName}: ${best.reasons.join(", ")}` : "No reasonable automatic match was found.";
  document.querySelector("#sap-other-candidates").value = (record.match?.candidates || []).map((candidate) => `${candidate.studentName} (${candidate.score}%)`).join("; ") || "None";
  studentSelect.innerHTML = `<option value="">Select the correct student</option>${state.students.map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.studentName)}</option>`).join("")}`;
  studentSelect.value = record.expectedStudentId || record.match?.profileStudentId || record.match?.proposedStudentId || "";
  studentSelect.addEventListener("change", refreshLinkedReview);
  renderProfileReview();
  const extractedRows = record.extracted.milestones.map((row) => ({ ...row, sourceRowId: row.id, action: "replace" }));
  renderRows(extractedRows.length ? extractedRows : [{ manual: true, sourceRowId: crypto.randomUUID(), normalizedType: "other", dateStatus: "blank", action: "replace" }]);
  refreshLinkedReview();
  document.querySelector("#sap-review").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProfileReview() {
  const extracted = state.import.extracted;
  const values = [["enrollmentDate", "Enrollment date", extracted.enrollmentDate], ["projectedGraduationDate", "Projected graduation", extracted.projectedGraduationDate], ["program", "Program", extracted.program], ["campus", "Campus", extracted.campus]];
  document.querySelector("#sap-profile-review").innerHTML = values.map(([field, label, value]) => `<div class="sap-profile-field" data-profile-field="${field}"><label><input type="checkbox" data-apply-profile="${field}" ${value ? "checked" : ""} /> Update ${escapeHtml(label)}</label><span>Current: <b data-current-profile="${field}">-</b></span><label>Imported / corrected<input data-profile-value="${field}" ${field.toLowerCase().includes("date") ? 'type="date"' : 'type="text"'} value="${escapeHtml(value || "")}" /></label></div>`).join("");
}

function renderRows(rows) {
  document.querySelector("#sap-review-rows").innerHTML = rows.map(rowMarkup).join("");
}

function rowMarkup(row) {
  const id = escapeHtml(row.sourceRowId || row.id || crypto.randomUUID());
  return `<tr data-sap-row data-source-row-id="${id}" data-manual="${row.manual ? "true" : "false"}" data-date-status="${escapeHtml(row.dateStatus || "blank")}">
    <td><input data-row-field="course" value="${escapeHtml(row.course || "")}" /></td>
    <td><input data-row-field="rawLabel" value="${escapeHtml(row.rawLabel || "")}" /><small>${escapeHtml(row.rawValue || row.dateStatus || "blank")}</small></td>
    <td><select data-row-field="normalizedType">${SAP_MILESTONE_TYPES.map((type) => `<option value="${type}" ${type === row.normalizedType ? "selected" : ""}>${type.replaceAll("_", " ")}</option>`).join("")}</select></td>
    <td><input data-row-field="projectedDate" type="date" value="${escapeHtml(row.projectedDate || "")}" /></td>
    <td data-linked-status>Reviewing...</td>
    <td><select data-row-field="action"><option value="replace">Use imported date</option><option value="keep_existing">Keep existing date</option><option value="skip">Skip row</option></select></td>
    <td><div class="sap-row-actions"><span class="sap-drag-handle" draggable="true" data-row-drag-handle title="Drag to reorder">Drag</span><button class="row-action" type="button" data-add-row-after aria-label="Add milestone below">Add below</button><button class="row-action" type="button" data-remove-row aria-label="Remove milestone">Remove</button></div></td>
  </tr>`;
}

function refreshLinkedReview() {
  const student = selectedStudent();
  const currentEnrollment = student?.enrollmentDate || student?.courseStartDate || "Not set";
  document.querySelector("#sap-enrollment-comparison").value = `${currentEnrollment} → ${state.import?.extracted?.enrollmentDate || "blank"}`;
  document.querySelectorAll("[data-current-profile]").forEach((element) => {
    const field = element.dataset.currentProfile;
    element.textContent = student?.[field] || (field === "program" ? student?.curriculum : "") || "Not set";
  });
  document.querySelectorAll("[data-sap-row]").forEach((row) => {
    const milestone = rowData(row);
    const existing = state.milestones.find((item) => item.studentId === student?.id && item.course === milestone.course && (item.originalLabel || item.rawLabel) === milestone.rawLabel);
    const evaluated = student ? evaluateMilestone(milestone, { student, writtenAttempts: state.writtenAttempts, writtenScheduled: state.writtenScheduled, stageRequests: state.stageRequests }) : null;
    const details = [];
    if (existing) details.push(`Existing ${existing.projectedDate ? formatDate(existing.projectedDate) : existing.dateStatus || "blank"}${existing.actualCompletionDate ? ` · actual ${formatDate(existing.actualCompletionDate)}` : ""}`);
    if (evaluated?.written?.length) details.push(evaluated.written.map((item) => `${item.test}: ${item.status.replaceAll("_", " ")} · practice ${item.practice.highestScore ?? "none"}${item.practice.ready ? " ready" : ""}`).join("; "));
    if (evaluated?.stage) details.push(`Check: ${evaluated.stage.status}`);
    row.querySelector("[data-linked-status]").innerHTML = details.length ? details.map((text) => `<small>${escapeHtml(text)}</small>`).join("") : "<small>No linked record</small>";
  });
}

document.querySelector("#sap-review-rows").addEventListener("input", refreshLinkedReview);
document.querySelector("#sap-review-rows").addEventListener("click", handleRowAction);
document.querySelector("#sap-review-rows").addEventListener("dragstart", handleRowDragStart);
document.querySelector("#sap-review-rows").addEventListener("dragover", handleRowDragOver);
document.querySelector("#sap-review-rows").addEventListener("drop", handleRowDrop);
document.querySelector("#sap-review-rows").addEventListener("dragend", handleRowDragEnd);
document.querySelector("#sap-add-row").addEventListener("click", () => {
  appendManualRow(document.querySelector("#sap-review-rows"));
});
document.querySelector("#sap-cancel-review").addEventListener("click", cancelReview);
document.querySelector("#sap-save-later").addEventListener("click", () => { document.querySelector("#sap-review-status").textContent = "Saved as pending review. You can leave this page safely."; });
reviewForm.addEventListener("submit", confirmImport);

async function confirmImport(event) {
  event.preventDefault();
  if (!studentSelect.value) { setReviewStatus("Select the correct student before confirming.", true); studentSelect.focus(); return; }
  const profile = Object.fromEntries([...document.querySelectorAll("[data-profile-field]")].map((field) => { const name = field.dataset.profileField; return [name, { apply: field.querySelector("[data-apply-profile]").checked, value: field.querySelector("[data-profile-value]").value }]; }));
  const milestones = [...document.querySelectorAll("[data-sap-row]")].map(rowData);
  document.querySelector("#sap-confirm-button").disabled = true;
  setReviewStatus("Confirming the import transaction...", false);
  try {
    const result = await apiFetch("/api/sap-confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: state.import.id, selectedStudentId: studentSelect.value, profile, milestones }) });
    setReviewStatus(`${result.milestoneCount} milestones ${result.relinked ? "reconnected" : "confirmed"}. Opening the student timeline...`, false);
    location.href = `student-detail.html?id=${encodeURIComponent(result.studentId)}#sap-training-timeline`;
  } catch (error) {
    setReviewStatus(error.message, true);
    document.querySelector("#sap-confirm-button").disabled = false;
  }
}

function rowData(row) {
  return { sourceRowId: row.dataset.sourceRowId, manual: row.dataset.manual === "true", dateStatus: row.dataset.dateStatus, courseOrder: visibleRowIndex(row), course: row.querySelector('[data-row-field="course"]').value, rawLabel: row.querySelector('[data-row-field="rawLabel"]').value, normalizedType: row.querySelector('[data-row-field="normalizedType"]').value, projectedDate: row.querySelector('[data-row-field="projectedDate"]').value || null, action: row.querySelector('[data-row-field="action"]').value };
}

function handleRowAction(event) {
  const row = event.target.closest("[data-sap-row]");
  if (!row) return;
  if (event.target.matches("[data-remove-row]")) {
    row.querySelector('[data-row-field="action"]').value = "skip";
    row.hidden = true;
    refreshLinkedReview();
    return;
  }
  if (event.target.matches("[data-add-row-after]")) {
    appendManualRow(row, rowData(row));
    return;
  }
}

function appendManualRow(target, seed = {}) {
  const markup = rowMarkup({ manual: true, sourceRowId: crypto.randomUUID(), normalizedType: seed.normalizedType || "other", dateStatus: "blank", course: seed.course || "", action: "replace" });
  if (target?.matches?.("[data-sap-row]")) target.insertAdjacentHTML("afterend", markup);
  else target.insertAdjacentHTML("beforeend", markup);
  refreshLinkedReview();
}

function visibleRowIndex(row) {
  return [...document.querySelectorAll("[data-sap-row]:not([hidden])")].indexOf(row);
}

function handleRowDragStart(event) {
  if (!event.target.matches("[data-row-drag-handle]")) {
    event.preventDefault();
    return;
  }
  const row = event.target.closest("[data-sap-row]");
  if (!row || row.hidden) return;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.sourceRowId || "");
}

function handleRowDragOver(event) {
  const dragging = document.querySelector("[data-sap-row].is-dragging");
  if (!dragging) return;
  event.preventDefault();
  const target = event.target.closest("[data-sap-row]");
  if (!target || target === dragging || target.hidden) return;
  const rect = target.getBoundingClientRect();
  if (event.clientY < rect.top + rect.height / 2) target.before(dragging);
  else target.after(dragging);
}

function handleRowDrop(event) {
  if (!document.querySelector("[data-sap-row].is-dragging")) return;
  event.preventDefault();
  refreshLinkedReview();
}

function handleRowDragEnd() {
  document.querySelectorAll("[data-sap-row].is-dragging").forEach((row) => row.classList.remove("is-dragging"));
}

function selectedStudent() { return state.students.find((student) => sameId(student.id, studentSelect.value)); }
function sameId(left, right) { return String(left ?? "") !== "" && String(left) === String(right ?? ""); }
function resetReview() { state.import = null; document.querySelector("#sap-review").hidden = true; document.querySelector("#sap-upload-section").hidden = false; }
async function cancelReview() {
  if (!state.import || !confirm("Cancel this pending SAP import? Its audit record will be retained.")) return;
  try { await apiFetch("/api/sap-cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: state.import.id }) }); resetReview(); setStatus("The SAP import was cancelled. Its audit history was retained.", false); }
  catch (error) { setReviewStatus(error.message, true); }
}
function toggleBusy(busy) { uploadButton.disabled = busy || !state.file; document.querySelector("#sap-upload-status").hidden = !busy; }
function setStatus(message, error = false) { const box = document.querySelector("#sap-access-error"); box.hidden = false; box.classList.toggle("tuition-alert-error", error); box.textContent = message; }
function setReviewStatus(message, error) { const element = document.querySelector("#sap-review-status"); element.textContent = message; element.classList.toggle("sap-error-text", error); }
function formatBytes(value) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

async function sha256(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function apiFetch(url, options = {}) {
  const token = await window.AOAAuth.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.details || payload.error || `Request failed (${response.status})`);
  return payload;
}

async function openSourcePdf() {
  try {
    const token = await window.AOAAuth.getIdToken();
    const response = await fetch(`/api/sap-document?id=${encodeURIComponent(state.import.id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("The source PDF could not be opened.");
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { setReviewStatus(error.message, true); }
}
