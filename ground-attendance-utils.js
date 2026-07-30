export function normalizeGroundAttendanceName(value) {
  const raw = String(value || "").trim();
  const ordered = raw.includes(",")
    ? raw.split(",").map((part) => part.trim()).filter(Boolean).reverse().join(" ")
    : raw;
  const parts = ordered.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)}`;
}

function groundAttendanceNamesMatch(studentNameKey, recordNameKey) {
  if (!studentNameKey || !recordNameKey) return false;
  if (studentNameKey === recordNameKey) return true;
  const [studentFirst, studentLast] = studentNameKey.split(" ");
  const [recordFirst, recordLast] = recordNameKey.split(" ");
  if (!studentLast || !recordLast || studentLast !== recordLast) return false;
  const shorterFirstNameLength = Math.min(studentFirst.length, recordFirst.length);
  return shorterFirstNameLength >= 3
    && (studentFirst.startsWith(recordFirst) || recordFirst.startsWith(studentFirst));
}

export function groundAttendanceCounts(records = []) {
  const byStudentId = new Map();
  const byName = new Map();
  const entries = [];
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (record?.deletedAt) return;
    const ids = [
      record?.canonical_student_id,
      record?.studentId,
      record?.student_id,
      record?.student_email_or_id
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase()).filter(Boolean);
    const recordName = record?.studentName || record?.student_name
      || `${record?.student_first_name || ""} ${record?.student_last_name || ""}`;
    const nameKey = normalizeGroundAttendanceName(recordName);
    entries.push({ ids: new Set(ids), nameKey });
    new Set(ids).forEach((id) => byStudentId.set(id, (byStudentId.get(id) || 0) + 1));
    if (nameKey) byName.set(nameKey, (byName.get(nameKey) || 0) + 1);
  });
  return { byStudentId, byName, entries };
}

export function groundAttendanceCountForStudent(student = {}, counts = groundAttendanceCounts()) {
  const ids = [student.id, student.studentId, student.myfboStudentId, student.email]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  const studentIds = new Set(ids);
  const nameKey = normalizeGroundAttendanceName(student.studentName);
  if (Array.isArray(counts.entries)) {
    return counts.entries.filter((entry) => (
      [...entry.ids].some((id) => studentIds.has(id))
      || (entry.ids.size === 0 && groundAttendanceNamesMatch(nameKey, entry.nameKey))
    )).length;
  }
  const idCounts = ids.map((id) => counts.byStudentId.get(id) || 0);
  return Math.max(counts.byName.get(nameKey) || 0, ...idCounts, 0);
}
