// core/site.js — the fixed context the design sits in.
//
// Nothing here changes while you design. The site, the park and the neighbour
// are the givens; the volumes in core/state.js are what you (and the agents)
// argue about.
//
// Coordinates: +X east, +Z south, so -Z is north. Origin (0,0) is the centre
// of the site. All dimensions in metres.

export const SITE = {
  name: 'Workshop Site',

  // Latitude drives the sun path. Vancouver, BC — same city as ArchSim V2,
  // so the shadow behaviour is familiar and the numbers are checkable.
  latitude: 49.28,

  // The buildable parcel, centred on the origin.
  width: 60,   // east-west
  depth: 40,   // north-south

  // Minimum distance a building must keep from each site edge (metres).
  // The ARCHITECT agent's knowledge base reads these in milestone 2.
  setbacks: { north: 6, south: 6, east: 4, west: 4 }
};

// The public park sits directly NORTH of the site. In the northern hemisphere
// shadows fall north, so any tall volume will reach into it. That collision is
// the point of the exercise: the ENVIRONMENTAL and COMMUNITY agents care about
// this park, the ARCHITECT agent cares about the parcel.
export const PARK = {
  name: 'Public Park',
  x: 0,        // centre, aligned with the site
  z: -35,      // 35 m north of origin
  width: 50,
  depth: 30
};

// An existing neighbour building to the east. It casts its own shadow and
// constrains what can go near the east edge.
export const NEIGHBOUR = {
  name: 'Neighbour Block',
  x: 45,       // east of the site
  z: 5,
  width: 20,
  depth: 30,
  height: 18   // roughly six storeys
};

// Convenience: the four corners of the buildable area after setbacks.
// Returns {minX, maxX, minZ, maxZ} in metres.
export function buildableBounds() {
  return {
    minX: -SITE.width / 2 + SITE.setbacks.west,
    maxX: SITE.width / 2 - SITE.setbacks.east,
    minZ: -SITE.depth / 2 + SITE.setbacks.north,
    maxZ: SITE.depth / 2 - SITE.setbacks.south
  };
}
