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

    // These thresholds apply to the shadow THIS PROJECT ADDS, not to the total.
    // Part of the park is shaded by buildings that were there first, and that
    // is not something the design can answer for.
    acceptableShadowPercent: 20,   // no complaint below this
    seriousShadowPercent: 35       // argue hard above this
  },

  // ── GOAL ───────────────────────────────────────────────────────────────────
  goal: 'Keep the shadow this project adds to the park below 20% of its area at '
      + 'every test time, and treat anything above 35% as a serious problem. '
      + 'Judge the design on what it adds, not on shadow that would fall anyway.',

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
        .map(t => `${t.label}: ${t.shadowedPercent}% total, ${t.addedByDesignPercent}% ours `
                + `(sun ${t.sunAltitude}°)`);

      return `Park ${result.parkArea} m², sampled at ${result.sampleCount} points, with `
           + `${result.contextBuildingCount} existing buildings around it. `
           + `Worst case for this project is ${result.worst.label}: `
           + `${result.worst.shadowedPercent}% of the park in shadow altogether, of which `
           + `${result.worst.existingPercent}% falls there anyway and `
           + `${result.worst.addedByDesignPercent}% is added by the design. `
           + `Averages across test times: ${result.averageShadowedPercent}% total, `
           + `${result.averageAddedByDesignPercent}% added. `
           + lines.join('; ') + '.';
    }
  },

  // ── GOAL, AS A NUMBER ──────────────────────────────────────────────────────
  // Full marks while the shadow this project adds stays under the acceptable
  // threshold, zero once it passes the serious one, straight line between.
  satisfaction(result) {
    const kb = environmentalAgent.knowledge;
    const added = result.worst ? result.worst.addedByDesignPercent : 0;

    if (added <= kb.acceptableShadowPercent) return 100;
    if (added >= kb.seriousShadowPercent) return 0;

    const span = kb.seriousShadowPercent - kb.acceptableShadowPercent;
    return Math.round(100 * (1 - (added - kb.acceptableShadowPercent) / span));
  },

  // ── Demo mode ──────────────────────────────────────────────────────────────
  // Real numbers from the tool, pre-written wording.
  demo(result, state) {
    const kb = environmentalAgent.knowledge;
    const worst = result.worst;

    if (!worst || worst.addedByDesignPercent <= kb.acceptableShadowPercent) {
      return {
        argument: `No objection from me. The park is ${worst.shadowedPercent}% shaded at `
                + `${worst.label}, but only ${worst.addedByDesignPercent}% of that is this `
                + `project — the rest falls there anyway. Under my `
                + `${kb.acceptableShadowPercent}% threshold.`,
        proposal: null
      };
    }

    const tallest = state.volumes.reduce(
      (a, b) => (b.floors * b.floorHeight > a.floors * a.floorHeight ? b : a)
    );
    const severity = worst.addedByDesignPercent >= kb.seriousShadowPercent
      ? 'serious' : 'over threshold';

    return {
      argument: `This is ${severity}. At ${worst.label} the sun is only `
              + `${worst.sunAltitude}° up and the park is ${worst.shadowedPercent}% shaded. `
              + `${worst.existingPercent}% of that is the existing blocks, but `
              + `${worst.addedByDesignPercent}% is ours, against a limit of `
              + `${kb.acceptableShadowPercent}%. Height is what is driving it.`,
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
