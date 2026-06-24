#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import inquirer from "inquirer";
import { CALCULATION_METHODS, calculatePrayerTimes, toIsoDate } from "./prayer-times.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const locationsPath = path.join(rootDir, "data", "locations.json");

const CUSTOM_METHOD = "custom";

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

function suggestTimezone(location, date) {
  const timezoneOffset = getTimezoneOffset(location.timezone, date);
  if (Number.isFinite(timezoneOffset)) {
    return timezoneOffset;
  }

  const offset = Math.round(location.longitude / 15);
  return Math.max(-12, Math.min(14, offset));
}

async function askForLocation() {
  const locations = loadLocations();
  const { locationMode } = await inquirer.prompt([
    {
      type: "list",
      name: "locationMode",
      message: "How would you like to choose your location?",
      choices: [
        { name: "Search for a city", value: "search", disabled: locations.length === 0 ? "No saved locations available" : false },
        { name: "Enter coordinates manually", value: "manual" }
      ],
      default: locations.length > 0 ? "search" : "manual"
    }
  ]);

  if (locationMode === "manual") {
    return inquirer.prompt([
      {
        type: "input",
        name: "latitude",
        message: "Latitude",
        default: "31.19",
        validate: (value) => parseNumber(value, "Latitude", { min: -90, max: 90 }),
        filter: Number
      },
      {
        type: "input",
        name: "longitude",
        message: "Longitude",
        default: "29.95",
        validate: (value) => parseNumber(value, "Longitude", { min: -180, max: 180 }),
        filter: Number
      }
    ]);
  }

  const { search } = await inquirer.prompt([
    {
      type: "input",
      name: "search",
      message: "City or country",
      default: "Alexandria",
      validate: (value) => value.trim() ? true : "Enter a city or country name."
    }
  ]);

  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = locations
    .filter((entry) => {
      const haystack = `${entry.country} ${entry.city}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 50);

  if (matches.length === 0) {
    console.log("No matching location was found. Please enter the coordinates manually.\n");
    return inquirer.prompt([
      {
        type: "input",
        name: "latitude",
        message: "Latitude",
        default: "31.19",
        validate: (value) => parseNumber(value, "Latitude", { min: -90, max: 90 }),
        filter: Number
      },
      {
        type: "input",
        name: "longitude",
        message: "Longitude",
        default: "29.95",
        validate: (value) => parseNumber(value, "Longitude", { min: -180, max: 180 }),
        filter: Number
      }
    ]);
  }

  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Choose a location",
      pageSize: 15,
      choices: matches.map((entry) => ({
        name: `${entry.city}${entry.region ? `, ${entry.region}` : ""}, ${entry.country}`,
        value: entry
      }))
    }
  ]);

  return selected;
}

async function main() {
  console.log("Mawakit Prayer Times\n");

  const location = await askForLocation();
  const current = todayParts();

  const dateBase = await inquirer.prompt([
    {
      type: "input",
      name: "year",
      message: "Year",
      default: String(current.year),
      validate: (value) => parseNumber(value, "Year", { min: 1900, max: 3000 }),
      filter: Number
    },
    {
      type: "input",
      name: "month",
      message: "Month",
      default: String(current.month),
      validate: (value) => parseNumber(value, "Month", { min: 1, max: 12 }),
      filter: Number
    }
  ]);

  const { day } = await inquirer.prompt([
    {
      type: "input",
      name: "day",
      message: "Day",
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
  const defaultTimezone = suggestTimezone(location, date);

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "timezone",
      message: "UTC offset",
      default: String(defaultTimezone),
      validate: (value) => parseNumber(value, "UTC offset", { min: -12, max: 14 }),
      filter: Number
    },
    {
      type: "list",
      name: "method",
      message: "Prayer time convention",
      choices: [
        ...Object.entries(CALCULATION_METHODS).map(([value, method]) => ({
          name: formatMethodChoice(method),
          value
        })),
        { name: "Custom angles", value: CUSTOM_METHOD }
      ],
      default: location.country === "Egypt" ? "egyptian" : "mwl"
    },
    {
      type: "input",
      name: "fajrAngle",
      message: "Fajr angle",
      default: "18",
      when: (answersSoFar) => answersSoFar.method === CUSTOM_METHOD,
      validate: (value) => parseNumber(value, "Fajr angle", { min: 0, max: 30 }),
      filter: Number
    },
    {
      type: "input",
      name: "ishaAngle",
      message: "Isha angle",
      default: "17",
      when: (answersSoFar) => answersSoFar.method === CUSTOM_METHOD,
      validate: (value) => parseNumber(value, "Isha angle", { min: 0, max: 30 }),
      filter: Number
    },
    {
      type: "list",
      name: "asrShadowFactor",
      message: "Asr convention",
      choices: [
        { name: "Standard (Shafi, Maliki, Hanbali)", value: 1 },
        { name: "Hanafi", value: 2 }
      ],
      default: 1
    },
    {
      type: "input",
      name: "height",
      message: "Elevation in meters",
      default: "5",
      validate: (value) => parseNumber(value, "Elevation", { min: 0, max: 10000 }),
      filter: Number
    }
  ]);

  const params = {
    ...date,
    ...answers,
    method: answers.method === CUSTOM_METHOD ? undefined : answers.method,
    latitude: location.latitude,
    longitude: location.longitude
  };
  const times = calculatePrayerTimes(params);

  console.log(`\nPrayer times for ${toIsoDate(params)}`);
  if (location.city && location.country) {
    console.log(`${location.city}, ${location.country}`);
  }
  console.log(`UTC${params.timezone >= 0 ? "+" : ""}${params.timezone} | ${location.timezone || "manual timezone"} | ${params.latitude}, ${params.longitude}`);
  console.table(times);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
