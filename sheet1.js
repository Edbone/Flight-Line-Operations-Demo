import { loadCollectionData, saveCollectionData } from "./firebase.js";

const STORAGE_KEY = "aoa-ground-trainer-bookings-v2";
const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_INCREMENT = 0.5;
const MIN_SLOT_HEIGHT = 34;
const MAX_SLOT_HEIGHT = 52;
const CALENDAR_HEADER_HEIGHT = 62;

const calendar = document.querySelector("#trainer-calendar");
const weekLabel = document.querySelector("#week-label");
const searchInput = document.querySelector("#booking-search");
const dialog = document.querySelector("#booking-dialog");
const form = document.querySelector("#booking-form");
const deleteButton = document.querySelector("#delete-booking");
const dialogTitle = document.querySelector("#booking-dialog-title");
const toast = document.querySelector("#schedule-toast");
const calendarLegend = document.querySelector(".calendar-legend");

let activeTrainer = "trainer1";
let weekStart = getCenteredScheduleStart(new Date());
let bookings = [];
let resizingBookingId = null;
let resizeStartY = 0;
let resizeStartDuration = 0;
let movingBookingId = null;
let moveStartX = 0;
let moveStartY = 0;
let moveHasMoved = false;
let suppressBookingClickId = null;
let slotHeight = MAX_SLOT_HEIGHT;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getMonday(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function getCenteredScheduleStart(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - 3);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatTime(value) {
  const hour = Math.floor(value);
  const minutes = value % 1 ? 30 : 0;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  const paddedMinutes = String(minutes).padStart(2, "0");
  return `${displayHour}:${paddedMinutes} ${suffix}`;
}

function formatRange(booking) {
  const start = Number(booking.startHour);
  const end = start + Number(booking.duration);
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function seedBookings() {
  const monday = getMonday(new Date());
  return [
    { id: crypto.randomUUID(), trainer: "trainer1", name: "Eddie Jackson", initials: "EJ", date: dateKey(addDays(monday, 2)), startHour: 7, duration: 3, type: "lesson", notes: "BTU" },
    { id: crypto.randomUUID(), trainer: "trainer1", name: "Room Reservation", initials: "RR", date: dateKey(addDays(monday, 4)), startHour: 10, duration: 1, type: "reservation", notes: "" },
    { id: crypto.randomUUID(), trainer: "trainer2", name: "Sandra Lee", initials: "SL", date: dateKey(addDays(monday, 3)), startHour: 10, duration: 2, type: "lesson", notes: "Sim" }
  ];
}

async function loadBookings() {
  const loaded = await loadCollectionData("trainer-bookings", STORAGE_KEY);
  return Array.isArray(loaded) && loaded.length > 0 ? loaded : seedBookings();
}

async function saveBookings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  await saveCollectionData("trainer-bookings", bookings);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setWeekLabel() {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startText = weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endText = end.toLocaleDateString("en-US", { month: sameMonth ? undefined : "long", day: "numeric", year: "numeric" });
  weekLabel.textContent = `${startText} - ${endText}`;
}

function overlaps(booking, targetDate, targetHour, ignoreId = "") {
  const targetEnd = targetHour + Number(booking.duration);
  return bookings.some((item) => {
    if (item.id === ignoreId || item.trainer !== booking.trainer || item.date !== targetDate) return false;
    const itemStart = Number(item.startHour);
    const itemEnd = itemStart + Number(item.duration);
    return targetHour < itemEnd && targetEnd > itemStart;
  });
}

function calculateSlotHeight() {
  const availableHeight = window.innerHeight
    - calendar.getBoundingClientRect().top
    - calendarLegend.offsetHeight
    - CALENDAR_HEADER_HEIGHT
    - 12;
  const totalRows = Math.round((END_HOUR - START_HOUR) / SLOT_INCREMENT);
  const fittedHeight = Math.floor(availableHeight / totalRows);
  return Math.max(MIN_SLOT_HEIGHT, Math.min(MAX_SLOT_HEIGHT, fittedHeight));
}

function createBookingElement(booking) {
  const item = document.createElement("button");
  item.className = `calendar-booking booking-${booking.type}`;
  item.type = "button";
  item.dataset.bookingId = booking.id;
  item.style.top = `${((Number(booking.startHour) - START_HOUR) / SLOT_INCREMENT) * slotHeight + 3}px`;
  item.style.height = `${(Number(booking.duration) / SLOT_INCREMENT) * slotHeight - 6}px`;
  item.innerHTML = `<strong>${escapeHtml(booking.name)}</strong><span>${formatRange(booking)}${booking.initials ? ` · ${escapeHtml(booking.initials)}` : ""}</span>${booking.notes ? `<small>${escapeHtml(booking.notes)}</small>` : ""}`;
  item.addEventListener("click", () => {
    if (suppressBookingClickId === booking.id) {
      suppressBookingClickId = null;
      return;
    }
    openEditDialog(booking.id);
  });
  item.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".booking-resize-handle")) return;
    startBookingMove(event, booking.id, item);
  });

  const resizeHandle = document.createElement("span");
  resizeHandle.className = "booking-resize-handle";
  resizeHandle.title = "Drag to resize";
  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resizingBookingId = booking.id;
    resizeStartY = event.clientY;
    resizeStartDuration = Number(booking.duration);
    window.addEventListener("pointermove", handleResizePointerMove);
    window.addEventListener("pointerup", handleResizePointerUp, { once: true });
  });
  item.append(resizeHandle);
  return item;
}

function startBookingMove(event, bookingId, element) {
  event.preventDefault();
  movingBookingId = bookingId;
  moveStartX = event.clientX;
  moveStartY = event.clientY;
  moveHasMoved = false;
  element.setPointerCapture?.(event.pointerId);
  element.classList.add("moving");
  window.addEventListener("pointermove", handleMovePointerMove);
  window.addEventListener("pointerup", handleMovePointerUp, { once: true });
}

function handleMovePointerMove(event) {
  if (!movingBookingId) return;
  const distance = Math.hypot(event.clientX - moveStartX, event.clientY - moveStartY);
  if (distance < 8 && !moveHasMoved) return;
  moveHasMoved = true;
  const target = getMoveTarget(event.clientX, event.clientY);
  document.querySelectorAll(".day-column.drag-over").forEach((column) => column.classList.remove("drag-over"));
  if (target) target.column.classList.add("drag-over");
}

function handleMovePointerUp(event) {
  const id = movingBookingId;
  const didMove = moveHasMoved;
  movingBookingId = null;
  moveHasMoved = false;
  window.removeEventListener("pointermove", handleMovePointerMove);
  document.querySelectorAll(".calendar-booking.moving").forEach((item) => item.classList.remove("moving"));
  document.querySelectorAll(".day-column.drag-over").forEach((column) => column.classList.remove("drag-over"));

  if (!id || !didMove) return;
  suppressBookingClickId = id;
  const booking = bookings.find((item) => item.id === id);
  const target = getMoveTarget(event.clientX, event.clientY);
  if (!booking || !target) {
    showToast("Drop on a day column to move a booking.");
    return;
  }

  const roundedHour = clampAndRoundHour(booking, target.hour);
  const targetDate = target.column.dataset.date;
  if (overlaps(booking, targetDate, roundedHour, booking.id)) {
    showToast("That time overlaps another booking.");
    return;
  }

  booking.date = targetDate;
  booking.startHour = roundedHour;
  saveBookings();
  renderCalendar();
  showToast(`Moved to ${formatTime(roundedHour)}.`);
}

function getMoveTarget(clientX, clientY) {
  const column = [...document.querySelectorAll(".day-column")].find((item) => {
    const rect = item.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
  if (!column) return null;
  const rect = column.getBoundingClientRect();
  const slotIndex = Math.round((clientY - rect.top) / slotHeight);
  return { column, hour: START_HOUR + slotIndex * SLOT_INCREMENT };
}

function clampAndRoundHour(booking, hour) {
  const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR - Number(booking.duration), hour));
  return Math.round(clampedHour / SLOT_INCREMENT) * SLOT_INCREMENT;
}

function clampBookingDuration(booking, duration) {
  const minDuration = SLOT_INCREMENT;
  const maxDuration = END_HOUR - Number(booking.startHour);
  return Math.max(minDuration, Math.min(maxDuration, duration));
}

function handleResizePointerMove(event) {
  if (!resizingBookingId) return;
  const booking = bookings.find((item) => item.id === resizingBookingId);
  if (!booking) return;

  const deltaRows = Math.round((event.clientY - resizeStartY) / slotHeight);
  const newDuration = clampBookingDuration(booking, resizeStartDuration + deltaRows * SLOT_INCREMENT);
  if (newDuration !== booking.duration) {
    booking.duration = newDuration;
    renderCalendar();
  }
}

function handleResizePointerUp() {
  if (!resizingBookingId) return;
  const booking = bookings.find((item) => item.id === resizingBookingId);
  resizingBookingId = null;
  window.removeEventListener("pointermove", handleResizePointerMove);
  if (booking) {
    saveBookings();
    showToast(`Booking duration updated to ${booking.duration} ${booking.duration === 1 ? "hour" : "hours"}.`);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderCalendar() {
  setWeekLabel();
  calendar.replaceChildren();
  slotHeight = calculateSlotHeight();
  calendar.style.setProperty("--slot-height", `${slotHeight}px`);

  const corner = document.createElement("div");
  corner.className = "calendar-corner";
  corner.innerHTML = "<span>Local time</span>";
  calendar.append(corner);

  const today = dateKey(new Date());
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(weekStart, dayIndex);
    const header = document.createElement("div");
    header.className = `day-header${dateKey(date) === today ? " today" : ""}`;
    header.innerHTML = `<span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>${date.getDate()}</strong>`;
    calendar.append(header);
  }

  const timeRail = document.createElement("div");
  timeRail.className = "time-rail";
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.height = `${slotHeight * 2}px`;
    label.textContent = formatTime(hour);
    timeRail.append(label);
  }
  calendar.append(timeRail);

  const totalSlots = Math.round((END_HOUR - START_HOUR) / SLOT_INCREMENT);
  const query = searchInput.value.trim().toLowerCase();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const currentDate = dateKey(addDays(weekStart, dayIndex));
    const column = document.createElement("div");
    column.className = `day-column${currentDate === today ? " today" : ""}`;
    column.dataset.date = currentDate;

    for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += 1) {
      const hourValue = START_HOUR + slotIndex * SLOT_INCREMENT;
      const timeString = `${pad(Math.floor(hourValue))}:${pad(hourValue % 1 ? 30 : 0)}`;
      const slot = document.createElement("button");
      slot.className = "calendar-slot";
      slot.type = "button";
      slot.dataset.time = timeString;
      slot.dataset.value = hourValue;
      slot.title = `Add booking at ${formatTime(hourValue)}`;
      slot.setAttribute("aria-label", `Add booking on ${currentDate} at ${formatTime(hourValue)}`);
      slot.addEventListener("click", () => openNewDialog(currentDate, hourValue));
      slot.style.height = `${slotHeight}px`;
      column.append(slot);
    }

    bookings
      .filter((booking) => booking.trainer === activeTrainer && booking.date === currentDate)
      .filter((booking) => !query || `${booking.name} ${booking.initials || ""} ${booking.notes} ${booking.type}`.toLowerCase().includes(query))
      .forEach((booking) => column.append(createBookingElement(booking)));

    calendar.append(column);
  }
}

function formatTimeValue(value) {
  const hour = Math.floor(value);
  const minutes = value % 1 ? 30 : 0;
  return `${pad(hour)}:${pad(minutes)}`;
}

function openNewDialog(date = dateKey(new Date()), hour = 9) {
  form.reset();
  form.elements.bookingId.value = "";
  form.elements.trainer.value = activeTrainer;
  form.elements.date.value = date;
  form.elements.startTime.value = formatTimeValue(hour);
  form.elements.duration.value = "1";
  form.elements.initials.value = "";
  dialogTitle.textContent = "New booking";
  deleteButton.hidden = true;
  dialog.showModal();
  form.elements.name.focus();
}

function openEditDialog(id) {
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  form.elements.bookingId.value = booking.id;
  form.elements.name.value = booking.name;
  form.elements.trainer.value = booking.trainer;
  form.elements.type.value = booking.type;
  form.elements.initials.value = booking.initials || "";
  form.elements.date.value = booking.date;
  form.elements.startTime.value = formatTimeValue(Number(booking.startHour));
  form.elements.duration.value = booking.duration;
  form.elements.notes.value = booking.notes || "";
  dialogTitle.textContent = "Edit booking";
  deleteButton.hidden = false;
  dialog.showModal();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const id = data.get("bookingId") || crypto.randomUUID();
  const [startHourValue, startMinuteValue] = data.get("startTime").split(":");
  const booking = {
    id,
    name: data.get("name").trim(),
    initials: data.get("initials").trim().toUpperCase(),
    trainer: data.get("trainer"),
    type: data.get("type"),
    date: data.get("date"),
    startHour: Number(startHourValue) + Number(startMinuteValue) / 60,
    duration: Number(data.get("duration")),
    notes: data.get("notes").trim()
  };

  if (!booking.initials) {
    showToast("Initials are required.");
    form.elements.initials.focus();
    return;
  }

  if (booking.startHour < START_HOUR || booking.startHour + booking.duration > END_HOUR) {
    showToast(`Bookings must end by ${formatTime(END_HOUR)}.`);
    return;
  }

  if (overlaps(booking, booking.date, booking.startHour, id)) {
    showToast("That time overlaps another booking.");
    return;
  }

  const index = bookings.findIndex((item) => item.id === id);
  if (index >= 0) bookings[index] = booking;
  else bookings.push(booking);
  saveBookings();
  activeTrainer = booking.trainer;
  updateTabs();
  renderCalendar();
  dialog.close();
  showToast(index >= 0 ? "Booking updated." : "Booking added.");
});

function updateTabs() {
  document.querySelectorAll(".trainer-tab").forEach((tab) => {
    const active = tab.dataset.trainer === activeTrainer;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

document.querySelectorAll(".trainer-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTrainer = tab.dataset.trainer;
    updateTabs();
    renderCalendar();
  });
});

document.querySelector("#previous-week").addEventListener("click", () => {
  weekStart = addDays(weekStart, -7);
  renderCalendar();
});
document.querySelector("#next-week").addEventListener("click", () => {
  weekStart = addDays(weekStart, 7);
  renderCalendar();
});
document.querySelector("#today-week").addEventListener("click", () => {
  weekStart = getCenteredScheduleStart(new Date());
  renderCalendar();
});
document.querySelector("#open-booking-dialog").addEventListener("click", () => openNewDialog());
document.querySelector("#close-booking-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-booking").addEventListener("click", () => dialog.close());
searchInput.addEventListener("input", renderCalendar);
window.addEventListener("resize", () => {
  clearTimeout(renderCalendar.resizeTimer);
  renderCalendar.resizeTimer = setTimeout(renderCalendar, 120);
});
deleteButton.addEventListener("click", () => {
  const id = form.elements.bookingId.value;
  bookings = bookings.filter((item) => item.id !== id);
  saveBookings();
  renderCalendar();
  dialog.close();
  showToast("Booking deleted.");
});

(async () => {
  bookings = await loadBookings();
  renderCalendar();
})();
