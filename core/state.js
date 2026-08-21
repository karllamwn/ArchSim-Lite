// core/state.js — the design world, and the only place it changes.
//
// One shared object plus a subscribe/notify pattern. Anything that needs to
// react to a design change (the 3D viewport, the parameter panel, later the
// agents) subscribes once and gets called whenever the state changes.
//
// Rule: never mutate `state` directly from outside this file. Use the update
// functions below, so every change goes through one place and every listener
// is told about it.

// ── The state ────────────────────────────────────────────────────────────────

export const state = {
  // The buildings being designed. Start with one; you can add up to three.
  // x, z  = centre of the footprint, metres from the site origin
  // w, d  = footprint width (east-west) and depth (north-south), metres
  // rotation = degrees clockwise, 0 = aligned with the site
  volumes: [
    { id: 'A', x: 0, z: 8, w: 24, d: 16, rotation: 0, floors: 6, floorHeight: 3.2 }
  ],

  // When the sun is being simulated. Local solar time: 12:00 is solar noon.
  sun: { month: 3, day: 21, hour: 12 },

  // Which volume the parameter panel is editing.
  selectedId: 'A'
};

// ── Subscribe / notify ───────────────────────────────────────────────────────

const listeners = [];

/** Register a function to run whenever the state changes. */
export function subscribe(fn) {
  listeners.push(fn);
  fn(state);          // run once immediately, so the view starts in sync
}

/** Tell every subscriber that the state changed. */
function notify() {
  for (const fn of listeners) fn(state);
}

// ── Update functions ─────────────────────────────────────────────────────────

/** Change one or more fields on a volume. e.g. updateVolume('A', {floors: 8}) */
export function updateVolume(id, patch) {
  const volume = state.volumes.find(v => v.id === id);
  if (!volume) {
    console.warn('updateVolume: no volume with id', id);
    return;
  }
  Object.assign(volume, patch);
  notify();
}

/** Change the sun date or time. e.g. updateSun({hour: 15}) */
export function updateSun(patch) {
  Object.assign(state.sun, patch);
  notify();
}

/** Add a new volume. Maximum of three, to keep the negotiation legible. */
export function addVolume() {
  if (state.volumes.length >= 3) return;

  // Next free letter: A, B, C
  const id = ['A', 'B', 'C'].find(letter => !state.volumes.some(v => v.id === letter));

  state.volumes.push({
    id, x: 0, z: -8, w: 18, d: 14, rotation: 0, floors: 4, floorHeight: 3.2
  });
  state.selectedId = id;
  notify();
}

/** Remove a volume. The last remaining one cannot be deleted. */
export function removeVolume(id) {
  if (state.volumes.length <= 1) return;
  state.volumes = state.volumes.filter(v => v.id !== id);
  if (state.selectedId === id) state.selectedId = state.volumes[0].id;
  notify();
}

/** Choose which volume the parameter panel edits. */
export function selectVolume(id) {
  state.selectedId = id;
  notify();
}

// ── Derived values ───────────────────────────────────────────────────────────
// Small helpers so the same arithmetic is not repeated in three places.

/** Total height of a volume in metres. */
export function volumeHeight(volume) {
  return volume.floors * volume.floorHeight;
}

/** Gross floor area of a volume in m². */
export function volumeGFA(volume) {
  return volume.w * volume.d * volume.floors;
}
