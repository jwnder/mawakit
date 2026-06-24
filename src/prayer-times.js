import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Rounding
} from "adhan";

export const CALCULATION_METHODS = {
  egyptian: {
    name: "Egyptian General Authority of Survey",
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    libraryMethod: "Egyptian"
  },
  mwl: {
    name: "Muslim World League",
    fajrAngle: 18,
    ishaAngle: 17,
    libraryMethod: "MuslimWorldLeague"
  },
  isna: {
    name: "North America (ISNA)",
    fajrAngle: 15,
    ishaAngle: 15,
    libraryMethod: "NorthAmerica"
  },
  karachi: {
    name: "University of Islamic Sciences, Karachi",
    fajrAngle: 18,
    ishaAngle: 18,
    libraryMethod: "Karachi"
  },
  ummAlQura: {
    name: "Umm al-Qura, Makkah",
    fajrAngle: 18.5,
    ishaInterval: 90,
    libraryMethod: "UmmAlQura"
  },
  dubai: {
    name: "Dubai",
    fajrAngle: 18.2,
    ishaAngle: 18.2,
    libraryMethod: "Dubai"
  },
  qatar: {
    name: "Qatar",
    fajrAngle: 18,
    ishaInterval: 90,
    libraryMethod: "Qatar"
  },
  kuwait: {
    name: "Kuwait",
    fajrAngle: 18,
    ishaAngle: 17.5,
    libraryMethod: "Kuwait"
  },
  moonsighting: {
    name: "Moonsighting Committee",
    fajrAngle: 18,
    ishaAngle: 18,
    libraryMethod: "MoonsightingCommittee"
  },
  singapore: {
    name: "Singapore",
    fajrAngle: 20,
    ishaAngle: 18,
    libraryMethod: "Singapore"
  },
  turkey: {
    name: "Turkey / Diyanet",
    fajrAngle: 18,
    ishaAngle: 17,
    libraryMethod: "Turkey"
  },
  tehran: {
    name: "Tehran",
    fajrAngle: 17.7,
    ishaAngle: 14,
    libraryMethod: "Tehran"
  },
  oldMawakit: {
    name: "Original Mawakit default",
    fajrAngle: 17.5,
    ishaAngle: 17.5,
    libraryMethod: "Other"
  }
};


const PI = 4 * Math.atan(1);

function toRadians(value) {
  return value * PI / 180;
}

function toDegrees(value) {
  return value * 180 / PI;
}

function normalizeDegrees(value) {
  return value - Math.floor(value / 360) * 360;
}

function legacySolarApprox(date, solarMinutes) {
  const d1 = date.day;
  let y1;
  let m1;

  if (date.month > 2) {
    y1 = date.year;
    m1 = date.month - 3;
  } else {
    y1 = date.year - 1;
    m1 = date.month + 9;
  }

  let t = solarMinutes / (60 * 24) + d1 + Math.floor(30.6 * m1 + 0.5) + Math.floor(365.25 * (y1 - 1976));
  t = (t - 8707.5) / 36525.0;

  const g = normalizeDegrees(357.528 + 35999.05 * t);
  const c = 1.915 * Math.sin(toRadians(g)) + 0.02 * Math.sin(toRadians(2 * g));
  const l = normalizeDegrees(280.46 + 36000.77 * t + c);
  const alpha = l - 2.466 * Math.sin(toRadians(2 * l)) + 0.053 * Math.sin(toRadians(4 * l));
  const obliquity = 23.4393 - 0.013 * t;

  return {
    declination: toDegrees(Math.atan(Math.tan(toRadians(obliquity)) * Math.sin(toRadians(alpha)))),
    eot: (l - c - alpha) * 4
  };
}

function legacyHourAngle(x, declination, latitude) {
  const sinDsinLat = Math.sin(toRadians(declination)) * Math.sin(toRadians(latitude));
  const cosDcosLat = Math.cos(toRadians(declination)) * Math.cos(toRadians(latitude));
  const acosInput = (x - sinDsinLat) / cosDcosLat;

  if (acosInput < -1 || acosInput > 1) {
    return Number.NaN;
  }

  return toDegrees(Math.acos(acosInput)) / 15.0;
}

function formatLegacyTime(value) {
  if (!Number.isFinite(value)) {
    return "Unavailable";
  }

  let totalMinutes = Math.round(value * 60) % (24 * 60);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  let hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour < 12 ? "am" : "pm";

  if (hour >= 12) {
    hour -= 12;
  }

  if (hour === 0) {
    hour = 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function calculateLegacyPrayerTimes(options) {
  const methodConfig = CALCULATION_METHODS[options.method] || CALCULATION_METHODS.egyptian;
  const fajrAngle = Number.isFinite(options.fajrAngle) ? options.fajrAngle : methodConfig.fajrAngle;
  const ishaAngle = Number.isFinite(options.ishaAngle) ? options.ishaAngle : methodConfig.ishaAngle;
  const ishaInterval = Number.isFinite(options.ishaInterval) ? options.ishaInterval : methodConfig.ishaInterval;
  const solarMinutes = 4 * (options.longitude - 15 * options.timezone);
  const approx = legacySolarApprox(options, solarMinutes);
  const declination = approx.declination;
  const noon = 12 - (options.longitude - 15 * options.timezone) / 15 - approx.eot / 60;
  const sunriseAngle = Math.sin(toRadians(-0.8333 - 0.0347 * Math.sqrt(options.height || 0)));
  const fajrTwilightAngle = -Math.sin(toRadians(fajrAngle));
  const asrAltitude = toDegrees(Math.atan(1 / ((options.asrShadowFactor || 1) + Math.tan(toRadians(Math.abs(options.latitude - declination))))));
  const asrAngle = Math.sin(toRadians(asrAltitude));

  const sunriseOffset = legacyHourAngle(sunriseAngle, declination, options.latitude);
  const fajrOffset = legacyHourAngle(fajrTwilightAngle, declination, options.latitude);
  const asrOffset = legacyHourAngle(asrAngle, declination, options.latitude);
  const sunset = noon + sunriseOffset;

  let isha;
  if (Number.isFinite(ishaAngle)) {
    const ishaTwilightAngle = -Math.sin(toRadians(ishaAngle));
    const ishaOffset = legacyHourAngle(ishaTwilightAngle, declination, options.latitude);
    isha = noon + ishaOffset;
  } else if (Number.isFinite(ishaInterval)) {
    isha = sunset + ishaInterval / 60;
  } else {
    isha = Number.NaN;
  }

  return {
    times: {
      Fajr: formatLegacyTime(noon - fajrOffset),
      Sunrise: formatLegacyTime(noon - sunriseOffset),
      Zuhr: formatLegacyTime(noon),
      Asr: formatLegacyTime(noon + asrOffset),
      Sunset: formatLegacyTime(sunset),
      Esha: formatLegacyTime(isha)
    },
    warnings: [
      "Legacy Mawakit calculations are kept for comparison and historical compatibility only.",
      "Legacy results may differ from modern libraries and official timetables; use the Adhan library engine for normal use.",
      "Times are calculated estimates. Confirm official local mosque or authority timetables when accuracy is critical."
    ],
    engine: "legacy"
  };
}
function formatTime(date, timezoneOffset) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !Number.isFinite(timezoneOffset)) {
    return "Unavailable";
  }

  const shifted = new Date(date.getTime() + timezoneOffset * 60 * 60 * 1000);
  let hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const suffix = hour < 12 ? "am" : "pm";

  if (hour >= 12) {
    hour -= 12;
  }

  if (hour === 0) {
    hour = 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function buildParameters(options, coordinates) {
  const methodConfig = CALCULATION_METHODS[options.method] || CALCULATION_METHODS.egyptian;
  const methodFactory = CalculationMethod[methodConfig.libraryMethod];
  const parameters = typeof methodFactory === "function"
    ? methodFactory()
    : CalculationMethod.Other();

  if (methodConfig.libraryMethod === "Other") {
    parameters.fajrAngle = methodConfig.fajrAngle;
    parameters.ishaAngle = methodConfig.ishaAngle;
    parameters.ishaInterval = 0;
  }

  if (Number.isFinite(options.fajrAngle)) {
    parameters.fajrAngle = options.fajrAngle;
  }

  if (Number.isFinite(options.ishaAngle)) {
    parameters.ishaAngle = options.ishaAngle;
    parameters.ishaInterval = 0;
  }

  if (Number.isFinite(options.ishaInterval)) {
    parameters.ishaInterval = options.ishaInterval;
    parameters.ishaAngle = 0;
  }

  parameters.madhab = Number(options.asrShadowFactor) === 2 ? Madhab.Hanafi : Madhab.Shafi;
  parameters.rounding = Rounding.Nearest;
  parameters.highLatitudeRule = normalizeHighLatitudeRule(options.highLatitudeRule) || HighLatitudeRule.recommended(coordinates);
  parameters.polarCircleResolution = PolarCircleResolution.AqrabYaum;

  return parameters;
}

function normalizeHighLatitudeRule(value) {
  const rules = {
    middleOfTheNight: HighLatitudeRule.MiddleOfTheNight,
    middleofthenight: HighLatitudeRule.MiddleOfTheNight,
    seventhOfTheNight: HighLatitudeRule.SeventhOfTheNight,
    seventhofthenight: HighLatitudeRule.SeventhOfTheNight,
    twilightAngle: HighLatitudeRule.TwilightAngle,
    twilightangle: HighLatitudeRule.TwilightAngle
  };

  return rules[value] || null;
}

function buildDate({ day, month, year }) {
  return new Date(year, month - 1, day);
}

function buildWarnings(options, parameters) {
  const warnings = [
    "Times are calculated estimates. Confirm official local mosque or authority timetables when accuracy is critical.",
    "Different apps may differ by a few minutes because of convention, rounding, adjustments, coordinates, and high-latitude rules."
  ];

  if (!options.timezoneName) {
    warnings.push("No IANA timezone was available, so times were formatted from the manual UTC offset.");
  }

  if (Math.abs(options.latitude) >= 48) {
    warnings.push(`High-latitude rule applied: ${parameters.highLatitudeRule}. Fajr and Isha may be approximated.`);
  }

  if (parameters.polarCircleResolution !== PolarCircleResolution.Unresolved && Math.abs(options.latitude) >= 65) {
    warnings.push(`Polar-circle fallback applied when needed: ${parameters.polarCircleResolution}.`);
  }

  if (Number.isFinite(options.fajrAngle) || Number.isFinite(options.ishaAngle) || Number.isFinite(options.ishaInterval)) {
    warnings.push("Custom Fajr/Isha settings were used, so results may not match named convention timetables.");
  }

  return warnings;
}

export function calculatePrayerTimes(options) {
  if (options.engine === "legacy") {
    return calculateLegacyPrayerTimes(options);
  }

  const coordinates = new Coordinates(options.latitude, options.longitude);
  const parameters = buildParameters(options, coordinates);
  const prayerTimes = new PrayerTimes(coordinates, buildDate(options), parameters);
  const timezone = options.timezone;

  return {
    times: {
      Fajr: formatTime(prayerTimes.fajr, timezone),
      Sunrise: formatTime(prayerTimes.sunrise, timezone),
      Zuhr: formatTime(prayerTimes.dhuhr, timezone),
      Asr: formatTime(prayerTimes.asr, timezone),
      Sunset: formatTime(prayerTimes.sunset, timezone),
      Esha: formatTime(prayerTimes.isha, timezone)
    },
    warnings: buildWarnings(options, parameters),
    engine: "adhan"
  };
}

export function toIsoDate({ day, month, year }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
