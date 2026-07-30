import { cacheLocalData, loadCollectionData, saveCollectionData, subscribeCollectionData } from "./firebase.js";

export const INSTRUCTOR_STORAGE_KEY = "aoa-instructor-profiles-v1";
export const INSTRUCTOR_COLLECTION = "instructor-profiles";

export const DEFAULT_INSTRUCTORS = [
  "Naomi Chase",
  "Nina Patel",
  "Caleb Rivera",
  "Amara Lewis",
  "Nolan Hayes",
  "Maya Chen",
  "Theo Grant",
  "Sofia Reyes",
  "Ayla Monroe",
  "Julian Brooks",
  "Simon Ellis",
  "Lena Walsh",
  "Mila Foster",
  "Elena Price",
  "Grace Holloway",
  "Dylan Park",
  "Iris Bennett",
  "Owen Carter"
];

const LEGACY_DEFAULT_INSTRUCTORS = [
  "Naomi Chase",
  "Nina Patel",
  "Caleb Rivera",
  "Amara Lewis"
];

export function normalizeInstructor(input = {}) {
  const name = cleanInstructorName(input.name || input.instructorName || input.id || "");
  return {
    id: String(input.id || slugForInstructor(name) || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name,
    initials: String(input.initials || initialsForName(name)).trim().toUpperCase(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    role: String(input.role || "CFI").trim(),
    activeStatus: String(input.activeStatus || "Yes") === "No" ? "No" : "Yes",
    aircraft: String(input.aircraft || "C172").trim(),
    checkInstructor: Boolean(input.checkInstructor),
    notes: String(input.notes || "").trim(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

export async function loadInstructors() {
  const loaded = await loadCollectionData(INSTRUCTOR_COLLECTION, INSTRUCTOR_STORAGE_KEY);
  const instructors = Array.isArray(loaded) ? loaded.map(normalizeInstructor).filter((item) => item.name) : [];
  return seedInstructorProfiles(instructors);
}

export async function saveInstructors(instructors, options = {}) {
  const normalized = normalizeInstructorList(instructors);
  cacheLocalData(INSTRUCTOR_STORAGE_KEY, normalized);
  const saved = await saveCollectionData(INSTRUCTOR_COLLECTION, normalized, options);
  const next = normalizeInstructorList(saved);
  cacheLocalData(INSTRUCTOR_STORAGE_KEY, next);
  return next;
}

export function subscribeInstructors(onData, onError) {
  return subscribeCollectionData(INSTRUCTOR_COLLECTION, (items) => {
    onData(seedInstructorProfiles(Array.isArray(items) ? items : []));
  }, onError);
}

export function activeInstructorNames(instructors) {
  return normalizeInstructorList(instructors)
    .filter((instructor) => instructor.activeStatus !== "No")
    .map((instructor) => instructor.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function defaultInstructorProfiles() {
  return DEFAULT_INSTRUCTORS.map((name) => normalizeInstructor({ name }));
}

function seedInstructorProfiles(instructors) {
  const normalized = normalizeInstructorList(instructors);
  if (!normalized.length || isLegacyDefaultOnly(normalized)) return defaultInstructorProfiles();
  return normalized;
}

function isLegacyDefaultOnly(instructors) {
  const names = instructors.map((instructor) => instructor.name.toLowerCase()).sort();
  const legacyNames = LEGACY_DEFAULT_INSTRUCTORS.map((name) => name.toLowerCase()).sort();
  return names.length === legacyNames.length && names.every((name, index) => name === legacyNames[index]);
}

export function normalizeInstructorList(instructors) {
  const byName = new Map();
  (Array.isArray(instructors) ? instructors : []).forEach((item) => {
    const instructor = normalizeInstructor(item);
    if (!instructor.name) return;
    byName.set(instructor.name.toLowerCase(), instructor);
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function cleanInstructorName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function slugForInstructor(name) {
  return cleanInstructorName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function initialsForName(name) {
  const parts = cleanInstructorName(name).split(" ").filter(Boolean);
  if (!parts.length) return "";
  return `${parts[0][0] || ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`;
}
