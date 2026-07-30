import { groundAttendanceCountForStudent, groundAttendanceCounts } from "./ground-attendance-utils.js";

const DAY_MS = 86400000;

export function zonedDateKey(date = new Date(), timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToDateKey(dateKey, days) {
  const date = dateKeyToUtc(dateKey);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function nightCurrencyStatus(currencyDate, todayDate) {
  const start = dateKeyToUtc(currencyDate);
  const today = dateKeyToUtc(todayDate);
  if (!start || !today) return null;
  const expirationDate = addDaysToDateKey(currencyDate, 90);
  const expiration = dateKeyToUtc(expirationDate);
  const daysRemaining = Math.round((expiration - today) / DAY_MS);
  return {
    expirationDate,
    daysRemaining,
    state: daysRemaining > 0 ? "current" : daysRemaining === 0 ? "expires_today" : "expired"
  };
}

export function instructorStudentAttendance(student = {}, groundAttendance = [], myfboAttendance = []) {
  const nameKey = attendanceNameKey(student.studentName);
  const groundSchoolCount = groundAttendanceCountForStudent(student, groundAttendanceCounts(groundAttendance));
  const studentIds = new Set([student.id, student.studentId, student.myfboStudentId].filter(Boolean).map(String));
  const myfbo = (Array.isArray(myfboAttendance) ? myfboAttendance : []).find((record) => {
    const recordIds = [record.id, record.studentId, record.myfboStudentId].filter(Boolean).map(String);
    return recordIds.some((id) => studentIds.has(id)) || (nameKey && attendanceNameKey(record.studentName) === nameKey);
  }) || null;
  const rate = Number(myfbo?.metrics?.attendanceRate);
  return {
    groundSchoolCount,
    myfbo,
    myfboRate: Number.isFinite(rate) ? rate : null
  };
}

function attendanceNameKey(value) {
  const parts = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : parts[0] || "";
}

export function civilTwilightTimes(date = new Date(), latitude = 28.5455, longitude = -81.3329) {
  const dateKey = zonedDateKey(date, "America/New_York");
  const dawn = solarEvent(dateKey, latitude, longitude, 96, true);
  let dusk = solarEvent(dateKey, latitude, longitude, 96, false);
  if (dawn && dusk && dusk <= dawn) dusk = new Date(dusk.getTime() + DAY_MS);
  return {
    dawn,
    dusk
  };
}

function dateKeyToUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function solarEvent(dateKey, latitude, longitude, zenith, morning) {
  const base = dateKeyToUtc(dateKey);
  if (!base) return null;
  const startOfYear = Date.UTC(base.getUTCFullYear(), 0, 0);
  const day = Math.floor((base.getTime() - startOfYear) / DAY_MS);
  const longitudeHour = longitude / 15;
  const approximateTime = day + ((morning ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = 0.9856 * approximateTime - 3.289;
  let trueLongitude = meanAnomaly + 1.916 * sinDegrees(meanAnomaly) + 0.02 * sinDegrees(2 * meanAnomaly) + 282.634;
  trueLongitude = normalizeDegrees(trueLongitude);
  let rightAscension = normalizeDegrees(toDegrees(Math.atan(0.91764 * Math.tan(toRadians(trueLongitude)))));
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;
  const sinDeclination = 0.39782 * sinDegrees(trueLongitude);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosineHour = (Math.cos(toRadians(zenith)) - sinDeclination * sinDegrees(latitude)) / (cosDeclination * Math.cos(toRadians(latitude)));
  if (cosineHour < -1 || cosineHour > 1) return null;
  let localHour = morning ? 360 - toDegrees(Math.acos(cosineHour)) : toDegrees(Math.acos(cosineHour));
  localHour /= 15;
  const localMeanTime = localHour + rightAscension - 0.06571 * approximateTime - 6.622;
  const utcHours = normalizeHours(localMeanTime - longitudeHour);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + utcHours * 3600000);
}

function toRadians(value) { return value * Math.PI / 180; }
function toDegrees(value) { return value * 180 / Math.PI; }
function sinDegrees(value) { return Math.sin(toRadians(value)); }
function normalizeDegrees(value) { return ((value % 360) + 360) % 360; }
function normalizeHours(value) { return ((value % 24) + 24) % 24; }
