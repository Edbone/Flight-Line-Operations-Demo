import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQF9De489mbdRXMf3nI1JeurJqknWFw2w",
  authDomain: "aoassrhub.firebaseapp.com",
  projectId: "aoassrhub",
  storageBucket: "aoassrhub.firebasestorage.app",
  messagingSenderId: "376265108824",
  appId: "1:376265108824:web:3cc573772d99380217c92d",
  measurementId: "G-J4CH23VD7W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const firestoreRestBase = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

console.log("✓ Firebase initialized successfully");
console.log("Project:", firebaseConfig.projectId);

// Sync data collection with localStorage fallback
export async function saveCollectionData(collectionName, data) {
  try {
    const ref = doc(db, collectionName, "data");
    await setDoc(ref, {
      items: data,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`✓ Saved to Firebase: ${collectionName}`);
  } catch (error) {
    console.warn("Firebase save failed, falling back to localStorage", error);
  }
}

export async function loadCollectionData(collectionName, localStorageKey) {
  try {
    const ref = doc(db, collectionName, "data");
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      console.log(`✓ Loaded from Firebase: ${collectionName}`);
      return snapshot.data().items || [];
    }
  } catch (error) {
    console.warn("Firebase load failed, using localStorage", error);
  }

  try {
    const data = await loadCollectionDataRest(collectionName);
    if (data) {
      console.log(`✓ Loaded from Firebase REST fallback: ${collectionName}`);
      return data.items || [];
    }
  } catch (error) {
    console.warn("Firebase REST fallback failed, using localStorage", error);
  }

  // Fallback to localStorage
  try {
    return JSON.parse(localStorage.getItem(localStorageKey)) || [];
  } catch {
    return [];
  }
}

async function loadCollectionDataRest(collectionName) {
  const url = `${firestoreRestBase}/${encodeURIComponent(collectionName)}/data?key=${firebaseConfig.apiKey}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore REST read failed: ${response.status}`);
  const documentData = await response.json();
  return firestoreFieldsToObject(documentData.fields || {});
}

function firestoreFieldsToObject(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValueToJson(value)]));
}

function firestoreValueToJson(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValueToJson);
  if ("mapValue" in value) return firestoreFieldsToObject(value.mapValue.fields || {});
  return null;
}

export async function saveFormData(sheetId, data) {
  const ref = doc(db, "forms", sheetId);
  await setDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function loadFormData(sheetId) {
  const ref = doc(db, "forms", sheetId);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? snapshot.data() : null;
}
