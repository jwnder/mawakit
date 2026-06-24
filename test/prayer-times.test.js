import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrayerTimes } from "../src/prayer-times.js";

function minutesSinceMidnight(time) {
  const match = time.match(/^(\d{2}):(\d{2})\s([ap]m)$/);
  assert.ok(match, `Unexpected time format: ${time}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] === "pm" && hour !== 12) {
    hour += 12;
  }
  if (match[3] === "am" && hour === 12) {
    hour = 0;
  }
  return hour * 60 + minute;
}

test("uses the Adhan library calculation engine", () => {
  const result = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 31.20176,
    longitude: 29.91582,
    timezone: 3,
    timezoneName: "Africa/Cairo",
    height: 5,
    method: "egyptian",
    asrShadowFactor: 1
  });

  assert.equal(result.engine, "adhan");
  assert.match(result.times.Fajr, /^\d{2}:\d{2}\s[ap]m$/);
  assert.match(result.times.Esha, /^\d{2}:\d{2}\s[ap]m$/);
  assert.ok(result.warnings.some((warning) => warning.includes("calculated estimates")));
});

test("Hanafi Asr is later than standard Asr", () => {
  const shared = {
    day: 24,
    month: 6,
    year: 2026,
    latitude: -30,
    longitude: 0,
    timezone: 0,
    timezoneName: "UTC",
    height: 0,
    method: "mwl"
  };
  const standard = calculatePrayerTimes({ ...shared, asrShadowFactor: 1 });
  const hanafi = calculatePrayerTimes({ ...shared, asrShadowFactor: 2 });

  assert.ok(minutesSinceMidnight(hanafi.times.Asr) > minutesSinceMidnight(standard.times.Asr));
});

test("calculation methods can use different Fajr and Isha rules", () => {
  const shared = {
    day: 24,
    month: 6,
    year: 2026,
    latitude: 31.20176,
    longitude: 29.91582,
    timezone: 3,
    timezoneName: "Africa/Cairo",
    height: 5,
    asrShadowFactor: 1
  };
  const egyptian = calculatePrayerTimes({ ...shared, method: "egyptian" });
  const northAmerica = calculatePrayerTimes({ ...shared, method: "isna" });

  assert.notEqual(egyptian.times.Fajr, northAmerica.times.Fajr);
  assert.notEqual(egyptian.times.Esha, northAmerica.times.Esha);
});

test("fixed-interval Isha methods use minutes after Maghrib", () => {
  const shared = {
    day: 24,
    month: 6,
    year: 2026,
    latitude: 21.4225,
    longitude: 39.8262,
    timezone: 3,
    timezoneName: "Asia/Riyadh",
    height: 300,
    asrShadowFactor: 1
  };
  const ummAlQura = calculatePrayerTimes({ ...shared, method: "ummAlQura" });
  const muslimWorldLeague = calculatePrayerTimes({ ...shared, method: "mwl" });

  assert.notEqual(ummAlQura.times.Esha, muslimWorldLeague.times.Esha);
});

test("high latitude locations include accuracy warnings", () => {
  const result = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 69.6492,
    longitude: 18.9553,
    timezone: 2,
    timezoneName: "Europe/Oslo",
    height: 0,
    method: "mwl",
    asrShadowFactor: 1
  });

  assert.ok(result.warnings.some((warning) => warning.includes("High-latitude")));
});
test("legacy engine remains available for comparison", () => {
  const result = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 31.20176,
    longitude: 29.91582,
    timezone: 3,
    timezoneName: "Africa/Cairo",
    height: 5,
    method: "egyptian",
    asrShadowFactor: 1,
    engine: "legacy"
  });

  assert.equal(result.engine, "legacy");
  assert.match(result.times.Fajr, /^\d{2}:\d{2}\s[ap]m$/);
  assert.ok(result.warnings.some((warning) => warning.includes("Legacy Mawakit")));
});
test("Adhan and legacy engines stay within a small range for Cairo with the same settings", () => {
  const shared = {
    day: 24,
    month: 6,
    year: 2026,
    latitude: 30.0444,
    longitude: 31.2357,
    timezone: 3,
    timezoneName: "Africa/Cairo",
    height: 23,
    method: "egyptian",
    asrShadowFactor: 1
  };
  const adhan = calculatePrayerTimes({ ...shared, engine: "adhan" });
  const legacy = calculatePrayerTimes({ ...shared, engine: "legacy" });

  for (const prayer of ["Fajr", "Sunrise", "Zuhr", "Asr", "Sunset", "Esha"]) {
    const difference = Math.abs(minutesSinceMidnight(adhan.times[prayer]) - minutesSinceMidnight(legacy.times[prayer]));
    assert.ok(difference <= 5, `${prayer} differs by ${difference} minutes`);
  }
});