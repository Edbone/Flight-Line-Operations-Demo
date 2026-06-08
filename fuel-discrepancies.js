import { loadCollectionData, saveCollectionData } from "./firebase.js";

const FUEL_STORAGE_KEY = "aoa-fuel-discrepancies-v1";

const seedFuelReports = [
  {"id":"f-1","tailNumber":"N24108","date":"2025-06-03","issue":"Delayed","waitingMinutes":30,"fuelLevel":"","notes":"Didn't fuel night before, 6:25 am call"},
  {"id":"f-2","tailNumber":"N174TH","date":"2025-06-03","issue":"Delayed","waitingMinutes":50,"fuelLevel":"","notes":"7:50 am call, had to cancel a lesson"},
  {"id":"f-3","tailNumber":"N52522","date":"2025-06-06","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"6:50 am call, did not fuel night prior"},
  {"id":"f-4","tailNumber":"N52522","date":"2025-06-10","issue":"Delayed","waitingMinutes":45,"fuelLevel":25,"notes":"Plane landed yesterday, 6:30 am call"},
  {"id":"f-5","tailNumber":"N52522","date":"2025-06-11","issue":"Delayed","waitingMinutes":30,"fuelLevel":22,"notes":"Plane landed yesterday, 6:00 am call, student waited"},
  {"id":"f-6","tailNumber":"N464ER","date":"2025-06-18","issue":"Delayed","waitingMinutes":45,"fuelLevel":"","notes":"Called 12:15, cancelled flight"},
  {"id":"f-7","tailNumber":"N52522","date":"2025-07-03","issue":"Delayed","waitingMinutes":55,"fuelLevel":"","notes":"Called 10 AM, cancelled flight"},
  {"id":"f-8","tailNumber":"N174TH","date":"2025-07-27","issue":"Delayed","waitingMinutes":60,"fuelLevel":"","notes":"Called 7 am"},
  {"id":"f-9","tailNumber":"N24108","date":"2025-08-16","issue":"Delayed","waitingMinutes":60,"fuelLevel":26,"notes":"6am call, did not fuel night before"},
  {"id":"f-10","tailNumber":"N52522","date":"2025-08-27","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right wing after fueling"},
  {"id":"f-11","tailNumber":"N55297","date":"2025-08-30","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Found twice"},
  {"id":"f-12","tailNumber":"N464ER","date":"2025-09-03","issue":"Delayed","waitingMinutes":35,"fuelLevel":"","notes":"Called 32 mins prior, still waiting"},
  {"id":"f-13","tailNumber":"N52522","date":"2025-09-10","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right wing / innermost rear sump"},
  {"id":"f-14","tailNumber":"N52522","date":"2025-09-14","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right wing / innermost rear sump"},
  {"id":"f-15","tailNumber":"N6064R","date":"2025-09-19","issue":"Delayed","waitingMinutes":30,"fuelLevel":"","notes":"Due to other requests and shift change"},
  {"id":"f-16","tailNumber":"N6064R","date":"2025-09-20","issue":"Delayed","waitingMinutes":25,"fuelLevel":"","notes":"Called 2:05 for top off, called again 2:30"},
  {"id":"f-17","tailNumber":"N174TH","date":"2025-09-27","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Not fueled overnight, 6:13am call for top off"},
  {"id":"f-18","tailNumber":"N52522","date":"2025-10-07","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Both wings"},
  {"id":"f-19","tailNumber":"N174TH","date":"2025-10-13","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Atlantic said unable to fuel night or morning"},
  {"id":"f-20","tailNumber":"N55297","date":"2025-10-14","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right wing"},
  {"id":"f-21","tailNumber":"N464ER","date":"2025-10-17","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Not fueled overnight"},
  {"id":"f-22","tailNumber":"N52522","date":"2025-10-24","issue":"Delayed","waitingMinutes":45,"fuelLevel":"","notes":"Not filled overnight, 6:05 call, cancelled lesson"},
  {"id":"f-23","tailNumber":"N52522","date":"2025-10-30","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right wing"},
  {"id":"f-24","tailNumber":"N6064R","date":"2025-10-31","issue":"Delayed","waitingMinutes":30,"fuelLevel":"","notes":"Called 4pm, fueled 4:30, lineman unaware"},
  {"id":"f-25","tailNumber":"N6064R","date":"2025-10-31","issue":"Delayed","waitingMinutes":35,"fuelLevel":"","notes":"4pm-6pm block"},
  {"id":"f-26","tailNumber":"N52522","date":"2025-11-03","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Insufficient fuel, filled all the way instead of tabs"},
  {"id":"f-27","tailNumber":"N464ER","date":"2025-11-04","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Accidentally Fueled the aircraft with a no fuel order."},
  {"id":"f-28","tailNumber":"N464ER","date":"2025-11-05","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Accidentally Fueled the aircraft with a no fuel order AGAIN"},
  {"id":"f-29","tailNumber":"N464ER","date":"2025-11-05","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Fueld airplane with an extra 5 gallons than what was told"},
  {"id":"f-30","tailNumber":"N52522","date":"2025-11-07","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right Wing"},
  {"id":"f-31","tailNumber":"N55297","date":"2025-11-07","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Right Wing"},
  {"id":"f-32","tailNumber":"N24108","date":"2025-11-17","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":"","notes":"Overflowing top off found. | 6:00 PM"},
  {"id":"f-33","tailNumber":"N24108","date":"2025-11-18","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":51,"notes":"Dipped tanks at 6AM must have been topped off night before"},
  {"id":"f-34","tailNumber":"N174TH","date":"2025-11-18","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":50,"notes":"Dipped tanks at 6AM must have been topped off night before"},
  {"id":"f-35","tailNumber":"N55297","date":"2025-11-21","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":50,"notes":"Tanks topped off, found at 8am must have been topped off the night before | 8:10 AM"},
  {"id":"f-36","tailNumber":"N464ER","date":"2025-11-21","issue":"Delayed","waitingMinutes":"","fuelLevel":25,"notes":"No fuel order removed at 8:15am, no top off on the hour (9am) and had to call 9:20 for tabs | 9:20 AM"},
  {"id":"f-37","tailNumber":"N52522","date":"2025-11-21","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Called 12:18 for tabs, 12:36 student and instuctor cancelled due to no truck in sight | 12:37"},
  {"id":"f-38","tailNumber":"N174TH","date":"2025-11-25","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":"","notes":"Plane was returned back at 11:30. Fuel was supposed to come at 12 and never came. Called at 12:10  and just got fuel at 12:45. | 12:45"},
  {"id":"f-39","tailNumber":"N174TH","date":"2025-12-02","issue":"Delayed","waitingMinutes":"","fuelLevel":14,"notes":"Not flown all day and Instructor noted it was at 14 gallons total when he checked at 4pm"},
  {"id":"f-40","tailNumber":"N6064R","date":"2025-12-03","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":50,"notes":"6:50 AM - Requested TABS"},
  {"id":"f-41","tailNumber":"N24108","date":"2025-12-03","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":50,"notes":"6:50 AM - Requested TABS"},
  {"id":"f-42","tailNumber":"N464ER","date":"2025-12-03","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":20,"notes":"Flew 2-4PM 12/2/25 never fueled now its 6:50 am 12/3"},
  {"id":"f-43","tailNumber":"N55297","date":"2025-12-03","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Did not fly all day 12/2, they fueled it 12/3 at 6:45AM"},
  {"id":"f-44","tailNumber":"N55297","date":"2025-12-05","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":20,"notes":"11 in R and 10 on L, called 8am top off because student  wasn't comfortable with 20 gal fuel but it was topped off within 10min of call, student reported they added 23.5 gallons | 8:13 AM"},
  {"id":"f-45","tailNumber":"N55297","date":"2025-12-11","issue":"Delayed","waitingMinutes":"","fuelLevel":14,"notes":"Student checked fuel at 7:50 AM and the fuelers did not check the fuel the night prior ort in the morning and only had 14 gallons total | 7:58 AM"},
  {"id":"f-46","tailNumber":"N24108","date":"","issue":"Delayed","waitingMinutes":"","fuelLevel":21,"notes":"Date not recorded in source. Student called dispatch at 1:52, Dispatch called Atlantic at 1:53 and fuelers showed up at 2:23 (30 minutes)"},
  {"id":"f-47","tailNumber":"N24108","date":"","issue":"Delayed","waitingMinutes":"","fuelLevel":17,"notes":"Date not recorded in source."},
  {"id":"f-48","tailNumber":"N52522","date":"2025-12-20","issue":"Delayed","waitingMinutes":30,"fuelLevel":40,"notes":"fuel was called for at 6:50 AM by dispatch, the CFI witnessed the fuel truck drive by the plane twice, and 30 minutes later the fuel truck still has not showed up. Followed up with Atlantic at 7:19 and was told there were only 3 guys working but will try to get them there ASAP | 7:22 AM"},
  {"id":"f-49","tailNumber":"N52522","date":"2025-12-24","issue":"Delayed","waitingMinutes":20,"fuelLevel":30,"notes":"Called at 12:06PM, Got to plane at 12:25PM | 12:30 PM"},
  {"id":"f-50","tailNumber":"N52522","date":"2026-01-06","issue":"Delayed","waitingMinutes":30,"fuelLevel":19,"notes":"Called at 4:07 PM and fuel truck did not come out until 4:37 PM. | 4:07 PM"},
  {"id":"f-51","tailNumber":"N52522","date":"2026-01-22","issue":"Delayed","waitingMinutes":45,"fuelLevel":24,"notes":"Called and did not come for 45 minutes. Instructor and student left without being fueled."},
  {"id":"f-52","tailNumber":"N52522","date":"2026-01-30","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":30,"notes":"Did not fuel the plane the previous night- The prop was straight up and down | 7:13 AM"},
  {"id":"f-53","tailNumber":"N464ER","date":"2026-02-07","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":53,"notes":"Fully topped off overnight after a no fuel order in place | 5:57 AM"},
  {"id":"f-54","tailNumber":"N52522","date":"2026-02-11","issue":"Delayed","waitingMinutes":125,"fuelLevel":20,"notes":"Called for fuel at 4:18 PM, Flight was switched to a different plane. Mechanic checked fuel level at 6:27 PM and plane was still not fueled | 6:29 PM"},
  {"id":"f-55","tailNumber":"N55297","date":"2026-02-21","issue":"Delayed","waitingMinutes":35,"fuelLevel":20,"notes":"Did not fuel the plane the previous night, called at 8:15am and arrived at 8:50am | 8:50 AM"},
  {"id":"f-56","tailNumber":"N24108","date":"2026-02-26","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":20,"notes":"Did not fuel plane previous night, called 6:02am and fueled shortly after"},
  {"id":"f-57","tailNumber":"N174TH","date":"2026-02-28","issue":"Delayed","waitingMinutes":80,"fuelLevel":27,"notes":"Called for fuel at 4:10 PM, fuelers did not arrive until 5:20 PM. Delayed the flight for more than an hour | 5:28 PM"},
  {"id":"f-58","tailNumber":"N174TH","date":"2026-03-02","issue":"Delayed","waitingMinutes":36,"fuelLevel":35,"notes":"Called for fuel at 8:00 am, Fuelers did not arrive until 8:36 AM. Delayed the long IFR cross country"},
  {"id":"f-59","tailNumber":"N174TH","date":"2026-03-03","issue":"Incorrect fuel level","waitingMinutes":40,"fuelLevel":15,"notes":"Called for fuel 6:03am, 5 gal in R wing and 10 L wing. Prop was turned but aircraft wasn't fueled overnight and did not fuel till 6:40"},
  {"id":"f-60","tailNumber":"N24108","date":"2026-03-11","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":51,"notes":"Called for Tabs and they filled it all the way up, Ryan and justin were unable to fly that aircraft due to the weight of the fuel."},
  {"id":"f-61","tailNumber":"N24108","date":"2026-03-12","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":53,"notes":"AIrplane topped off, lesson cancelled bc too much fuel due to weight"},
  {"id":"f-62","tailNumber":"N464ER","date":"2026-03-21","issue":"Incorrect fuel level","waitingMinutes":"","fuelLevel":20,"notes":"Did not top off overnight, called at 7:10AM to ask if it had a fuel hold and they said no"},
  {"id":"f-63","tailNumber":"N55297","date":"2026-03-26","issue":"Delayed","waitingMinutes":50,"fuelLevel":28,"notes":"Called 11:20AM for tabs, no fuel truck, called again at 11:58 and still hadnt fueled by 12:15"},
  {"id":"f-64","tailNumber":"N52522","date":"2026-03-26","issue":"Delayed","waitingMinutes":70,"fuelLevel":25,"notes":"Called at 8:00PM for top off, called again at 8:30PM and still waiting for fuel, called again at 9PM. Did not get fuel until 9:05PM. Delayed a night time XC by over an hour. | 9:02 PM"},
  {"id":"f-65","tailNumber":"N24108","date":"2026-03-27","issue":"Delayed","waitingMinutes":45,"fuelLevel":22,"notes":"Called at 8:00am then called again 25 mins later and they never came to fuel."},
  {"id":"f-66","tailNumber":"N24108","date":"2026-03-27","issue":"Delayed","waitingMinutes":35,"fuelLevel":14,"notes":"Called at 10:12am and they didn't come til 10:47"},
  {"id":"f-67","tailNumber":"N6064R","date":"2026-03-27","issue":"Delayed","waitingMinutes":50,"fuelLevel":"","notes":"Called for fuel several times and each time was told it would be 45min-1hr wait"},
  {"id":"f-68","tailNumber":"N464ER","date":"2026-04-03","issue":"Delayed","waitingMinutes":45,"fuelLevel":16,"notes":"Wasn't topped off overnight, called at 8:05, and still not fueled by 8:50, lesson switched to ground"},
  {"id":"f-69","tailNumber":"N174TH","date":"2026-04-03","issue":"Delayed","waitingMinutes":60,"fuelLevel":19,"notes":"Called for fuel 9:50 asked how long the wait was and was told there was no wait. Still no fuel by 10:30. Called again. LESSON HAD TO BE CANCELLED. Fueler stated he had never receieved a call about 174TH when fueling over an hour later | Called for fuel 9:50 asked how long the wait was and was told there was no wait. Still no fuel by 10:30. Called again. LESSON HAD TO BE CANCELLED. Fueler stated he had never receieved a call about 174TH when fueling over an hour later"},
  {"id":"f-70","tailNumber":"N6064R","date":"2026-04-11","issue":"Delayed","waitingMinutes":60,"fuelLevel":18,"notes":"Pattern work was not available and they couldnt take off and do work else where. Lesson cancelled | 9:40 AM"},
  {"id":"f-71","tailNumber":"N464ER","date":"2026-04-12","issue":"Delayed","waitingMinutes":45,"fuelLevel":24,"notes":"Lesson cancelled"},
  {"id":"f-72","tailNumber":"N55297","date":"2026-04-13","issue":"Delayed","waitingMinutes":"","fuelLevel":16,"notes":"Wasnt topped off overnight, called in the morning and took long flight was delayed"},
  {"id":"f-73","tailNumber":"N55297","date":"2026-04-13","issue":"Delayed","waitingMinutes":25,"fuelLevel":16,"notes":"Was asked to top off then proceeded to drive off after instructor asked them to fill up"},
  {"id":"f-74","tailNumber":"N464ER","date":"2026-04-13","issue":"Delayed","waitingMinutes":25,"fuelLevel":20,"notes":""},
  {"id":"f-75","tailNumber":"N6064R","date":"2026-04-14","issue":"Delayed","waitingMinutes":"","fuelLevel":21,"notes":"Landed 6:30PM Never fueled and is now 8AM"},
  {"id":"f-76","tailNumber":"N55297","date":"2026-04-14","issue":"Delayed","waitingMinutes":"","fuelLevel":17,"notes":"Landed 4PM yesterday had 17 gallons at 8:15AM"},
  {"id":"f-77","tailNumber":"N55297","date":"2026-04-14","issue":"Water in tanks","waitingMinutes":"","fuelLevel":"","notes":"Water in Right Wing Tank"},
  {"id":"f-78","tailNumber":"N464ER","date":"2026-04-14","issue":"Delayed","waitingMinutes":40,"fuelLevel":15,"notes":"Lesson cancelled Called for override for no fuel order, they never came. So Chris and Kevin moved to a ground. I called Atlantic to ensure that they do not fuel the aircraft until tomorrow due to Spin Training."},
  {"id":"f-79","tailNumber":"N464ER","date":"2026-04-15","issue":"Delayed","waitingMinutes":40,"fuelLevel":20,"notes":"Evan called at 11:35 AM for fuel and to lift no fuel order, lauren called again at 12:11 PM to get fuel. Progress check waiting fuel. Lesson cancelled"},
  {"id":"f-80","tailNumber":"N24108","date":"2026-04-16","issue":"Delayed","waitingMinutes":120,"fuelLevel":20,"notes":"Evan called for fuel 9:55AM and again at 10:40 and then again at 11:45 they did not fuel till 12PM. Led to lesson cancellation."},
  {"id":"f-81","tailNumber":"N6064R","date":"2026-04-16","issue":"Delayed","waitingMinutes":35,"fuelLevel":20,"notes":"Called at 8:06 PM, They didnt bring a truck out until about 8:25 (2-3 line guys were in the breakroom) Then a 100LL truck came out parked infront of a cirrus for 10 minutes and I went over asked for fuel in our plane and he went over."},
  {"id":"f-82","tailNumber":"N24108","date":"2026-04-17","issue":"Delayed","waitingMinutes":30,"fuelLevel":20,"notes":"Called 7:40 did not come till soemone waved the fuelers down at 8:10"},
  {"id":"f-83","tailNumber":"N52522","date":"2026-04-17","issue":"Other","waitingMinutes":"","fuelLevel":"","notes":"Waited for fuel again and had to wave the fueler down, but they only screwed fuel caps on 1/2 closed"},
  {"id":"f-84","tailNumber":"N24108","date":"2026-04-18","issue":"Delayed","waitingMinutes":90,"fuelLevel":24,"notes":"Called for fuel at 6:00, fueled at 7:30 led to future lesson cancellation"},
  {"id":"f-85","tailNumber":"N464ER","date":"2026-04-18","issue":"Delayed","waitingMinutes":"","fuelLevel":26,"notes":"Not fueled the night before"},
  {"id":"f-86","tailNumber":"N55297","date":"2026-04-18","issue":"Other","waitingMinutes":"","fuelLevel":27,"notes":"Not fueled the night before"},
  {"id":"f-87","tailNumber":"N52522","date":"2026-04-18","issue":"Other","waitingMinutes":"","fuelLevel":32,"notes":"Not fueled the night before"},
  {"id":"f-88","tailNumber":"N55297","date":"2026-04-18","issue":"Delayed","waitingMinutes":60,"fuelLevel":20,"notes":"Called for fuel at 3 pm. followed up at 3:20, and then at 4 flight cancelled for low fuel. truck showed up at 4 PM."},
  {"id":"f-89","tailNumber":"All Aircraft","date":"2026-04-20","issue":"Other","waitingMinutes":"","fuelLevel":"","notes":"No top off night before nor filled in the morning"},
  {"id":"f-90","tailNumber":"N174TH","date":"2026-04-20","issue":"Other","waitingMinutes":"","fuelLevel":44,"notes":"Lauren walked the fleet due to no one flying anymore in the evening at 6:50 PM to call for fuel, at 8 20 when I walked again they were fueled but only like 22-23 gallons each tank..."},
  {"id":"f-91","tailNumber":"N24108","date":"2026-04-21","issue":"Other","waitingMinutes":"","fuelLevel":48,"notes":"Lauren walked the fleet due to no one flying anymore in the evening at 6:50 PM to call for fuel, at 8 20 when I walked again they were fueled but only like 22-23 gallons each tank..."},
  {"id":"f-92","tailNumber":"N55297","date":"2026-04-22","issue":"Other","waitingMinutes":"","fuelLevel":47,"notes":"Lauren walked the fleet due to no one flying anymore in the evening at 6:50 PM to call for fuel, at 8 20 when I walked again they were fueled but only like 22-23 gallons each tank..."},
  {"id":"f-93","tailNumber":"N52522","date":"2026-04-24","issue":"Delayed","waitingMinutes":30,"fuelLevel":"","notes":"Called 11:55 for fuel in 4 planes, at 12:17 planes were not fueled. Called desk since over 20min wait and was told we would have to wait because there were more people in front of us. Was told the wait would be 5 more min."},
  {"id":"f-94","tailNumber":"N174TH","date":"2026-04-27","issue":"Delayed","waitingMinutes":32,"fuelLevel":24,"notes":"Called at 1:55PM to fuel 174TH and did not come until 2:32 PM"},
  {"id":"f-95","tailNumber":"N52522","date":"2026-04-27","issue":"Delayed","waitingMinutes":"","fuelLevel":"","notes":"Supposed to go down fleet at 11 AM and fuel all aircraft, N52522 below tabs, drove by and didn't check fuel"},
  {"id":"f-96","tailNumber":"N6064R","date":"2026-04-27","issue":"Other","waitingMinutes":"","fuelLevel":"","notes":"Called at 8 PM to get 3 planes fueled."},
  {"id":"f-97","tailNumber":"N174TH","date":"2026-05-01","issue":"Other","waitingMinutes":"","fuelLevel":30,"notes":"Called last night for top offs (per Alysha) but no top off follwoing morning when checked at 7:40AM."},
  {"id":"f-98","tailNumber":"N6064R","date":"2026-05-01","issue":"Other","waitingMinutes":"","fuelLevel":30,"notes":"Called last night for top offs (per Alysha) but no top off follwoing morning when checked at 7:40AM."},
  {"id":"f-99","tailNumber":"N464ER","date":"2026-05-05","issue":"Other","waitingMinutes":"","fuelLevel":35,"notes":"Wasn't filled last night"},
  {"id":"f-100","tailNumber":"N55297","date":"2026-05-07","issue":"Other","waitingMinutes":"","fuelLevel":24,"notes":"Wasnt fueled overnight, 24 gal"},
  {"id":"f-101","tailNumber":"N55297","date":"2026-05-15","issue":"Other","waitingMinutes":"","fuelLevel":34,"notes":"Wasnt fueled overnight"},
  {"id":"f-102","tailNumber":"N464ER","date":"2026-05-15","issue":"Delayed","waitingMinutes":"","fuelLevel":30,"notes":"Called 7:49am to put 7gal in each wing, 8:18am student and instructor had to move planes because hadnt been fueled"},
  {"id":"f-103","tailNumber":"N52522","date":"2026-05-16","issue":"Other","waitingMinutes":"","fuelLevel":37,"notes":"Wasn't filled last night"}
];

const rows = document.querySelector("#fuel-rows");
const searchInput = document.querySelector("#fuel-search");
const issueFilter = document.querySelector("#fuel-issue-filter");
const aircraftFilter = document.querySelector("#fuel-aircraft-filter");
const yearFilter = document.querySelector("#fuel-year-filter");
const dialog = document.querySelector("#fuel-dialog");
const form = document.querySelector("#fuel-form");
let fuelReports = [];

function normalizeIssue(issue = "") {
  if (issue === "Overfilled" || issue === "Topped Off Incorrectly") return "Incorrect fuel level";
  return issue || "Other";
}

function normalizeTailNumber(tailNumber = "") {
  const cleaned = String(tailNumber).trim();
  if (!cleaned) return "";
  if (/^all aircraft$/i.test(cleaned)) return "All Aircraft";
  const compact = cleaned.toUpperCase().replace(/\s+/g, "");
  return compact.startsWith("N") || !/^\d/.test(compact) ? compact : `N${compact}`;
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function normalizeReport(report, index = 0) {
  return {
    id: report.id || `imported-${index + 1}`,
    tailNumber: normalizeTailNumber(report.tailNumber),
    date: String(report.date || "").trim(),
    issue: normalizeIssue(String(report.issue || "").trim()),
    waitingMinutes: normalizeNumber(report.waitingMinutes),
    fuelLevel: normalizeNumber(report.fuelLevel),
    notes: String(report.notes || "").trim()
  };
}

function mergeSeedReports(loadedReports) {
  const merged = new Map(seedFuelReports.map((report) => [report.id, { ...report }]));
  for (const [index, report] of loadedReports.entries()) {
    const normalized = normalizeReport(report, index);
    merged.set(normalized.id, normalized);
  }
  return [...merged.values()];
}

async function saveFuelReports() {
  localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(fuelReports));
  await saveCollectionData("fuel-discrepancies", fuelReports);
}

function todayLocal() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

function issueClass(issue) {
  if (issue === "Delayed") return "issue-delayed";
  if (issue === "Water in tanks") return "issue-water";
  if (issue === "Incorrect fuel level") return "issue-level";
  return "issue-other";
}

function renderFilters() {
  const currentAircraft = aircraftFilter.value;
  const currentYear = yearFilter.value;
  const aircraft = [...new Set(fuelReports.map((report) => report.tailNumber).filter(Boolean))].sort();
  const years = [...new Set(fuelReports.map((report) => report.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  aircraftFilter.innerHTML = `<option value="">All aircraft</option>${aircraft.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}`;
  yearFilter.innerHTML = `<option value="">All years</option>${years.map((year) => `<option>${year}</option>`).join("")}`;
  aircraftFilter.value = currentAircraft;
  yearFilter.value = currentYear;
}

function filteredReports() {
  const term = searchInput.value.trim().toLowerCase();
  return fuelReports
    .filter((report) => !issueFilter.value || report.issue === issueFilter.value)
    .filter((report) => !aircraftFilter.value || report.tailNumber === aircraftFilter.value)
    .filter((report) => !yearFilter.value || report.date.startsWith(yearFilter.value))
    .filter((report) => [report.tailNumber, report.issue, report.notes].some((value) => String(value || "").toLowerCase().includes(term)))
    .sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      return dateCompare || a.id.localeCompare(b.id);
    });
}

function render() {
  const filtered = filteredReports();
  rows.innerHTML = filtered.map((report) => `
    <tr>
      <td><span class="tailnumber-chip">${escapeHtml(report.tailNumber || "—")}</span></td>
      <td><time>${formatDate(report.date)}</time></td>
      <td><span class="issue-chip ${issueClass(report.issue)}">${escapeHtml(report.issue)}</span></td>
      <td>${report.waitingMinutes !== "" ? `<strong>${Number(report.waitingMinutes)} min</strong>` : "—"}</td>
      <td>${report.fuelLevel !== "" ? `<strong>${Number(report.fuelLevel).toLocaleString()} gal</strong>` : "—"}</td>
      <td class="wrap-cell">${escapeHtml(report.notes) || "—"}</td>
      <td><button class="row-action" type="button" data-delete="${report.id}">Delete</button></td>
    </tr>`).join("");

  document.querySelector("#fuel-empty-state").hidden = filtered.length > 0;
  document.querySelector("#fuel-result-count").textContent = `${filtered.length} of ${fuelReports.length} reports`;
  renderMetrics(filtered);
  renderAircraftSummary(filtered);
}

function renderMetrics(reports) {
  const waterCount = reports.filter((report) => report.issue === "Water in tanks").length;
  const waits = reports.filter((report) => report.waitingMinutes !== "").map((report) => Number(report.waitingMinutes));
  const counts = reports.reduce((result, report) => {
    result[report.tailNumber] = (result[report.tailNumber] || 0) + 1;
    return result;
  }, {});
  const highest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  document.querySelector("#fuel-report-count").textContent = reports.length;
  document.querySelector("#fuel-report-period").textContent = yearFilter.value ? `${yearFilter.value} filtered reports` : "All recorded discrepancies";
  document.querySelector("#water-report-count").textContent = waterCount;
  document.querySelector("#average-wait").textContent = waits.length ? `${Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length)} min` : "0 min";
  document.querySelector("#most-reported-aircraft").textContent = highest ? highest[0] : "—";
  document.querySelector("#most-reported-detail").textContent = highest ? `${highest[1]} reports` : "No reports";
}

function renderAircraftSummary(reports) {
  const summary = reports.reduce((result, report) => {
    result[report.tailNumber] ||= { total: 0, delayed: 0, water: 0 };
    result[report.tailNumber].total += 1;
    if (report.issue === "Delayed") result[report.tailNumber].delayed += 1;
    if (report.issue === "Water in tanks") result[report.tailNumber].water += 1;
    return result;
  }, {});
  document.querySelector("#fuel-aircraft-summary").innerHTML = Object.entries(summary)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([aircraft, counts]) => `<article class="fleet-item fuel-summary-item">
      <span class="tailnumber-chip">${escapeHtml(aircraft)}</span>
      <div><strong>${counts.total} reports</strong><small>${counts.delayed} delayed · ${counts.water} water</small></div>
    </article>`).join("");
}

function openFuelForm() {
  form.reset();
  form.elements.date.value = todayLocal();
  dialog.showModal();
}

function exportFuelCsv() {
  const columns = ["Tailnumber", "Date", "Issue", "Waiting Time (minutes)", "Fuel Level (Gallons)", "Notes"];
  const csvRows = fuelReports.map((report) => [report.tailNumber, report.date, report.issue, report.waitingMinutes, report.fuelLevel, report.notes]);
  const csv = [columns, ...csvRows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `fuel-discrepancies-${todayLocal()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  fuelReports.push(normalizeReport({
    id: crypto.randomUUID(),
    ...data,
    waitingMinutes: data.waitingMinutes === "" ? "" : Number(data.waitingMinutes),
    fuelLevel: data.fuelLevel === "" ? "" : Number(data.fuelLevel)
  }));
  saveFuelReports();
  renderFilters();
  dialog.close();
  render();
});

rows.addEventListener("click", (event) => {
  const id = event.target.dataset.delete;
  if (!id || !confirm("Delete this fuel discrepancy?")) return;
  fuelReports = fuelReports.filter((report) => report.id !== id);
  saveFuelReports();
  renderFilters();
  render();
});

[searchInput, issueFilter, aircraftFilter, yearFilter].forEach((element) => element.addEventListener("input", render));
document.querySelector("#open-fuel-form-button").addEventListener("click", openFuelForm);
document.querySelector("#close-fuel-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-fuel-form-button").addEventListener("click", () => dialog.close());
document.querySelector("#export-fuel-button").addEventListener("click", exportFuelCsv);

(async () => {
  const loaded = await loadCollectionData("fuel-discrepancies", FUEL_STORAGE_KEY);
  fuelReports = mergeSeedReports(Array.isArray(loaded) ? loaded : []);
  renderFilters();
  render();

  const loadedCount = Array.isArray(loaded) ? loaded.length : 0;
  if (fuelReports.length !== loadedCount) {
    saveFuelReports();
  }
})();
