import { cacheLocalData, loadCollectionData, saveCollectionData } from "./firebase.js";
import { escapeHtml } from "./student-utils.js";

const COLLECTION = "flight-test-room-bookings";
const STORAGE_KEY = "aoa-flight-test-room-bookings-v1";
const START_HOUR = 6;
const END_HOUR = 22;

const els = {
  calendar: document.querySelector("#test-room-calendar"),
  monthLabel: document.querySelector("#test-room-month-label"),
  prevMonth: document.querySelector("#test-room-prev-month"),
  nextMonth: document.querySelector("#test-room-next-month"),
  dialog: document.querySelector("#test-room-dialog"),
  form: document.querySelector("#test-room-form"),
  title: document.querySelector("#test-room-dialog-title"),
  message: document.querySelector("#test-room-message"),
  deleteButton: document.querySelector("#delete-test-room-booking"),
  dayDialog: document.querySelector("#test-room-day-dialog"),
  dayTitle: document.querySelector("#test-room-day-title"),
  dayList: document.querySelector("#test-room-day-list"),
  dayMessage: document.querySelector("#test-room-day-message"),
  addDayBooking: document.querySelector("#add-test-room-day-booking"),
  todayCount: document.querySelector("#test-room-today-count"),
  todayDetail: document.querySelector("#test-room-today-detail"),
  weekCount: document.querySelector("#test-room-week-count"),
  weekDetail: document.querySelector("#test-room-week-detail"),
  nextTime: document.querySelector("#test-room-next-time"),
  nextDetail: document.querySelector("#test-room-next-detail"),
  openTime: document.querySelector("#test-room-open-time"),
  openDetail: document.querySelector("#test-room-open-detail")
};

let cursor = firstOfMonth(new Date());
let bookings = [];
let selectedDay = "";

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function timeToHour(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) + (Number.isFinite(minutes) ? minutes : 0) / 60;
}

function hourToTime(value) {
  return `${pad(Math.floor(value))}:${pad(value % 1 ? 30 : 0)}`;
}

function formatTime(value) {
  const hour = Math.floor(Number(value));
  const minutes = Number(value) % 1 ? 30 : 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${pad(minutes)} ${suffix}`;
}

function formatRange(booking) {
  return `${formatTime(booking.startHour)}-${formatTime(Number(booking.startHour) + Number(booking.duration))}`;
}

function formatShortDate(day) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function normalizeBooking(booking) {
  return {
    id: String(booking?.id || crypto.randomUUID()),
    title: String(booking?.title || booking?.name || "").trim(),
    date: String(booking?.date || ""),
    startHour: Number(booking?.startHour),
    duration: Number(booking?.duration),
    notes: String(booking?.notes || "").trim(),
    deletedAt: booking?.deletedAt || "",
    bookedAt: booking?.bookedAt || new Date().toISOString(),
    createdByUserId: booking?.createdByUserId || "",
    createdByName: booking?.createdByName || "",
    createdByInitials: booking?.createdByInitials || "",
    updatedAt: booking?.updatedAt || "",
    updatedByUserId: booking?.updatedByUserId || "",
    updatedByName: booking?.updatedByName || "",
    updatedByInitials: booking?.updatedByInitials || ""
  };
}

function activeBookings() {
  return bookings.filter((booking) => {
    if (booking.deletedAt) return false;
    if (!booking.date || !booking.title) return false;
    if (!Number.isFinite(Number(booking.startHour)) || !Number.isFinite(Number(booking.duration))) return false;
    return Number(booking.duration) > 0;
  });
}

function bookingsForDate(day) {
  return activeBookings()
    .filter((booking) => booking.date === day)
    .sort((a, b) => Number(a.startHour) - Number(b.startHour));
}

function upcomingBookings(now = new Date()) {
  const today = dateKey(now);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  return activeBookings()
    .filter((booking) => booking.date > today || (booking.date === today && Number(booking.startHour) + Number(booking.duration) > currentHour))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.startHour) - Number(b.startHour));
}

function overlaps(candidate, ignoreId = "") {
  const start = Number(candidate.startHour);
  const end = start + Number(candidate.duration);
  return activeBookings().some((booking) => {
    if (booking.id === ignoreId || booking.date !== candidate.date) return false;
    const bookingStart = Number(booking.startHour);
    const bookingEnd = bookingStart + Number(booking.duration);
    return start < bookingEnd && end > bookingStart;
  });
}

function clearMessage() {
  els.message.textContent = "";
  els.message.hidden = true;
}

function showMessage(message) {
  els.message.textContent = message;
  els.message.hidden = false;
}

function clearDayMessage() {
  if (!els.dayMessage) return;
  els.dayMessage.textContent = "";
  els.dayMessage.hidden = true;
}

function showDayMessage(message) {
  if (!els.dayMessage) return;
  els.dayMessage.textContent = message;
  els.dayMessage.hidden = false;
}

function renderCalendar() {
  if (!els.calendar) return;
  els.monthLabel.textContent = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  els.calendar.replaceChildren();

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label) => {
    const header = document.createElement("span");
    header.className = "home-room-weekday";
    header.textContent = label;
    els.calendar.append(header);
  });

  const start = addDays(cursor, -cursor.getDay());
  const today = dateKey(new Date());
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const day = dateKey(date);
    const dayBookings = bookingsForDate(day);
    const button = document.createElement("button");
    button.className = "home-room-day";
    button.type = "button";
    button.dataset.date = day;
    button.classList.toggle("outside", date.getMonth() !== cursor.getMonth());
    button.classList.toggle("today", day === today);
    button.classList.toggle("has-bookings", dayBookings.length > 0);
    if (dayBookings.length) {
      button.title = dayBookings.map((booking) => `${formatRange(booking)} ${booking.title}`).join("\n");
    }
    button.innerHTML = `
      <span>${date.getDate()}</span>
      ${dayBookings.slice(0, 2).map((booking) => `<strong>${escapeHtml(formatRange(booking))} ${escapeHtml(booking.title)}</strong>`).join("")}
      ${dayBookings.length > 2 ? `<em>+${dayBookings.length - 2} more</em>` : ""}
    `;
    button.addEventListener("click", () => {
      if (dayBookings.length) openDayDialog(day);
      else openNewDialog(day);
    });
    els.calendar.append(button);
  }
  renderMetrics();
}

function renderMetrics() {
  if (!els.todayCount) return;
  const now = new Date();
  const today = dateKey(now);
  const weekStart = addDays(now, -(now.getDay() || 0));
  const weekDays = new Set(Array.from({ length: 7 }, (_, index) => dateKey(addDays(weekStart, index))));
  const todayBookings = bookingsForDate(today);
  const weekBookings = activeBookings().filter((booking) => weekDays.has(booking.date));
  const nextBooking = upcomingBookings(now)[0] || null;
  const openSlot = findNextOpenSlot(now);

  els.todayCount.textContent = String(todayBookings.length);
  els.todayDetail.textContent = todayBookings[0]
    ? `${formatRange(todayBookings[0])} ${todayBookings[0].title}`
    : "No bookings today";
  els.weekCount.textContent = String(weekBookings.length);
  els.weekDetail.textContent = weekBookings.length
    ? `${new Set(weekBookings.map((booking) => booking.date)).size} active day${new Set(weekBookings.map((booking) => booking.date)).size === 1 ? "" : "s"}`
    : "No bookings this week";
  els.nextTime.textContent = nextBooking ? formatTime(nextBooking.startHour) : "Open";
  els.nextDetail.textContent = nextBooking
    ? `${formatShortDate(nextBooking.date)} · ${nextBooking.title}`
    : "No upcoming bookings";
  els.openTime.textContent = openSlot ? formatTime(openSlot.hour) : "Full";
  els.openDetail.textContent = openSlot ? `${formatShortDate(openSlot.date)} for 1 hour` : "No one-hour opening found";
}

function findNextOpenSlot(now = new Date()) {
  const currentHour = now.getHours() + now.getMinutes() / 60;
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const date = addDays(now, dayOffset);
    const day = dateKey(date);
    const start = dayOffset === 0
      ? Math.max(START_HOUR, Math.ceil(currentHour * 2) / 2)
      : START_HOUR;
    for (let hour = start; hour <= END_HOUR - 1; hour += 0.5) {
      if (!overlaps({ id: "__open-slot__", date: day, startHour: hour, duration: 1 }, "__open-slot__")) {
        return { date: day, hour };
      }
    }
  }
  return null;
}

function openNewDialog(day) {
  els.form.reset();
  clearMessage();
  els.title.textContent = "Book test room";
  els.form.elements.bookingId.value = "";
  els.form.elements.date.value = day;
  els.form.elements.startTime.value = "09:00";
  els.form.elements.duration.value = "1";
  els.deleteButton.hidden = true;
  els.dialog.showModal();
  els.form.elements.title.focus();
}

function openEditDialog(id) {
  const booking = activeBookings().find((item) => item.id === id);
  if (!booking) return;
  els.form.reset();
  clearMessage();
  els.title.textContent = "Edit test room booking";
  els.form.elements.bookingId.value = booking.id;
  els.form.elements.title.value = booking.title;
  els.form.elements.date.value = booking.date;
  els.form.elements.startTime.value = hourToTime(Number(booking.startHour));
  els.form.elements.duration.value = String(booking.duration);
  els.form.elements.notes.value = booking.notes || "";
  els.deleteButton.hidden = false;
  els.dayDialog?.close();
  els.dialog.showModal();
  els.form.elements.title.focus();
}

function openDayDialog(day) {
  selectedDay = day;
  clearDayMessage();
  renderDayDialog();
  els.dayDialog?.showModal();
}

function renderDayDialog() {
  const dayBookings = bookingsForDate(selectedDay);
  if (els.dayTitle) els.dayTitle.textContent = `${formatShortDate(selectedDay)} bookings`;
  if (!els.dayList) return;
  els.dayList.innerHTML = dayBookings.length
    ? dayBookings.map((booking) => `
      <article class="test-room-day-booking">
        <div>
          <strong>${escapeHtml(booking.title)}</strong>
          <span>${escapeHtml(formatRange(booking))}${booking.notes ? ` · ${escapeHtml(booking.notes)}` : ""}</span>
        </div>
        <div class="test-room-day-actions">
          <button class="button quiet" type="button" data-edit-test-room="${escapeHtml(booking.id)}">Edit</button>
          <button class="button danger-button" type="button" data-remove-test-room="${escapeHtml(booking.id)}">Remove</button>
        </div>
      </article>
    `).join("")
    : `<div class="home-empty-state">No bookings on this day.</div>`;
}

async function saveBookings(options = {}) {
  cacheLocalData(STORAGE_KEY, bookings);
  const result = await saveCollectionData(COLLECTION, bookings, { ...options, returnStatus: true });
  bookings = Array.isArray(result.items) ? result.items.map(normalizeBooking) : bookings;
  cacheLocalData(STORAGE_KEY, bookings);
  return Boolean(result.remoteSaved);
}

els.prevMonth?.addEventListener("click", () => {
  cursor = addMonths(cursor, -1);
  renderCalendar();
});

els.nextMonth?.addEventListener("click", () => {
  cursor = addMonths(cursor, 1);
  renderCalendar();
});

document.querySelector("#close-test-room-dialog")?.addEventListener("click", () => els.dialog.close());
document.querySelector("#cancel-test-room-dialog")?.addEventListener("click", () => els.dialog.close());
document.querySelector("#close-test-room-day-dialog")?.addEventListener("click", () => els.dayDialog?.close());
document.querySelector("#cancel-test-room-day-dialog")?.addEventListener("click", () => els.dayDialog?.close());
els.addDayBooking?.addEventListener("click", () => {
  els.dayDialog?.close();
  openNewDialog(selectedDay || dateKey(new Date()));
});
els.dayList?.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit-test-room]")?.dataset.editTestRoom;
  const removeId = event.target.closest("[data-remove-test-room]")?.dataset.removeTestRoom;
  if (editId) openEditDialog(editId);
  if (removeId) await removeBooking(removeId, { keepDayDialogOpen: true });
});
els.form?.addEventListener("input", clearMessage);

els.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const staff = window.AOAAuth?.getCurrentUser?.();
  if (!staff) {
    showMessage("Please sign in before booking the test room.");
    return;
  }

  const data = new FormData(els.form);
  const id = String(data.get("bookingId") || crypto.randomUUID());
  const existing = bookings.find((booking) => booking.id === id);
  const startHour = timeToHour(data.get("startTime"));
  const booking = normalizeBooking({
    ...existing,
    id,
    title: data.get("title"),
    date: data.get("date"),
    startHour,
    duration: Number(data.get("duration")),
    notes: data.get("notes"),
    bookedAt: existing?.bookedAt || new Date().toISOString(),
    createdByUserId: existing?.createdByUserId || staff.id || "",
    createdByName: existing?.createdByName || staff.name || "",
    createdByInitials: existing?.createdByInitials || staff.initials || "",
    updatedAt: new Date().toISOString(),
    updatedByUserId: staff.id || "",
    updatedByName: staff.name || "",
    updatedByInitials: staff.initials || ""
  });

  if (!booking.title) {
    showMessage("Add a name or test for the reservation.");
    return;
  }
  if (booking.startHour < START_HOUR || booking.startHour + booking.duration > END_HOUR) {
    showMessage(`Bookings must stay between ${formatTime(START_HOUR)} and ${formatTime(END_HOUR)}.`);
    return;
  }
  if (overlaps(booking, id)) {
    showMessage("That time overlaps another test room booking.");
    return;
  }

  const index = bookings.findIndex((item) => item.id === id);
  if (index >= 0) bookings[index] = booking;
  else bookings.push(booking);

  event.submitter.disabled = true;
  try {
    await saveBookings();
    renderCalendar();
    els.dialog.close();
  } catch (error) {
    console.warn("Test room booking save failed", error);
    showMessage("Database save failed. Try again.");
  } finally {
    event.submitter.disabled = false;
  }
});

els.deleteButton?.addEventListener("click", async () => {
  const id = els.form.elements.bookingId.value;
  await removeBooking(id);
});

async function removeBooking(id, options = {}) {
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  booking.deletedAt = new Date().toISOString();
  booking.updatedAt = booking.deletedAt;
  Object.assign(booking, window.AOAAuth?.staffStamp?.("updated") || {});
  try {
    await saveBookings();
    renderCalendar();
    if (options.keepDayDialogOpen) {
      renderDayDialog();
      if (!bookingsForDate(selectedDay).length) {
        showDayMessage("No bookings remain for this day.");
      }
    } else {
      els.dialog.close();
    }
  } catch (error) {
    console.warn("Test room booking delete failed", error);
    if (options.keepDayDialogOpen) showDayMessage("Database delete failed. Try again.");
    else showMessage("Database delete failed. Try again.");
  }
}

(async () => {
  const loaded = await loadCollectionData(COLLECTION, STORAGE_KEY);
  bookings = Array.isArray(loaded) ? loaded.map(normalizeBooking) : [];
  renderCalendar();
})();
