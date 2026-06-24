# Mawakit Prayer Times

Mawakit is an interactive command-line prayer time calculator built with Node.js and Inquirer. It calculates daily prayer times for cities around the world using selectable prayer-time conventions.

## Features

- Search more than 234,000 locations from the GeoNames city database.
- Automatically suggests the standard UTC offset from the selected location timezone and date.
- Asks whether daylight saving time should be applied.
- Remembers your last prompt choices, including location, convention, Asr convention, UTC offset, daylight-saving setting, and elevation.
- Supports common prayer-time conventions:
  - Egyptian General Authority of Survey
  - Muslim World League
  - North America (ISNA)
  - University of Islamic Sciences, Karachi
  - Umm al-Qura, Makkah
  - Dubai
  - Qatar
  - Kuwait
  - Moonsighting Committee
  - Singapore
  - Turkey / Diyanet
  - Tehran
  - Original Mawakit default
  - Custom Fajr and Isha angles
- Supports Standard and Hanafi Asr conventions.

## Requirements

- Node.js 20 or newer

## Installation

Install dependencies:

```bash
npm install
```

## Usage

Run the CLI:

```bash
npm start
```

Then choose your location, date, standard UTC offset, daylight-saving setting, prayer-time convention, Asr convention, and elevation.

## Prompt Memory

Mawakit saves your last choices in the user configuration folder:

- Windows: `%APPDATA%\\mawakit\\preferences.json`
- macOS/Linux: `$XDG_CONFIG_HOME/mawakit/preferences.json` or `~/.config/mawakit/preferences.json`

The next run will offer your previous location and reuse your previous defaults.

## Data Source

Location data is generated from the GeoNames `cities500` export, with country and region names normalized from GeoNames supporting files.

GeoNames data is licensed under Creative Commons Attribution 4.0:
https://creativecommons.org/licenses/by/4.0/

Source:
https://download.geonames.org/export/dump/

## Development

Run tests:

```bash
npm test
```

Check syntax:

```bash
node --check ./src/cli.js
node --check ./src/prayer-times.js
node --check ./scripts/import-geonames.js
```

Regenerate location data after downloading GeoNames files into `tmp/geonames`:

```bash
node ./scripts/import-geonames.js
```

## Notes

High-latitude fallback rules are not implemented yet. If sunrise, sunset, Fajr, or Isha cannot be calculated astronomically for a location/date, the result may show `Unavailable`.