// tools/shadowAnalysis.js — how much of the park is in shadow, and when.
//
// This is a real calculation, not a reading of the picture on screen. The park
// is covered with a grid of sample points; for each point and each test time we
// point a ray at the sun and ask whether a building is in the way. It uses the
// same sun maths the viewport draws with, so the number and the image agree.
//
// The ENVIRONMENTAL agent may only cite what this function returns.

import { SITE, PARK, NEIGHBOUR } from '../core/site.js';
import { sunVector, sunPosition } from '../view/sun.js';
import { volumeToBox, rayHitsBox, round } from './geometry.js';

// How far apart the sample points are, in metres. 2 m over a 50x30 m park is
// 375 points: fine enough to be stable, small enough to run instantly.
const SAMPLE_SPACING = 2;

/**
 * @param {object} state    the design world from core/state.js
 * @param {Array}  times    [{label, month, day, hour}, ...] moments to test
 * @returns {{
 *   times: Array<{label, hour, sunAltitude, shadowedPercent, shadowedArea}>,
 *   worst: object,
 *   averageShadowedPercent: number,
 *   parkArea: number,
 *   sampleCount: number,
 *   units: object
 * }}
 */
export function shadowAnalysis(state, times) {
  const samples = buildSampleGrid();
  const parkArea = PARK.width * PARK.depth;

  // Everything that can cast a shadow: the designed volumes plus the existing
  // neighbour block, which was there before the project and shades the park too.
  const casters = [
    ...state.volumes.map(volumeToBox),
    {
      x: NEIGHBOUR.x, z: NEIGHBOUR.z,
      w: NEIGHBOUR.width, d: NEIGHBOUR.depth,
      height: NEIGHBOUR.height, rotation: 0
    }
  ];

  const results = times.map(time => {
    const sun = sunPosition(time.month, time.day, time.hour, SITE.latitude);

    // Sun below the horizon: everything is in shadow, but nobody is in the park.
    // Report it honestly rather than pretending the number means something.
    if (!sun.isUp) {
      return {
        label: time.label,
        hour: time.hour,
        sunAltitude: round(sun.altitude),
        shadowedPercent: null,
        shadowedArea: null,
        note: 'sun below horizon'
      };
    }

    const dir = sunVector(time.month, time.day, time.hour, SITE.latitude);

    let shadowed = 0;
    for (const point of samples) {
      if (casters.some(box => rayHitsBox(point.x, point.z, dir, box))) shadowed++;
    }

    const percent = (shadowed / samples.length) * 100;

    return {
      label: time.label,
      hour: time.hour,
      sunAltitude: round(sun.altitude),
      shadowedPercent: round(percent),
      shadowedArea: round(parkArea * percent / 100, 0)
    };
  });

  // The worst moment is the one the agent will argue from.
  const measured = results.filter(r => r.shadowedPercent !== null);
  const worst = measured.reduce(
    (a, b) => (b.shadowedPercent > a.shadowedPercent ? b : a),
    measured[0] ?? null
  );

  const average = measured.length
    ? round(measured.reduce((sum, r) => sum + r.shadowedPercent, 0) / measured.length)
    : null;

  return {
    times: results,
    worst,
    averageShadowedPercent: average,
    parkArea: round(parkArea, 0),
    sampleCount: samples.length,
    units: { area: 'm2', percent: '% of park area', altitude: 'degrees' }
  };
}

/** A regular grid of points covering the park. */
function buildSampleGrid() {
  const points = [];
  const halfW = PARK.width / 2;
  const halfD = PARK.depth / 2;

  // Start half a spacing in, so points represent equal cells and none of them
  // sit exactly on the boundary.
  for (let x = -halfW + SAMPLE_SPACING / 2; x < halfW; x += SAMPLE_SPACING) {
    for (let z = -halfD + SAMPLE_SPACING / 2; z < halfD; z += SAMPLE_SPACING) {
      points.push({ x: PARK.x + x, z: PARK.z + z });
    }
  }
  return points;
}
