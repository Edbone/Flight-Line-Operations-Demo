import { loadCollectionData, saveCollectionData } from "./firebase.js";

const AIRCRAFT_COLLECTION = "master-schedule-config";
const AIRCRAFT_STORAGE_KEY = "aoa-master-schedule-config-v1";
const DEFAULT_AIRCRAFT = ["N174TH", "N24108", "N6064R", "N464ER", "N52522", "N55297", "N505FM"];

const content = document.querySelector("#management-content");
const saveState = document.querySelector("#management-save-state");
const accountList = document.querySelector("#management-accounts-list");
const reportList = document.querySelector("#management-report-list");
const reportCount = document.querySelector("#management-report-count");
const aircraftList = document.querySelector("#management-aircraft-list");
const aircraftCount = document.querySelector("#management-aircraft-count");
const aircraftSelect = document.querySelector("#management-aircraft-remove");
const aircraftStatus = document.querySelector("#management-aircraft-status");
const aircraftInput = document.querySelector("#management-aircraft-add");
let aircraft = [];

await window.AOAAuth.ready;
await initialize();

async function initialize() {
  const loaded = await loadCollectionData(AIRCRAFT_COLLECTION, AIRCRAFT_STORAGE_KEY);
  aircraft = normalizeAircraft(loaded?.[0]?.airplanes || DEFAULT_AIRCRAFT);
  content.hidden = false;
  saveState.textContent = "Portfolio demo · local only";
  reportList.innerHTML = '<div class="empty-state compact"><strong>No demo problem reports.</strong><span>Production reports are not connected to this portfolio.</span></div>';
  reportCount.textContent = "0 open";
  accountList.innerHTML = `
    <section class="account-admin-row">
      <div><strong>Portfolio Admin</strong><small>demo@example.invalid</small></div>
      <label>Name<input value="Portfolio Admin" disabled /></label>
      <label>Initials<input value="PA" disabled /></label>
      <span class="student-badge green">Demo administrator</span>
    </section>`;
  document.querySelector("#management-save-accounts").disabled = true;
  document.querySelector("#management-save-accounts").title = "Remote account management is disabled in the portfolio demo.";
  document.querySelector("#management-aircraft-add-button").addEventListener("click", addAircraft);
  document.querySelector("#management-aircraft-remove-button").addEventListener("click", removeAircraft);
  renderAircraft();
}

function normalizeAircraft(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function renderAircraft() {
  aircraftCount.textContent = `${aircraft.length} active`;
  aircraftList.innerHTML = aircraft.map((tail) => `<span class="management-aircraft-chip">${escapeHtml(tail)}</span>`).join("");
  aircraftSelect.innerHTML = aircraft.map((tail) => `<option value="${escapeHtml(tail)}">${escapeHtml(tail)}</option>`).join("");
}

async function persistAircraft(message) {
  await saveCollectionData(AIRCRAFT_COLLECTION, [{ id: "config", airplanes: aircraft }], { allowDeletes: true });
  aircraftStatus.textContent = `${message} Changes are saved only in this browser.`;
  renderAircraft();
}

async function addAircraft() {
  const tail = String(aircraftInput.value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!tail) return;
  aircraft = normalizeAircraft([...aircraft, tail]);
  aircraftInput.value = "";
  await persistAircraft(`${tail} added.`);
}

async function removeAircraft() {
  const tail = aircraftSelect.value;
  if (!tail) return;
  aircraft = aircraft.filter((item) => item !== tail);
  await persistAircraft(`${tail} removed from the demo schedule.`);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
