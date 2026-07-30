import { loadInstructors } from "./instructor-data.js";
import { loadStudents } from "./student-data.js";
import { loadCollectionData, loadFirestoreCollection } from "./firebase.js";
import { escapeHtml } from "./student-utils.js";
import { civilTwilightTimes, instructorStudentAttendance, nightCurrencyStatus, zonedDateKey } from "./instructor-dashboard-utils.js";

const GROUND_ATTENDANCE_STORAGE_KEY = "aoa-ground-attendance-v1";
const NIGHT_CURRENCY_STORAGE_KEY = "aoa-instructor-night-currency-v1";

await waitForAuth();
const user = window.AOAAuth?.getCurrentUser?.();
if (!user?.isInstructor) {
  window.location.replace("index.html");
} else {
  startInstructorClock();
  bindNightCurrencyCalculator();
  const [students, instructors, groundAttendance, myfboAttendance] = await Promise.all([
    loadStudents(),
    loadInstructors(),
    loadCollectionData("ground_attendance", GROUND_ATTENDANCE_STORAGE_KEY),
    loadFirestoreCollection("attendanceLatest").catch((error) => {
      console.warn("MyFBO attendance could not be loaded for the instructor dashboard", error);
      return [];
    })
  ]);
  const instructor = instructors.find((item) => item.id === user.instructorProfileId);
  const assigned = students.filter((student) => student.assignedInstructorId === user.instructorProfileId
    || (instructor?.name && normalize(student.assignedCFI) === normalize(instructor.name)));
  const search = document.querySelector("#instructor-student-search");
  search.addEventListener("input", () => render(assigned, instructor, search.value, groundAttendance, myfboAttendance));
  render(assigned, instructor, "", groundAttendance, myfboAttendance);
}

function startInstructorClock() {
  const localTime = document.querySelector("#instructor-local-time");
  const localDate = document.querySelector("#instructor-local-date");
  const zuluTime = document.querySelector("#instructor-zulu-time");
  const dawn = document.querySelector("#instructor-civil-dawn");
  const dusk = document.querySelector("#instructor-civil-dusk");
  const localClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" });
  const localDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
  const twilightClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  let twilightDate = "";
  const update = () => {
    const now = new Date();
    localTime.textContent = localClock.format(now);
    localDate.textContent = `${localDay.format(now)} · Local`;
    zuluTime.textContent = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
    const dateKey = zonedDateKey(now);
    if (dateKey !== twilightDate) {
      twilightDate = dateKey;
      const times = civilTwilightTimes(now);
      dawn.textContent = times.dawn ? twilightClock.format(times.dawn) : "Unavailable";
      dusk.textContent = times.dusk ? twilightClock.format(times.dusk) : "Unavailable";
    }
  };
  update();
  window.setInterval(update, 1000);
}

function bindNightCurrencyCalculator() {
  const input = document.querySelector("#night-currency-date");
  const result = document.querySelector("#night-currency-result");
  const clear = document.querySelector("#night-currency-clear");
  const userId = window.AOAAuth?.getCurrentUser?.()?.uid || window.AOAAuth?.getCurrentUser?.()?.id || "current";
  const storageKey = `${NIGHT_CURRENCY_STORAGE_KEY}:${userId}`;
  try {
    input.value = localStorage.getItem(storageKey) || "";
  } catch (error) {
    console.warn("Night currency date could not be restored", error);
  }
  const render = () => {
    const status = nightCurrencyStatus(input.value, zonedDateKey());
    result.className = "night-currency-result";
    if (!status) {
      result.innerHTML = `<span>Expiration</span><strong>Select a date</strong><small>Days remaining will appear here.</small>`;
      return;
    }
    const expiration = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${status.expirationDate}T00:00:00Z`));
    result.classList.add(`is-${status.state}`);
    if (status.state === "current") result.innerHTML = `<span>Night currency status</span><strong>Current</strong><small>${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"} remaining · out of currency ${escapeHtml(expiration)}</small>`;
    else if (status.state === "expires_today") result.innerHTML = `<span>Out of currency ${escapeHtml(expiration)}</span><strong>Expires today</strong><small>0 days remaining</small>`;
    else result.innerHTML = `<span>Out of currency ${escapeHtml(expiration)}</span><strong>${Math.abs(status.daysRemaining)} day${Math.abs(status.daysRemaining) === 1 ? "" : "s"} expired</strong><small>Enter a newer currency date to recalculate.</small>`;
  };
  input.addEventListener("input", () => {
    try {
      if (input.value) localStorage.setItem(storageKey, input.value);
      else localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Night currency date could not be saved", error);
    }
    render();
  });
  clear.addEventListener("click", () => {
    input.value = "";
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Night currency date could not be cleared", error);
    }
    render();
    input.focus();
  });
  render();
}

function render(students, instructor, term, groundAttendance, myfboAttendance) {
  const query = normalize(term);
  const filtered = students
    .filter((student) => !query || [student.studentName, student.currentCourse, student.group, student.aircraft].some((value) => normalize(value).includes(query)))
    .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), undefined, { sensitivity: "base" }));
  document.querySelector("#instructor-home-subtitle").textContent = instructor
    ? `${instructor.name} · students linked to your instructor profile`
    : "Your account needs an instructor-profile link before students can appear here.";
  document.querySelector("#instructor-active-students").textContent = students.filter((student) => student.activeStatus === "Yes").length;
  document.querySelector("#instructor-total-students").textContent = students.length;
  document.querySelector("#instructor-student-count").textContent = `${filtered.length} shown`;
  document.querySelector("#instructor-student-grid").innerHTML = filtered.map((student) => studentCard(student, groundAttendance, myfboAttendance)).join("");
  document.querySelector("#instructor-student-empty").hidden = filtered.length > 0;
}

function studentCard(student, groundAttendance, myfboAttendance) {
  const initials = String(student.studentName || "Student").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const photo = student.photoUrl
    ? `<img class="student-photo" src="${escapeHtml(student.photoUrl)}" alt="${escapeHtml(student.studentName || "Student")} profile photo" loading="lazy" />`
    : `<span class="student-photo student-photo-fallback">${escapeHtml(initials)}</span>`;
  const attendance = instructorStudentAttendance(student, groundAttendance, myfboAttendance);
  const myfboLabel = attendance.myfboRate === null ? "MyFBO: no match" : `MyFBO: ${formatPercent(attendance.myfboRate)}`;
  return `<a class="student-profile-card" href="student-detail.html?id=${encodeURIComponent(student.id)}">
    ${photo}
    <span class="student-profile-content"><span class="student-profile-topline"><span class="student-badge ${student.activeStatus === "Yes" ? "green" : "blue"}">${escapeHtml(student.activeStatus === "Yes" ? "Active" : "Inactive")}</span><span class="student-badge blue">${escapeHtml(student.group || "No group")}</span></span><strong>${escapeHtml(student.studentName)}</strong><span class="student-profile-meta">${escapeHtml(student.currentCourse || "No course")} · ${escapeHtml(student.aircraft || "No aircraft")}</span><span class="instructor-attendance-summary"><span>${escapeHtml(myfboLabel)}</span><span>Ground school: ${attendance.groundSchoolCount}</span></span></span>
  </a>`;
}

function formatPercent(value) {
  return `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function waitForAuth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.AOAAuth?.ready) return window.AOAAuth.ready;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
}
