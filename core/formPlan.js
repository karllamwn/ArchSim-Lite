// core/formPlan.js — the footprint, as one signed distance function.
//
// Split out of core/form.js because it carries the whole horizontal story: the
// base outline, the void cut out of it, whether a point is inside, how much
// area there is, and the outline the viewport extrudes. All five come from one
// function, which is the point — the solid on screen, the rays the shadow tool
// casts, and the area in the readout cannot describe different buildings.
//
// It is a signed DISTANCE rather than a yes/no. With a boolean you can only ask
// which side of the edge a sample is on, and an outline traced from that comes
// back stair-stepped. With a distance the crossing point can be interpolated,
// so a rectangle traces as a rectangle.

const DEG = Math.PI / 180;

// ── The field ────────────────────────────────────────────────────────────────

/**
 * How far inside the footprint a local point is, in metres.
 * Positive inside, negative outside, zero on the edge.
 */
export function planDistance(lx, lz, slab) {
  return Math.min(baseDistance(lx, lz, slab), -voidDistance(lx, lz, slab));
}

/** Distance inside the BASE outline. */
function baseDistance(lx, lz, slab) {
  const hw = slab.w / 2;
  const hd = slab.d / 2;

  switch (slab.base) {
    case 'ellipse': {
      const k = Math.hypot(lx / hw, lz / hd);
      return (1 - k) * Math.min(hw, hd);
    }

    // A circle, not an ellipse: the smaller half-dimension wins, so the plan
    // stays round however the width and depth sliders are set.
    case 'circle':
      return Math.min(hw, hd) - Math.hypot(lx, lz);

    // A rectangle with the four corners cut off at 45 degrees.
    case 'chamfered': {
      const cut = Math.min(hw, hd) * slab.chamfer;
      const box = Math.min(hw - Math.abs(lx), hd - Math.abs(lz));
      const corner = ((hw - Math.abs(lx)) + (hd - Math.abs(lz)) - cut) / Math.SQRT2;
      return Math.min(box, corner);
    }

    // A rotated square inscribed in the bounding box.
    case 'diamond':
      return (1 - Math.abs(lx) / hw - Math.abs(lz) / hd) * Math.min(hw, hd) / Math.SQRT2;

    case 'rect':
    default:
      return Math.min(hw - Math.abs(lx), hd - Math.abs(lz));
  }
}

/**
 * Distance inside the PLAN void. Positive inside the void.
 *
 * The L and the U reach the perimeter, and their rectangles are pushed well
 * past the outline on those sides. That is what stops a wall being drawn around
 * the notch: a courtyard is a hole in the middle of a floor plate and has an
 * inner facade, but an L is simply a smaller floor plate. Cutting the notch as
 * a hole was what put a facade around thin air.
 */
function voidDistance(lx, lz, slab) {
  const hw = slab.w / 2;
  const hd = slab.d / 2;
  const r = slab.voidRatio;
  const far = Math.max(slab.w, slab.d);   // safely outside the outline

  let box;   // [minX, maxX, minZ, maxZ]
  switch (slab.plan) {
    case 'courtyard': box = [-hw * r, hw * r, -hd * r, hd * r]; break;
    case 'lshape':    box = [hw * (1 - 2 * r), far, hd * (1 - 2 * r), far]; break;
    case 'ushape':    box = [-hw * r, hw * r, hd * (1 - 2 * r), far]; break;
    default:          return -far;        // solid: nothing is inside the void
  }

  const [minX, maxX, minZ, maxZ] = box;
  return Math.min(lx - minX, maxX - lx, lz - minZ, maxZ - lz);
}

// ── Point test ───────────────────────────────────────────────────────────────

/** Is a world point inside this slab's footprint, seen from above? */
export function pointInPlan(x, z, slab) {
  const p = toLocal(x, z, slab);
  return planDistance(p.lx, p.lz, slab) >= 0;
}

/** World point into the slab's own frame, where it is centred and axis-aligned. */
function toLocal(x, z, slab) {
  const dx = x - slab.x;
  const dz = z - slab.z;
  const t = slab.rotation * DEG;
  return {
    lx:  dx * Math.cos(t) + dz * Math.sin(t),
    lz: -dx * Math.sin(t) + dz * Math.cos(t)
  };
}

// ── Area ─────────────────────────────────────────────────────────────────────

const AREA_SAMPLES = 48;

/**
 * Footprint area of a slab, in m².
 *
 * Measured by sampling rather than by formula: any base can be combined with
 * any void, and there is no tidy expression for "ellipse minus off-centre L".
 * A fixed grid keeps it deterministic, so the same design always reports the
 * same area, and 48x48 lands within a fraction of a percent.
 */
export function planArea(slab) {
  const cell = (slab.w / AREA_SAMPLES) * (slab.d / AREA_SAMPLES);
  let inside = 0;

  for (let i = 0; i < AREA_SAMPLES; i++) {
    const lx = slab.w * ((i + 0.5) / AREA_SAMPLES - 0.5);
    for (let j = 0; j < AREA_SAMPLES; j++) {
      const lz = slab.d * ((j + 0.5) / AREA_SAMPLES - 0.5);
      if (planDistance(lx, lz, slab) >= 0) inside++;
    }
  }
  return inside * cell;
}

// ── Outline ──────────────────────────────────────────────────────────────────

const TRACE_STEPS = 100;

/**
 * Trace the footprint as closed loops of local points, using marching squares
 * over planDistance. The largest loop is the outline; any others are holes.
 *
 * Tracing rather than writing a polygon per shape is what keeps the drawing
 * honest: the extruded solid comes from the same field the shadow rays test.
 * It also means a plan a student invents is drawn correctly without them
 * touching the viewport — implement the distance, get the geometry.
 */
export function planOutlines(slab) {
  const pad = Math.max(slab.w, slab.d) * 0.05;
  const minX = -slab.w / 2 - pad, maxX = slab.w / 2 + pad;
  const minZ = -slab.d / 2 - pad, maxZ = slab.d / 2 + pad;
  const stepX = (maxX - minX) / TRACE_STEPS;
  const stepZ = (maxZ - minZ) / TRACE_STEPS;

  // Sample once; marching squares reads each corner from four cells.
  const field = [];
  for (let i = 0; i <= TRACE_STEPS; i++) {
    field[i] = [];
    for (let j = 0; j <= TRACE_STEPS; j++) {
      field[i][j] = planDistance(minX + i * stepX, minZ + j * stepZ, slab);
    }
  }

  const at = (i, j) => ({ x: minX + i * stepX, y: minZ + j * stepZ });
  const cross = (pa, va, pb, vb) => {
    const t = va / (va - vb);
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  };

  const segments = [];
  for (let i = 0; i < TRACE_STEPS; i++) {
    for (let j = 0; j < TRACE_STEPS; j++) {
      const va = field[i][j], vb = field[i + 1][j];
      const vc = field[i + 1][j + 1], vd = field[i][j + 1];

      const code = (va >= 0 ? 1 : 0) | (vb >= 0 ? 2 : 0)
                 | (vc >= 0 ? 4 : 0) | (vd >= 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;

      const pa = at(i, j), pb = at(i + 1, j), pc = at(i + 1, j + 1), pd = at(i, j + 1);
      const bottom = () => cross(pa, va, pb, vb);
      const right  = () => cross(pb, vb, pc, vc);
      const top    = () => cross(pc, vc, pd, vd);
      const left   = () => cross(pd, vd, pa, va);

      // Wound so the inside stays on the left of each segment.
      const cases = {
        1:  [[left, bottom]],
        2:  [[bottom, right]],
        3:  [[left, right]],
        4:  [[right, top]],
        5:  [[left, bottom], [right, top]],
        6:  [[bottom, top]],
        7:  [[left, top]],
        8:  [[top, left]],
        9:  [[top, bottom]],
        10: [[bottom, right], [top, left]],
        11: [[top, right]],
        12: [[right, left]],
        13: [[right, bottom]],
        14: [[bottom, left]]
      };
      for (const pair of cases[code] ?? []) segments.push([pair[0](), pair[1]()]);
    }
  }

  return stitch(segments);
}

/** Join segments end to end into closed loops, largest first. */
function stitch(segments) {
  const key = p => p.x.toFixed(4) + ',' + p.y.toFixed(4);

  const byStart = new Map();
  for (const seg of segments) {
    const k = key(seg[0]);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(seg);
  }

  const loops = [];
  const used = new Set();

  for (const seed of segments) {
    if (used.has(seed)) continue;

    const loop = [seed[0]];
    let current = seed;
    let guard = 0;

    while (current && !used.has(current) && guard++ < segments.length + 2) {
      used.add(current);
      loop.push(current[1]);
      const next = byStart.get(key(current[1]));
      current = next ? next.find(s => !used.has(s)) : null;
    }

    if (loop.length > 3) loops.push(simplify(loop));
  }

  return loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
}

/** Drop points on a straight run, so a rectangle comes back as four corners. */
function simplify(points, tolerance = 0.03) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1], b = points[i], c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > tolerance) out.push(b);
  }
  return out;
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
