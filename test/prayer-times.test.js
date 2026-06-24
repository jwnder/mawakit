import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrayerTimes } from "../src/prayer-times.js";

test("Asr uses absolute latitude-declination relation for southern locations", () => {
  const times = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: -30,
    longitude: 0,
    timezone: 0,
    height: 0,
    method: "mwl",
    asrShadowFactor: 1
  });

  assert.equal(times.Asr, "02:50 pm");
});

test("Hanafi Asr is later than standard Asr", () => {
  const standard = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: -30,
    longitude: 0,
    timezone: 0,
    height: 0,
    method: "mwl",
    asrShadowFactor: 1
  });
  const hanafi = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: -30,
    longitude: 0,
    timezone: 0,
    height: 0,
    method: "mwl",
    asrShadowFactor: 2
  });

  assert.equal(standard.Asr, "02:50 pm");
  assert.equal(hanafi.Asr, "03:32 pm");
});

test("calculation methods can use different Fajr and Isha angles", () => {
  const egyptian = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 31.19,
    longitude: 29.95,
    timezone: 3,
    height: 5,
    method: "egyptian",
    asrShadowFactor: 1
  });
  const oldMawakit = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 31.19,
    longitude: 29.95,
    timezone: 3,
    height: 5,
    method: "oldMawakit",
    asrShadowFactor: 1
  });

  assert.equal(egyptian.Fajr, "04:09 am");
  assert.equal(oldMawakit.Fajr, "04:22 am");
  assert.equal(egyptian.Esha, oldMawakit.Esha);
});
test("fixed-interval Isha methods use minutes after Maghrib", () => {
  const ummAlQura = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 21.4225,
    longitude: 39.8262,
    timezone: 3,
    height: 300,
    method: "ummAlQura",
    asrShadowFactor: 1
  });
  const muslimWorldLeague = calculatePrayerTimes({
    day: 24,
    month: 6,
    year: 2026,
    latitude: 21.4225,
    longitude: 39.8262,
    timezone: 3,
    height: 300,
    method: "mwl",
    asrShadowFactor: 1
  });

  assert.equal(ummAlQura.Sunset, "07:09 pm");
  assert.equal(ummAlQura.Esha, "08:39 pm");
  assert.notEqual(ummAlQura.Esha, muslimWorldLeague.Esha);
});