// core/form.js — what shape a volume actually is.
//
// One definition of the form, used by everything: the viewport draws from it,
// the shadow tool casts rays at it, the envelope tool measures its footprint.
// If the picture and the numbers ever disagreed, an agent could argue from a
// building nobody can see. So there is exactly one description, here.
//
// THREE INDEPENDENT CHOICES, following the Grasshopper definition in ArchSim V2
// (base_shape / plan_type / section_type there):
//
//   BASE     the outline of the footprint      rectangle, ellipse, circle...
//   PLAN     what is cut out of that outline   solid, courtyard, L, U
//   SECTION  how the plate changes going up    straight, tapered, podium, stepped
//
// Separate axes on purpose. An elliptical tower with a courtyard is a real
// building; so is a chamfered podium with an L-shaped plate. Folding the
// outline and the void into one menu would have made those unbuildable.
//
// BASE and PLAN resolve into a point test; SECTION resolves into SLABS —
// horizontal bands, each a scaled copy of the footprint between two heights.
// Everything downstream sees only slabs and pointInPlan(), so a new base shape
// or a new void is one case statement and nothing else.

// ── Menus ────────────────────────────────────────────────────────────────────
// `label` is the real name, used in readouts, proposals and the decision log.
// `short` is what fits on a button — the interface can be terse without the
// record of a decision being terse.

export const BASE_SHAPES = [
  { id: 'rect',      label: 'Rectangle', short: 'Rect' },
  { id: 'ellipse',   label: 'Ellipse',   short: 'Oval' },
  { id: 'circle',    label: 'Circle',    short: 'Circ' },
  { id: 'chamfered', label: 'Chamfered', short: 'Cham' },
  { id: 'diamond',   label: 'Diamond',   short: 'Diam' }
];

export const PLAN_TYPES = [
  { id: 'solid',     label: 'Solid',     short: 'Solid' },
  { id: 'courtyard', label: 'Courtyard', short: 'Court' },
  { id: 'lshape',    label: 'L-shape',   short: 'L' },
  { id: 'ushape',    label: 'U-shape',   short: 'U' }
];

export const SECTION_TYPES = [
  { id: 'straight', label: 'Straight',       short: 'Plain' },
  { id: 'tapered',  label: 'Tapered',        short: 'Taper' },
  { id: 'podium',   label: 'Podium + tower', short: 'Podium' },
  { id: 'stepped',  label: 'Stepped',        short: 'Step' }
];

/** Extra sliders worth showing for each choice. Hidden otherwise. */
export const BASE_PARAMS = {
  rect: [], ellipse: [], circle: [], chamfered: ['chamfer'], diamond: []
};
export const PLAN_PARAMS = {
  solid: [], courtyard: ['voidRatio'], lshape: ['voidRatio'], ushape: ['voidRatio']
};
export const SECTION_PARAMS = {
  straight: [],
  tapered:  ['topScale'],
  podium:   ['podiumFloors', 'towerRatio'],
  stepped:  ['setbackEvery', 'setbackDepth']
};

// ── Section: the vertical story ──────────────────────────────────────────────

/**
 * Break a volume into horizontal bands.
 *
 * @returns {Array<{x, z, w, d, rotation, y0, y1, base, plan, voidRatio, chamfer, zone}>}
 *   zone is 'podium' or 'tower' for a podium section, otherwise 'all'. V2 can
 *   restrict a courtyard to one or the other; this carries the information a
 *   student would need to add that.
 */
export function volumeToSlabs(volume) {
  const height = volume.floors * volume.floorHeight;
  const common = {
    x: volume.x, z: volume.z, rotation: volume.rotation,
    base: volume.base ?? 'rect',
    plan: volume.plan ?? 'solid',
    voidRatio: volume.voidRatio ?? 0.5,
    chamfer: volume.chamfer ?? 0.25,
    zone: 'all'
  };

  switch (volume.section ?? 'straight') {

    case 'straight':
      return [{ ...common, w: volume.w, d: volume.d, y0: 0, y1: height }];

    // Narrows steadily toward the top. Less shadow high up, where a low sun
    // throws it furthest, which is why it earns its place in this exercise.
    case 'tapered': {
      const bands = Math.max(2, Math.min(volume.floors, 8));
      const topScale = volume.topScale ?? 0.6;
      return Array.from({ length: bands }, (_, i) => {
        const scale = 1 + (topScale - 1) * ((i + 0.5) / bands);
        return {
          ...common,
          w: volume.w * scale,
          d: volume.d * scale,
          y0: height * (i / bands),
          y1: height * ((i + 1) / bands)
        };
      });
    }

    // A wide base with a slimmer tower above: the standard urban answer to a
    // street wall, and the form most likely to keep a park in sunlight.
    case 'podium': {
      const podiumFloors = Math.min(volume.podiumFloors ?? 2, volume.floors - 1);
      if (podiumFloors < 1) {
        return [{ ...common, w: volume.w, d: volume.d, y0: 0, y1: height }];
      }
      const podiumHeight = podiumFloors * volume.floorHeight;
      const ratio = volume.towerRatio ?? 0.6;
      return [
        { ...common, zone: 'podium', w: volume.w, d: volume.d, y0: 0, y1: podiumHeight },
        { ...common, zone: 'tower',
          w: volume.w * ratio, d: volume.d * ratio, y0: podiumHeight, y1: height }
      ];
    }

    // Steps back at intervals, the way a zoning envelope makes a building step.
    case 'stepped': {
      const every = Math.max(1, volume.setbackEvery ?? 4);
      const depth = volume.setbackDepth ?? 2;
      const slabs = [];

      for (let floor = 0; floor < volume.floors; floor += every) {
        const inset = Math.floor(floor / every) * depth;
        const w = volume.w - inset * 2;
        const d = volume.d - inset * 2;
        if (w <= 2 || d <= 2) break;   // stepped away to nothing

        slabs.push({
          ...common, w, d,
          y0: floor * volume.floorHeight,
          y1: Math.min(floor + every, volume.floors) * volume.floorHeight
        });
      }
      return slabs.length ? slabs
        : [{ ...common, w: volume.w, d: volume.d, y0: 0, y1: height }];
    }

    default:
      return [{ ...common, w: volume.w, d: volume.d, y0: 0, y1: height }];
  }
}

/** The slab that touches the ground. What the envelope rules measure. */
export function baseSlab(volume) {
  return volumeToSlabs(volume)[0];
}

// ── Footprint ───────────────────────────────────────────────────
// The horizontal half of the form lives in core/formPlan.js: one signed
// distance function, and the point test, the area and the outline all read from
// it. Re-exported here so the rest of the app has a single import.

export { pointInPlan, planArea, planOutlines, planDistance } from './formPlan.js';

import { planArea as areaOf } from './formPlan.js';

/** Total floor area of a volume, taking base, plan and section into account. */
export function volumeFloorArea(volume) {
  return volumeToSlabs(volume).reduce((sum, slab) => {
    const floors = Math.round((slab.y1 - slab.y0) / volume.floorHeight);
    return sum + areaOf(slab) * floors;
  }, 0);
}
