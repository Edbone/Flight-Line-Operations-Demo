const HOME_STATUS_CONFIG = {
  airport: "KORL",
  tafAirport: "KMCO",
  refreshMs: 5 * 60 * 1000,
  airportLat: 28.5455,
  airportLon: -81.3329,
  proxyBase: "https://purple-sun-777e.bocajack03.workers.dev"
};

const HOME_STATUS_RUNWAYS = { "07": 67, "25": 247, "13": 131, "31": 311 };

const homeStatusWeather = {
  rawMetar: "Loading current KORL weather...",
  receiptTime: new Date().toISOString(),
  windDirection: 0,
  windSpeed: 0,
  windGust: 0,
  visibility: 99,
  clouds: [],
  tafHasGustsNextHour: false,
  convectiveSigmetActive: false
};

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function makeStatuses() {
  return {
    dual: { trafficPattern: true, practiceArea: true, crossCountry: true, ifr: true },
    solo: { trafficPattern: true, practiceArea: true, crossCountry: true },
    renter: { trafficPattern: true, practiceArea: true, crossCountry: true }
  };
}

function calculateRunwayWindComponents(windDirection, windSpeed) {
  let bestHeadwind = -Infinity;
  let bestCrosswind = 0;

  Object.values(HOME_STATUS_RUNWAYS).forEach((heading) => {
    let angle = Math.abs(windDirection - heading);
    if (angle > 180) angle = 360 - angle;
    const headwind = windSpeed * Math.cos((angle * Math.PI) / 180);
    const crosswind = Math.abs(windSpeed * Math.sin((angle * Math.PI) / 180));
    if (headwind > bestHeadwind) {
      bestHeadwind = headwind;
      bestCrosswind = crosswind;
    }
  });

  return { crosswind: Math.round(bestCrosswind * 10) / 10 };
}

function getLowestCeiling(clouds) {
  let lowest = Infinity;
  clouds.forEach((layer) => {
    const cover = String(layer.cover || "").toUpperCase();
    const base = Number(layer.base);
    if ((cover === "BKN" || cover === "OVC") && Number.isFinite(base) && base < lowest) lowest = base;
  });
  return Number.isFinite(lowest) ? lowest : null;
}

function setAllNoGo(statuses) {
  Object.values(statuses).forEach((profile) => {
    Object.keys(profile).forEach((condition) => {
      profile[condition] = false;
    });
  });
}

function closeVfrProfiles(statuses, condition) {
  statuses.dual[condition] = false;
  statuses.solo[condition] = false;
  statuses.renter[condition] = false;
}

function applyFlightRules(weather) {
  const statuses = makeStatuses();
  const windSpeed = weather.windSpeed;
  const windGust = weather.windGust;
  const visibility = weather.visibility;
  const lowestCeiling = getLowestCeiling(weather.clouds);
  const { crosswind } = calculateRunwayWindComponents(weather.windDirection, windSpeed);

  if (windGust >= 30 || weather.convectiveSigmetActive) setAllNoGo(statuses);

  if (windGust > windSpeed || weather.tafHasGustsNextHour || windSpeed > 20 || windGust > 20 || crosswind > 10) {
    statuses.solo.trafficPattern = false;
    statuses.solo.practiceArea = false;
    statuses.solo.crossCountry = false;
  }

  if (windSpeed > 25 || windGust > 25 || crosswind > 15) {
    Object.keys(statuses.dual).forEach((condition) => { statuses.dual[condition] = false; });
    Object.keys(statuses.renter).forEach((condition) => { statuses.renter[condition] = false; });
  }

  if (visibility < 1) statuses.dual.ifr = false;
  if (visibility < 3) closeVfrProfiles(statuses, "trafficPattern");
  if (visibility < 5) closeVfrProfiles(statuses, "practiceArea");
  if (visibility < 6) closeVfrProfiles(statuses, "crossCountry");

  if (lowestCeiling !== null) {
    if (lowestCeiling < 1600) closeVfrProfiles(statuses, "trafficPattern");
    if (lowestCeiling < 2000) {
      closeVfrProfiles(statuses, "practiceArea");
      statuses.dual.crossCountry = false;
    }
    if (lowestCeiling < 3000) statuses.renter.crossCountry = false;
    if (lowestCeiling < 4000) statuses.solo.crossCountry = false;
    if (lowestCeiling < 467) statuses.dual.ifr = false;
  }

  return statuses;
}

function renderStatusRow(condition, isOpen) {
  return `<div class="home-status-row"><span>${condition}</span><strong class="${isOpen ? "open" : "hold"}">${isOpen ? "OPEN" : "HOLD"}</strong></div>`;
}

function renderStatusGroup(profile, rows) {
  return `<div class="home-status-group"><strong class="home-profile-name">${profile}</strong><div>${rows.join("")}</div></div>`;
}

function renderStatuses(statuses) {
  document.querySelector("#home-status-table").innerHTML = [
    renderStatusGroup("DUAL", [
      renderStatusRow("Traffic Pattern", statuses.dual.trafficPattern),
      renderStatusRow("Practice Area", statuses.dual.practiceArea),
      renderStatusRow("Cross Country", statuses.dual.crossCountry),
      renderStatusRow("IFR", statuses.dual.ifr)
    ]),
    renderStatusGroup("SOLO", [
      renderStatusRow("Traffic Pattern", statuses.solo.trafficPattern),
      renderStatusRow("Practice Area", statuses.solo.practiceArea),
      renderStatusRow("Cross Country", statuses.solo.crossCountry)
    ]),
    renderStatusGroup("RENTER / TIMEBUILDER", [
      renderStatusRow("Traffic Pattern", statuses.renter.trafficPattern),
      renderStatusRow("Practice Area", statuses.renter.practiceArea),
      renderStatusRow("Cross Country", statuses.renter.crossCountry)
    ])
  ].join("");
}

function pickFirstRecord(json) {
  if (Array.isArray(json)) return json[0] || null;
  if (Array.isArray(json?.data)) return json.data[0] || null;
  return json || null;
}

function normalizeClouds(metar) {
  if (!Array.isArray(metar?.clouds)) return [];
  return metar.clouds.map((layer) => ({
    cover: layer.cover || layer.type || "",
    base: safeNumber(layer.base ?? layer.altitude ?? layer.height, NaN)
  }));
}

function tafHasGustsNextHour(taf) {
  if (!taf) return false;
  const now = Date.now();
  const periods = []
    .concat(Array.isArray(taf.fcsts) ? taf.fcsts : [])
    .concat(Array.isArray(taf.forecast) ? taf.forecast : []);

  const forecastGusts = periods.some((item) => {
    const start = new Date(item.fcst_time_from || item.startTime || item.valid_from || item.from || item.timeFrom || item.start_time).getTime();
    const end = new Date(item.fcst_time_to || item.endTime || item.valid_to || item.to || item.timeTo || item.end_time).getTime();
    const gust = Number(item.wgst || item.wind_gust_kt || item.wgust || item.gust || 0);
    return Number.isFinite(start) && Number.isFinite(end) && end > now && start < now + 60 * 60 * 1000 && gust > 0;
  });

  const raw = taf.rawTAF || taf.raw_text || taf.raw || "";
  return forecastGusts || /(?:\s|^)\d{3}\d{2,3}G\d{2,3}KT(?:\s|$)/.test(raw);
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  const hitsPolygon = (polygon) => polygon?.length && pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring));
  if (geometry.type === "Polygon") return hitsPolygon(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(hitsPolygon);
  return false;
}

function sigmetIsActive(feature) {
  const properties = feature?.properties || {};
  const start = new Date(properties.validTimeFrom || properties.valid_from || properties.startTime || properties.issuetime).getTime();
  const end = new Date(properties.validTimeTo || properties.valid_to || properties.endTime || properties.expireTime).getTime();
  const now = Date.now();
  return (!Number.isFinite(start) || now >= start) && (!Number.isFinite(end) || now <= end);
}

async function fetchWeatherJson(path) {
  const response = await fetch(`${HOME_STATUS_CONFIG.proxyBase}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

async function loadHomeFlightStatus() {
  const [metarJson, tafJson, sigmetJson] = await Promise.all([
    fetchWeatherJson(`/api/data/metar?ids=${HOME_STATUS_CONFIG.airport}&format=json`),
    fetchWeatherJson(`/api/data/taf?ids=${HOME_STATUS_CONFIG.tafAirport}&format=json`),
    fetchWeatherJson("/api/data/airsigmet?format=geojson")
  ]);
  const metar = pickFirstRecord(metarJson);
  const taf = pickFirstRecord(tafJson);
  if (!metar) throw new Error("No KORL METAR available");

  const airportPoint = [HOME_STATUS_CONFIG.airportLon, HOME_STATUS_CONFIG.airportLat];
  homeStatusWeather.rawMetar = metar.rawOb || metar.raw_text || metar.raw || "No METAR available";
  homeStatusWeather.receiptTime = metar.receiptTime || metar.observationTime || (typeof metar.obsTime === "number" ? new Date(metar.obsTime * 1000).toISOString() : new Date().toISOString());
  homeStatusWeather.windDirection = (metar.wdir ?? metar.windDirection ?? metar.wind_dir_degrees) === "VRB" ? 0 : safeNumber(metar.wdir ?? metar.windDirection ?? metar.wind_dir_degrees, 0);
  homeStatusWeather.windSpeed = safeNumber(metar.wspd ?? metar.windSpeed ?? metar.wind_speed_kt, 0);
  homeStatusWeather.windGust = safeNumber(metar.wgst ?? metar.windGust ?? metar.wind_gust_kt, homeStatusWeather.windSpeed);
  homeStatusWeather.visibility = (metar.visib ?? metar.visibility ?? metar.visibility_statute_mi) === "10+" ? 10 : safeNumber(metar.visib ?? metar.visibility ?? metar.visibility_statute_mi, 99);
  homeStatusWeather.clouds = normalizeClouds(metar);
  homeStatusWeather.tafHasGustsNextHour = tafHasGustsNextHour(taf);
  homeStatusWeather.convectiveSigmetActive = (sigmetJson?.features || []).some((feature) => sigmetIsActive(feature) && pointInGeometry(airportPoint, feature.geometry));
}

function renderHomeFlightStatus() {
  document.querySelector("#home-raw-metar").textContent = homeStatusWeather.rawMetar;
  document.querySelector("#flight-status-updated").textContent = `Updated ${new Date(homeStatusWeather.receiptTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  renderStatuses(applyFlightRules(homeStatusWeather));
}

async function refreshHomeFlightStatus() {
  try {
    await loadHomeFlightStatus();
    renderHomeFlightStatus();
  } catch (error) {
    console.error(error);
    document.querySelector("#home-raw-metar").textContent = `Unable to load KORL METAR: ${error.message}`;
    document.querySelector("#flight-status-updated").textContent = "Weather unavailable";
  }
}

renderStatuses(makeStatuses());
refreshHomeFlightStatus();
setInterval(refreshHomeFlightStatus, HOME_STATUS_CONFIG.refreshMs);
