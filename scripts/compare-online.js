import { calculatePrayerTimes } from "../src/prayer-times.js";

const DATE = { year: 2026, month: 6, day: 24 };
const MAX_EXPECTED_DIFF_MINUTES = 5;

const PRAYERS = [
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Zuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Sunset", "Sunset"],
  ["Esha", "Isha"]
];

const cases = [
  {
    name: "Cairo, Egypt",
    latitude: 30.0444,
    longitude: 31.2357,
    timezone: 3,
    timezoneName: "Africa/Cairo",
    method: "egyptian",
    aladhanMethod: 5,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 23
  },
  {
    name: "New York, United States",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: -4,
    timezoneName: "America/New_York",
    method: "isna",
    aladhanMethod: 2,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 10
  },
  {
    name: "London, United Kingdom",
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 1,
    timezoneName: "Europe/London",
    method: "mwl",
    aladhanMethod: 3,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    highLatitudeRule: "twilightAngle",
    height: 11
  },
  {
    name: "Karachi, Pakistan",
    latitude: 24.8607,
    longitude: 67.0011,
    timezone: 5,
    timezoneName: "Asia/Karachi",
    method: "karachi",
    aladhanMethod: 1,
    asrShadowFactor: 2,
    aladhanSchool: 1,
    height: 10
  },
  {
    name: "Makkah, Saudi Arabia",
    latitude: 21.4225,
    longitude: 39.8262,
    timezone: 3,
    timezoneName: "Asia/Riyadh",
    method: "ummAlQura",
    aladhanMethod: 4,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 277
  },
  {
    name: "Dubai, United Arab Emirates",
    latitude: 25.2048,
    longitude: 55.2708,
    timezone: 4,
    timezoneName: "Asia/Dubai",
    method: "dubai",
    aladhanMethod: 16,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 16
  },
  {
    name: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 8,
    timezoneName: "Asia/Singapore",
    method: "singapore",
    aladhanMethod: 11,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 15
  },
  {
    name: "Tehran, Iran",
    latitude: 35.6892,
    longitude: 51.389,
    timezone: 3.5,
    timezoneName: "Asia/Tehran",
    method: "tehran",
    aladhanMethod: 7,
    asrShadowFactor: 1,
    aladhanSchool: 0,
    height: 1200
  }
];

function formatDateForApi({ day, month, year }) {
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

function aladhanUrl(testCase) {
  const url = new URL(`https://api.aladhan.com/v1/timings/${formatDateForApi(DATE)}`);
  url.searchParams.set("latitude", String(testCase.latitude));
  url.searchParams.set("longitude", String(testCase.longitude));
  url.searchParams.set("method", String(testCase.aladhanMethod));
  url.searchParams.set("school", String(testCase.aladhanSchool));
  url.searchParams.set("timezonestring", testCase.timezoneName);
  return url;
}

function parseTime(value) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();

  if (suffix === "pm" && hours !== 12) {
    hours += 12;
  }

  if (suffix === "am" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

function minuteDiff(left, right) {
  const direct = Math.abs(left - right);
  return Math.min(direct, 1440 - direct);
}

function appTimes(testCase) {
  return calculatePrayerTimes({
    ...DATE,
    engine: "adhan",
    latitude: testCase.latitude,
    longitude: testCase.longitude,
    timezone: testCase.timezone,
    timezoneName: testCase.timezoneName,
    method: testCase.method,
    asrShadowFactor: testCase.asrShadowFactor,
    highLatitudeRule: testCase.highLatitudeRule,
    height: testCase.height
  }).times;
}

async function onlineTimes(testCase) {
  const response = await fetch(aladhanUrl(testCase), {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`${testCase.name}: AlAdhan returned HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.code !== 200 || !payload.data?.timings) {
    throw new Error(`${testCase.name}: AlAdhan returned an unexpected payload`);
  }

  return payload.data.timings;
}

async function compareCase(testCase) {
  const local = appTimes(testCase);
  const online = await onlineTimes(testCase);

  return PRAYERS.map(([localKey, onlineKey]) => {
    const localMinutes = parseTime(local[localKey]);
    const onlineMinutes = parseTime(online[onlineKey]);
    const diff = localMinutes === null || onlineMinutes === null
      ? Number.NaN
      : minuteDiff(localMinutes, onlineMinutes);

    return {
      location: testCase.name,
      convention: testCase.method,
      prayer: localKey,
      mawakit: local[localKey],
      online: online[onlineKey],
      diff
    };
  });
}

function printResults(rows) {
  console.table(rows.map((row) => ({
    Location: row.location,
    Convention: row.convention,
    Prayer: row.prayer,
    Mawakit: row.mawakit,
    AlAdhan: row.online,
    "Diff (min)": Number.isNaN(row.diff) ? "n/a" : row.diff
  })));
}

async function main() {
  const rows = [];

  for (const testCase of cases) {
    rows.push(...await compareCase(testCase));
  }

  printResults(rows);

  const validDiffs = rows
    .map((row) => row.diff)
    .filter((diff) => Number.isFinite(diff));
  const maxDiff = Math.max(...validDiffs);
  const failures = rows.filter((row) => Number.isFinite(row.diff) && row.diff > MAX_EXPECTED_DIFF_MINUTES);

  console.log(`Compared ${rows.length} prayer times across ${cases.length} locations.`);
  console.log(`Maximum difference: ${maxDiff} minute(s).`);
  console.log("Online source: AlAdhan Prayer Times API, https://aladhan.com/prayer-times-api");
  console.log("Note: AlAdhan is an online calculated reference. Official local authority timetables can still apply local corrections.");

  if (failures.length > 0) {
    console.log(`Found ${failures.length} result(s) above ${MAX_EXPECTED_DIFF_MINUTES} minutes.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});


