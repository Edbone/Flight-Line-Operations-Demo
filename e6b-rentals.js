import { loadCollectionData, saveCollectionData } from "./firebase.js";

const RENTAL_STORAGE_KEY = "aoa-e6b-rentals-v1";
const INVENTORY = ["1", "2", "3", "4", "5"];
const OVERDUE_DAYS = 14;

const seedRentals = [
  { id: "r-1", name: "John Basso", e6bNumber: "1", checkoutDate: "2024-12-12", returnDate: "2024-12-15", notes: "" },
  { id: "r-2", name: "Evan Knapstead", e6bNumber: "2", checkoutDate: "2023-12-12", returnDate: "2025-02-03", notes: "" },
  { id: "r-3", name: "Ahmed Salami", e6bNumber: "2", checkoutDate: "2025-02-08", returnDate: "2025-02-10", notes: "" },
  { id: "r-4", name: "Gabrielle Weir", e6bNumber: "4", checkoutDate: "2025-02-17", returnDate: "2025-02-20", notes: "" },
  { id: "r-5", name: "Savannah Strasberg", e6bNumber: "2", checkoutDate: "2025-06-10", returnDate: "2025-06-27", notes: "" },
  { id: "r-6", name: "Tyler Diaz", e6bNumber: "4", checkoutDate: "2025-06-11", returnDate: "2025-08-26", notes: "" },
  { id: "r-7", name: "Nanette Disla", e6bNumber: "1", checkoutDate: "2025-06-19", returnDate: "2025-08-12", notes: "" },
  { id: "r-8", name: "Celine Rivera", e6bNumber: "5", checkoutDate: "2025-06-23", returnDate: "2025-06-24", notes: "" },
  { id: "r-9", name: "Daniel Weis", e6bNumber: "2", checkoutDate: "2025-07-01", returnDate: "2025-07-04", notes: "" },
  { id: "r-10", name: "Daniel Weis", e6bNumber: "2", checkoutDate: "2025-07-04", returnDate: "2025-07-10", notes: "" },
  { id: "r-11", name: "Elise Phillips", e6bNumber: "2", checkoutDate: "2025-08-13", returnDate: "2025-08-26", notes: "" },
  { id: "r-12", name: "Judson Hershiser", e6bNumber: "1", checkoutDate: "2025-08-26", returnDate: "2025-08-28", notes: "" },
  { id: "r-13", name: "Chase Harden", e6bNumber: "2", checkoutDate: "2025-08-26", returnDate: "2025-08-27", notes: "" },
  { id: "r-14", name: "Eddie Jackson", e6bNumber: "2", checkoutDate: "2025-10-04", returnDate: "2025-10-06", notes: "" },
  { id: "r-15", name: "Edwin Melendez", e6bNumber: "2", checkoutDate: "2025-10-06", returnDate: "2025-10-06", notes: "" },
  { id: "r-16", name: "Edwin Melendez", e6bNumber: "1", checkoutDate: "2025-10-08", returnDate: "2025-10-08", notes: "" },
  { id: "r-17", name: "Landon", e6bNumber: "1", checkoutDate: "2025-10-10", returnDate: "", notes: "" },
  { id: "r-18", name: "Johnathan Ahern", e6bNumber: "2", checkoutDate: "2025-10-18", returnDate: "", notes: "" },
  { id: "r-19", name: "Will Wood", e6bNumber: "", checkoutDate: "2025-11-18", returnDate: "", notes: "E6B number not recorded." },
  { id: "r-20", name: "Cristian Feliz", e6bNumber: "5", checkoutDate: "2026-01-09", returnDate: "", notes: "" },
  { id: "r-21", name: "Eddie Jackson", e6bNumber: "2", checkoutDate: "2026-01-12", returnDate: "2026-01-16", notes: "" },
  { id: "r-22", name: "Eddie Jackson", e6bNumber: "1", checkoutDate: "2026-01-22", returnDate: "2026-01-26", notes: "" }
];

const rows = document.querySelector("#rental-rows");
const searchInput = document.querySelector("#rental-search");
const statusFilter = document.querySelector("#rental-status-filter");
const e6bFilter = document.querySelector("#e6b-filter");
const dialog = document.querySelector("#rental-dialog");
const form = document.querySelector("#rental-form");
let rentals = [];

async function loadRentals() {
  const loaded = await loadCollectionData("e6b-rentals", RENTAL_STORAGE_KEY);
  return Array.isArray(loaded) && loaded.length > 0 ? loaded : seedRentals;
}

async function saveRentals() {
  localStorage.setItem(RENTAL_STORAGE_KEY, JSON.stringify(rentals));
  await saveCollectionData("e6b-rentals", rentals);
}

function todayLocal() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 864e5));
}

function rentalDays(rental) {
  return daysBetween(rental.checkoutDate, rental.returnDate || todayLocal());
}

function rentalStatus(rental) {
  if (rental.returnDate) return "returned";
  return rentalDays(rental) > OVERDUE_DAYS ? "overdue" : "active";
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function renderFilters() {
  e6bFilter.innerHTML = `<option value="">All E6Bs</option>${INVENTORY.map((number) => `<option value="${number}">E6B ${number}</option>`).join("")}`;
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = rentals
    .filter((rental) => !e6bFilter.value || rental.e6bNumber === e6bFilter.value)
    .filter((rental) => !statusFilter.value || rentalStatus(rental) === statusFilter.value)
    .filter((rental) => [rental.name, rental.e6bNumber, rental.notes].some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

  rows.innerHTML = filtered.map((rental) => {
    const status = rentalStatus(rental);
    const statusLabel = status === "returned" ? "Returned" : status === "overdue" ? "Overdue" : "Checked out";
    return `<tr>
      <td><strong>${escapeHtml(rental.name)}</strong>${rental.notes ? `<small>${escapeHtml(rental.notes)}</small>` : ""}</td>
      <td><span class="e6b-number">${rental.e6bNumber ? `#${escapeHtml(rental.e6bNumber)}` : "—"}</span></td>
      <td><time>${formatDate(rental.checkoutDate)}</time></td>
      <td><time>${formatDate(rental.returnDate)}</time></td>
      <td><strong>${rentalDays(rental)} days</strong></td>
      <td><span class="status-badge rental-${status}">${statusLabel}</span></td>
      <td class="rental-actions">${rental.returnDate ? "" : `<button class="return-button" type="button" data-return="${rental.id}">Return</button>`}<button class="row-action" type="button" data-delete="${rental.id}">Delete</button></td>
    </tr>`;
  }).join("");

  document.querySelector("#rental-empty-state").hidden = filtered.length > 0;
  document.querySelector("#rental-result-count").textContent = `${filtered.length} of ${rentals.length} rentals`;
  renderMetrics();
  renderInventory();
}

function renderMetrics() {
  const active = rentals.filter((rental) => !rental.returnDate);
  const overdue = active.filter((rental) => rentalStatus(rental) === "overdue");
  const completed = rentals.filter((rental) => rental.returnDate);
  const checkedOutNumbers = new Set(active.map((rental) => rental.e6bNumber).filter(Boolean));
  const average = completed.length ? completed.reduce((sum, rental) => sum + rentalDays(rental), 0) / completed.length : 0;

  document.querySelector("#active-rentals").textContent = active.length;
  document.querySelector("#overdue-rentals").textContent = overdue.length;
  document.querySelector("#available-e6bs").textContent = INVENTORY.length - checkedOutNumbers.size;
  document.querySelector("#inventory-detail").textContent = `${INVENTORY.length} total tracked E6Bs`;
  document.querySelector("#average-rental").textContent = `${Math.round(average)} days`;
}

function renderInventory() {
  const activeByNumber = {};
  rentals.filter((rental) => !rental.returnDate && rental.e6bNumber).forEach((rental) => { activeByNumber[rental.e6bNumber] = rental; });
  document.querySelector("#e6b-inventory-list").innerHTML = INVENTORY.map((number) => {
    const rental = activeByNumber[number];
    const status = rental ? rentalStatus(rental) : "available";
    return `<article class="fleet-item inventory-item">
      <span class="e6b-number">#${number}</span>
      <div><strong>${rental ? escapeHtml(rental.name) : "Available"}</strong><small class="inventory-${status}">${rental ? `${rentalDays(rental)} days out` : "Ready to rent"}</small></div>
    </article>`;
  }).join("");
}

function openRentalForm() {
  form.reset();
  form.elements.checkoutDate.value = todayLocal();
  const activeNumbers = new Set(rentals.filter((rental) => !rental.returnDate).map((rental) => rental.e6bNumber));
  [...form.elements.e6bNumber.options].forEach((option) => {
    option.disabled = option.value !== "" && activeNumbers.has(option.value);
  });
  dialog.showModal();
}

function exportRentals() {
  const columns = ["Name", "E6B Number", "Checkout Date", "Return Date", "Rental Length (days)", "Status", "Notes"];
  const csvRows = rentals.map((rental) => [rental.name, rental.e6bNumber, rental.checkoutDate, rental.returnDate, rentalDays(rental), rentalStatus(rental), rental.notes]);
  const csv = [columns, ...csvRows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `e6b-rentals-${todayLocal()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  rentals.push({ id: crypto.randomUUID(), ...data });
  saveRentals();
  dialog.close();
  render();
});

rows.addEventListener("click", (event) => {
  const returnId = event.target.dataset.return;
  const deleteId = event.target.dataset.delete;
  if (returnId) {
    rentals = rentals.map((rental) => rental.id === returnId ? { ...rental, returnDate: todayLocal() } : rental);
    saveRentals();
    render();
  }
  if (deleteId && confirm("Delete this rental record?")) {
    rentals = rentals.filter((rental) => rental.id !== deleteId);
    saveRentals();
    render();
  }
});

[searchInput, statusFilter, e6bFilter].forEach((element) => element.addEventListener("input", render));
document.querySelector("#open-rental-form-button").addEventListener("click", openRentalForm);
document.querySelector("#close-rental-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-rental-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#export-rentals-button").addEventListener("click", exportRentals);

(async () => {
  rentals = await loadRentals();
  renderFilters();
  render();
})();
