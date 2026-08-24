// tools/envelopeCheck.js — does the massing sit inside the buildable envelope?
//
// Setbacks, overlaps, spacing between volumes, height, site coverage. Not the
// internal layout: nothing here knows or cares how the floor plan is arranged.
// It measures where a volume is allowed to be and reports the distances; the
// SITE PLANNER agent decides what is worth arguing about.

import { SITE } from '../core/site.js';
import {
  volumeToBox, footprintCorners, footprintGap, footprintsOverlap, round
} from './geometry.js';
import { baseSlab, planArea, volumeFloorArea } from '../core/form.js';

/**
 * @param {object} state the design world from core/state.js
 * @param {object} rules the ARCHITECT agent's knowledge base
 * @returns {{
 *   volumes: Array, pairs: Array, siteCoveragePercent: number,
 *   totalGFA: number, violationCount: number, units: object
 * }}
 */
export function envelopeCheck(state, rules) {
  // Setbacks and spacing are measured against the slab that touches the
  // ground, which for a podium or a stepped tower is the widest one.
  const boxes = state.volumes.map(v => {
    const slab = baseSlab(v);
    return { x: slab.x, z: slab.z, w: slab.w, d: slab.d,
             height: v.floors * v.floorHeight, rotation: slab.rotation };
  });

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
      footprintArea: round(planArea(baseSlab(volume)), 0),
      gfa: round(volumeFloorArea(volume), 0),
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
  const footprintTotal = state.volumes.reduce((sum, v) => sum + planArea(baseSlab(v)), 0);
  const siteArea = SITE.width * SITE.depth;
  const coverage = (footprintTotal / siteArea) * 100;
  const totalGFA = state.volumes.reduce((sum, v) => sum + volumeFloorArea(v), 0);

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
