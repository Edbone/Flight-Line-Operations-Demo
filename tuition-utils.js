const TUITION_COLUMNS = [
  "studentName",
  "paymentDescription",
  "amount",
  "dueDate",
  "paid",
  "datePaid",
  "status"
];

const HEADER_ALIASES = {
  studentName: ["student name", "student", "name"],
  paymentDescription: ["payment description", "description", "payment", "tuition"],
  amount: ["amount", "total", "charge"],
  dueDate: ["due date", "due", "date due"],
  paid: ["paid", "paid?"],
  datePaid: ["date paid", "paid date", "payment date"],
  status: ["status"]
};

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

export function parseAmount(value) {
  const cleaned = String(value ?? "").trim().replace(/\$/g, "").replace(/,/g, "");
  if (!cleaned) return { value: null, valid: false };
  const amount = Number(cleaned);
  return { value: Number.isFinite(amount) ? amount : null, valid: Number.isFinite(amount) };
}

export function parseDateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: "", valid: false };

  const localDateMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (localDateMatch) {
    const month = Number(localDateMatch[1]);
    const day = Number(localDateMatch[2]);
    const year = Number(localDateMatch[3].length === 2 ? `20${localDateMatch[3]}` : localDateMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { value: toIsoDate(date), valid: true };
    }
    return { value: "", valid: false };
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return { value: toIsoDate(date), valid: true };
    }
  }

  return { value: "", valid: false };
}

export function formatDate(value) {
  if (!value) return "";
  const parsed = parseDateValue(value);
  if (!parsed.valid) return "";
  const [year, month, day] = parsed.value.split("-");
  return `${month}/${day}/${year}`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export function normalizePaid(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["yes", "y", "true", "paid", "1", "x"].includes(raw);
}

export function calculateTuitionStatus(record, today = new Date()) {
  const normalized = normalizeTuitionRecord(record, today);
  return normalized.status;
}

export function normalizeTuitionRecord(record, today = new Date()) {
  const studentName = String(record?.studentName || "").trim().replace(/\s+/g, " ");
  const paymentDescription = String(record?.paymentDescription || "").trim().replace(/\s+/g, " ");
  const amountParse = typeof record?.amount === "number"
    ? { value: record.amount, valid: Number.isFinite(record.amount) }
    : parseAmount(record?.amount);
  const dueDateParse = parseDateValue(record?.dueDate);
  const datePaidRaw = String(record?.datePaid || "").trim();
  const datePaidParse = datePaidRaw ? parseDateValue(datePaidRaw) : { value: "", valid: true };
  const paid = typeof record?.paid === "boolean" ? record.paid : normalizePaid(record?.paid);
  const issues = [];

  if (!studentName) issues.push("Missing student name");
  if (!amountParse.valid) issues.push("Invalid amount");
  if (!dueDateParse.valid) issues.push("Invalid due date");
  if (datePaidRaw && !datePaidParse.valid) issues.push("Invalid date paid");

  let status = "Invalid";
  if (!issues.some((issue) => ["Missing student name", "Invalid amount", "Invalid due date"].includes(issue))) {
    status = getSpreadsheetStatus({ paid, dueDate: dueDateParse.value }, today);
  }

  return {
    id: String(record?.id || crypto.randomUUID()),
    studentName,
    paymentDescription,
    amount: amountParse.value,
    dueDate: dueDateParse.value,
    paid,
    datePaid: datePaidParse.valid ? datePaidParse.value : "",
    status,
    importedBy: String(record?.importedBy || "").trim().toUpperCase(),
    issues
  };
}

export function parseTuitionPayments(text, today = new Date(), options = {}) {
  const input = String(text || "");
  if (!input.trim()) {
    return { records: [], errors: ["No data pasted."], warnings: [], validCount: 0, invalidCount: 0 };
  }

  const lines = input.split(/\r?\n/).filter((line) => line.trim());
  const scheduleRecords = parsePaymentSchedule(lines, options.studentName, today);
  if (scheduleRecords) return buildParseResult(scheduleRecords);

  const rows = lines.map(splitRow);
  if (!rows.length) {
    return { records: [], errors: ["No valid rows found."], warnings: [], validCount: 0, invalidCount: 0 };
  }

  const firstRow = rows[0];
  const headerMap = getHeaderMap(firstRow);
  const dataRows = headerMap ? rows.slice(1) : rows;
  const warnings = [];
  const records = dataRows.map((row, index) => {
    const source = headerMap ? rowFromHeader(row, headerMap) : rowFromDefaultOrder(row);
    const normalized = normalizeTuitionRecord(source, today);
    if (normalized.issues.length) warnings.push(`Row ${index + 1}: ${normalized.issues.join(", ")}`);
    return normalized;
  });

  return buildParseResult(records, warnings);
}

export function sortTuitionRecords(records) {
  return [...records].sort((a, b) => (
    a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base" }) ||
    String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31")) ||
    Number(b.amount || 0) - Number(a.amount || 0)
  ));
}

export function getDuplicateKey(record) {
  return [
    String(record.studentName || "").trim().toLowerCase(),
    String(record.paymentDescription || "").trim().toLowerCase(),
    Number(record.amount || 0).toFixed(2),
    String(record.dueDate || "")
  ].join("|");
}

function buildParseResult(records, warnings = []) {
  const rowWarnings = [...warnings];
  records.forEach((record, index) => {
    if (record.issues?.length && !rowWarnings.some((warning) => warning.startsWith(`Row ${index + 1}:`))) {
      rowWarnings.push(`Row ${index + 1}: ${record.issues.join(", ")}`);
    }
  });
  const validCount = records.filter((record) => record.status !== "Invalid").length;
  const invalidCount = records.length - validCount;
  const errors = records.length ? [] : ["No valid rows found."];
  if (!validCount && records.length) errors.push("No valid rows found.");

  return { records: sortTuitionRecords(records), errors, warnings: rowWarnings, validCount, invalidCount };
}

function getSpreadsheetStatus(record, today) {
  // Mirrors the spreadsheet-style tuition status rules using the current date.
  if (record.paid) return "Paid";
  const due = new Date(`${record.dueDate}T00:00:00Z`);
  const current = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysUntilDue = Math.floor((due - current) / 86400000);
  if (daysUntilDue < 0) return "Past Due";
  if (daysUntilDue <= 30) return "Upcoming";
  return "OK";
}

function splitRow(line) {
  if (line.includes("\t")) return line.split("\t").map((value) => value.trim());
  return repairCommaRow(parseCsvLine(line));
}

function parsePaymentSchedule(lines, studentName, today) {
  if (lines.length < 3) return null;

  const dates = tokenizeScheduleDates(lines[0]);
  const amounts = tokenizeScheduleAmounts(lines[2]);
  if (dates.length < 2 || dates.length !== amounts.length) return null;
  if (!dates.every((value) => parseDateValue(value).valid)) return null;
  if (!amounts.every((value) => parseAmount(value).valid)) return null;

  const descriptions = tokenizeScheduleDescriptions(lines[1], dates.length);
  return dates.map((dueDate, index) => normalizeTuitionRecord({
    studentName,
    paymentDescription: descriptions[index] || "",
    amount: amounts[index] || "",
    dueDate,
    paid: false,
    datePaid: ""
  }, today));
}

function tokenizeScheduleDates(line) {
  return String(line || "").trim().split(/\s+/).filter(Boolean);
}

function tokenizeScheduleAmounts(line) {
  return [...String(line || "").matchAll(/\$?\d[\d,]*(?:\.\d+)?/g)].map((match) => match[0]);
}

function tokenizeScheduleDescriptions(line, count) {
  const split = splitRow(line).filter(Boolean);
  if (split.length === count) return split;

  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length === count) return words;
  if (words.length % count === 0) {
    const wordsPerDescription = words.length / count;
    return Array.from({ length: count }, (_, index) => words.slice(index * wordsPerDescription, (index + 1) * wordsPerDescription).join(" "));
  }

  return Array.from({ length: count }, () => words.join(" "));
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function repairCommaRow(row) {
  if (row.length <= TUITION_COLUMNS.length) return row;
  const dueIndex = row.findIndex((value, index) => index > 2 && parseDateValue(value).valid);
  if (dueIndex <= 2) return row;
  return [
    row[0],
    row[1],
    row.slice(2, dueIndex).join(","),
    ...row.slice(dueIndex)
  ];
}

function getHeaderMap(row) {
  const normalized = row.map(normalizeHeader);
  const hasHeaderSignal = normalized.some((value) => value.includes("student")) &&
    normalized.some((value) => value.includes("amount")) &&
    normalized.some((value) => value.includes("due"));
  if (!hasHeaderSignal) return null;

  return TUITION_COLUMNS.reduce((map, key) => {
    const index = normalized.findIndex((value) => HEADER_ALIASES[key].includes(value));
    if (index >= 0) map[key] = index;
    return map;
  }, {});
}

function rowFromHeader(row, headerMap) {
  return TUITION_COLUMNS.reduce((record, key) => {
    record[key] = row[headerMap[key]] ?? "";
    return record;
  }, {});
}

function rowFromDefaultOrder(row) {
  return {
    studentName: row[0] || "",
    paymentDescription: row[1] || "",
    amount: row[2] || "",
    dueDate: row[3] || "",
    paid: row[4] || "",
    datePaid: row[5] || "",
    status: row[6] || ""
  };
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function toIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
