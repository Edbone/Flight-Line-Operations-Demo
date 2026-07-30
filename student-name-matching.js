function normalizedText(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’\-]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameParts(value = "") {
  return normalizedText(value).split(" ").filter(Boolean);
}

export function splitCanonicalStudentName(value = "") {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "",
    last: parts.length > 1 ? parts[parts.length - 1] : ""
  };
}

export function findCanonicalStudent(students = [], enteredName = "") {
  const enteredParts = [...new Set(nameParts(enteredName))];
  if (enteredParts.length < 2) return null;
  const enteredSet = new Set(enteredParts);
  const enteredNormalized = enteredParts.join(" ");

  const candidates = students.map((student) => {
    const parts = [...new Set(nameParts(student.studentName))];
    const matchedParts = parts.filter((part) => enteredSet.has(part)).length;
    const exact = parts.join(" ") === enteredNormalized;
    return { student, matchedParts, score: (exact ? 1000 : 0) + matchedParts };
  }).filter((candidate) => candidate.matchedParts >= 2)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  if (candidates[1]?.score === candidates[0].score) return null;
  return candidates[0].student;
}

export function canonicalAttendanceFields(student = {}, fallbackIdentifier = "") {
  const name = splitCanonicalStudentName(student.studentName);
  return {
    canonical_student_id: String(student.id || student.studentId || student.email || "").trim(),
    student_first_name: name.first,
    student_last_name: name.last,
    student_email_or_id: String(student.studentId || student.email || fallbackIdentifier || "").trim()
  };
}

export function canonicalizeAttendanceRecord(record = {}, students = []) {
  const enteredName = `${record.student_first_name || ""} ${record.student_last_name || ""}`.trim();
  const matchedStudent = findCanonicalStudent(students, enteredName);
  if (!matchedStudent) return { record, matchedStudent: null, changed: false };

  const next = {
    ...record,
    ...canonicalAttendanceFields(matchedStudent, record.student_email_or_id)
  };
  const changed = ["canonical_student_id", "student_first_name", "student_last_name", "student_email_or_id"]
    .some((field) => String(next[field] || "") !== String(record[field] || ""));
  return { record: next, matchedStudent, changed };
}
