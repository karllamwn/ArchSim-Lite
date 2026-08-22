// agents/_template.js — copy this file to make a new agent.
//
// THE WHOLE IDEA: one agent = one knowledge base + one goal + one tool.
// An agent may only cite numbers its own tool returns. It never calculates,
// never guesses, and never speaks about parameters outside its scope.
//
// HOW TO MAKE YOUR OWN AGENT
//   1. Copy this file to agents/yourname.js
//   2. Edit the four sections marked below, and nothing else
//   3. Add two lines to agents/index.js (an import and a list entry)
//   4. Reload the page. Your agent joins the negotiation.
//
// Ideas that work well: heritage, traffic, noise, cost, accessibility,
// ecology, fire access, wind.

import { round } from '../tools/geometry.js';

export const templateAgent = {
  // ── Identity ───────────────────────────────────────────────────────────────
  // `color` is any CSS colour. It tints this agent everywhere in the interface.
  id: 'template',
  name: 'Template',
  color: '#9df0cf',

  // ── 1. ROLE ────────────────────────────────────────────────────────────────
  // One sentence. Who is this, and what do they know about?
  role: 'You are a consultant who advises on <your topic> for a schematic design.',

  // ── 2. KNOWLEDGE BASE ──────────────────────────────────────────────────────
  // The only facts this agent is allowed to rely on. Inline JSON, so a reader
  // can see exactly what the agent knows. Put your thresholds, standards,
  // survey data or rules of thumb here — and say where they came from.
  knowledge: {
    source: 'Where these figures come from. Say plainly if they are invented.',
    comfortableUpTo: 10,
    unacceptableAbove: 30,
    unit: 'your unit here'
  },

  // ── 3. GOAL ────────────────────────────────────────────────────────────────
  // One sentence. What is this agent trying to achieve? Make it specific enough
  // that it will sometimes disagree with the other agents — an agent that
  // always agrees adds nothing to a negotiation.
  goal: 'Keep <your measured quantity> below <your threshold>.',

  // Which design parameters this agent may propose changes to. The negotiation
  // engine rejects any proposal outside this list, so an agent cannot wander
  // into someone else\'s discipline.
  // Available: x, z, w, d, rotation, floors, floorHeight
  canPropose: ['floors'],

  // ── 4. TOOL ────────────────────────────────────────────────────────────────
  // One deterministic function. State goes in, numbers with units come out.
  // No randomness, no network, no language model. If you cannot compute it
  // here, your agent is not allowed to claim it.
  tool: {
    name: 'templateMeasure',

    /**
     * @param {object} state    the design world (see core/state.js)
     * @param {object} context  { shadow } — the shadow result, already computed
     *                          this round, in case your tool needs it
     * @returns {object} plain data, with units named
     */
    run(state, context) {
      const kb = templateAgent.knowledge;
      const tallest = Math.max(...state.volumes.map(v => v.floors * v.floorHeight));

      return {
        measured: round(tallest),
        threshold: kb.comfortableUpTo,
        overBy: round(Math.max(0, tallest - kb.comfortableUpTo)),
        units: { measured: 'm' }
      };
    },

    /**
     * One short line summarising the result. It goes into the prompt the model
     * sees and appears under the agent's message as its evidence, so write it
     * for a human: name the number and its unit.
     */
    summarise(result) {
      return `Tallest volume ${result.measured} m, threshold ${result.threshold} m.`;
    }
  },

  // ── GOAL, AS A NUMBER ──────────────────────────────────────────────────────
  // The same goal as above, scored 0 to 100, so your agent gets an axis on the
  // radar and a line on the convergence graph. Keep it simple and predictable:
  // a reader should be able to guess the score from the tool result.
  //
  // Leave this out and your agent still argues, it just does not appear on the
  // charts.
  satisfaction(result) {
    const kb = templateAgent.knowledge;

    if (result.measured <= kb.comfortableUpTo) return 100;
    if (result.measured >= kb.unacceptableAbove) return 0;

    const span = kb.unacceptableAbove - kb.comfortableUpTo;
    return Math.round(100 * (1 - (result.measured - kb.comfortableUpTo) / span));
  },

  /**
   * Demo mode: what this agent says when no API key is present.
   *
   * The tool still runs for real, so the numbers below are genuine — only the
   * wording is pre-written. That is deliberate: it shows students that the
   * measurements never depend on the language model.
   *
   * Return { argument, proposal } where proposal may be null.
   */
  demo(result, state) {
    if (result.overBy <= 0) {
      return {
        argument: `Nothing to raise. ${templateAgent.tool.summarise(result)}`,
        proposal: null
      };
    }
    return {
      argument: `This is over my threshold by ${result.overBy} m. `
              + `${templateAgent.tool.summarise(result)}`,
      proposal: {
        volumeId: state.volumes[0].id,
        parameter: 'floors',
        value: Math.max(1, state.volumes[0].floors - 1),
        reason: `Bring the height back toward ${result.threshold} m.`
      }
    };
  }
};
