import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const geonamesDir = path.join(rootDir, "tmp", "geonames");
const outputPath = path.join(rootDir, "data", "locations.json");

const countryInfoPath = path.join(geonamesDir, "countryInfo.txt");
const admin1Path = path.join(geonamesDir, "admin1CodesASCII.txt");
const citiesPath = path.join(geonamesDir, "cities500.txt");

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
}

function loadCountries() {
  const countries = new Map();
  for (const line of readLines(countryInfoPath)) {
    if (line.startsWith("#")) {
      continue;
    }

    const cols = line.split("\t");
    const iso = cols[0];
    const name = cols[4];
    if (iso && name) {
      countries.set(iso, name);
    }
  }

  return countries;
}

function loadAdmin1() {
  const admin1 = new Map();
  for (const line of readLines(admin1Path)) {
    const cols = line.split("\t");
    const key = cols[0];
    const name = cols[1];
    if (key && name) {
      admin1.set(key, name);
    }
  }

  return admin1;
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function preferredName(name, asciiName) {
  if (name && !hasArabic(name)) {
    return name;
  }

  return asciiName || name;
}

function importLocations() {
  const countries = loadCountries();
  const admin1 = loadAdmin1();
  const seen = new Set();
  const locations = [];

  for (const line of readLines(citiesPath)) {
    const cols = line.split("\t");
    const geonameId = Number(cols[0]);
    const name = preferredName(cols[1], cols[2]);
    const latitude = Number(cols[4]);
    const longitude = Number(cols[5]);
    const featureCode = cols[7];
    const countryCode = cols[8];
    const admin1Code = cols[10];
    const population = Number(cols[14] || 0);
    const elevation = cols[15] ? Number(cols[15]) : null;
    const timezone = cols[17] || null;

    if (!geonameId || !name || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const duplicateKey = `${countryCode}:${admin1Code}:${name.toLowerCase()}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
    if (seen.has(duplicateKey)) {
      continue;
    }
    seen.add(duplicateKey);

    const adminKey = admin1Code ? `${countryCode}.${admin1Code}` : null;
    locations.push({
      id: geonameId,
      city: name,
      country: countries.get(countryCode) || countryCode,
      countryCode,
      region: adminKey ? admin1.get(adminKey) || null : null,
      latitude,
      longitude,
      timezone,
      population: Number.isFinite(population) ? population : 0,
      elevation: Number.isFinite(elevation) ? elevation : null,
      featureCode
    });
  }

  locations.sort((a, b) => {
    if (b.population !== a.population) {
      return b.population - a.population;
    }

    return `${a.country} ${a.region || ""} ${a.city}`.localeCompare(`${b.country} ${b.region || ""} ${b.city}`);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(locations, null, 2)}\n`);
  console.log(`Wrote ${locations.length.toLocaleString()} locations to ${path.relative(rootDir, outputPath)}`);
}

importLocations();