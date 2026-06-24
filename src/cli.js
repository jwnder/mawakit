#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import inquirer from "inquirer";
import { CALCULATION_METHODS, calculatePrayerTimes, toIsoDate } from "./prayer-times.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const locationsPath = path.join(rootDir, "data", "locations.json");
const preferencesPath = path.join(getConfigDir(), "preferences.json");

const CUSTOM_METHOD = "custom";

function getConfigDir() {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "mawakit");
  }

  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "mawakit");
  }

  return path.join(os.homedir(), ".config", "mawakit");
}

function loadPreferences() {
  try {
    if (!fs.existsSync(preferencesPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
  } catch {
    return {};
  }
}

function savePreferences(preferences) {
  fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
  fs.writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`);
}

function withDefaultLabel(message, value) {
  return `${message} (${value})`;
}

function methodName(value) {
  if (value === CUSTOM_METHOD) {
    return "Custom angles";
  }

  return CALCULATION_METHODS[value]?.name || value;
}

function asrName(value) {
  return Number(value) === 2 ? "Hanafi" : "Standard";
}
function formatMethodChoice(method) {
  const parts = [`Fajr ${method.fajrAngle} deg`];
  if (Number.isFinite(method.ishaAngle)) {
    parts.push(`Isha ${method.ishaAngle} deg`);
  } else if (Number.isFinite(method.ishaInterval)) {
    parts.push(`Isha ${method.ishaInterval} min after Maghrib`);
  }

  return `${method.name} (${parts.join(", ")})`;
}

function parseNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `${label} must be a number.`;
  }

  if (number < min || number > max) {
    return `${label} must be between ${min} and ${max}.`;
  }

  return true;
}

function loadLocations() {
  if (!fs.existsSync(locationsPath)) {
    return [];
  }

  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
  return locations.filter((location) => (
    location
    && typeof location.country === "string"
    && typeof location.city === "string"
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
  ));
}

function todayParts() {
  const now = new Date();
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

function dateIsValid({ day, month, year }) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function getTimezoneOffset(timezone, dateParts) {
  if (!timezone) {
    return null;
  }

  try {
    const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset"
    }).formatToParts(date);
    const value = parts.find((part) => part.type === "timeZoneName")?.value || "";
    const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) {
      return null;
    }

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);
    return sign * (hours + minutes / 60);
  } catch {
    return null;
  }
}

function getTimezoneDefaults(location, date) {
  const fallbackOffset = Math.max(-12, Math.min(14, Math.round(location.longitude / 15)));
  if (!location.timezone) {
    return { baseTimezone: fallbackOffset, daylightSaving: false };
  }

  const currentOffset = getTimezoneOffset(location.timezone, date);
  const januaryOffset = getTimezoneOffset(location.timezone, { ...date, month: 1, day: 15 });
  const julyOffset = getTimezoneOffset(location.timezone, { ...date, month: 7, day: 15 });

  if (!Number.isFinite(currentOffset)) {
    return { baseTimezone: fallbackOffset, daylightSaving: false };
  }

  if (!Number.isFinite(januaryOffset) || !Number.isFinite(julyOffset) || januaryOffset === julyOffset) {
    return { baseTimezone: currentOffset, daylightSaving: false };
  }

  const baseTimezone = Math.min(januaryOffset, julyOffset);
  return {
    baseTimezone,
    daylightSaving: currentOffset > baseTimezone
  };
}

function defaultDaylightSaving(preferences, timezoneDefaults) {
  if (typeof preferences.daylightSaving === "boolean") {
    return preferences.daylightSaving;
  }

  return timezoneDefaults.daylightSaving;
}

function applyDaylightSaving(timezone, daylightSaving) {
  return daylightSaving ? timezone + 1 : timezone;
}

function formatUtcOffset(offset) {
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = Math.trunc(absolute);
  const minutes = Math.round((absolute - hours) * 60);
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatTimeSettings(settings) {
  const finalTimezone = applyDaylightSaving(settings.baseTimezone, settings.daylightSaving);
  return `${formatUtcOffset(settings.baseTimezone)}, daylight saving ${settings.daylightSaving ? "yes" : "no"}, final ${formatUtcOffset(finalTimezone)}`;
}

function rememberedTimeSettings(preferences) {
  const baseTimezone = Number(preferences.baseTimezone ?? preferences.timezone);
  if (!Number.isFinite(baseTimezone)) {
    return null;
  }

  return {
    baseTimezone,
    daylightSaving: typeof preferences.daylightSaving === "boolean" ? preferences.daylightSaving : false
  };
}

async function askTimeSettings(preferences, cityDefaults) {
  const remembered = rememberedTimeSettings(preferences);

  console.log(`\nCity time default: ${formatTimeSettings(cityDefaults)}`);
  if (remembered) {
    console.log(`Remembered time setting: ${formatTimeSettings(remembered)}`);
  }

  const choices = [
    { name: `Use city default (${formatTimeSettings(cityDefaults)})`, value: "city" }
  ];

  if (remembered) {
    choices.push({ name: `Use remembered setting (${formatTimeSettings(remembered)})`, value: "remembered" });
  }

  choices.push({ name: "Enter manually", value: "manual" });

  const { source } = await inquirer.prompt([
    {
      type: "list",
      name: "source",
      message: "Time and daylight saving",
      choices,
      default: "city"
    }
  ]);

  if (source === "city") {
    return cityDefaults;
  }

  if (source === "remembered") {
    return remembered;
  }

  const manual = await inquirer.prompt([
    {
      type: "input",
      name: "baseTimezone",
      message: withDefaultLabel("Standard UTC offset", remembered?.baseTimezone ?? cityDefaults.baseTimezone),
      default: String(remembered?.baseTimezone ?? cityDefaults.baseTimezone),
      validate: (value) => parseNumber(value, "UTC offset", { min: -12, max: 14 }),
      filter: Number
    },
    {
      type: "confirm",
      name: "daylightSaving",
      message: withDefaultLabel("Apply daylight saving time?", (remembered?.daylightSaving ?? cityDefaults.daylightSaving) ? "yes" : "no"),
      default: remembered?.daylightSaving ?? cityDefaults.daylightSaving
    }
  ]);

  return manual;
}
function formatLocation(location) {
  if (!location) {
    return "";
  }

  return `${location.city}${location.region ? `, ${location.region}` : ""}, ${location.country}`;
}

function findRememberedLocation(locations, memory) {
  if (!memory) {
    return null;
  }

  if (Number.isFinite(memory.id)) {
    const byId = locations.find((location) => location.id === memory.id);
    if (byId) {
      return byId;
    }
  }

  if (Number.isFinite(memory.latitude) && Number.isFinite(memory.longitude)) {
    return {
      city: memory.city || "Custom location",
      country: memory.country || "",
      region: memory.region || null,
      latitude: memory.latitude,
      longitude: memory.longitude,
      timezone: memory.timezone || null
    };
  }

  return null;
}

async function askManualLocation(defaultLocation) {
  return inquirer.prompt([
    {
      type: "input",
      name: "latitude",
      message: withDefaultLabel("Latitude", defaultLocation?.latitude ?? 31.19),
      default: String(defaultLocation?.latitude ?? 31.19),
      validate: (value) => parseNumber(value, "Latitude", { min: -90, max: 90 }),
      filter: Number
    },
    {
      type: "input",
      name: "longitude",
      message: withDefaultLabel("Longitude", defaultLocation?.longitude ?? 29.95),
      default: String(defaultLocation?.longitude ?? 29.95),
      validate: (value) => parseNumber(value, "Longitude", { min: -180, max: 180 }),
      filter: Number
    }
  ]);
}

async function askForLocation(preferences) {
  const locations = loadLocations();
  const rememberedLocation = findRememberedLocation(locations, preferences.location);
  const choices = [];

  if (rememberedLocation) {
    choices.push({ name: `Use ${formatLocation(rememberedLocation)}`, value: "remembered" });
  }

  choices.push(
    { name: "Search for a city", value: "search", disabled: locations.length === 0 ? "No saved locations available" : false },
    { name: "Enter coordinates manually", value: "manual" }
  );

  const { locationMode } = await inquirer.prompt([
    {
      type: "list",
      name: "locationMode",
      message: "How would you like to choose your location?",
      choices,
      default: rememberedLocation ? "remembered" : locations.length > 0 ? "search" : "manual"
    }
  ]);

  if (locationMode === "remembered") {
    return rememberedLocation;
  }

  if (locationMode === "manual") {
    return askManualLocation(rememberedLocation);
  }

  const { search } = await inquirer.prompt([
    {
      type: "input",
      name: "search",
      message: withDefaultLabel("City or country", rememberedLocation?.city || "Alexandria"),
      default: rememberedLocation?.city || "Alexandria",
      validate: (value) => value.trim() ? true : "Enter a city or country name."
    }
  ]);

  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = locations
    .filter((entry) => {
      const haystack = `${entry.country} ${entry.region || ""} ${entry.city}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 50);

  if (matches.length === 0) {
    console.log("No matching location was found. Please enter the coordinates manually.\n");
    return askManualLocation(rememberedLocation);
  }

  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Choose a location",
      pageSize: 15,
      choices: matches.map((entry) => ({
        name: formatLocation(entry),
        value: entry
      }))
    }
  ]);

  return selected;
}

async function main() {
  console.log("Mawakit Prayer Times\n");

  const preferences = loadPreferences();
  const location = await askForLocation(preferences);
  const current = todayParts();

  const dateBase = await inquirer.prompt([
    {
      type: "input",
      name: "year",
      message: withDefaultLabel("Year", current.year),
      default: String(current.year),
      validate: (value) => parseNumber(value, "Year", { min: 1900, max: 3000 }),
      filter: Number
    },
    {
      type: "input",
      name: "month",
      message: withDefaultLabel("Month", current.month),
      default: String(current.month),
      validate: (value) => parseNumber(value, "Month", { min: 1, max: 12 }),
      filter: Number
    }
  ]);

  const { day } = await inquirer.prompt([
    {
      type: "input",
      name: "day",
      message: withDefaultLabel("Day", current.day),
      default: String(current.day),
      validate: (value) => {
        const parsed = parseNumber(value, "Day", { min: 1, max: 31 });
        if (parsed !== true) {
          return parsed;
        }

        const date = { ...dateBase, day: Number(value) };
        return dateIsValid(date) ? true : "Enter a valid calendar date.";
      },
      filter: Number
    }
  ]);

  const date = { ...dateBase, day };
  const timezoneDefaults = getTimezoneDefaults(location, date);
  const timeSettings = await askTimeSettings(preferences, timezoneDefaults);
  const rememberedMethod = preferences.method && (CALCULATION_METHODS[preferences.method] || preferences.method === CUSTOM_METHOD)
    ? preferences.method
    : location.country === "Egypt" ? "egyptian" : "mwl";
  const defaultAsrShadowFactor = preferences.asrShadowFactor ?? 1;
  const defaultElevation = preferences.height ?? location.elevation ?? 5;
  const defaultFajrAngle = preferences.fajrAngle ?? 18;
  const defaultIshaAngle = preferences.ishaAngle ?? 17;

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: withDefaultLabel("Prayer time convention", methodName(rememberedMethod)),
      choices: [
        ...Object.entries(CALCULATION_METHODS).map(([value, method]) => ({
          name: formatMethodChoice(method),
          value
        })),
        { name: "Custom angles", value: CUSTOM_METHOD }
      ],
      default: rememberedMethod
    },
    {
      type: "input",
      name: "fajrAngle",
      message: withDefaultLabel("Fajr angle", defaultFajrAngle),
      default: String(defaultFajrAngle),
      when: (answersSoFar) => answersSoFar.method === CUSTOM_METHOD,
      validate: (value) => parseNumber(value, "Fajr angle", { min: 0, max: 30 }),
      filter: Number
    },
    {
      type: "input",
      name: "ishaAngle",
      message: withDefaultLabel("Isha angle", defaultIshaAngle),
      default: String(defaultIshaAngle),
      when: (answersSoFar) => answersSoFar.method === CUSTOM_METHOD,
      validate: (value) => parseNumber(value, "Isha angle", { min: 0, max: 30 }),
      filter: Number
    },
    {
      type: "list",
      name: "asrShadowFactor",
      message: withDefaultLabel("Asr convention", asrName(defaultAsrShadowFactor)),
      choices: [
        { name: "Standard (Shafi, Maliki, Hanbali)", value: 1 },
        { name: "Hanafi", value: 2 }
      ],
      default: defaultAsrShadowFactor
    },
    {
      type: "input",
      name: "height",
      message: withDefaultLabel("Elevation above sea level in meters", defaultElevation),
      default: String(defaultElevation),
      validate: (value) => parseNumber(value, "Elevation above sea level", { min: 0, max: 10000 }),
      filter: Number
    }
  ]);

  const finalTimezone = applyDaylightSaving(timeSettings.baseTimezone, timeSettings.daylightSaving);
  const params = {
    ...date,
    ...answers,
    timezone: finalTimezone,
    daylightSaving: timeSettings.daylightSaving,
    method: answers.method === CUSTOM_METHOD ? undefined : answers.method,
    latitude: location.latitude,
    longitude: location.longitude
  };
  const times = calculatePrayerTimes(params);

  savePreferences({
    location: {
      id: location.id,
      city: location.city,
      country: location.country,
      region: location.region,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone
    },
    baseTimezone: timeSettings.baseTimezone,
    timezone: finalTimezone,
    daylightSaving: timeSettings.daylightSaving,
    method: answers.method,
    fajrAngle: answers.fajrAngle,
    ishaAngle: answers.ishaAngle,
    asrShadowFactor: answers.asrShadowFactor,
    height: answers.height
  });

  console.log(`\nPrayer times for ${toIsoDate(params)}`);
  if (location.city && location.country) {
    console.log(formatLocation(location));
  }
  console.log(`UTC${params.timezone >= 0 ? "+" : ""}${params.timezone} | DST ${timeSettings.daylightSaving ? "yes" : "no"} | ${location.timezone || "manual timezone"} | ${params.latitude}, ${params.longitude}`);
  console.table(times);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});