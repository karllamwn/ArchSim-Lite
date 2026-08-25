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
    //
    // They are read against the AVERAGE across the test times above, not the
    // single worst moment. The worst moment is always Dec 21 noon, when the sun
    // is 17 degrees up and the shadow is longer than the park whatever is
    // built: 6, 8 and 10 storeys all measure 61.6%. Scored on that, the design
    // makes no difference until it suddenly does, and the only way to move the
    // number is to demolish the building — which is what this agent used to
    // argue for. The average moves smoothly with the massing, so it is the one
    // worth negotiating over. The worst case is still reported as evidence.
    acceptableShadowPercent: 20,   // no complaint below this
    // The pair spans the range the design actually covers: the opening massing
    // averages 50% added and a settled one around 8%, so 20 to 55 puts every
    // real design somewhere on the slope. A narrower ceiling clamped the first
    // round to zero, and a zero on the radar reads as a broken chart rather
    // than as a building with a problem.
    seriousShadowPercent: 55,      // argue hard above this

    // How far past the threshold this agent will let a design sit before it
    // asks for another change. A shadow study is a model, not a measurement:
    // insisting on 19.9% over 20.4% is arguing about the sampling grid. The
    // band also stops the last rounds turning into one-floor haggling over a
    // number nobody could defend to that precision.
    tolerancePercent: 5
  },

  // ── GOAL ───────────────────────────────────────────────────────────────────
  goal: 'Keep the shadow this project adds to the park below 20% of its area at '
      + 'average across the test times, allowing 5 percentage points of '
      + 'tolerance because a shadow study is a model, and treat anything above '
      + '55% as serious. '
      + 'Judge the design on what it adds, not on shadow that would fall anyway.',

  canPropose: ['section', 'floors', 'z', 'd', 'rotation'],

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
    const added = result.worst ? result.averageAddedByDesignPercent : 0;

    if (added <= kb.acceptableShadowPercent) return 100;
    if (added >= kb.seriousShadowPercent) return 0;

    const span = kb.seriousShadowPercent - kb.acceptableShadowPercent;
    return Math.round(100 * (1 - (added - kb.acceptableShadowPercent) / span));
  },

  // ── What this agent watches ────────────────────────────────────────────────
  highlights(result) {
    if (!result.worst) return ['sun below horizon'];
    return [
      `park shadow ${result.worst.addedByDesignPercent}%`,
      `sun ${result.worst.sunAltitude}°`,
      result.worst.label.toLowerCase(),
      `${result.sampleCount} samples`
    ];
  },

  // ── Demo answers ───────────────────────────────────────────────────────────
  demoAnswer(topic, result, state) {
    const kb = environmentalAgent.knowledge;
    const worst = result.worst;
    if (!worst) return 'The sun is below the horizon at every test time, so there is nothing to measure.';

    if (topic === 'evidence') {
      return `shadowAnalysis, sampling the park at ${result.sampleCount} points against `
           + `${result.contextBuildingCount} existing buildings. Worst moment is `
           + `${worst.label}: ${worst.shadowedPercent}% of the park shaded, `
           + `${worst.existingPercent}% of it by blocks that were here first, so `
           + `${worst.addedByDesignPercent}% is this project's. Sun altitude `
           + `${worst.sunAltitude}°.`;
    }

    if (topic === 'threshold') {
      return `${kb.acceptableShadowPercent}% of the park at any test time, measured on what `
           + `this project ADDS rather than the total — shading that would happen anyway is `
           + `not the design's fault. Above ${kb.seriousShadowPercent}% I argue hard. Test `
           + `times are the equinoxes and the winter solstice, which is common municipal `
           + `practice; the percentages are teaching values, not a bylaw.`;
    }

    if (topic === 'remedy') {
      if (result.averageAddedByDesignPercent <= kb.acceptableShadowPercent) {
        return `Nothing. ${result.averageAddedByDesignPercent}% average is already under `
             + `my ${kb.acceptableShadowPercent}% limit.`;
      }
      const tallest = state.volumes.reduce((a, b) =>
        (b.floors * b.floorHeight > a.floors * a.floorHeight ? b : a));
      return `Height, on volume ${tallest.id}. At a ${worst.sunAltitude}° winter sun every `
           + `metre of height throws a long shadow north into the park. Moving the volume `
           + `south helps a little; rotating it barely helps at all.`;
    }
    return null;
  },

  // ── Demo reply ─────────────────────────────────────────────────────────────
  demoReply(result, state, others) {
    const kb = environmentalAgent.knowledge;
    const worst = result.worst;
    if (!worst) return null;

    const added = result.averageAddedByDesignPercent;
    const ally = others.find(o => o.wantsChange && o.parameter === 'floors');
    const planner = others.find(o => o.id === 'planner');

    // Under threshold: back whoever is arguing for something else.
    if (added <= kb.acceptableShadowPercent) {
      return `Shadow is not the problem this round — ${added}% added against a `
           + `${kb.acceptableShadowPercent}% limit. Whatever the others decide, `
           + `it does not change my position.`;
    }

    if (ally) {
      return `${ally.name} and I are asking for the same thing from different `
           + `evidence: they are reading the survey, I am reading a `
           + `${worst.sunAltitude}° sun angle at ${worst.label}. When two `
           + `independent measurements point the same way, that is worth something.`;
    }

    if (planner) {
      return `I hear the floor-area argument. But ${added}% of the park is shaded by `
           + `this project alone, past my ${kb.acceptableShadowPercent}% limit, and `
           + `height is the only parameter that moves it. Rotation and setback will `
           + `not fix a winter shadow.`;
    }

    return null;
  },

  // ── Demo mode ──────────────────────────────────────────────────────────────
  // Real numbers from the tool, pre-written wording.
  demo(result, state) {
    const kb = environmentalAgent.knowledge;
    const worst = result.worst;

    // Stop asking once the design is within tolerance, not once it is strictly
    // under. The threshold is where this agent starts caring; the tolerance is
    // how precisely it is willing to pretend the model knows the answer.
    const settledAt = kb.acceptableShadowPercent + kb.tolerancePercent;
    const added = result.averageAddedByDesignPercent;
    if (!worst || added <= settledAt) {
      const within = added > kb.acceptableShadowPercent;
      return {
        argument: `No objection from me. Averaged across the test times this project adds `
                + `${added}% shadow to the park; the worst single moment is ${worst.label} `
                + `at ${worst.addedByDesignPercent}% ours out of ${worst.shadowedPercent}% `
                + `shaded altogether. `
                + (within
                    ? `That is over my ${kb.acceptableShadowPercent}% threshold but inside `
                    + `the ${kb.tolerancePercent}-point tolerance I allow, and I am not `
                    + `going to argue a shadow model to that precision.`
                    : `Under my ${kb.acceptableShadowPercent}% threshold.`),
        proposal: null
      };
    }

    const tallest = state.volumes.reduce(
      (a, b) => (b.floors * b.floorHeight > a.floors * a.floorHeight ? b : a)
    );
    const severity = added >= kb.seriousShadowPercent ? 'serious' : 'over threshold';

    // Ask for the form change before the floor count. Reshaping the upper part
    // of the building buys more shadow than cutting storeys does, and it costs
    // the architect far less floor area, so it is the proposal most likely to
    // be accepted. Only once the section is doing its share is height worth
    // arguing about.
    const section = tallest.section ?? 'straight';
    if (section === 'straight') {
      return {
        argument: `This is ${severity}. At ${worst.label} the sun is only `
                + `${worst.sunAltitude}° up and the park is ${worst.shadowedPercent}% shaded. `
                + `${worst.existingPercent}% of that is the existing blocks. Averaged over `
                + `every test time we add ${added}%, against a limit of `
                + `${kb.acceptableShadowPercent}%. It is a straight extrusion, so every `
                + `storey throws the same long shadow. Reshape it before you shrink it.`,
        proposal: {
          volumeId: tallest.id,
          parameter: 'section',
          value: 'podium',
          reason: `A podium keeps the street wall and sets the tower back, so the part of `
                + `the building that reaches the park is much narrower.`
        }
      };
    }

    if (section === 'stepped') {
      return {
        argument: `Better, but not enough. We still add ${added}% on average, against `
                + `${kb.acceptableShadowPercent}%. `
                + `Stepping helps near the top; tapering the whole profile helps all the way up.`,
        proposal: {
          volumeId: tallest.id,
          parameter: 'section',
          value: 'tapered',
          reason: `A continuous taper removes mass at every level, not only above the setback.`
        }
      };
    }

    return {
      argument: `Still ${severity}. We add ${added}% on average, against `
              + `${kb.acceptableShadowPercent}%; at ${worst.label} the sun is only `
              + `${worst.sunAltitude}° up. The section is already working, so what is `
              + `left is height.`,
      proposal: {
        volumeId: tallest.id,
        parameter: 'floors',
        value: Math.max(1, tallest.floors - 1),
        reason: `With the form doing what it can, height is what is left. One storey at a `
              + `time, so we find the point where the shadow clears rather than overshooting `
              + `it and handing back area nobody needed to lose.`
      }
    };
  }
};
