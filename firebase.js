import { demoNotes, demoTuitionPayments } from "./demo-data.js";

// Portfolio runtime: every operation stays in this browser. This file deliberately
// contains no Firebase SDK import, project identifier, API key, or remote fallback.
const KEY_PREFIX = "flight-ops-portfolio:";
const listeners = new Map();
const collectionAliases = new Map();

const DEMO_STUDENTS = [
  { id: "demo-student-1", studentName: "Wyatt Brooks", activeStatus: "Yes", group: "Group 3", trainingType: "Part 141", curriculum: "Private Pilot", currentCourse: "Private Pilot", program: "PPL", campus: "Demo Campus", aircraft: "C172", assignedCFI: "Naomi Chase", projectedGraduationDate: "2026-10-16", mondayAvailability: "3", tuesdayAvailability: "2", wednesdayAvailability: "3", thursdayAvailability: "2", fridayAvailability: "3", attendanceRate: 94, notes: "Portfolio demonstration record." },
  { id: "demo-student-2", studentName: "Camila Hart", activeStatus: "Yes", group: "Group 4", trainingType: "Part 141", curriculum: "Instrument Rating", currentCourse: "Instrument Rating", program: "IRA", campus: "Demo Campus", aircraft: "C172", assignedCFI: "Nina Patel", projectedGraduationDate: "2026-09-04", mondayAvailability: "2", wednesdayAvailability: "2", fridayAvailability: "3", saturdayAvailability: "4", attendanceRate: 88, notes: "Portfolio demonstration record." },
  { id: "demo-student-3", studentName: "Elliot Stone", activeStatus: "Yes", group: "Group 5", trainingType: "Part 61", curriculum: "Commercial Pilot", currentCourse: "Commercial Pilot", program: "CAX", campus: "Demo Campus", aircraft: "C172", assignedCFI: "Caleb Rivera", projectedGraduationDate: "2026-11-20", tuesdayAvailability: "3", thursdayAvailability: "3", saturdayAvailability: "4", attendanceRate: 91, notes: "Portfolio demonstration record." },
  { id: "demo-student-4", studentName: "Mira Vaughn", activeStatus: "Yes", group: "Group 3", trainingType: "Part 141", curriculum: "Private Pilot", currentCourse: "Private Pilot", program: "PPL", campus: "Demo Campus", aircraft: "C172", assignedCFI: "Amara Lewis", projectedGraduationDate: "2026-12-12", mondayAvailability: "2", tuesdayAvailability: "2", thursdayAvailability: "2", sundayAvailability: "4", attendanceRate: 82, notes: "Portfolio demonstration record." }
];

const DEMO_ATTENDANCE = DEMO_STUDENTS.map((student, index) => ({
  id: student.id,
  studentId: student.id,
  studentName: student.studentName,
  metrics: {
    totalScheduled: 40 + index * 4,
    completedTotal: 34 + index * 3,
    completedFlights: 24 + index * 2,
    completedGrounds: 10 + index,
    avoidableCancellations: index,
    weatherCancellations: 2,
    maintenanceCancellations: 1
  },
  updatedAt: "2026-07-28T14:00:00.000Z"
}));

const COLLECTION_SEEDS = {
  "korl-students": DEMO_STUDENTS,
  "notes": demoNotes,
  "tuition-payments": demoTuitionPayments
};

const DOCUMENT_SEEDS = {
  "attendanceMeta/current": {
    id: "current",
    status: "demo",
    updatedAt: "2026-07-28T14:00:00.000Z",
    source: "Portfolio sample data"
  }
};

const FIRESTORE_COLLECTION_SEEDS = {
  attendanceLatest: DEMO_ATTENDANCE,
  sap_imports: [],
  sap_milestones: [],
  sap_notifications: []
};

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function collectionKey(collectionName, localStorageKey) {
  return `${KEY_PREFIX}${localStorageKey || collectionName}`;
}

function firestoreCollectionKey(collectionName) {
  return `${KEY_PREFIX}documents:${collectionName}`;
}

function notify(channel, value, metadata = {}) {
  const callbacks = listeners.get(channel);
  if (!callbacks) return;
  callbacks.forEach((callback) => callback(clone(value), { source: "portfolio-local", ...metadata }));
}

function subscribe(channel, callback) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel).add(callback);
  return () => {
    listeners.get(channel)?.delete(callback);
    if (!listeners.get(channel)?.size) listeners.delete(channel);
  };
}

export function cacheLocalData(key, value) {
  try {
    const storageKey = String(key).startsWith(KEY_PREFIX) ? String(key) : `${KEY_PREFIX}${key}`;
    localStorage.setItem(storageKey, typeof value === "string" ? value : JSON.stringify(clone(value)));
    return true;
  } catch (error) {
    console.warn(`Portfolio cache write failed for ${key}`, error);
    return false;
  }
}

export async function loadCollectionData(collectionName, localStorageKey, options = {}) {
  const fallback = COLLECTION_SEEDS[collectionName] || [];
  if (localStorageKey) collectionAliases.set(collectionName, localStorageKey);
  const aliasedValue = localStorageKey ? localStorage.getItem(collectionKey(collectionName, localStorageKey)) : null;
  const collectionValue = localStorage.getItem(collectionKey(collectionName));
  const items = safeParse(aliasedValue || collectionValue, fallback);
  const result = Array.isArray(items) ? items : [];
  return options.returnStatus
    ? { items: clone(result), source: "portfolio-local", error: null, remoteSaved: false }
    : clone(result);
}

export async function saveCollectionData(collectionName, data, options = {}) {
  const localStorageKey = typeof options === "string" ? options : undefined;
  const settings = options && typeof options === "object" ? options : {};
  const items = Array.isArray(data) ? clone(data) : [];
  localStorage.setItem(collectionKey(collectionName, localStorageKey), JSON.stringify(items));
  const alias = collectionAliases.get(collectionName);
  if (alias) localStorage.setItem(collectionKey(collectionName, alias), JSON.stringify(items));
  notify(`collection:${collectionName}`, items, { count: items.length });
  window.dispatchEvent(new CustomEvent("aoa:data-sync", {
    detail: { status: "saved-local", collectionName, count: items.length, at: new Date().toISOString() }
  }));
  return settings.returnStatus
    ? { items: clone(items), source: "portfolio-local", error: null, remoteSaved: false }
    : clone(items);
}

export function subscribeCollectionData(collectionName, onData, onError) {
  const unsubscribe = subscribe(`collection:${collectionName}`, onData);
  loadCollectionData(collectionName).then((items) => onData(items, { source: "portfolio-local" })).catch(onError);
  return unsubscribe;
}

export async function loadFirestoreCollection(collectionName) {
  const fallback = FIRESTORE_COLLECTION_SEEDS[collectionName] || [];
  const items = safeParse(localStorage.getItem(firestoreCollectionKey(collectionName)), fallback);
  return Array.isArray(items) ? clone(items) : [];
}

export async function loadFirestoreDocument(collectionName, documentId) {
  const documents = await loadFirestoreCollection(collectionName);
  const existing = documents.find((item) => String(item.id) === String(documentId));
  return clone(existing || DOCUMENT_SEEDS[`${collectionName}/${documentId}`] || null);
}

export async function saveFirestoreDocument(collectionName, documentId, data, options = {}) {
  const documents = await loadFirestoreCollection(collectionName);
  const index = documents.findIndex((item) => String(item.id) === String(documentId));
  const previous = index >= 0 ? documents[index] : {};
  const next = { ...(options.merge === false ? {} : previous), ...clone(data), id: String(documentId) };
  if (index >= 0) documents[index] = next;
  else documents.push(next);
  localStorage.setItem(firestoreCollectionKey(collectionName), JSON.stringify(documents));
  notify(`firestore-collection:${collectionName}`, documents, { count: documents.length });
  notify(`firestore-document:${collectionName}/${documentId}`, next);
  return clone(next);
}

export function subscribeFirestoreCollection(collectionName, onData, onError) {
  const unsubscribe = subscribe(`firestore-collection:${collectionName}`, onData);
  loadFirestoreCollection(collectionName).then((items) => onData(items, { source: "portfolio-local" })).catch(onError);
  return unsubscribe;
}

export function subscribeFirestoreDocument(collectionName, documentId, onData, onError) {
  const channel = `firestore-document:${collectionName}/${documentId}`;
  const unsubscribe = subscribe(channel, onData);
  loadFirestoreDocument(collectionName, documentId).then((item) => onData(item, { source: "portfolio-local" })).catch(onError);
  return unsubscribe;
}

export async function uploadStudentProfilePhoto(studentId, blob) {
  if (!studentId || !blob) throw new Error("Select a student and image first.");
  return blobToDataUrl(blob);
}

export async function uploadSapMatrixPdf(checksum, file) {
  if (!checksum || !file) throw new Error("Select a SAP PDF first.");
  const key = `${KEY_PREFIX}sap-upload:${checksum}`;
  localStorage.setItem(key, JSON.stringify({ name: file.name, type: file.type, size: file.size }));
  return `portfolio-local/${checksum}.pdf`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Image could not be read."));
    reader.readAsDataURL(blob);
  });
}

export async function saveFormData(sheetId, data) {
  localStorage.setItem(`${KEY_PREFIX}form:${sheetId}`, JSON.stringify({
    ...clone(data),
    updatedAt: new Date().toISOString()
  }));
}

export async function loadFormData(sheetId) {
  return safeParse(localStorage.getItem(`${KEY_PREFIX}form:${sheetId}`), null);
}
