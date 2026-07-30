export const SAP_PARSER_VERSION = "1.0.1";

export const SAP_CONFIG = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  readinessScore: 90,
  readinessAttempts: 3,
  dueWindows: Object.freeze({ critical: 0, high: 7, medium: 14, info: 30 })
});

export const SAP_MILESTONE_TYPES = Object.freeze([
  "written_test", "stage_check", "progress_check", "commercial_audit", "time_building",
  "training", "oral_proficiency", "flight_proficiency", "end_of_course",
  "checkride_endorsement", "course_start", "other"
]);

const COURSE_ALIASES = [
  [/private|\bppl\b|\bpar\b/i, "Private Pilot Certificate"],
  [/flight instructor\s*[-–—]?\s*instrument|\bcfii\b/i, "Certified Flight Instructor - Instrument"],
  [/instrument(?!.*instructor)|\bira\b|\bifr\b/i, "Instrument Rating"],
  [/single.?engine\s+(?:commercial|comm?\.?\b)|commercial|\bcax\b|\bcomm?\.?\b/i, "Single Engine Commercial"],
  [/certified flight instructor|\bcfi\b/i, "Certified Flight Instructor"],
  [/multi.?engine academy/i, "Multi-Engine Academy Program"],
  [/multi.?engine add.?on/i, "Multi-Engine Add On"],
  [/multi.?engine instructor|\bmei\b/i, "Multi-Engine Instructor"]
];

const TEST_ALIASES = Object.freeze({
  PAR: ["PAR", "PPL", "PRIVATE", "PRIVATE PILOT"],
  IRA: ["IRA", "IFR", "INSTRUMENT"],
  FII: ["FII", "CFII", "INSTRUMENT INSTRUCTOR"],
  CAX: ["CAX", "COM", "COMMERCIAL"],
  FOI: ["FOI", "FUNDAMENTALS OF INSTRUCTING"],
  FIA: ["FIA", "CFI", "FLIGHT INSTRUCTOR AIRPLANE"],
  AGI: ["AGI", "ADVANCED GROUND INSTRUCTOR"],
  IGI: ["IGI", "INSTRUMENT GROUND INSTRUCTOR"]
});

export function normalizeWhitespace(value = "") {
  return String(value).replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim();
}

export function normalizedKey(value = "") {
  return normalizeWhitespace(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseDateOnly(value) {
  const text = normalizeWhitespace(value);
  if (!text || /^(?:tbd|to be discussed|unknown|n\/?a|-+)$/i.test(text)) return null;
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (match) {
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  } else {
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) [year, month, day] = match.slice(1).map(Number);
  }
  if (!year) {
    const monthNames = "january february march april may june july august september october november december".split(" ");
    match = text.toLowerCase().match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (match) {
      month = monthNames.findIndex((name) => name.startsWith(match[1])) + 1;
      day = Number(match[2]);
      year = Number(match[3]);
    }
  }
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeCourseName(value = "") {
  const text = normalizeWhitespace(value);
  return COURSE_ALIASES.find(([pattern]) => pattern.test(text))?.[1] || text;
}

export function normalizeMilestoneType(label = "") {
  const text = normalizedKey(label);
  if (/\b(written|knowledge test|faa test)\b/.test(text)) return "written_test";
  if (/checkride.*endorsement|endorsement.*checkride/.test(text)) return "checkride_endorsement";
  if (/commercial.*audit/.test(text)) return "commercial_audit";
  if (/time.*build/.test(text)) return "time_building";
  if (/oral.*proficien/.test(text)) return "oral_proficiency";
  if (/flight.*proficien/.test(text)) return "flight_proficiency";
  if (/end.*course|\beoc\b/.test(text)) return "end_of_course";
  if (/progress.*check/.test(text)) return "progress_check";
  if (/stage|phase/.test(text)) return "stage_check";
  if (/training/.test(text)) return "training";
  if (/course.*start|to be discussed|\btbd\b/.test(text)) return "course_start";
  return "other";
}

export function requiredWrittenTests(label = "", course = "") {
  const upper = `${label} ${course}`.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
  if (!/\b(WRITTEN|KNOWLEDGE TEST|FAA TEST)\b/.test(String(label).toUpperCase())) return [];
  const tests = Object.entries(TEST_ALIASES).filter(([, aliases]) => aliases.some((alias) => new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`).test(upper))).map(([code]) => code);
  if (/\bWRITTEN\b/.test(upper) && !tests.length) {
    const canonicalCourse = normalizeCourseName(course);
    if (canonicalCourse === "Private Pilot Certificate") tests.push("PAR");
    if (canonicalCourse === "Instrument Rating") tests.push("IRA");
    if (canonicalCourse === "Single Engine Commercial") tests.push("CAX");
  }
  return [...new Set(tests)];
}

export function isSignatureCertificatePage(text = "") {
  const key = normalizedKey(text);
  const signals = ["recipient verification", "email verified", "ip address", "document completed by all parties", "signed with pandadoc", "signer timestamp signature"];
  return signals.filter((signal) => key.includes(signal)).length >= 2;
}

function findLabeledValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeWhitespace(text.match(new RegExp(`${escaped}\\s*:?\\s*([^\\n]+)`, "i"))?.[1] || "");
}

function splitTextItem(item) {
  const text = normalizeWhitespace(item.str);
  if (!text) return [];
  const matches = [...text.matchAll(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|To Be Discussed|TBD/gi)];
  if (matches.length < 2 && !(matches.length === 1 && matches[0][0] !== text)) return [{ ...item, str: text }];
  const widthPerChar = Number(item.width || 0) / Math.max(text.length, 1);
  return matches.map((match) => ({ ...item, str: match[0], x: Number(item.x) + match.index * widthPerChar, width: match[0].length * widthPerChar }));
}

function closestColumn(columns, item) {
  const center = Number(item.x) + Number(item.width || 0) / 2;
  return columns.reduce((best, column, index) => Math.abs(center - column.center) < best.distance ? { index, distance: Math.abs(center - column.center) } : best, { index: 0, distance: Infinity }).index;
}

function courseFromBlock(block, nextY) {
  const items = block.pageItems.filter((item) => item.y < block.y - 2 && item.y > nextY + 2);
  const milestoneMarker = items.find((item) => /^milestones?\b/i.test(normalizeWhitespace(item.str)));
  if (!milestoneMarker) return { ...block.course, milestones: [] };
  const gridItems = items.filter((item) => item.y < milestoneMarker.y - 2);
  const datedItems = gridItems.flatMap(splitTextItem).filter((item) => parseDateOnly(item.str));
  const valueY = datedItems.length ? Math.max(...datedItems.map((item) => item.y)) : null;
  if (valueY === null) return { ...block.course, milestones: [] };
  const valueItems = gridItems.flatMap(splitTextItem).filter((item) => Math.abs(item.y - valueY) < 3 && (parseDateOnly(item.str) || /^(?:tbd|to be discussed)$/i.test(normalizeWhitespace(item.str))));
  const labelItems = gridItems.filter((item) => item.y > valueY + 3 && !parseDateOnly(item.str));
  const rawAnchors = [...new Set(labelItems.map((item) => Number(item.x).toFixed(1)))].map(Number).sort((a, b) => a - b);
  const columns = rawAnchors.map((x, index) => ({ x, center: index + 1 < rawAnchors.length ? (x + rawAnchors[index + 1]) / 2 : x + 30 }));
  if (!columns.length) return { ...block.course, milestones: [] };
  const labels = columns.map(() => []);
  labelItems.forEach((item) => {
    const index = rawAnchors.reduce((best, x, i) => Math.abs(Number(item.x) - x) < Math.abs(Number(item.x) - rawAnchors[best]) ? i : best, 0);
    labels[index].push(item);
  });
  const values = columns.map(() => []);
  valueItems.forEach((item) => values[closestColumn(columns, item)].push(item));
  const milestones = columns.map((column, index) => {
    const rawLabel = normalizeWhitespace(labels[index].sort((a, b) => b.y - a.y).map((item) => item.str).join(" "));
    if (!rawLabel) return null;
    const rawValue = normalizeWhitespace(values[index].sort((a, b) => b.y - a.y).map((item) => item.str).join(" "));
    return {
      id: `row-${block.course.order + 1}-${index + 1}`,
      course: block.course.name,
      courseOrder: block.course.order,
      rawLabel,
      normalizedType: normalizeMilestoneType(rawLabel),
      rawValue,
      projectedDate: parseDateOnly(rawValue),
      dateStatus: /^(?:tbd|to be discussed)$/i.test(rawValue) ? "tbd" : rawValue ? (parseDateOnly(rawValue) ? "projected" : "unclear") : "blank",
      requiredWrittenTests: requiredWrittenTests(rawLabel, block.course.name)
    };
  }).filter(Boolean);
  return { ...block.course, milestones };
}

export function parseSapPages(pages = []) {
  const usablePages = pages.filter((page) => !isSignatureCertificatePage(page.text));
  const ignoredPages = pages.filter((page) => isSignatureCertificatePage(page.text)).map((page) => page.pageNumber);
  if (!usablePages.length) throw new Error("No SAP Matrix training page was found.");
  const fullText = usablePages.map((page) => page.text).join("\n");
  const studentName = findLabeledValue(fullText, "Student").split(/\s{2,}|Enrollment Date/i)[0].trim();
  const campus = findLabeledValue(fullText, "Campus").split(/\s{2,}|Graduation Date/i)[0].trim();
  const program = findLabeledValue(fullText, "Program").split(/\s{2,}|Course:/i)[0].trim();
  const enrollmentRaw = fullText.match(/Enrollment Date\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i)?.[1] || "";
  const graduationRaw = fullText.match(/(?:Projected\s+)?Graduation Date\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i)?.[1] || "";
  const courses = [];
  usablePages.forEach((page) => {
    const items = (page.items || []).map((item) => ({ ...item, x: Number(item.x ?? item.transform?.[4] ?? 0), y: Number(item.y ?? item.transform?.[5] ?? 0) })).filter((item) => normalizeWhitespace(item.str));
    const courseLabels = items.filter((item) => /^course\s*:?$/i.test(normalizeWhitespace(item.str))).sort((a, b) => b.y - a.y);
    const blocks = courseLabels.map((label, order) => {
      const nameItem = items.filter((item) => Math.abs(item.y - label.y) < 2 && item.x > label.x + 20 && !/^length/i.test(item.str)).sort((a, b) => a.x - b.x)[0];
      const lengthLabel = items.find((item) => Math.abs(item.y - label.y) < 2 && /^length\s*:?$/i.test(normalizeWhitespace(item.str)));
      const lengthItem = lengthLabel && items.filter((item) => Math.abs(item.y - label.y) < 2 && item.x > lengthLabel.x + 20).sort((a, b) => a.x - b.x)[0];
      return { y: label.y, pageItems: items, course: { name: normalizeCourseName(nameItem?.str || "Unknown course"), originalName: normalizeWhitespace(nameItem?.str || ""), length: normalizeWhitespace(lengthItem?.str || ""), order: courses.length + order } };
    });
    blocks.forEach((block, index) => courses.push(courseFromBlock(block, blocks[index + 1]?.y ?? -Infinity)));
  });
  const milestones = courses.flatMap((course) => course.milestones);
  if (!studentName || !courses.length || !milestones.length) throw new Error("The PDF contains text, but its SAP Matrix fields could not be read reliably.");
  return {
    parserVersion: SAP_PARSER_VERSION,
    extractionMethod: pages.some((page) => page.extractionMethod === "ocr") ? "ocr" : "native",
    ignoredPages,
    studentName,
    enrollmentDate: parseDateOnly(enrollmentRaw),
    projectedGraduationDate: parseDateOnly(graduationRaw),
    campus,
    program,
    courses,
    milestones,
    warnings: milestones.filter((item) => item.dateStatus === "unclear").map((item) => `Unclear date for ${item.course}: ${item.rawLabel}`)
  };
}

function nameTokens(value) {
  return normalizedKey(value).split(" ").filter(Boolean);
}

export function matchStudent(extracted = {}, students = []) {
  const target = nameTokens(extracted.studentName);
  const targetSorted = [...target].sort().join(" ");
  const candidates = students.map((student) => {
    const parts = nameTokens(student.studentName);
    const sorted = [...parts].sort().join(" ");
    const overlap = parts.filter((part) => target.includes(part)).length;
    let score = 0;
    const reasons = [];
    if (parts.join(" ") === target.join(" ")) { score += 100; reasons.push("exact full name"); }
    else if (sorted === targetSorted) { score += 94; reasons.push("reordered full name"); }
    else if (parts[0] === target[0] && parts.at(-1) === target.at(-1)) { score += 82; reasons.push("first and last name"); }
    else if (parts[0] === target.at(-1) && parts.at(-1) === target[0]) { score += 78; reasons.push("reversed first and last name"); }
    else score += Math.round((overlap / Math.max(parts.length, target.length, 1)) * 65);
    const currentEnrollment = parseDateOnly(student.enrollmentDate || student.courseStartDate);
    let enrollmentConflict = false;
    if (extracted.enrollmentDate && currentEnrollment) {
      if (extracted.enrollmentDate === currentEnrollment) { score += 6; reasons.push("enrollment date"); }
      else { score -= 35; enrollmentConflict = true; reasons.push("enrollment date conflict"); }
    }
    return { studentId: student.id, studentName: student.studentName, score: Math.max(0, Math.min(100, score)), reasons, enrollmentDate: currentEnrollment, enrollmentConflict };
  }).filter((candidate) => candidate.score >= 40).sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
  const best = candidates[0] || null;
  const ambiguous = Boolean(best && candidates[1] && best.score - candidates[1].score < 8);
  const autoSelectable = Boolean(best && best.score >= 85 && !best.enrollmentConflict && !ambiguous);
  return { proposedStudentId: autoSelectable ? best.studentId : null, bestCandidate: best, candidates: candidates.slice(0, 8), confidence: !best ? "none" : best.score >= 90 ? "high" : best.score >= 70 ? "medium" : "low", requiresManualSelection: !autoSelectable, ambiguous };
}

export function canonicalTestCode(value = "") {
  const upper = normalizeWhitespace(value).toUpperCase();
  return Object.entries(TEST_ALIASES).find(([, aliases]) => aliases.some((alias) => upper === alias || new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`).test(upper)))?.[0] || upper;
}

function sameStudentName(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  return left.length >= 2 && [...left].sort().join(" ") === [...right].sort().join(" ");
}

export function writtenCrossReference(milestone, student, attempts = [], scheduled = [], config = SAP_CONFIG) {
  const required = milestone.requiredWrittenTests?.length ? milestone.requiredWrittenTests : requiredWrittenTests(milestone.rawLabel, milestone.course);
  return required.map((test) => {
    const matchingAttempts = attempts.filter((attempt) => sameStudentName(attempt.student, student.studentName) && canonicalTestCode(attempt.test) === test).sort((a, b) => String(a.takenAt || a.date || "").localeCompare(String(b.takenAt || b.date || "")));
    const scores = matchingAttempts.map((attempt) => Number(attempt.score)).filter(Number.isFinite);
    const actualPassed = matchingAttempts.find((attempt) => attempt.passed === true || /^(?:pass|passed|satisfactory)$/i.test(attempt.result || "") || attempt.recordType === "actual_written");
    const actualFailed = !actualPassed && matchingAttempts.find((attempt) => attempt.passed === false || /^(?:fail|failed|unsatisfactory)$/i.test(attempt.result || ""));
    const booking = scheduled.find((entry) => sameStudentName(entry.student, student.studentName) && canonicalTestCode(entry.test) === test);
    const recent = scores.at(-1) ?? null;
    const highest = scores.length ? Math.max(...scores) : null;
    const qualifying = scores.filter((score) => score >= config.readinessScore).length;
    const trend = scores.length < 2 ? "insufficient" : recent > scores.at(-2) ? "improving" : recent < scores.at(-2) ? "declining" : "steady";
    return { test, status: actualPassed ? "passed" : actualFailed ? "not_passed" : booking ? "scheduled" : "no_record", actualCompletedAt: actualPassed?.takenAt || actualPassed?.date || null, scheduledDate: booking?.date || null, practice: { attempts: scores.length, mostRecentDate: matchingAttempts.at(-1)?.takenAt || matchingAttempts.at(-1)?.date || null, mostRecentScore: recent, highestScore: highest, qualifyingAttempts: qualifying, ready: qualifying >= config.readinessAttempts, trend } };
  });
}

export function stageCrossReference(milestone, student, requests = []) {
  const target = normalizedKey(`${milestone.course} ${milestone.rawLabel}`);
  const matching = requests.filter((request) => sameStudentName(request.student, student.studentName)).map((request) => {
    const candidate = normalizedKey(`${request.course || ""} ${request.checkType || ""}`);
    const tokens = target.split(" ").filter((token) => token.length > 1);
    const overlap = tokens.filter((token) => candidate.includes(token)).length;
    return { request, score: overlap / Math.max(tokens.length, 1) };
  }).filter((candidate) => candidate.score >= 0.35).sort((a, b) => b.score - a.score)[0]?.request;
  if (!matching) return { status: "unscheduled", scheduledAt: null, completedAt: null, result: null };
  const completedAt = matching.completedAt || matching.actualCompletionDate || null;
  return { status: completedAt ? "completed" : matching.scheduledAt ? "scheduled" : "unscheduled", scheduledAt: matching.scheduledAt || null, completedAt, result: matching.result || matching.statusResult || null };
}

export function dateDifferenceDays(date, today = new Date()) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Number.isNaN(target.getTime()) ? null : Math.round((target - localToday) / 86400000);
}

export function evaluateMilestone(milestone, context = {}, today = new Date(), config = SAP_CONFIG) {
  const daysRemaining = dateDifferenceDays(milestone.projectedDate, today);
  const written = milestone.normalizedType === "written_test" ? writtenCrossReference(milestone, context.student || {}, context.writtenAttempts || [], context.writtenScheduled || [], config) : [];
  const stage = ["stage_check", "progress_check", "end_of_course"].includes(milestone.normalizedType) ? stageCrossReference(milestone, context.student || {}, context.stageRequests || []) : null;
  const actualDate = milestone.actualCompletionDate || written.length && written.every((test) => test.status === "passed") && written.map((test) => test.actualCompletedAt).filter(Boolean).sort().at(-1) || stage?.completedAt || null;
  const completed = Boolean(actualDate || milestone.completionStatus === "completed");
  let status = completed ? "completed" : !milestone.projectedDate ? milestone.dateStatus === "tbd" ? "tbd" : "unscheduled" : daysRemaining < 0 ? "overdue" : daysRemaining === 0 ? "due_today" : daysRemaining <= 7 ? "due_7" : daysRemaining <= 14 ? "due_14" : daysRemaining <= 30 ? "due_30" : "upcoming";
  let priority = completed ? "informational" : status === "overdue" || status === "due_today" ? "critical" : status === "due_7" ? "high" : status === "due_14" ? "medium" : "informational";
  const warnings = [];
  if (milestone.conflict) warnings.push("Data conflict");
  if (written.length) {
    const incomplete = written.filter((test) => test.status !== "passed");
    if (incomplete.length && daysRemaining !== null && daysRemaining <= 7) priority = daysRemaining < 0 ? "critical" : "high";
    incomplete.forEach((test) => {
      if (!test.practice.attempts && daysRemaining !== null && daysRemaining <= 30) warnings.push(`${test.test}: missing practice test`);
      else if (!test.practice.ready && daysRemaining !== null && daysRemaining <= 14) warnings.push(`${test.test}: practice score below readiness threshold`);
      if (!test.scheduledDate && test.practice.ready) warnings.push(`${test.test}: ready but no written test scheduled`);
    });
    if (incomplete.length && incomplete.length < written.length) warnings.push("Combined written milestone is partially complete");
  }
  if (stage && stage.status !== "completed" && daysRemaining !== null && daysRemaining <= 7 && stage.status === "unscheduled") warnings.push("Progress or stage check is not scheduled");
  return { ...milestone, actualCompletionDate: actualDate || milestone.actualCompletionDate || null, completionStatus: completed ? "completed" : "incomplete", status, priority, daysRemaining, written, stage, warnings };
}

export function compareImport(existingMilestones = [], importedMilestones = []) {
  const key = (item) => `${normalizedKey(item.course)}|${normalizedKey(item.originalLabel || item.rawLabel)}`;
  const existing = new Map(existingMilestones.map((item) => [key(item), item]));
  const incoming = new Map(importedMilestones.map((item) => [key(item), item]));
  return {
    added: importedMilestones.filter((item) => !existing.has(key(item))),
    removed: existingMilestones.filter((item) => !incoming.has(key(item))),
    changed: importedMilestones.filter((item) => existing.has(key(item)) && existing.get(key(item)).projectedDate !== item.projectedDate).map((item) => ({ previous: existing.get(key(item)), next: item })),
    unchanged: importedMilestones.filter((item) => existing.has(key(item)) && existing.get(key(item)).projectedDate === item.projectedDate)
  };
}

export function preserveActualCompletion(existing = {}, projectedUpdate = {}) {
  return {
    ...projectedUpdate,
    actualCompletionDate: existing.actualCompletionDate || projectedUpdate.actualCompletionDate || null,
    completionStatus: existing.actualCompletionDate ? "completed" : existing.completionStatus || projectedUpdate.completionStatus || "incomplete",
    manuallyCompleted: existing.manuallyCompleted ?? projectedUpdate.manuallyCompleted ?? false,
    completedAt: existing.completedAt || projectedUpdate.completedAt || null,
    completedBy: existing.completedBy || projectedUpdate.completedBy || null,
    completionHistory: existing.completionHistory || projectedUpdate.completionHistory || [],
    actualResult: existing.actualResult || projectedUpdate.actualResult || null,
    instructorNotes: existing.instructorNotes || projectedUpdate.instructorNotes || null
  };
}
