// agents/index.js — the register of everyone at the table.
//
// TO ADD YOUR OWN AGENT: two lines. One import, one entry in the list.
// That is the whole registration step.
//
//   import { noiseAgent } from './noise.js';
//   export const AGENTS = [ ..., noiseAgent ];
//
// Order matters only in that agents speak in this order each round.

import { sitePlannerAgent } from './sitePlanner.js';
import { environmentalAgent } from './environmental.js';
import { communityAgent } from './community.js';

export const AGENTS = [
  sitePlannerAgent,
  environmentalAgent,
  communityAgent
];

/** Look up an agent by id. */
export function getAgent(id) {
  return AGENTS.find(a => a.id === id);
}
