import { loadCollectionData, saveCollectionData } from "./firebase.js";

const OIL_STORAGE_KEY = "aoa-oil-entries-v1";
const aircraftClasses = {
  "174TH": "aircraft-orange", "24108": "aircraft-green", "464ER": "aircraft-teal",
  "52522": "aircraft-yellow", "55297": "aircraft-purple", "6064R": "aircraft-blue"
};

const seedOilEntries = [
  { id: "oil-1", date: "2026-05-07", aircraft: "52522", quarts: 1, tach: 9435.1, initials: "ESP", notes: "" },
  { id: "oil-2", date: "2026-05-08", aircraft: "6064R", quarts: 1, tach: 11422.2, initials: "ESP", notes: "" },
  { id: "oil-3", date: "2026-05-08", aircraft: "55297", quarts: 1, tach: 5325.1, initials: "LW", notes: "" },
  { id: "oil-4", date: "2026-05-10", aircraft: "174TH", quarts: 1, tach: "", initials: "", notes: "" },
  { id: "oil-5", date: "2026-05-10", aircraft: "52522", quarts: 1, tach: "", initials: "", notes: "" },
  { id: "oil-6", date: "2026-05-10", aircraft: "464ER", quarts: 1, tach: "", initials: "", notes: "" },
  { id: "oil-7", date: "2026-05-10", aircraft: "55297", quarts: 1, tach: "", initials: "", notes: "" },
  { id: "oil-8", date: "2026-05-11", aircraft: "55297", quarts: 2, tach: "", initials: "", notes: "" },
  { id: "oil-9", date: "2026-05-15", aircraft: "52522", quarts: 1, tach: 9449.2, initials: "ESP", notes: "" },
  { id: "oil-10", date: "2026-05-20", aircraft: "24108", quarts: 1, tach: 4262.3, initials: "ESP", notes: "" },
  { id: "oil-11", date: "2026-05-21", aircraft: "24108", quarts: 1, tach: 4265.3, initials: "ESP", notes: "" },
  { id: "oil-12", date: "2026-05-21", aircraft: "6064R", quarts: 1, tach: 11360.4, initials: "ESP", notes: "" },
  { id: "oil-13", date: "2026-05-21", aircraft: "464ER", quarts: 1, tach: 7844.7, initials: "ESP", notes: "" },
  { id: "oil-14", date: "2026-05-21", aircraft: "55297", quarts: 1, tach: 5345.9, initials: "ESP", notes: "" },
  { id: "oil-15", date: "2026-05-24", aircraft: "464ER", quarts: 1, tach: 10847.2, initials: "LW", notes: "" },
  { id: "oil-16", date: "2026-05-24", aircraft: "55297", quarts: 2, tach: 7566.4, initials: "LW", notes: "" },
  { id: "oil-17", date: "2026-05-25", aircraft: "464ER", quarts: 1, tach: 10847.8, initials: "JA", notes: "" },
  { id: "oil-18", date: "2026-05-26", aircraft: "24108", quarts: 1, tach: 4275.6, initials: "", notes: "" },
  { id: "oil-19", date: "2026-05-29", aircraft: "24108", quarts: 1, tach: 4282.6, initials: "ESP", notes: "" },
  { id: "oil-20", date: "2026-05-31", aircraft: "52522", quarts: 1, tach: 12632.8, initials: "LW", notes: "" },
  { id: "oil-21", date: "2026-06-01", aircraft: "52522", quarts: 2, tach: 9466.6, initials: "TED", notes: "" },
  { id: "oil-22", date: "2026-06-01", aircraft: "55297", quarts: 2, tach: 5369.3, initials: "", notes: "" }
];

const rows = document.querySelector("#oil-rows");
const monthFilter = document.querySelector("#month-filter");
const aircraftFilter = document.querySelector("#aircraft-filter");
const searchInput = document.querySelector("#oil-search");
const dialog = document.querySelector("#oil-dialog");
const form = document.querySelector("#oil-form");
let oilEntries = [];

async function loadOilEntries() {
  const loaded = await loadCollectionData("oil-entries", OIL_STORAGE_KEY);
  return Array.isArray(loaded) && loaded.length > 0 ? loaded : seedOilEntries;
}

async function saveOilEntries() {
  localStorage.setItem(OIL_STORAGE_KEY, JSON.stringify(oilEntries));
  await saveCollectionData("oil-entries", oilEntries);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function formatOilDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function aircraftChip(aircraft) {
  return `<span class="aircraft-chip ${aircraftClasses[aircraft] || "aircraft-gray"}">${escapeHtml(aircraft)}</span>`;
}

function renderAircraftFilter() {
  const current = aircraftFilter.value;
  const aircraft = [...new Set(oilEntries.map((entry) => entry.aircraft))].sort();
  aircraftFilter.innerHTML = `<option value="">All aircraft</option>${aircraft.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
  aircraftFilter.value = current;
}

function render() {
  const term = searchInput.value.trim().toLowerCase();
  const monthly = oilEntries.filter((entry) => entry.date.startsWith(monthFilter.value));
  const filtered = monthly
    .filter((entry) => !aircraftFilter.value || entry.aircraft === aircraftFilter.value)
    .filter((entry) => [entry.aircraft, entry.initials, entry.notes].some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date));

  rows.innerHTML = filtered.map((entry) => `
    <tr>
      <td><time>${formatOilDate(entry.date)}</time></td>
      <td>${aircraftChip(entry.aircraft)}</td>
      <td><strong>${Number(entry.quarts).toLocaleString()} qt${Number(entry.quarts) === 1 ? "" : "s"}</strong></td>
      <td>${entry.tach !== "" ? Number(entry.tach).toFixed(1) : "—"}</td>
      <td><span class="initials-chip">${escapeHtml(entry.initials || "—")}</span></td>
      <td><button class="row-action" type="button" data-delete="${entry.id}" aria-label="Delete oil entry">Delete</button></td>
    </tr>`).join("");

  document.querySelector("#oil-empty-state").hidden = filtered.length > 0;
  document.querySelector("#oil-result-count").textContent = `${filtered.length} of ${monthly.length} entries`;
  renderMetrics(monthly);
  renderFleet();
}

function renderMetrics(monthly) {
  const totals = monthly.reduce((result, entry) => {
    result[entry.aircraft] = (result[entry.aircraft] || 0) + Number(entry.quarts);
    return result;
  }, {});
  const highest = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  const monthDate = new Date(`${monthFilter.value}-01T00:00:00`);

  document.querySelector("#month-quarts").textContent = monthly.reduce((sum, entry) => sum + Number(entry.quarts), 0).toLocaleString();
  document.querySelector("#month-label").textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate);
  document.querySelector("#entry-count").textContent = monthly.length;
  document.querySelector("#aircraft-count").textContent = Object.keys(totals).length;
  document.querySelector("#highest-aircraft").textContent = highest ? highest[0] : "—";
  document.querySelector("#highest-detail").textContent = highest ? `${highest[1]} quarts added` : "No entries";
}

function renderFleet() {
  const latestByAircraft = {};
  oilEntries.filter((entry) => entry.tach !== "").forEach((entry) => {
    if (!latestByAircraft[entry.aircraft] || entry.date > latestByAircraft[entry.aircraft].date) latestByAircraft[entry.aircraft] = entry;
  });
  document.querySelector("#fleet-list").innerHTML = Object.values(latestByAircraft)
    .sort((a, b) => a.aircraft.localeCompare(b.aircraft))
    .map((entry) => `<article class="fleet-item">${aircraftChip(entry.aircraft)}<div><strong>${Number(entry.tach).toFixed(1)}</strong><small>Recorded ${formatOilDate(entry.date)}</small></div></article>`)
    .join("");
}

function changeMonth(amount) {
  const date = new Date(`${monthFilter.value}-01T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  monthFilter.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  render();
}

function openOilForm() {
  form.reset();
  const [year, month] = monthFilter.value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(new Date().getDate(), lastDay);
  form.elements.date.value = `${monthFilter.value}-${String(day).padStart(2, "0")}`;
  dialog.showModal();
}

function exportOilCsv() {
  const columns = ["Date", "Aircraft", "Quarts", "Tach", "Initials", "Notes"];
  const monthly = oilEntries.filter((entry) => entry.date.startsWith(monthFilter.value));
  const csv = [columns, ...monthly.map((entry) => columns.map((column) => entry[column.toLowerCase()] ?? ""))]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `oil-tracker-${monthFilter.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  oilEntries.push({ id: crypto.randomUUID(), ...data, quarts: Number(data.quarts), tach: data.tach === "" ? "" : Number(data.tach), initials: data.initials.toUpperCase() });
  saveOilEntries();
  renderAircraftFilter();
  monthFilter.value = data.date.slice(0, 7);
  dialog.close();
  render();
});

rows.addEventListener("click", (event) => {
  const id = event.target.dataset.delete;
  if (!id || !confirm("Delete this oil entry?")) return;
  oilEntries = oilEntries.filter((entry) => entry.id !== id);
  saveOilEntries();
  renderAircraftFilter();
  render();
});

[monthFilter, aircraftFilter, searchInput].forEach((element) => element.addEventListener("input", render));
document.querySelector("#previous-month").addEventListener("click", () => changeMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => changeMonth(1));
document.querySelector("#open-oil-form-button").addEventListener("click", openOilForm);
document.querySelector("#close-oil-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-oil-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#export-oil-button").addEventListener("click", exportOilCsv);

(async () => {
  oilEntries = await loadOilEntries();
  renderAircraftFilter();
  render();
})();
