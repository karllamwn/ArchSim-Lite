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

// The surrounding city. These are existing buildings: you cannot change them,
// but they are there, and the ones that stand between the sun and the park cast
// their own shadow into it. That baseline matters — part of the shading the
// Environmental agent measures was never the project's fault.
//
// Placement note: shadows fall north, so only buildings SOUTH of the park can
// reach it. The row along the park's north edge frames the space without
// touching the shadow numbers.
export const CONTEXT = [
  // Immediate neighbours, either side of the site
  { name: 'East Neighbour',  x:  46, z:   4, width: 22, depth: 30, height: 18 },
  { name: 'West Neighbour',  x: -46, z:   2, width: 20, depth: 26, height: 14 },

  // Across the lane to the south, behind the site
  { name: 'South Block A',   x: -22, z:  46, width: 26, depth: 22, height: 21 },
  { name: 'South Block B',   x:  16, z:  48, width: 24, depth: 20, height: 12 },
  { name: 'South Tower',     x:  50, z:  52, width: 18, depth: 18, height: 34 },

  // The far side of the park, framing it from the north
  { name: 'North Row A',     x: -34, z: -62, width: 22, depth: 16, height: 11 },
  { name: 'North Row B',     x:  -6, z: -64, width: 20, depth: 16, height:  9 },
  { name: 'North Row C',     x:  22, z: -62, width: 24, depth: 16, height: 13 },

  // Flanking the park, east and west
  { name: 'Park Edge East',  x:  48, z: -34, width: 18, depth: 24, height: 16 },
  { name: 'Park Edge West',  x: -48, z: -36, width: 18, depth: 22, height: 10 }
];

// Kept as a named export because the first neighbour is the one the layout
// rules and the older examples refer to.
export const NEIGHBOUR = CONTEXT[0];

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
