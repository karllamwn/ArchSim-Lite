// core/form.js — what shape a volume actually is.
//
// One definition of the form, used by everything: the viewport draws from it,
// the shadow tool casts rays at it, the layout tool measures its footprint. If
// the picture and the numbers ever disagreed, an agent could argue from a
// building nobody can see. So there is exactly one description, here.
//
// A volume is described by two independent choices:
//
//   PLAN     what the footprint looks like from above
//   SECTION  how that footprint changes as the building goes up
//
// Both are resolved into SLABS: horizontal bands, each a scaled copy of the
// plan between two heights. A straight tower is one slab; a stepped tower is
// several. Everything downstream only ever sees slabs, so adding a new section
// type means adding a case here and nothing else.

const DEG = Math.PI / 180;

// ── Slabs ────────────────────────────────────────────────────────────────────

/**
 * Break a volume into horizontal bands.
 *
 * @param {object} volume from core/state.js
 * @returns {Array<{x, z, w, d, rotation, y0, y1, plan, planRatio}>}
 *   x, z      centre of this band, world metres
 *   w, d      its footprint size
 *   y0, y1    the heights it spans
 *   plan      'rect' | 'ellipse' | 'lshape' | 'courtyard'
 */
export function volumeToSlabs(volume) {
  const height = volume.floors * volume.floorHeight;
  const base = {
    x: volume.x, z: volume.z, rotation: volume.rotation,
    plan: volume.plan ?? 'rect',
    planRatio: volume.planRatio ?? 0.45
  };

  switch (volume.section ?? 'straight') {

    // A single extrusion. The simplest building, and the default.
    case 'straight':
      return [{ ...base, w: volume.w, d: volume.d, y0: 0, y1: height }];

    // Narrows steadily toward the top. Less shadow high up, where the shadow
    // reaches furthest, which is why it is worth having in this exercise.
    case 'tapered': {
      const bands = Math.max(2, Math.min(volume.floors, 8));
      const topScale = volume.topScale ?? 0.6;
      const slabs = [];
      for (let i = 0; i < bands; i++) {
        // Scale at the middle of the band, so the stack reads as a smooth taper.
        const t = (i + 0.5) / bands;
        const scale = 1 + (topScale - 1) * t;
        slabs.push({
          ...base,
          w: volume.w * scale,
          d: volume.d * scale,
          y0: height * (i / bands),
          y1: height * ((i + 1) / bands)
        });
      }
      return slabs;
    }

    // A wide base with a slimmer tower above: the standard urban response to a
    // street wall, and the form most likely to keep a park in sunlight.
    case 'podium': {
      const podiumFloors = Math.min(volume.podiumFloors ?? 2, volume.floors - 1);
      if (podiumFloors < 1) {
        return [{ ...base, w: volume.w, d: volume.d, y0: 0, y1: height }];
      }
      const podiumHeight = podiumFloors * volume.floorHeight;
      const ratio = volume.towerRatio ?? 0.6;
      return [
        { ...base, w: volume.w, d: volume.d, y0: 0, y1: podiumHeight },
        { ...base, w: volume.w * ratio, d: volume.d * ratio, y0: podiumHeight, y1: height }
      ];
    }

    // Steps back at intervals, the way a zoning envelope makes a building step.
    case 'stepped': {
      const every = Math.max(1, volume.setbackEvery ?? 4);
      const depth = volume.setbackDepth ?? 2;
      const slabs = [];

      for (let floor = 0; floor < volume.floors; floor += every) {
        const step = Math.floor(floor / every);
        const inset = step * depth;
        const w = volume.w - inset * 2;
        const d = volume.d - inset * 2;
        if (w <= 2 || d <= 2) break;   // stepped away to nothing

        const top = Math.min(floor + every, volume.floors);
        slabs.push({
          ...base,
          w, d,
          y0: floor * volume.floorHeight,
          y1: top * volume.floorHeight
        });
      }
      return slabs.length ? slabs
        : [{ ...base, w: volume.w, d: volume.d, y0: 0, y1: height }];
    }

    default:
      return [{ ...base, w: volume.w, d: volume.d, y0: 0, y1: height }];
  }
}

/** The slab that touches the ground. What the layout rules measure. */
export function baseSlab(volume) {
  return volumeToSlabs(volume)[0];
}

// ── Plan shapes ──────────────────────────────────────────────────────────────

/**
 * Is a world point inside this slab's footprint, seen from above?
 *
 * The one place plan shape is decided. Adding a shape means adding a case here
 * and an entry in PLAN_SHAPES; the viewport and the shadow tool both follow.
 */
export function pointInPlan(x, z, slab) {
  // Into the slab's own frame, where it is centred and axis-aligned.
  const dx = x - slab.x;
  const dz = z - slab.z;
  const t = slab.rotation * DEG;
  const lx =  dx * Math.cos(t) + dz * Math.sin(t);
  const lz = -dx * Math.sin(t) + dz * Math.cos(t);

  const hw = slab.w / 2;
  const hd = slab.d / 2;

  switch (slab.plan) {
    case 'ellipse':
      return (lx / hw) ** 2 + (lz / hd) ** 2 <= 1;

    case 'lshape': {
      // A rectangle with one quadrant removed.
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) return false;
      const cutW = slab.w * slab.planRatio;
      const cutD = slab.d * slab.planRatio;
      const inCut = lx > hw - cutW && lz > hd - cutD;
      return !inCut;
    }

    case 'courtyard': {
      // A ring: inside the outline, outside the void.
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) return false;
      const innerW = hw * slab.planRatio;
      const innerD = hd * slab.planRatio;
      return Math.abs(lx) > innerW || Math.abs(lz) > innerD;
    }

    case 'rect':
    default:
      return Math.abs(lx) <= hw && Math.abs(lz) <= hd;
  }
}

/**
 * Footprint area of a slab, in m².
 * Exact for the rectangle and the ellipse; the cut shapes are exact too,
 * because the pieces removed are rectangles.
 */
export function planArea(slab) {
  const full = slab.w * slab.d;

  switch (slab.plan) {
    case 'ellipse':   return Math.PI * (slab.w / 2) * (slab.d / 2);
    case 'lshape':    return full * (1 - slab.planRatio * slab.planRatio);
    case 'courtyard': return full * (1 - slab.planRatio * slab.planRatio);
    default:          return full;
  }
}

/** Total floor area of a volume, taking plan shape into account. */
export function volumeFloorArea(volume) {
  return volumeToSlabs(volume).reduce((sum, slab) => {
    const floors = Math.round((slab.y1 - slab.y0) / volume.floorHeight);
    return sum + planArea(slab) * floors;
  }, 0);
}

// ── Menus, shared by the panel and the agents ────────────────────────────────

export const PLAN_SHAPES = [
  { id: 'rect',      label: 'Rectangle' },
  { id: 'ellipse',   label: 'Ellipse' },
  { id: 'lshape',    label: 'L-shape' },
  { id: 'courtyard', label: 'Courtyard' }
];

export const SECTION_TYPES = [
  { id: 'straight', label: 'Straight' },
  { id: 'tapered',  label: 'Tapered' },
  { id: 'podium',   label: 'Podium + tower' },
  { id: 'stepped',  label: 'Stepped' }
];

/** Which extra sliders are worth showing for a given section type. */
export const SECTION_PARAMS = {
  straight: [],
  tapered:  ['topScale'],
  podium:   ['podiumFloors', 'towerRatio'],
  stepped:  ['setbackEvery', 'setbackDepth']
};

/** Which extra sliders are worth showing for a given plan shape. */
export const PLAN_PARAMS = {
  rect: [], ellipse: [], lshape: ['planRatio'], courtyard: ['planRatio']
};
