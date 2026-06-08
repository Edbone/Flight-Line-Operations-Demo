function collectionStorageKey(collectionName, localStorageKey) {
  return localStorageKey || `aoa-${collectionName}-local`;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

export async function saveCollectionData(collectionName, data, localStorageKey) {
  const storageKey = collectionStorageKey(collectionName, localStorageKey);
  localStorage.setItem(storageKey, JSON.stringify(cloneData(data)));
  console.log(`Saved locally: ${collectionName}`);
}

export async function loadCollectionData(collectionName, localStorageKey) {
  const storageKey = collectionStorageKey(collectionName, localStorageKey);

  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

export async function saveFormData(sheetId, data) {
  localStorage.setItem(`aoa-form-${sheetId}`, JSON.stringify({
    ...cloneData(data),
    updatedAt: new Date().toISOString()
  }));
}

export async function loadFormData(sheetId) {
  try {
    return JSON.parse(localStorage.getItem(`aoa-form-${sheetId}`));
  } catch {
    return null;
  }
}
