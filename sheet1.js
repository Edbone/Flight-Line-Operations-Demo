import { cacheLocalData, loadCollectionData, saveCollectionData } from "./firebase.js";
import { attachStudentNameDatalists, findStudentByName } from "./student-directory.js";
import {
  TRAINER_CHECKIN_POLICY_START_DATE,
  TRAINER_LESSON_WITH_INSTRUCTOR,
  TRAINER_LESSON_WITHOUT_INSTRUCTOR,
  isCountedTrainerNoShow,
  isTrainerBookingCoveredByCheckinPolicy,
  normalizeTrainerLessonType,
  trainerBookingBlocksTime
} from "./trainer-attendance-utils.js";

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
const checkInButton = document.querySelector("#check-in-booking");
const noShowButton = document.querySelector("#no-show-booking");
const dialogTitle = document.querySelector("#booking-dialog-title");
const toast = document.querySelector("#schedule-toast");
const calendarLegend = document.querySelector(".calendar-legend");
const bookingDetails = document.querySelector("#booking-details");
const bookingMessage = document.querySelector("#booking-message");

let activeTrainer = "trainer1";
let weekStart = getCenteredScheduleStart(new Date());
let bookings = [];
let studentDirectory = [];
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

function formatSessionDate(dateKeyValue) {
  const date = new Date(`${dateKeyValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKeyValue || "Not set";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatBookedAt(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSlot(date, startHour) {
  return `${formatSessionDate(date)} · ${formatTime(Number(startHour))}`;
}

function formatMoveDetails(booking) {
  if (!booking.movedAt) return "Not moved";
  const movedBy = booking.movedByName || booking.movedBy;
  const movedByText = movedBy ? ` by ${movedBy}` : "";
  const previousSlot = booking.movedFromDate ? ` from ${formatSlot(booking.movedFromDate, booking.movedFromStartHour)}` : "";
  return `${formatBookedAt(booking.movedAt)}${movedByText}${previousSlot}`;
}

function formatAttendanceDetails(booking) {
  if (isCountedTrainerNoShow(booking)) {
    const staff = booking.noShowByName || booking.noShowByInitials || "Staff";
    return `Ground trainer no-show · marked ${formatBookedAt(booking.noShowAt)} by ${staff}`;
  }
  if (!isTrainerBookingCoveredByCheckinPolicy(booking)) {
    return `Grandfathered · check-in policy begins ${formatSessionDate(TRAINER_CHECKIN_POLICY_START_DATE)}`;
  }
  if (normalizeTrainerLessonType(booking) === TRAINER_LESSON_WITH_INSTRUCTOR) {
    return "With instructor · attendance is recorded by the main attendance tracking script";
  }
  if (!booking?.checkedInAt) return "Not checked in · does not count toward attendance";
  const staff = booking.checkedInByName || booking.checkedInByInitials || "Staff";
  return `Checked in ${formatBookedAt(booking.checkedInAt)} by ${staff}`;
}

function currentStaff() {
  return window.AOAAuth?.getCurrentUser?.() || null;
}

function currentInitials() {
  return window.AOAAuth?.getCurrentUserInitials?.() || "";
}

function staffDisplay(record = {}) {
  return record.createdByName || record.bookedByName || record.updatedByName || record.initials || "Not recorded";
}

function applyMoveMetadata(booking, previousBooking) {
  const staff = currentStaff();
  booking.movedAt = new Date().toISOString();
  booking.movedBy = staff?.initials || booking.initials || "";
  booking.movedByName = staff?.name || "";
  booking.movedByUserId = staff?.id || "";
  booking.movedFromDate = previousBooking.date;
  booking.movedFromStartHour = Number(previousBooking.startHour);
  booking.movedFromTrainer = previousBooking.trainer;
}

function seedBookings() {
  const monday = getMonday(new Date());
  const bookedAt = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), trainer: "trainer1", name: "Room Reservation", initials: "RR", date: dateKey(addDays(monday, 4)), startHour: 10, duration: 1, type: "reservation", notes: "", bookedAt },
    { id: crypto.randomUUID(), trainer: "trainer2", name: "Trainer Reservation", initials: "TR", date: dateKey(addDays(monday, 3)), startHour: 10, duration: 2, type: "reservation", notes: "Sim", bookedAt }
  ];
}

async function loadBookings() {
  const loaded = await loadCollectionData("trainer-bookings", STORAGE_KEY);
  const source = Array.isArray(loaded) && loaded.length > 0 ? loaded : seedBookings();
  return source.map(normalizeBooking);
}

async function saveBookings(options = {}) {
  cacheLocalData(STORAGE_KEY, bookings);
  const result = await saveCollectionData("trainer-bookings", bookings, { ...options, returnStatus: true });
  bookings = Array.isArray(result.items) ? result.items.map(normalizeBooking) : bookings;
  cacheLocalData(STORAGE_KEY, bookings);
  return Boolean(result.remoteSaved);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function clearBookingMessage() {
  if (!bookingMessage) return;
  bookingMessage.textContent = "";
  bookingMessage.hidden = true;
}

function showBookingMessage(message) {
  if (!bookingMessage) {
    showToast(message);
    return;
  }
  bookingMessage.textContent = message;
  bookingMessage.hidden = false;
  bookingMessage.scrollIntoView({ block: "nearest" });
}

function showBookingBlocker(message) {
  if (dialog.open) showBookingMessage(message);
  else showToast(message);
}

function normalizeBooking(booking) {
  return {
    ...booking,
    id: String(booking?.id || crypto.randomUUID()),
    trainer: booking?.trainer || "trainer1",
    type: normalizeTrainerLessonType(booking),
    name: String(booking?.name || "").trim(),
    date: String(booking?.date || ""),
    startHour: Number(booking?.startHour),
    duration: Number(booking?.duration),
    deletedAt: booking?.deletedAt || ""
  };
}

function isActiveBooking(booking) {
  if (!booking || booking.deletedAt) return false;
  if (!booking.name || !booking.date || !booking.trainer) return false;
  if (!Number.isFinite(Number(booking.startHour)) || !Number.isFinite(Number(booking.duration))) return false;
  return Number(booking.duration) > 0;
}

function activeBookings() {
  return bookings.filter(isActiveBooking);
}

function setSavingButton(button, saving) {
  if (!button) return;
  if (saving) {
    button.dataset.originalText = button.textContent;
    button.textContent = "Saving...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
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
  return activeBookings().some((item) => {
    if (item.id === ignoreId || item.trainer !== booking.trainer || item.date !== targetDate) return false;
    if (!trainerBookingBlocksTime(item)) return false;
    const itemStart = Number(item.startHour);
    const itemEnd = itemStart + Number(item.duration);
    return targetHour < itemEnd && targetEnd > itemStart;
  });
}

function bookingStart(booking) {
  return Number(booking.startHour);
}

function bookingEnd(booking) {
  return bookingStart(booking) + Number(booking.duration);
}

function layoutOverlappingBookings(dayBookings) {
  const sorted = [...dayBookings].sort((first, second) => {
    const startDiff = bookingStart(first) - bookingStart(second);
    if (startDiff) return startDiff;
    return bookingEnd(second) - bookingEnd(first);
  });
  const laidOut = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (!cluster.length) return;
    const lanes = [];
    const clusterItems = cluster.map((booking) => {
      const laneIndex = lanes.findIndex((laneEnd) => laneEnd <= bookingStart(booking));
      const assignedLane = laneIndex >= 0 ? laneIndex : lanes.length;
      lanes[assignedLane] = bookingEnd(booking);
      return { ...booking, overlapLane: assignedLane };
    });
    const overlapCount = lanes.length;
    clusterItems.forEach((booking) => laidOut.push({ ...booking, overlapCount }));
    cluster = [];
    clusterEnd = -Infinity;
  }

  sorted.forEach((booking) => {
    if (cluster.length && bookingStart(booking) >= clusterEnd) flushCluster();
    cluster.push(booking);
    clusterEnd = Math.max(clusterEnd, bookingEnd(booking));
  });
  flushCluster();
  return laidOut;
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
  const countedNoShow = isCountedTrainerNoShow(booking);
  const lessonType = normalizeTrainerLessonType(booking);
  const lessonTypeLabel = lessonType === TRAINER_LESSON_WITH_INSTRUCTOR ? "With instructor" : "Without instructor";
  const item = document.createElement("button");
  item.className = `calendar-booking booking-${booking.type}${booking.checkedInAt ? " is-checked-in" : ""}${countedNoShow ? " is-no-show" : ""}`;
  item.type = "button";
  item.dataset.bookingId = booking.id;
  item.style.top = `${((Number(booking.startHour) - START_HOUR) / SLOT_INCREMENT) * slotHeight + 3}px`;
  item.style.height = `${(Number(booking.duration) / SLOT_INCREMENT) * slotHeight - 6}px`;
  if (booking.overlapCount > 1) {
    const lane = Number(booking.overlapLane) || 0;
    const count = Number(booking.overlapCount) || 1;
    const leftPercent = (lane / count) * 100;
    const rightPercent = ((count - lane - 1) / count) * 100;
    item.classList.add("booking-overlap");
    item.style.left = `calc(${leftPercent}% + ${lane === 0 ? 7 : 3}px)`;
    item.style.right = `calc(${rightPercent}% + ${lane === count - 1 ? 7 : 3}px)`;
    item.title = "This booking overlaps another visible booking.";
  }
  const attendanceLabel = countedNoShow ? '<small class="booking-no-show-label">No-show · time available</small>' : booking.checkedInAt && lessonType !== TRAINER_LESSON_WITH_INSTRUCTOR ? '<small class="booking-checkin-label">✓ Checked in</small>' : "";
  item.innerHTML = `<strong>${escapeHtml(booking.name)}</strong><span>${formatRange(booking)}${booking.initials ? ` · ${escapeHtml(booking.initials)}` : ""}</span><small class="booking-type-label">${lessonTypeLabel}</small>${booking.notes ? `<small>${escapeHtml(booking.notes)}</small>` : ""}${attendanceLabel}`;
  item.setAttribute("aria-label", `${booking.name}, ${formatRange(booking)}, ${lessonTypeLabel}, ${countedNoShow ? "ground trainer no-show, time available" : booking.checkedInAt && lessonType !== TRAINER_LESSON_WITH_INSTRUCTOR ? "checked in" : lessonType === TRAINER_LESSON_WITH_INSTRUCTOR ? "attendance tracked separately" : isTrainerBookingCoveredByCheckinPolicy(booking) ? "not checked in" : "before check-in policy"}`);
  item.addEventListener("click", () => {
    if (suppressBookingClickId === booking.id) {
      suppressBookingClickId = null;
      return;
    }
    if (canEditBookings()) openEditDialog(booking.id);
  });
  item.addEventListener("pointerdown", (event) => {
    if (!canEditBookings()) return;
    if (event.target.closest(".booking-resize-handle")) return;
    startBookingMove(event, booking.id, item);
  });

  if (!canEditBookings()) return item;
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
  if (booking.date === targetDate && Number(booking.startHour) === roundedHour) return;

  if (overlaps(booking, targetDate, roundedHour, booking.id)) {
    showToast("That time overlaps another booking.");
    return;
  }

  const staff = currentStaff();
  if (!staff) {
    showToast("Please sign in before moving a booking.");
    return;
  }

  const previousBooking = { ...booking };
  booking.date = targetDate;
  booking.startHour = roundedHour;
  applyMoveMetadata(booking, previousBooking);
  saveBookings();
  renderCalendar();
  showToast(`Moved to ${formatTime(roundedHour)} by ${staff.name}.`);
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
    if (overlaps(booking, booking.date, Number(booking.startHour), booking.id)) {
      booking.duration = resizeStartDuration;
      renderCalendar();
      showToast("That duration overlaps another booking.");
      return;
    }
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

    const visibleBookings = activeBookings()
      .filter((booking) => booking.trainer === activeTrainer && booking.date === currentDate)
      .filter((booking) => !query || `${booking.name} ${booking.initials || ""} ${booking.notes} ${booking.type}`.toLowerCase().includes(query));
    layoutOverlappingBookings(visibleBookings)
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
  if (!canEditBookings()) return;
  form.reset();
  clearBookingMessage();
  form.elements.bookingId.value = "";
  form.elements.trainer.value = activeTrainer;
  form.elements.type.value = TRAINER_LESSON_WITHOUT_INSTRUCTOR;
  form.elements.date.value = date;
  form.elements.startTime.value = formatTimeValue(hour);
  form.elements.duration.value = "1";
  form.elements.initials.value = currentInitials();
  dialogTitle.textContent = "New booking";
  deleteButton.hidden = true;
  checkInButton.hidden = true;
  noShowButton.hidden = true;
  bookingDetails.hidden = true;
  dialog.showModal();
  form.elements.name.focus();
}

function openEditDialog(id) {
  if (!canEditBookings()) return;
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  clearBookingMessage();
  form.elements.bookingId.value = booking.id;
  form.elements.name.value = booking.name;
  form.elements.trainer.value = booking.trainer;
  form.elements.type.value = normalizeTrainerLessonType(booking);
  form.elements.initials.value = booking.initials || "";
  form.elements.date.value = booking.date;
  form.elements.startTime.value = formatTimeValue(Number(booking.startHour));
  form.elements.duration.value = booking.duration;
  form.elements.notes.value = booking.notes || "";
  dialogTitle.textContent = "Edit booking";
  deleteButton.hidden = false;
  updateAttendanceButtons(booking);
  bookingDetails.querySelector('[data-detail="initials"]').textContent = staffDisplay(booking);
  bookingDetails.querySelector('[data-detail="session"]').textContent = `${formatSessionDate(booking.date)} · ${formatRange(booking)}`;
  bookingDetails.querySelector('[data-detail="attendance"]').textContent = formatAttendanceDetails(booking);
  bookingDetails.querySelector('[data-detail="booked"]').textContent = formatBookedAt(booking.bookedAt);
  bookingDetails.querySelector('[data-detail="moved"]').textContent = formatMoveDetails(booking);
  bookingDetails.hidden = false;
  dialog.showModal();
}

function updateAttendanceButtons(booking) {
  const student = findStudentByName(studentDirectory, booking?.name);
  const checkedIn = Boolean(booking?.checkedInAt);
  const noShow = Boolean(booking?.noShowAt);
  const policyCovered = isTrainerBookingCoveredByCheckinPolicy(booking);
  const instructorLed = normalizeTrainerLessonType(booking) === TRAINER_LESSON_WITH_INSTRUCTOR;
  checkInButton.hidden = !booking || instructorLed;
  checkInButton.disabled = !checkedIn && !student;
  checkInButton.textContent = checkedIn ? "Undo check-in" : noShow ? "Correct to checked in" : "Check in student";
  checkInButton.classList.toggle("danger-button", checkedIn);
  checkInButton.classList.toggle("secondary", !checkedIn);
  checkInButton.title = !checkedIn && !student ? "Choose a name from the saved student directory before checking in." : "";
  noShowButton.hidden = !booking;
  noShowButton.disabled = !noShow && (!student || !policyCovered);
  noShowButton.textContent = noShow ? "Undo no-show" : "Mark no-show";
  noShowButton.title = !noShow && !policyCovered
    ? `Bookings before ${formatSessionDate(TRAINER_CHECKIN_POLICY_START_DATE)} are grandfathered and cannot be marked as no-shows.`
    : !noShow && !student ? "Choose a name from the saved student directory before recording a no-show." : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEditBookings()) return;
  const data = new FormData(form);
  const id = data.get("bookingId") || crypto.randomUUID();
  const existingBooking = bookings.find((item) => item.id === id);
  const staff = currentStaff();
  const selectedStudent = findStudentByName(studentDirectory, data.get("name"));
  const [startHourValue, startMinuteValue] = data.get("startTime").split(":");
  const booking = {
    id,
    name: data.get("name").trim(),
    initials: existingBooking?.initials || currentInitials(),
    trainer: data.get("trainer"),
    type: normalizeTrainerLessonType({ type: data.get("type") }),
    date: data.get("date"),
    startHour: Number(startHourValue) + Number(startMinuteValue) / 60,
    duration: Number(data.get("duration")),
    notes: data.get("notes").trim(),
    studentId: selectedStudent?.id || (existingBooking?.name === data.get("name").trim() ? existingBooking?.studentId || "" : ""),
    studentName: selectedStudent?.studentName || data.get("name").trim(),
    bookedAt: existingBooking?.bookedAt || new Date().toISOString(),
    createdByUserId: existingBooking?.createdByUserId || staff?.id || "",
    createdByName: existingBooking?.createdByName || staff?.name || "",
    createdByInitials: existingBooking?.createdByInitials || currentInitials(),
    updatedAt: new Date().toISOString(),
    updatedByUserId: staff?.id || "",
    updatedByName: staff?.name || "",
    updatedByInitials: currentInitials(),
    movedAt: existingBooking?.movedAt || "",
    movedBy: existingBooking?.movedBy || "",
    movedByName: existingBooking?.movedByName || "",
    movedByUserId: existingBooking?.movedByUserId || "",
    movedFromDate: existingBooking?.movedFromDate || "",
    movedFromStartHour: existingBooking?.movedFromStartHour ?? "",
    movedFromTrainer: existingBooking?.movedFromTrainer || "",
    checkedInAt: existingBooking?.checkedInAt || "",
    checkedInByUserId: existingBooking?.checkedInByUserId || "",
    checkedInByName: existingBooking?.checkedInByName || "",
    checkedInByInitials: existingBooking?.checkedInByInitials || "",
    noShowAt: existingBooking?.noShowAt || "",
    noShowByUserId: existingBooking?.noShowByUserId || "",
    noShowByName: existingBooking?.noShowByName || "",
    noShowByInitials: existingBooking?.noShowByInitials || ""
  };

  if (!staff) {
    showBookingBlocker("Please sign in before saving a booking.");
    return;
  }

  if (booking.startHour < START_HOUR || booking.startHour + booking.duration > END_HOUR) {
    showBookingBlocker(`Bookings must end by ${formatTime(END_HOUR)}.`);
    return;
  }

  if (overlaps(booking, booking.date, booking.startHour, id)) {
    showBookingBlocker("That time overlaps another booking. Choose a different trainer, date, or time.");
    return;
  }

  const submitButton = event.submitter;
  setSavingButton(submitButton, true);
  const index = bookings.findIndex((item) => item.id === id);
  const scheduleChanged = existingBooking
    && (existingBooking.trainer !== booking.trainer
      || existingBooking.date !== booking.date
      || Number(existingBooking.startHour) !== Number(booking.startHour)
      || Number(existingBooking.duration) !== Number(booking.duration));
  const studentChanged = existingBooking && existingBooking.name.trim().toLowerCase() !== booking.name.trim().toLowerCase();
  const lessonTypeChanged = existingBooking && normalizeTrainerLessonType(existingBooking) !== booking.type;
  if (scheduleChanged) {
    applyMoveMetadata(booking, existingBooking);
  }
  if (scheduleChanged || studentChanged || lessonTypeChanged) {
    booking.checkedInAt = "";
    booking.checkedInByUserId = "";
    booking.checkedInByName = "";
    booking.checkedInByInitials = "";
  }
  if (scheduleChanged || studentChanged) {
    booking.noShowAt = "";
    booking.noShowByUserId = "";
    booking.noShowByName = "";
    booking.noShowByInitials = "";
  }

  if (index >= 0) bookings[index] = booking;
  else bookings.push(booking);
  form.elements.bookingId.value = id;

  try {
    const remoteSaved = await saveBookings();
    activeTrainer = booking.trainer;
    updateTabs();
    renderCalendar();
    if (remoteSaved) {
      dialog.close();
      clearBookingMessage();
      showToast(index >= 0 ? "Booking updated." : "Booking added.");
    } else {
      showBookingMessage("Database save failed. This booking is only saved on this device, so other staff may not see it.");
    }
  } catch (error) {
    console.warn("Ground trainer booking save failed", error);
    showBookingMessage("Database save failed. This booking is only saved on this device, so other staff may not see it.");
  } finally {
    setSavingButton(submitButton, false);
  }
});

function canEditBookings() {
  const user = window.AOAAuth?.getCurrentUser?.();
  return Boolean(user?.isAdmin || user?.isStaff);
}

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
form.addEventListener("input", clearBookingMessage);
searchInput.addEventListener("input", renderCalendar);
window.addEventListener("resize", () => {
  clearTimeout(renderCalendar.resizeTimer);
  renderCalendar.resizeTimer = setTimeout(renderCalendar, 120);
});
deleteButton.addEventListener("click", async () => {
  const id = form.elements.bookingId.value;
  const booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  booking.deletedAt = new Date().toISOString();
  booking.updatedAt = booking.deletedAt;
  Object.assign(booking, window.AOAAuth?.staffStamp?.("updated") || {});
  try {
    const remoteSaved = await saveBookings();
    renderCalendar();
    if (remoteSaved) {
      dialog.close();
      clearBookingMessage();
      showToast("Booking deleted.");
    } else {
      showBookingMessage("Database delete failed. This booking is only deleted on this device, so other staff may still see it.");
    }
  } catch (error) {
    console.warn("Ground trainer booking delete failed", error);
    showBookingMessage("Database delete failed. This booking is only deleted on this device, so other staff may still see it.");
  }
});

checkInButton.addEventListener("click", async () => {
  const id = form.elements.bookingId.value;
  const booking = bookings.find((item) => item.id === id);
  if (!booking || !canEditBookings()) return;
  const checkedIn = Boolean(booking.checkedInAt);
  const student = findStudentByName(studentDirectory, booking.name);
  if (!checkedIn && !student) {
    showBookingMessage("Choose an exact saved student name before checking in. Reservations without a student profile cannot count toward attendance.");
    return;
  }
  if (checkedIn && !confirm(`Undo the check-in for ${booking.name}? This session will no longer count toward attendance.`)) return;

  const staff = currentStaff();
  setSavingButton(checkInButton, true);
  if (checkedIn) {
    booking.checkedInAt = "";
    booking.checkedInByUserId = "";
    booking.checkedInByName = "";
    booking.checkedInByInitials = "";
  } else {
    booking.studentId = student.id || booking.studentId || "";
    booking.studentName = student.studentName || booking.name;
    booking.checkedInAt = new Date().toISOString();
    booking.checkedInByUserId = staff?.id || "";
    booking.checkedInByName = staff?.name || "";
    booking.checkedInByInitials = staff?.initials || currentInitials();
    booking.noShowAt = "";
    booking.noShowByUserId = "";
    booking.noShowByName = "";
    booking.noShowByInitials = "";
  }
  booking.updatedAt = new Date().toISOString();
  booking.updatedByUserId = staff?.id || "";
  booking.updatedByName = staff?.name || "";
  booking.updatedByInitials = staff?.initials || currentInitials();

  try {
    const remoteSaved = await saveBookings();
    renderCalendar();
    bookingDetails.querySelector('[data-detail="attendance"]').textContent = formatAttendanceDetails(booking);
    updateAttendanceButtons(booking);
    if (remoteSaved) showToast(checkedIn ? "Check-in removed. Attendance credit removed." : "Student checked in. Attendance credit added.");
    else showBookingMessage("Database save failed. The check-in is only saved on this device and will not reliably count toward attendance.");
  } catch (error) {
    console.warn("Ground trainer check-in save failed", error);
    showBookingMessage("Database save failed. The check-in is only saved on this device and will not reliably count toward attendance.");
  } finally {
    setSavingButton(checkInButton, false);
    updateAttendanceButtons(booking);
  }
});

noShowButton.addEventListener("click", async () => {
  const id = form.elements.bookingId.value;
  const booking = bookings.find((item) => item.id === id);
  if (!booking || !canEditBookings()) return;
  const alreadyNoShow = Boolean(booking.noShowAt);
  if (!alreadyNoShow && !isTrainerBookingCoveredByCheckinPolicy(booking)) {
    showBookingMessage(`This booking is grandfathered. The check-in and no-show policy begins ${formatSessionDate(TRAINER_CHECKIN_POLICY_START_DATE)}.`);
    return;
  }
  const student = findStudentByName(studentDirectory, booking.name);
  if (!alreadyNoShow && !student) {
    showBookingMessage("Choose an exact saved student name before marking a no-show. Reservations without a student profile cannot be added to a profile.");
    return;
  }
  const prompt = alreadyNoShow
    ? `Remove the ground trainer no-show from ${booking.name}'s profile?`
    : `Mark ${booking.name} as a ground trainer no-show? This is for trainer-usage tracking only and will not change attendance.`;
  if (!confirm(prompt)) return;

  const staff = currentStaff();
  setSavingButton(noShowButton, true);
  if (alreadyNoShow) {
    booking.noShowAt = "";
    booking.noShowByUserId = "";
    booking.noShowByName = "";
    booking.noShowByInitials = "";
  } else {
    booking.studentId = student.id || booking.studentId || "";
    booking.studentName = student.studentName || booking.name;
    booking.noShowAt = new Date().toISOString();
    booking.noShowByUserId = staff?.id || "";
    booking.noShowByName = staff?.name || "";
    booking.noShowByInitials = staff?.initials || currentInitials();
  }
  booking.updatedAt = new Date().toISOString();
  booking.updatedByUserId = staff?.id || "";
  booking.updatedByName = staff?.name || "";
  booking.updatedByInitials = staff?.initials || currentInitials();

  try {
    const remoteSaved = await saveBookings();
    renderCalendar();
    bookingDetails.querySelector('[data-detail="attendance"]').textContent = formatAttendanceDetails(booking);
    updateAttendanceButtons(booking);
    if (remoteSaved) showToast(alreadyNoShow ? "Ground trainer no-show removed." : "Ground trainer no-show added to student profile.");
    else showBookingMessage("Database save failed. The no-show is only saved on this device and will not reliably appear on the student profile.");
  } catch (error) {
    console.warn("Ground trainer no-show save failed", error);
    showBookingMessage("Database save failed. The no-show is only saved on this device and will not reliably appear on the student profile.");
  } finally {
    setSavingButton(noShowButton, false);
    updateAttendanceButtons(booking);
  }
});

(async () => {
  const [loadedBookings, loadedStudents] = await Promise.all([
    loadBookings(),
    attachStudentNameDatalists()
  ]);
  bookings = loadedBookings;
  studentDirectory = loadedStudents;
  renderCalendar();
})();
