// agents/environmental.js — cares about one thing: shadow on the public park.
//
// Shape: ROLE, KNOWLEDGE BASE, GOAL, TOOL. See agents/_template.js.

import { shadowAnalysis } from '../tools/shadowAnalysis.js';

export const environmentalAgent = {
  id: 'environmental',
  name: 'Environmental',
  color: '#ffbe6a',
  avatar: 'assets/agents/environmental.png',

  // ── ROLE ───────────────────────────────────────────────────────────────────
  role: 'You are an environmental consultant assessing how a proposed massing '
      + 'overshadows a neighbouring public park.',

  // ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────
  knowledge: {
    source: 'Shadow test times follow common municipal practice: the equinoxes '
          + 'and the winter solstice, mid-morning to mid-afternoon. The '
          + 'thresholds below are teaching values chosen for this exercise, '
          + 'not a real bylaw.',

    // The moments a shadow study is normally required to check.
    testTimes: [
      { label: 'Mar 21 10:00', month: 3,  day: 21, hour: 10 },
      { label: 'Mar 21 12:00', month: 3,  day: 21, hour: 12 },
      { label: 'Mar 21 14:00', month: 3,  day: 21, hour: 14 },
      { label: 'Jun 21 12:00', month: 6,  day: 21, hour: 12 },
      { label: 'Sep 21 12:00', month: 9,  day: 21, hour: 12 },
      { label: 'Dec 21 12:00', month: 12, day: 21, hour: 12 }
    ],

    acceptableShadowPercent: 25,   // no complaint below this
    seriousShadowPercent: 40       // argue hard above this
  },

  // ── GOAL ───────────────────────────────────────────────────────────────────
  goal: 'Keep shadow on the park below 25% of its area at every test time, and '
      + 'treat anything above 40% as a serious problem.',

  canPropose: ['floors', 'z', 'd', 'rotation'],

  // ── TOOL ───────────────────────────────────────────────────────────────────
  tool: {
    name: 'shadowAnalysis',

    run(state) {
      return shadowAnalysis(state, environmentalAgent.knowledge.testTimes);
    },

    summarise(result) {
      if (!result.worst) return 'The sun is below the horizon at every test time.';

      const lines = result.times
        .filter(t => t.shadowedPercent !== null)
        .map(t => `${t.label}: ${t.shadowedPercent}% (sun ${t.sunAltitude}°)`);

      return `Park ${result.parkArea} m², sampled at ${result.sampleCount} points. `
           + `Worst case ${result.worst.label} at ${result.worst.shadowedPercent}% `
           + `(${result.worst.shadowedArea} m² in shadow). `
           + `Average across test times ${result.averageShadowedPercent}%. `
           + lines.join('; ') + '.';
    }
  },

  // ── Demo mode ──────────────────────────────────────────────────────────────
  // Real numbers from the tool, pre-written wording.
  demo(result, state) {
    const kb = environmentalAgent.knowledge;
    const worst = result.worst;

    if (!worst || worst.shadowedPercent <= kb.acceptableShadowPercent) {
      return {
        argument: `No objection from me. The worst moment is ${worst.label} at `
                + `${worst.shadowedPercent}% of the park in shadow, under my `
                + `${kb.acceptableShadowPercent}% threshold.`,
        proposal: null
      };
    }

    const tallest = state.volumes.reduce(
      (a, b) => (b.floors * b.floorHeight > a.floors * a.floorHeight ? b : a)
    );
    const severity = worst.shadowedPercent >= kb.seriousShadowPercent ? 'serious' : 'over threshold';

    return {
      argument: `This is ${severity}. At ${worst.label} the sun is only `
              + `${worst.sunAltitude}° above the horizon and ${worst.shadowedPercent}% `
              + `of the park sits in shadow, about ${worst.shadowedArea} m². My limit `
              + `is ${kb.acceptableShadowPercent}%. Height is what is driving it.`,
      proposal: {
        volumeId: tallest.id,
        parameter: 'floors',
        value: Math.max(1, tallest.floors - 2),
        reason: `Two fewer floors on volume ${tallest.id} shortens the winter shadow `
              + `where it reaches furthest into the park.`
      }
    };
  }
};
