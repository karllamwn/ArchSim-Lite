// tools/geometry.js — small geometry helpers shared by the analysis tools.
//
// If you are writing your own tool for a new agent, these are here for you.
// Everything works in metres, in the world frame: +X east, +Z south, +Y up.

const DEG = Math.PI / 180;

/**
 * Turn a volume from core/state.js into the box shape the helpers below expect.
 * @returns {{x, z, w, d, height, rotation}}
 */
export function volumeToBox(volume) {
  return {
    x: volume.x,
    z: volume.z,
    w: volume.w,
    d: volume.d,
    height: volume.floors * volume.floorHeight,
    rotation: volume.rotation
  };
}

/**
 * Convert a world point to a box's own frame, where the box is simply
 * centred on the origin and aligned to the axes. Rotating the question is
 * much easier than rotating the box.
 */
function toBoxSpace(x, z, box) {
  const dx = x - box.x;
  const dz = z - box.z;
  const t = box.rotation * DEG;
  return {
    x:  dx * Math.cos(t) + dz * Math.sin(t),
    z: -dx * Math.sin(t) + dz * Math.cos(t)
  };
}

/** Rotate a direction into a box's frame. Directions do not get translated. */
function dirToBoxSpace(dx, dz, box) {
  const t = box.rotation * DEG;
  return {
    x:  dx * Math.cos(t) + dz * Math.sin(t),
    z: -dx * Math.sin(t) + dz * Math.cos(t)
  };
}

/** Is a world point inside a box's footprint, seen from above? */
export function pointInFootprint(x, z, box) {
  const p = toBoxSpace(x, z, box);
  return Math.abs(p.x) <= box.w / 2 && Math.abs(p.z) <= box.d / 2;
}

/**
 * Does a ray starting on the ground at (x, z) and travelling in direction
 * `dir` pass through the box? This is how we ask "is this spot in shadow":
 * point at the sun and see if a building is in the way.
 *
 * Uses the slab method: clip the ray against each pair of parallel faces and
 * see whether anything is left.
 *
 * @param {number} x world X of the ground point
 * @param {number} z world Z of the ground point
 * @param {{x,y,z}} dir unit vector pointing at the sun
 * @param {object} box from volumeToBox()
 */
export function rayHitsBox(x, z, dir, box) {
  const o = toBoxSpace(x, z, box);
  const d = dirToBoxSpace(dir.x, dir.z, box);

  // Start a little above the ground so a point sitting exactly on the base
  // plane does not count as a hit.
  const originY = 0.05;

  let tMin = 0;
  let tMax = Infinity;

  // Each axis is a pair of parallel planes ("slabs") to clip against.
  const slabs = [
    { o: o.x,     d: d.x,   min: -box.w / 2, max: box.w / 2 },
    { o: originY, d: dir.y, min: 0,          max: box.height },
    { o: o.z,     d: d.z,   min: -box.d / 2, max: box.d / 2 }
  ];

  for (const slab of slabs) {
    if (Math.abs(slab.d) < 1e-9) {
      // Ray runs parallel to this pair of faces: it either starts between
      // them and stays between them, or it can never enter.
      if (slab.o < slab.min || slab.o > slab.max) return false;
      continue;
    }
    let t1 = (slab.min - slab.o) / slab.d;
    let t2 = (slab.max - slab.o) / slab.d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMax > 0;
}

/** The four plan corners of a box, in world coordinates. */
export function footprintCorners(box) {
  const t = -box.rotation * DEG;   // box frame back into the world
  const hw = box.w / 2;
  const hd = box.d / 2;
  const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];

  return local.map(([lx, lz]) => ({
    x: box.x + lx * Math.cos(t) + lz * Math.sin(t),
    z: box.z - lx * Math.sin(t) + lz * Math.cos(t)
  }));
}

/**
 * Shortest distance between two box footprints in plan, in metres.
 * Returns 0 when they touch or overlap.
 *
 * Approximated by sampling each outline. Exact enough for a spacing check and
 * far easier to read than a full separating-axis routine.
 */
export function footprintGap(boxA, boxB) {
  const a = outlinePoints(boxA);
  const b = outlinePoints(boxB);

  if (footprintsOverlap(boxA, boxB)) return 0;

  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const dist = Math.hypot(p.x - q.x, p.z - q.z);
      if (dist < best) best = dist;
    }
  }
  return best;
}

/** Do two footprints overlap in plan? */
export function footprintsOverlap(boxA, boxB) {
  // Corner inside the other box, either way round, means they overlap.
  for (const c of footprintCorners(boxA)) {
    if (pointInFootprint(c.x, c.z, boxB)) return true;
  }
  for (const c of footprintCorners(boxB)) {
    if (pointInFootprint(c.x, c.z, boxA)) return true;
  }
  return false;
}

/** Points spaced around a footprint outline, used by footprintGap(). */
function outlinePoints(box, spacing = 1) {
  const corners = footprintCorners(box);
  const points = [];

  for (let i = 0; i < 4; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % 4];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.round(length / spacing));

    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      points.push({
        x: from.x + (to.x - from.x) * f,
        z: from.z + (to.z - from.z) * f
      });
    }
  }
  return points;
}

/** Round to a given number of decimals. Keeps tool output tidy for the LLM. */
export function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
