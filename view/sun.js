// view/sun.js — where the sun is, given a date, a time and a latitude.
//
// Pure maths. No Three.js in this file, so the shadow analysis tool in
// milestone 2 can use exactly the same numbers the viewport draws with.
//
// TIME CONVENTION: local solar time. 12:00 means the sun is due south, at its
// highest for the day. Real clock time drifts from solar time by up to ~16
// minutes (the equation of time) plus your longitude offset within the
// timezone. Shadow studies in architecture are normally quoted in solar time,
// and it saves students a timezone rabbit hole, so that is what we use.
//
// Algorithm: the standard NOAA solar position equations.

const DEG = Math.PI / 180;   // multiply degrees by this to get radians
const RAD = 180 / Math.PI;   // multiply radians by this to get degrees

// Days before the first of each month in a non-leap year.
const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Convert a month (1-12) and day (1-31) to a day of year (1-365). */
export function dayOfYear(month, day) {
  return DAYS_BEFORE_MONTH[month] + day;
}

/**
 * Solar declination in radians — how far north or south of the equator the sun
 * is on a given day. Ranges from about -23.4 degrees in December to +23.4 in June.
 */
function declination(doy) {
  // Fractional year, in radians.
  const g = (2 * Math.PI / 365) * (doy - 1);

  return 0.006918
    - 0.399912 * Math.cos(g)
    + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g)
    + 0.00148  * Math.sin(3 * g);
}

/**
 * Where is the sun?
 *
 * @param {number} month     1-12
 * @param {number} day       1-31
 * @param {number} hour      0-24, local solar time (12 = solar noon)
 * @param {number} latitude  degrees north, positive
 * @returns {{altitude: number, azimuth: number, isUp: boolean}}
 *   altitude — degrees above the horizon, negative when the sun has set
 *   azimuth  — degrees clockwise from north (0 N, 90 E, 180 S, 270 W)
 */
export function sunPosition(month, day, hour, latitude) {
  const doy = dayOfYear(month, day);
  const decl = declination(doy);
  const lat = latitude * DEG;

  // Hour angle: 0 at solar noon, -15 degrees per hour before, +15 after.
  const hourAngle = (hour - 12) * 15 * DEG;

  // Altitude above the horizon.
  const sinAltitude =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));

  // Azimuth, measured clockwise from north.
  const cosAzimuth =
    (Math.sin(decl) - Math.sin(lat) * Math.sin(altitude)) /
    (Math.cos(lat) * Math.cos(altitude));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * RAD;

  // acos only returns 0-180, which covers the morning. After solar noon the
  // sun is in the western half of the sky, so mirror it.
  if (hourAngle > 0) azimuth = 360 - azimuth;

  const altitudeDeg = altitude * RAD;

  return {
    altitude: altitudeDeg,
    azimuth,
    isUp: altitudeDeg > 0
  };
}

/**
 * The same position as a direction vector pointing FROM the site TOWARD the sun,
 * in our world coordinates (+X east, +Z south, +Y up).
 *
 * Shadows fall in the opposite direction. At solar noon here the sun is due
 * south (+Z), so shadows stretch north (-Z) — straight into the park.
 *
 * @returns {{x: number, y: number, z: number}} unit vector
 */
export function sunVector(month, day, hour, latitude) {
  const { altitude, azimuth } = sunPosition(month, day, hour, latitude);

  const alt = altitude * DEG;
  const azi = azimuth * DEG;
  const horizontal = Math.cos(alt);

  return {
    x:  Math.sin(azi) * horizontal,   // east component
    y:  Math.sin(alt),                // up
    z: -Math.cos(azi) * horizontal    // north is -Z, so flip the sign
  };
}
