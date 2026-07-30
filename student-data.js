import { cacheLocalData, loadCollectionData, saveCollectionData } from "./firebase.js";
import {
  AUDIT_COLLECTION,
  AUDIT_STORAGE_KEY,
  STUDENT_COLLECTION,
  STUDENT_STORAGE_KEY,
  normalizeStudent
} from "./student-utils.js";

const SAMPLE_STUDENT_NAMES = new Set([
  "jordan avery",
  "casey morgan",
  "riley brooks",
  "taylor singh",
  "alex kim"
]);

export async function loadStudents() {
  const loaded = await loadCollectionData(STUDENT_COLLECTION, STUDENT_STORAGE_KEY);
  if (!Array.isArray(loaded) || !loaded.length) return [];
  const normalized = loaded.map(normalizeStudent);
  const cleaned = normalized.filter((student) => !SAMPLE_STUDENT_NAMES.has(student.studentName.toLowerCase()));
  if (cleaned.length !== normalized.length) await saveStudents(cleaned, { allowDeletes: true });
  return cleaned;
}

export async function saveStudents(students, options = {}) {
  const normalized = students.map(normalizeStudent);
  writeStudentCache(normalized);
  const saved = await saveCollectionData(STUDENT_COLLECTION, normalized, options);
  const items = options.returnStatus ? saved.items : saved;
  writeStudentCache(items);
  return saved;
}

export async function loadAuditLog() {
  const loaded = await loadCollectionData(AUDIT_COLLECTION, AUDIT_STORAGE_KEY);
  return Array.isArray(loaded) ? loaded : [];
}

export async function appendAuditLog(entry) {
  const staff = window.AOAAuth?.getCurrentUser?.();
  const staffFields = staff ? {
    initials: entry.initials || staff.initials,
    staffUserId: entry.staffUserId || staff.id,
    staffName: entry.staffName || staff.name
  } : {};
  const cleanEntry = { ...entry };
  if (!cleanEntry.initials) delete cleanEntry.initials;
  const log = await loadAuditLog();
  const next = [{ id: crypto.randomUUID?.() || String(Date.now()), at: new Date().toISOString(), ...staffFields, ...cleanEntry }, ...log].slice(0, 250);
  cacheLocalData(AUDIT_STORAGE_KEY, next);
  const saved = await saveCollectionData(AUDIT_COLLECTION, next, { allowDeletes: true });
  cacheLocalData(AUDIT_STORAGE_KEY, saved);
  return saved;
}

function writeStudentCache(students) {
  try {
    cacheLocalData(STUDENT_STORAGE_KEY, students);
  } catch (error) {
    console.warn("Student local cache write failed; continuing with remote save.", error);
  }
}
