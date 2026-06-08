import { loadCollectionData, saveCollectionData } from "./firebase.js";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  getDuplicateKey,
  normalizeTuitionRecord,
  parseTuitionPayments,
  sortTuitionRecords
} from "./tuition-utils.js";

const TUITION_STORAGE_KEY = "aoa-tuition-payments-v1";
const STORAGE_COLLECTION = "tuition-payments";
const rows = document.querySelector("#tuition-rows");
const studentRows = document.querySelector("#student-summary-rows");
const pasteBox = document.querySelector("#tuition-paste-box");
const importStudentName = document.querySelector("#tuition-import-student-name");
const importInitials = document.querySelector("#tuition-import-initials");
const alertBox = document.querySelector("#tuition-alert");
const importStatus = document.querySelector("#tuition-import-status");
const saveImportButton = document.querySelector("#save-tuition-import-button");
const studentSummarySearch = document.querySelector("#student-summary-search");
const awarenessList = document.querySelector("#tuition-awareness-list");
const dialog = document.querySelector("#tuition-dialog");
const importDialog = document.querySelector("#tuition-import-dialog");
const form = document.querySelector("#tuition-form");
const filters = {
  search: document.querySelector("#tuition-search"),
  status: document.querySelector("#status-filter"),
  paid: document.querySelector("#paid-filter"),
  pastDueOnly: document.querySelector("#past-due-only"),
  upcomingOnly: document.querySelector("#upcoming-only")
};

let payments = [];
let previewRecords = [];
let showingPreview = false;
let activeView = "students";
let sortState = { key: "studentName", direction: "asc" };

async function loadPayments() {
  const loaded = await loadCollectionData(STORAGE_COLLECTION, TUITION_STORAGE_KEY);
  if (Array.isArray(loaded) && loaded.length > 0) return loaded.map((record) => normalizeTuitionRecord(record));

  const fallback = await loadPaymentsFromApi();
  return fallback.map((record) => normalizeTuitionRecord(record));
}

async function loadPaymentsFromApi() {
  try {
    const response = await fetch("/api/tuition-payments");
    if (!response.ok) throw new Error(`Tuition API returned ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.warn("Tuition API fallback failed", error);
    return [];
  }
}

async function savePayments() {
  // Firebase is the production-ready path already available in this repo.
  // localStorage is only a development/demo fallback and is not secure for student financial records.
  localStorage.setItem(TUITION_STORAGE_KEY, JSON.stringify(payments));
  await saveCollectionData(STORAGE_COLLECTION, payments);
}

function render() {
  const source = showingPreview ? previewRecords : payments;
  const filtered = sortForTable(applyFilters(source));
  renderView();
  renderStudentSummary(source);
  rows.innerHTML = filtered.map(rowMarkup).join("");
  document.querySelector("#tuition-empty-state").hidden = filtered.length > 0;
  document.querySelector("#tuition-result-count").textContent = `${filtered.length} of ${source.length} ${showingPreview ? "preview" : "saved"} records`;
  renderSummary(payments);
  updateSortHeaders();
}

function renderView() {
  document.querySelector("#students-view").hidden = activeView !== "students";
  document.querySelector("#financial-view").hidden = activeView !== "financial";
  document.querySelectorAll(".tuition-view-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
}

function renderStudentSummary(records) {
  const term = studentSummarySearch.value.trim().toLowerCase();
  const allStudents = getStudentSummaries(records);
  const students = allStudents
    .filter((student) => !term || student.studentName.toLowerCase().includes(term));

  studentRows.innerHTML = students.map(studentSummaryMarkup).join("");
  document.querySelector("#student-summary-empty-state").hidden = students.length > 0;
  document.querySelector("#student-summary-count").textContent = `${students.length} ${students.length === 1 ? "student" : "students"}`;
  renderPaymentAwareness(allStudents);
}

function getStudentSummaries(records) {
  const byStudent = new Map();
  records.forEach((record) => {
    const key = record.studentName.trim().toLowerCase();
    if (!key) return;
    if (!byStudent.has(key)) byStudent.set(key, { studentName: record.studentName, records: [] });
    byStudent.get(key).records.push(record);
  });

  return [...byStudent.values()].map(({ studentName, records }) => {
    const valid = records.filter((record) => record.status !== "Invalid");
    const unpaid = valid.filter((record) => !record.paid);
    const nextDue = unpaid
      .filter((record) => record.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const unpaidRemaining = unpaid.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const overallStatus = records.some((record) => record.status === "Invalid") ? "Invalid"
      : records.some((record) => record.status === "Past Due") ? "Past Due"
      : records.some((record) => record.status === "Upcoming") ? "Upcoming"
      : unpaid.length ? "OK"
      : "Paid";
    return { studentName, records, overallStatus, unpaidRemaining, nextDue };
  }).sort((a, b) => a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base" }));
}

function studentSummaryMarkup(student) {
  const statusClass = `tuition-status-${student.overallStatus.toLowerCase().replace(/\s+/g, "-")}`;
  return `
    <tr>
      <td><strong>${escapeHtml(student.studentName)}</strong></td>
      <td><span class="status-badge tuition-status ${statusClass}">${escapeHtml(student.overallStatus)}</span></td>
      <td>${formatCurrency(student.unpaidRemaining)}</td>
      <td>${student.nextDue ? `${formatDate(student.nextDue.dueDate)}<small>${escapeHtml(student.nextDue.paymentDescription || "")}</small>` : "—"}</td>
      <td>${student.records.length}</td>
      <td><button class="row-action edit-action" type="button" data-open-student="${escapeHtml(student.studentName)}">View details</button></td>
    </tr>
  `;
}

function renderPaymentAwareness(students) {
  const flagged = students
    .filter((student) => ["Past Due", "Upcoming"].includes(student.overallStatus))
    .sort((a, b) => statusPriority(a.overallStatus) - statusPriority(b.overallStatus) ||
      String(a.nextDue?.dueDate || "9999-12-31").localeCompare(String(b.nextDue?.dueDate || "9999-12-31")) ||
      a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base" }));

  document.querySelector("#tuition-awareness-count").textContent = flagged.length
    ? `${flagged.length} ${flagged.length === 1 ? "student needs" : "students need"} attention`
    : "No upcoming or past due payments";

  awarenessList.innerHTML = flagged.length ? flagged.map((student) => {
    const statusClass = `tuition-status-${student.overallStatus.toLowerCase().replace(/\s+/g, "-")}`;
    const dueText = student.nextDue ? `${formatDate(student.nextDue.dueDate)} · ${formatCurrency(student.nextDue.amount)}` : "No due date";
    return `
      <button class="tuition-awareness-item" type="button" data-open-student="${escapeHtml(student.studentName)}">
        <span class="status-badge tuition-status ${statusClass}">${escapeHtml(student.overallStatus)}</span>
        <strong>${escapeHtml(student.studentName)}</strong>
        <small>${escapeHtml(dueText)}</small>
      </button>
    `;
  }).join("") : `<div class="tuition-awareness-empty">No dispatcher payment alerts right now.</div>`;
}

function statusPriority(status) {
  if (status === "Past Due") return 0;
  if (status === "Upcoming") return 1;
  return 2;
}

function rowMarkup(record) {
  const statusClass = `tuition-status-${record.status.toLowerCase().replace(/\s+/g, "-")}`;
  const issues = record.issues?.length ? record.issues.join("; ") : "";
  return `
    <tr class="${record.status === "Invalid" ? "request-incomplete" : ""}">
      <td><strong>${escapeHtml(record.studentName || "Missing name")}</strong></td>
      <td>${escapeHtml(record.paymentDescription || "")}</td>
      <td>${record.amount === null ? "Invalid" : formatCurrency(record.amount)}</td>
      <td>${formatDate(record.dueDate) || "Invalid"}</td>
      <td>${record.paid ? "Yes" : "No"}</td>
      <td>${formatDate(record.datePaid) || ""}</td>
      <td><span class="status-badge tuition-status ${statusClass}">${escapeHtml(record.status)}</span></td>
      <td><small>${escapeHtml(issues)}</small></td>
      <td class="tuition-row-actions">
        ${showingPreview ? "" : `<button class="row-action edit-action" type="button" data-edit="${escapeHtml(record.id)}">Edit</button><button class="row-action" type="button" data-delete="${escapeHtml(record.id)}">Delete</button>`}
      </td>
    </tr>
  `;
}

function renderSummary(records) {
  const valid = records.filter((record) => record.status !== "Invalid");
  const totalByStatus = (status) => valid
    .filter((record) => record.status === status)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const countByStatus = (status) => valid.filter((record) => record.status === status).length;
  const unpaidRemaining = valid
    .filter((record) => !record.paid)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);

  document.querySelector("#total-paid").textContent = formatCurrency(totalByStatus("Paid"));
  document.querySelector("#total-past-due").textContent = formatCurrency(totalByStatus("Past Due"));
  document.querySelector("#total-upcoming").textContent = formatCurrency(totalByStatus("Upcoming"));
  document.querySelector("#total-unpaid").textContent = formatCurrency(unpaidRemaining);
  document.querySelector("#paid-record-count").textContent = `${countByStatus("Paid")} paid records`;
  document.querySelector("#past-due-record-count").textContent = `${countByStatus("Past Due")} past due records`;
  document.querySelector("#upcoming-record-count").textContent = `${countByStatus("Upcoming")} upcoming records`;
  document.querySelector("#unique-student-count").textContent = `${new Set(valid.map((record) => record.studentName.toLowerCase())).size} unique students`;
}

function applyFilters(records) {
  const term = filters.search.value.trim().toLowerCase();
  return records
    .filter((record) => !term || record.studentName.toLowerCase().includes(term))
    .filter((record) => !filters.status.value || record.status === filters.status.value)
    .filter((record) => !filters.paid.value || (filters.paid.value === "paid" ? record.paid : !record.paid))
    .filter((record) => !filters.pastDueOnly.checked || record.status === "Past Due")
    .filter((record) => !filters.upcomingOnly.checked || record.status === "Upcoming");
}

function sortForTable(records) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (sortState.key === "amount") return (Number(a.amount || 0) - Number(b.amount || 0)) * direction;
    if (sortState.key === "paid") return (Number(a.paid) - Number(b.paid)) * direction;
    return String(a[sortState.key] || "").localeCompare(String(b[sortState.key] || ""), undefined, { sensitivity: "base" }) * direction;
  });
}

function updateSortHeaders() {
  document.querySelectorAll(".tuition-table th button[data-sort]").forEach((button) => {
    const active = button.dataset.sort === sortState.key;
    button.textContent = button.textContent.replace(/\s+[▲▼]$/, "");
    if (active) button.textContent += sortState.direction === "asc" ? " ▲" : " ▼";
  });
}

function showAlert(messages, type = "info") {
  const list = Array.isArray(messages) ? messages.filter(Boolean) : [messages].filter(Boolean);
  alertBox.hidden = list.length === 0;
  alertBox.className = `tuition-alert tuition-alert-${type}`;
  alertBox.innerHTML = list.map((message) => `<div>${escapeHtml(message)}</div>`).join("");
}

function parsePreview() {
  const result = parseTuitionPayments(pasteBox.value, new Date(), { studentName: importStudentName.value.trim() });
  previewRecords = result.records;
  showingPreview = true;
  saveImportButton.disabled = previewRecords.length === 0;
  importStatus.textContent = `${result.validCount} valid, ${result.invalidCount} invalid`;
  const messages = [...result.errors, ...result.warnings.slice(0, 8)];
  if (result.warnings.length > 8) messages.push(`${result.warnings.length - 8} more row issues hidden.`);
  if (result.invalidCount && result.validCount) messages.unshift("Import preview includes some invalid rows.");
  showAlert(messages, result.errors.length ? "error" : result.invalidCount ? "warning" : "success");
  render();
}

async function savePreview() {
  if (!previewRecords.length) return;
  const initials = importInitials.value.trim().toUpperCase();
  if (!initials) {
    showAlert("Enter your initials before saving imported records.", "error");
    importInitials.focus();
    return;
  }
  const byKey = new Map(payments.map((record) => [getDuplicateKey(record), record]));
  let added = 0;
  let updated = 0;
  previewRecords.forEach((record) => {
    const signedRecord = { ...record, importedBy: initials };
    const key = getDuplicateKey(record);
    const existing = byKey.get(key);
    if (existing) {
      Object.assign(existing, { ...signedRecord, id: existing.id });
      updated += 1;
    } else {
      const newRecord = { ...signedRecord, id: crypto.randomUUID() };
      payments.push(newRecord);
      byKey.set(key, newRecord);
      added += 1;
    }
  });
  payments = sortTuitionRecords(payments.map((record) => normalizeTuitionRecord(record)));
  await savePayments();
  showingPreview = false;
  previewRecords = [];
  saveImportButton.disabled = true;
  importStatus.textContent = `Saved ${added} new, updated ${updated}`;
  showAlert(`Import saved. ${added} new records added and ${updated} duplicates updated.`, "success");
  importDialog.close();
  activeView = "students";
  render();
}

function openEditDialog(id) {
  const record = payments.find((item) => item.id === id);
  if (!record) return;
  form.reset();
  form.elements.id.value = record.id;
  form.elements.studentName.value = record.studentName;
  form.elements.paymentDescription.value = record.paymentDescription;
  form.elements.amount.value = record.amount ?? "";
  form.elements.dueDate.value = record.dueDate;
  form.elements.paid.checked = record.paid;
  form.elements.datePaid.value = record.datePaid;
  dialog.showModal();
}

async function saveEditedRecord() {
  const data = Object.fromEntries(new FormData(form));
  const normalized = normalizeTuitionRecord({
    ...data,
    paid: form.elements.paid.checked,
    amount: data.amount
  });
  payments = payments.map((record) => record.id === data.id ? { ...normalized, id: data.id } : record);
  await savePayments();
  dialog.close();
  render();
}

async function deleteRecord(id) {
  if (!confirm("Delete this tuition payment record?")) return;
  payments = payments.filter((record) => record.id !== id);
  await savePayments();
  render();
}

function exportCsv() {
  const columns = ["Student Name", "Payment Description", "Amount", "Due Date", "Paid", "Date Paid", "Status"];
  const records = sortForTable(applyFilters(showingPreview ? previewRecords : payments));
  const csvRows = records.map((record) => [
    record.studentName,
    record.paymentDescription,
    record.amount ?? "",
    formatDate(record.dueDate),
    record.paid ? "Yes" : "No",
    formatDate(record.datePaid),
    record.status
  ]);
  const csv = [columns, ...csvRows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "tuition-payments.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function openStudentDetails(studentName) {
  filters.search.value = studentName;
  filters.status.value = "";
  filters.paid.value = "";
  filters.pastDueOnly.checked = false;
  filters.upcomingOnly.checked = false;
  activeView = "financial";
  render();
}

document.querySelector("#open-tuition-import-button").addEventListener("click", () => importDialog.showModal());
document.querySelector("#close-tuition-import-button").addEventListener("click", () => importDialog.close());
document.querySelector("#parse-tuition-button").addEventListener("click", parsePreview);
saveImportButton.addEventListener("click", savePreview);
document.querySelector("#clear-paste-button").addEventListener("click", () => {
  pasteBox.value = "";
  importStudentName.value = "";
  importInitials.value = "";
  previewRecords = [];
  showingPreview = false;
  saveImportButton.disabled = true;
  importStatus.textContent = "";
  showAlert([]);
  render();
});
document.querySelector("#export-tuition-button").addEventListener("click", exportCsv);
document.querySelector("#reset-filters-button").addEventListener("click", () => {
  filters.search.value = "";
  filters.status.value = "";
  filters.paid.value = "";
  filters.pastDueOnly.checked = false;
  filters.upcomingOnly.checked = false;
  render();
});

document.querySelector(".tuition-view-tabs").addEventListener("click", (event) => {
  const view = event.target.dataset.view;
  if (!view) return;
  activeView = view;
  render();
});

Object.values(filters).forEach((element) => element.addEventListener("input", render));
studentSummarySearch.addEventListener("input", render);
document.querySelector(".tuition-table thead").addEventListener("click", (event) => {
  const key = event.target.dataset.sort;
  if (!key) return;
  sortState = { key, direction: sortState.key === key && sortState.direction === "asc" ? "desc" : "asc" };
  render();
});
studentRows.addEventListener("click", (event) => {
  const studentName = event.target.dataset.openStudent;
  if (!studentName) return;
  openStudentDetails(studentName);
});
awarenessList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-open-student]");
  if (!target) return;
  openStudentDetails(target.dataset.openStudent);
});
rows.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) openEditDialog(editId);
  if (deleteId) deleteRecord(deleteId);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedRecord();
});
document.querySelector("#close-tuition-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-tuition-dialog").addEventListener("click", () => dialog.close());

(async () => {
  payments = sortTuitionRecords(await loadPayments());
  render();
})();
