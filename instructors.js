import { loadInstructors, saveInstructors, normalizeInstructor } from "./instructor-data.js";

const state = {
  instructors: [],
  filters: { search: "", status: "Yes" },
  editingId: ""
};

const els = {
  search: document.querySelector("#instructor-search"),
  statusFilter: document.querySelector("#instructor-status-filter"),
  resultCount: document.querySelector("#instructor-result-count"),
  activeCount: document.querySelector("#instructor-active-count"),
  checkCount: document.querySelector("#instructor-check-count"),
  totalCount: document.querySelector("#instructor-total-count"),
  listCount: document.querySelector("#instructor-list-count"),
  grid: document.querySelector("#instructor-card-grid"),
  empty: document.querySelector("#instructor-empty"),
  form: document.querySelector("#instructor-form"),
  formTitle: document.querySelector("#instructor-form-title"),
  deleteButton: document.querySelector("#delete-instructor-button")
};

init();

async function init() {
  state.instructors = await loadInstructors();
  bindEvents();
  resetForm();
  render();
}

function bindEvents() {
  els.search.addEventListener("input", () => {
    state.filters.search = els.search.value.trim().toLowerCase();
    render();
  });
  els.statusFilter.addEventListener("change", () => {
    state.filters.status = els.statusFilter.value;
    render();
  });
  document.querySelector("#new-instructor-button").addEventListener("click", resetForm);
  document.querySelector("#reset-instructor-form").addEventListener("click", resetForm);
  els.grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-instructor]");
    if (button) editInstructor(button.dataset.editInstructor);
  });
  els.deleteButton.addEventListener("click", removeCurrentInstructor);
  els.form.addEventListener("submit", saveInstructorFromForm);
}

function filteredInstructors() {
  const term = state.filters.search;
  return state.instructors
    .filter((instructor) => !state.filters.status || instructor.activeStatus === state.filters.status)
    .filter((instructor) => !term || [instructor.name, instructor.initials, instructor.email, instructor.phone, instructor.role, instructor.aircraft, instructor.notes]
      .some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function render() {
  const instructors = filteredInstructors();
  els.grid.innerHTML = instructors.map(instructorCard).join("");
  els.empty.hidden = instructors.length > 0;
  els.resultCount.textContent = `${instructors.length} of ${state.instructors.length} instructors`;
  els.listCount.textContent = `${instructors.length} shown`;
  els.activeCount.textContent = state.instructors.filter((instructor) => instructor.activeStatus === "Yes").length;
  els.checkCount.textContent = state.instructors.filter((instructor) => instructor.checkInstructor).length;
  els.totalCount.textContent = state.instructors.length;
}

function instructorCard(instructor) {
  return `
    <button class="instructor-card ${state.editingId === instructor.id ? "active" : ""}" type="button" data-edit-instructor="${escapeHtml(instructor.id)}">
      <span class="student-photo student-photo-fallback">${escapeHtml(instructor.initials || initials(instructor.name))}</span>
      <span class="instructor-card-copy">
        <span>${badge(instructor.activeStatus === "Yes" ? "Active" : "Inactive", instructor.activeStatus === "Yes" ? "green" : "blue")}${instructor.checkInstructor ? badge("Check", "yellow") : ""}</span>
        <strong>${escapeHtml(instructor.name)}</strong>
        <small>${escapeHtml(instructor.role || "Instructor")} · ${escapeHtml(instructor.aircraft || "No aircraft")}</small>
        <small>${escapeHtml([instructor.email, instructor.phone].filter(Boolean).join(" · ") || "No contact info")}</small>
      </span>
    </button>
  `;
}

function editInstructor(id) {
  const instructor = state.instructors.find((item) => item.id === id);
  if (!instructor) return;
  state.editingId = instructor.id;
  els.formTitle.textContent = "Edit instructor";
  els.form.elements.id.value = instructor.id;
  els.form.elements.name.value = instructor.name;
  els.form.elements.initials.value = instructor.initials;
  els.form.elements.activeStatus.value = instructor.activeStatus;
  els.form.elements.role.value = instructor.role;
  els.form.elements.aircraft.value = instructor.aircraft;
  els.form.elements.email.value = instructor.email;
  els.form.elements.phone.value = instructor.phone;
  els.form.elements.checkInstructor.checked = Boolean(instructor.checkInstructor);
  els.form.elements.notes.value = instructor.notes;
  els.deleteButton.hidden = false;
  render();
}

function resetForm() {
  state.editingId = "";
  els.form.reset();
  els.form.elements.activeStatus.value = "Yes";
  els.form.elements.role.value = "CFI";
  els.form.elements.aircraft.value = "C172";
  els.formTitle.textContent = "Add instructor";
  els.deleteButton.hidden = true;
  render();
}

async function saveInstructorFromForm(event) {
  event.preventDefault();
  const formData = new FormData(els.form);
  const instructor = normalizeInstructor({
    id: formData.get("id"),
    name: formData.get("name"),
    initials: formData.get("initials"),
    activeStatus: formData.get("activeStatus"),
    role: formData.get("role"),
    aircraft: formData.get("aircraft"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    checkInstructor: formData.get("checkInstructor") === "on",
    notes: formData.get("notes"),
    updatedAt: new Date().toISOString()
  });
  if (!instructor.name) return;
  const others = state.instructors.filter((item) => item.id !== instructor.id && item.name.toLowerCase() !== instructor.name.toLowerCase());
  state.instructors = await saveInstructors([...others, instructor]);
  editInstructor(instructor.id);
}

async function removeCurrentInstructor() {
  const id = els.form.elements.id.value;
  const instructor = state.instructors.find((item) => item.id === id);
  if (!instructor) return;
  if (!confirm(`Remove ${instructor.name} from instructor profiles? Existing historical records will keep the name text.`)) return;
  state.instructors = await saveInstructors(state.instructors.filter((item) => item.id !== id), { allowDeletes: true });
  resetForm();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function badge(label, tone = "blue") {
  return `<span class="student-badge ${tone}">${escapeHtml(label)}</span>`;
}

function initials(name) {
  const parts = String(name || "Instructor").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "I"}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}
