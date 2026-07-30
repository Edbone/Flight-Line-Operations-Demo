import { loadStudents } from "./student-data.js";

let cachedStudents = null;

export async function getStudentDirectory(options = {}) {
  if (!cachedStudents) cachedStudents = loadStudents();
  const students = await cachedStudents;
  const activeOnly = options.activeOnly !== false;
  return [...students]
    .filter((student) => !activeOnly || student.activeStatus === "Yes")
    .sort((a, b) => String(a.studentName || "").localeCompare(String(b.studentName || ""), undefined, { sensitivity: "base" }));
}

export async function attachStudentNameDatalist(input, options = {}) {
  if (!input) return [];
  const students = options.students || await getStudentDirectory(options);
  const id = input.getAttribute("list") || `${input.name || input.id || "student"}-student-options`;
  let datalist = document.querySelector(`#${CSS.escape(id)}`);
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = id;
    document.body.append(datalist);
  }
  datalist.innerHTML = students.map((student) => {
    const detail = [student.group, student.trainingType, student.currentCourse].filter(Boolean).join(" | ");
    return `<option value="${escapeHtml(student.studentName)}" label="${escapeHtml(detail)}"></option>`;
  }).join("");
  input.setAttribute("list", id);
  input.setAttribute("autocomplete", "off");
  return students;
}

export async function attachStudentNameDatalists(selector = "[data-student-name]", options = {}) {
  const inputs = [...document.querySelectorAll(selector)];
  const students = await getStudentDirectory(options);
  await Promise.all(inputs.map((input) => attachStudentNameDatalist(input, { ...options, students })));
  return students;
}

export async function populateStudentSelect(select, options = {}) {
  if (!select) return [];
  const students = options.students || await getStudentDirectory(options);
  const placeholder = options.placeholder || "Select student profile";
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + students.map((student) => {
    const detail = [student.group, student.trainingType].filter(Boolean).join(" | ");
    return `<option value="${escapeHtml(student.id)}">${escapeHtml(student.studentName)}${detail ? ` - ${escapeHtml(detail)}` : ""}</option>`;
  }).join("");
  return students;
}

export function findStudentByName(students, name) {
  const key = normalizeName(name);
  return students.find((student) => normalizeName(student.studentName) === key) || null;
}

export function splitStudentName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "",
    last: parts.length > 1 ? parts[parts.length - 1] : ""
  };
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
