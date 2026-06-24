const PI = 4 * Math.atan(1);

export const CALCULATION_METHODS = {
  egyptian: {
    name: "Egyptian General Authority of Survey",
    fajrAngle: 19.5,
    ishaAngle: 17.5
  },
  mwl: {
    name: "Muslim World League",
    fajrAngle: 18,
    ishaAngle: 17
  },
  isna: {
    name: "North America (ISNA)",
    fajrAngle: 15,
    ishaAngle: 15
  },
  karachi: {
    name: "University of Islamic Sciences, Karachi",
    fajrAngle: 18,
    ishaAngle: 18
  },
  ummAlQura: {
    name: "Umm al-Qura, Makkah",
    fajrAngle: 18.5,
    ishaInterval: 90
  },
  dubai: {
    name: "Dubai",
    fajrAngle: 18.2,
    ishaAngle: 18.2
  },
  qatar: {
    name: "Qatar",
    fajrAngle: 18,
    ishaInterval: 90
  },
  kuwait: {
    name: "Kuwait",
    fajrAngle: 18,
    ishaAngle: 17.5
  },
  moonsighting: {
    name: "Moonsighting Committee",
    fajrAngle: 18,
    ishaAngle: 18
  },
  singapore: {
    name: "Singapore",
    fajrAngle: 20,
    ishaAngle: 18
  },
  turkey: {
    name: "Turkey / Diyanet",
    fajrAngle: 18,
    ishaAngle: 17
  },
  tehran: {
    name: "Tehran",
    fajrAngle: 17.7,
    ishaAngle: 14
  },
  oldMawakit: {
    name: "Original Mawakit default",
    fajrAngle: 17.5,
    ishaAngle: 17.5
  }
};

function toRadians(value) {
  return value * PI / 180;
}

function toDegrees(value) {
  return value * 180 / PI;
}

function normalizeDegrees(value) {
  return value - Math.floor(value / 360) * 360;
}

function solarApprox(date, solarMinutes) {
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

function hourAngle(x, declination, latitude) {
  const sinDsinLat = Math.sin(toRadians(declination)) * Math.sin(toRadians(latitude));
  const cosDcosLat = Math.cos(toRadians(declination)) * Math.cos(toRadians(latitude));
  const acosInput = (x - sinDsinLat) / cosDcosLat;

  if (acosInput < -1 || acosInput > 1) {
    return Number.NaN;
  }

  return toDegrees(Math.acos(acosInput)) / 15.0;
}

function formatTime(value) {
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

export function calculatePrayerTimes(options) {
  const {
    day,
    month,
    year,
    latitude,
    longitude,
    timezone,
    height,
    fajrAngle,
    ishaAngle,
    ishaInterval,
    method = "egyptian",
    asrShadowFactor = 1
  } = options;

  const methodConfig = CALCULATION_METHODS[method] || CALCULATION_METHODS.egyptian;
  const resolvedFajrAngle = Number.isFinite(fajrAngle) ? fajrAngle : methodConfig.fajrAngle;
  const resolvedIshaAngle = Number.isFinite(ishaAngle) ? ishaAngle : methodConfig.ishaAngle;
  const resolvedIshaInterval = Number.isFinite(ishaInterval) ? ishaInterval : methodConfig.ishaInterval;

  const solarMinutes = 4 * (longitude - 15 * timezone);
  const approx = solarApprox({ day, month, year }, solarMinutes);
  const declination = approx.declination;
  const noon = 12 - (longitude - 15 * timezone) / 15 - approx.eot / 60;
  const sunriseAngle = Math.sin(toRadians(-0.8333 - 0.0347 * Math.sqrt(height)));
  const fajrTwilightAngle = -Math.sin(toRadians(resolvedFajrAngle));
  const asrAltitude = toDegrees(Math.atan(1 / (asrShadowFactor + Math.tan(toRadians(Math.abs(latitude - declination))))));
  const asrAngle = Math.sin(toRadians(asrAltitude));

  const sunriseOffset = hourAngle(sunriseAngle, declination, latitude);
  const fajrOffset = hourAngle(fajrTwilightAngle, declination, latitude);
  const asrOffset = hourAngle(asrAngle, declination, latitude);
  const sunset = noon + sunriseOffset;

  let isha;
  if (Number.isFinite(resolvedIshaAngle)) {
    const ishaTwilightAngle = -Math.sin(toRadians(resolvedIshaAngle));
    const ishaOffset = hourAngle(ishaTwilightAngle, declination, latitude);
    isha = noon + ishaOffset;
  } else if (Number.isFinite(resolvedIshaInterval)) {
    isha = sunset + resolvedIshaInterval / 60;
  } else {
    isha = Number.NaN;
  }

  return {
    Fajr: formatTime(noon - fajrOffset),
    Sunrise: formatTime(noon - sunriseOffset),
    Zuhr: formatTime(noon),
    Asr: formatTime(noon + asrOffset),
    Sunset: formatTime(sunset),
    Esha: formatTime(isha)
  };
}

export function toIsoDate({ day, month, year }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}