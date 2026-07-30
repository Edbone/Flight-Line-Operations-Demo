export function itemKey(item) {
  if (item && typeof item === "object") {
    if (item.id !== undefined && item.id !== null && String(item.id)) return `id:${String(item.id)}`;
    if (item.studentId !== undefined && item.studentId !== null && String(item.studentId)) return `studentId:${String(item.studentId)}`;
  }
  return `value:${stableStringify(item)}`;
}

export function stableStringify(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function buildCollectionMutation(incomingItems, baselineItems, allowDeletes = false) {
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const baseline = Array.isArray(baselineItems) ? baselineItems : [];
  const incomingKeys = new Set(incoming.map(itemKey));
  const baselineByKey = new Map(baseline.map((item) => [itemKey(item), item]));
  return {
    upserts: incoming.filter((item) => {
      const key = itemKey(item);
      return !baselineByKey.has(key) || stableStringify(baselineByKey.get(key)) !== stableStringify(item);
    }),
    orderKeys: incoming.map(itemKey),
    deleteKeys: allowDeletes ? baseline.map(itemKey).filter((key) => !incomingKeys.has(key)) : []
  };
}

export function applyCollectionMutation(currentItems, mutation = {}) {
  const current = Array.isArray(currentItems) ? currentItems : [];
  const upserts = Array.isArray(mutation.upserts) ? mutation.upserts : [];
  const deleteKeys = new Set(Array.isArray(mutation.deleteKeys) ? mutation.deleteKeys : []);
  const orderKeys = Array.isArray(mutation.orderKeys) ? mutation.orderKeys : [];
  const itemsByKey = new Map(current.filter((item) => !deleteKeys.has(itemKey(item))).map((item) => [itemKey(item), item]));
  upserts.forEach((item) => itemsByKey.set(itemKey(item), item));
  const ordered = [];
  orderKeys.forEach((key) => {
    if (!itemsByKey.has(key)) return;
    ordered.push(itemsByKey.get(key));
    itemsByKey.delete(key);
  });
  return [...ordered, ...itemsByKey.values()];
}

export function deletedItemsForMutation(currentItems, mutation = {}) {
  const deleteKeys = new Set(Array.isArray(mutation.deleteKeys) ? mutation.deleteKeys : []);
  return (Array.isArray(currentItems) ? currentItems : []).filter((item) => deleteKeys.has(itemKey(item)));
}
