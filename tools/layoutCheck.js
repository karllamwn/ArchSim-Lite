// tools/layoutCheck.js — does the layout obey the rules of the parcel?
//
// Setbacks, overlaps, spacing between volumes, site coverage. All measured,
// none of it judged: the function reports distances and flags, and the
// ARCHITECT agent decides what to argue about.

import { SITE } from '../core/site.js';
import {
  volumeToBox, footprintCorners, footprintGap, footprintsOverlap, round
} from './geometry.js';

/**
 * @param {object} state the design world from core/state.js
 * @param {object} rules the ARCHITECT agent's knowledge base
 * @returns {{
 *   volumes: Array, pairs: Array, siteCoveragePercent: number,
 *   totalGFA: number, violationCount: number, units: object
 * }}
 */
export function layoutCheck(state, rules) {
  const boxes = state.volumes.map(volumeToBox);

  // ── Each volume against the site edges ─────────────────────────────────────
  const volumes = state.volumes.map((volume, i) => {
    const box = boxes[i];
    const corners = footprintCorners(box);

    // How close the footprint comes to each edge of the parcel. Negative means
    // it has crossed the boundary.
    const distances = {
      north: Math.min(...corners.map(c => c.z - (-SITE.depth / 2))),
      south: Math.min(...corners.map(c => (SITE.depth / 2) - c.z)),
      east:  Math.min(...corners.map(c => (SITE.width / 2) - c.x)),
      west:  Math.min(...corners.map(c => c.x - (-SITE.width / 2)))
    };

    const setbackIssues = [];
    for (const side of ['north', 'south', 'east', 'west']) {
      const required = rules.setbacks[side];
      if (distances[side] < required) {
        setbackIssues.push({
          side,
          required,
          actual: round(distances[side]),
          shortBy: round(required - distances[side])
        });
      }
    }

    const height = volume.floors * volume.floorHeight;

    return {
      id: volume.id,
      height: round(height),
      footprintArea: round(volume.w * volume.d, 0),
      gfa: round(volume.w * volume.d * volume.floors, 0),
      setbackDistances: {
        north: round(distances.north),
        south: round(distances.south),
        east:  round(distances.east),
        west:  round(distances.west)
      },
      setbackIssues,
      exceedsMaxHeight: height > rules.maxHeight,
      maxHeight: rules.maxHeight
    };
  });

  // ── Each pair of volumes against each other ────────────────────────────────
  const pairs = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const overlap = footprintsOverlap(boxes[i], boxes[j]);
      const gap = overlap ? 0 : round(footprintGap(boxes[i], boxes[j]));
      pairs.push({
        between: [state.volumes[i].id, state.volumes[j].id],
        overlap,
        gap,
        requiredGap: rules.minSpacing,
        tooClose: !overlap && gap < rules.minSpacing
      });
    }
  }

  // ── Whole-site figures ─────────────────────────────────────────────────────
  const footprintTotal = state.volumes.reduce((sum, v) => sum + v.w * v.d, 0);
  const siteArea = SITE.width * SITE.depth;
  const coverage = (footprintTotal / siteArea) * 100;
  const totalGFA = state.volumes.reduce((sum, v) => sum + v.w * v.d * v.floors, 0);

  const violationCount =
    volumes.reduce((n, v) => n + v.setbackIssues.length + (v.exceedsMaxHeight ? 1 : 0), 0) +
    pairs.filter(p => p.overlap || p.tooClose).length +
    (coverage > rules.maxCoveragePercent ? 1 : 0);

  return {
    volumes,
    pairs,
    siteArea: round(siteArea, 0),
    siteCoveragePercent: round(coverage),
    maxCoveragePercent: rules.maxCoveragePercent,
    exceedsMaxCoverage: coverage > rules.maxCoveragePercent,
    totalGFA: round(totalGFA, 0),
    violationCount,
    units: { distance: 'm', area: 'm2', coverage: '% of site area' }
  };
}
