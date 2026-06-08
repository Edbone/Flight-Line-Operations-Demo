const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAQF9De489mbdRXMf3nI1JeurJqknWFw2w",
  projectId: "aoassrhub"
};

const FIRESTORE_DOCUMENT_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/tuition-payments/data?key=${FIREBASE_CONFIG.apiKey}`;

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const firestoreResponse = await fetch(FIRESTORE_DOCUMENT_URL);
    const payload = await firestoreResponse.json();

    if (!firestoreResponse.ok) {
      response.status(firestoreResponse.status).json({
        error: "Unable to load tuition payments",
        details: payload.error?.message || "Firestore request failed"
      });
      return;
    }

    const data = firestoreFieldsToObject(payload.fields || {});
    response.status(200).json({
      items: Array.isArray(data.items) ? data.items : [],
      updatedAt: data.updatedAt || null
    });
  } catch (error) {
    response.status(500).json({
      error: "Unable to load tuition payments",
      details: error.message
    });
  }
};

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
