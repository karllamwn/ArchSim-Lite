// agents/community.js — speaks for a surveyed neighbourhood.
//
// Shape: ROLE, KNOWLEDGE BASE, GOAL, TOOL. See agents/_template.js.
//
// The survey is INVENTED. It is shaped like a real consultation dataset so the
// exercise behaves realistically, but nobody was asked. The agent is required
// to say so whenever it cites the numbers.

import { surveyScore } from '../tools/surveyScore.js';

export const communityAgent = {
  id: 'community',
  name: 'Community',
  color: '#ff8aa5',
  avatar: 'assets/agents/community.png',

  // ── ROLE ───────────────────────────────────────────────────────────────────
  role: 'You represent a neighbourhood consultation. You speak only from the '
      + 'survey in your knowledge base, and you always make clear that the '
      + 'survey is fictional teaching data.',

  // ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────
  knowledge: {
    source: 'FICTIONAL. Invented for this workshop. Structured like a real '
          + 'consultation return so the exercise behaves realistically, but no '
          + 'residents were surveyed.',

    respondents: 214,
    disclaimer: 'fictional survey data, invented for this exercise',

    // weight: how much this concern counts toward overall satisfaction
    // comfortableUpTo / unacceptableAbove: where satisfaction starts to fall,
    // and where it reaches zero
    concerns: [
      {
        id: 'parkShadow',
        label: 'Shadow on the park',
        weight: 0.45,
        respondentsRaising: 168,
        unit: '% of park newly shadowed by this project at the worst test time',
        comfortableUpTo: 15,
        unacceptableAbove: 45
      },
      {
        id: 'height',
        label: 'Building height',
        weight: 0.30,
        respondentsRaising: 121,
        unit: 'm, tallest volume',
        comfortableUpTo: 22,
        unacceptableAbove: 45
      },
      {
        id: 'bulk',
        label: 'Bulk on the street',
        weight: 0.25,
        respondentsRaising: 87,
        unit: '% of site covered',
        comfortableUpTo: 35,
        unacceptableAbove: 60
      }
    ],

    satisfactionFloor: 60   // below this the agent argues rather than accepts
  },

  // ── GOAL ───────────────────────────────────────────────────────────────────
  goal: 'Keep overall community satisfaction at or above 60 out of 100, and '
      + 'speak up first for whichever concern scores lowest.',

  canPropose: ['plan', 'floors', 'w', 'd', 'z'],

  // ── TOOL ───────────────────────────────────────────────────────────────────
  tool: {
    name: 'surveyScore',

    // This tool needs the shadow numbers, which the negotiation engine has
    // already computed this round and passes in as context. Agents share
    // measurements; they do not each recompute them.
    run(state, context) {
      return surveyScore(state, context.shadow, communityAgent.knowledge);
    },

    summarise(result) {
      const lines = result.concerns.map(c =>
        `${c.label} ${c.measured} (${c.unit}) scores ${c.satisfaction}/100, weight ${c.weight}`
      );
      return `Overall satisfaction ${result.overallSatisfaction}/100 from `
           + `${result.respondents} respondents (${result.disclaimer}). `
           + lines.join('; ') + `. Lowest: ${result.lowestConcern.label}.`;
    }
  },

  // ── GOAL, AS A NUMBER ──────────────────────────────────────────────────────
  // The survey already produces a 0-100 figure, so this agent simply reports it.
  satisfaction(result) {
    return result.overallSatisfaction;
  },

  // ── What this agent watches ────────────────────────────────────────────────
  highlights(result) {
    return [
      `satisfaction ${result.overallSatisfaction}/100`,
      `lowest: ${result.lowestConcern.label.toLowerCase()}`,
      `${result.respondents} respondents`,
      'fictional survey'
    ];
  },

  // ── Demo answers ───────────────────────────────────────────────────────────
  demoAnswer(topic, result, state) {
    const kb = communityAgent.knowledge;
    const lowest = result.lowestConcern;

    if (topic === 'evidence') {
      const lines = result.concerns.map(c =>
        `${c.label.toLowerCase()} ${c.measured} ${c.unit} scoring ${c.satisfaction}/100`
      ).join(', ');
      return `surveyScore, weighing ${result.concerns.length} concerns from `
           + `${result.respondents} respondents: ${lines}. Overall `
           + `${result.overallSatisfaction}/100. This is ${result.disclaimer}.`;
    }

    if (topic === 'threshold') {
      return `${kb.satisfactionFloor} out of 100 overall. Below that I argue. The weights `
           + `come from how many people raised each concern — shadow on the park carries `
           + `${result.concerns[0].weight}, and ${result.concerns[0].respondentsRaising} of `
           + `${result.respondents} raised it. Again: ${result.disclaimer}.`;
    }

    if (topic === 'remedy') {
      if (result.overallSatisfaction >= kb.satisfactionFloor) {
        return `Nothing needed. ${result.overallSatisfaction}/100 clears my floor of `
             + `${kb.satisfactionFloor}.`;
      }
      return `Work on ${lowest.label.toLowerCase()} and nothing else. It scores `
           + `${lowest.satisfaction}/100 and carries weight ${lowest.weight}, so it is `
           + `dragging the total down on its own. Fixing the other two would barely move `
           + `the number.`;
    }
    return null;
  },

  // ── Demo reply ─────────────────────────────────────────────────────────────
  demoReply(result, state, others) {
    const kb = communityAgent.knowledge;
    const lowest = result.lowestConcern;

    if (result.overallSatisfaction >= kb.satisfactionFloor) {
      return `Nothing further from the survey. ${result.overallSatisfaction}/100 is `
           + `above my floor, and I would rather spend the goodwill on a later round.`;
    }

    const ally = others.find(o => o.wantsChange && o.parameter === 'floors');
    const planner = others.find(o => o.id === 'planner');

    if (lowest.id === 'parkShadow' && ally) {
      return `${ally.name} is measuring the same thing I am hearing about. `
           + `${lowest.respondentsRaising} of ${result.respondents} respondents raised `
           + `shadow on the park, and it is my lowest-scoring concern at `
           + `${lowest.satisfaction}/100. I support the reduction.`;
    }

    if (planner) {
      return `The floor-area point is fair, and I am not asking for the building to `
           + `disappear. But ${lowest.label.toLowerCase()} scores `
           + `${lowest.satisfaction}/100 and drags the total to `
           + `${result.overallSatisfaction}. Something has to give on that concern, `
           + `not on all of them.`;
    }

    return null;
  },

  // ── Demo mode ──────────────────────────────────────────────────────────────
  demo(result, state) {
    const kb = communityAgent.knowledge;
    const lowest = result.lowestConcern;

    if (result.overallSatisfaction >= kb.satisfactionFloor) {
      return {
        argument: `The neighbourhood can live with this. Overall ${result.overallSatisfaction}/100 `
                + `across ${result.respondents} respondents, my floor is ${kb.satisfactionFloor}. `
                + `Weakest point is ${lowest.label.toLowerCase()} at ${lowest.satisfaction}/100. `
                + `Reminder that this is ${result.disclaimer}.`,
        proposal: null
      };
    }

    const tallest = state.volumes.reduce(
      (a, b) => (b.floors * b.floorHeight > a.floors * a.floorHeight ? b : a)
    );

    // Argue about whichever concern scored worst, and propose against that.
    // Bulk is a shape complaint before it is a size one: a courtyard reads as
    // less overbearing from the street than the same floor area as a slab, and
    // it keeps the area the architect is fighting for.
    const proposalByConcern = {
      parkShadow: { parameter: 'floors', value: Math.max(1, tallest.floors - 2) },
      height:     { parameter: 'floors', value: Math.max(1, tallest.floors - 3) },
      bulk: (tallest.plan ?? 'rect') === 'rect'
        ? { parameter: 'plan', value: 'courtyard' }
        : { parameter: 'w', value: Math.max(6, tallest.w - 5) }
    };
    const move = proposalByConcern[lowest.id] ?? proposalByConcern.height;

    return {
      argument: `Satisfaction is ${result.overallSatisfaction}/100, under my floor of `
              + `${kb.satisfactionFloor}. The complaint is ${lowest.label.toLowerCase()}: `
              + `${lowest.measured} ${lowest.unit}, scoring ${lowest.satisfaction}/100, raised `
              + `by ${lowest.respondentsRaising} of ${result.respondents} respondents. `
              + `This is ${result.disclaimer}, but the pattern is the one to design against.`,
      proposal: {
        volumeId: tallest.id,
        parameter: move.parameter,
        value: move.value,
        reason: `Address ${lowest.label.toLowerCase()}, the lowest-scoring concern in the survey.`
      }
    };
  }
};
