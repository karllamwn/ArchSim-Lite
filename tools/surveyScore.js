// tools/surveyScore.js — how satisfied the surveyed community would be.
//
// Takes the shadow result and the massing, scores each concern in the survey
// knowledge base from 0 to 100, and weights them into one number.
//
// The survey data itself is FICTIONAL. It is shaped like a real consultation
// dataset so the exercise behaves realistically, but no one was asked. The
// COMMUNITY agent is required to say so.

import { SITE } from '../core/site.js';
import { round } from './geometry.js';
import { baseSlab, planArea } from '../core/form.js';

/**
 * @param {object} state        the design world from core/state.js
 * @param {object} shadowResult output of tools/shadowAnalysis.js
 * @param {object} survey       the COMMUNITY agent's knowledge base
 * @returns {{
 *   concerns: Array, overallSatisfaction: number, respondents: number,
 *   lowestConcern: object, units: object, disclaimer: string
 * }}
 */
export function surveyScore(state, shadowResult, survey) {
  const tallest = Math.max(...state.volumes.map(v => v.floors * v.floorHeight));
  const footprintTotal = state.volumes.reduce((sum, v) => sum + planArea(baseSlab(v)), 0);
  const coverage = (footprintTotal / (SITE.width * SITE.depth)) * 100;

  // The measured value behind each concern, in the concern's own units.
  const measured = {
    // The community reacts to what the project adds, not to shadow the existing
    // blocks already cast. Same basis as the environmental agent, so the two
    // are arguing about the same number.
    parkShadow: shadowResult.worst ? shadowResult.worst.addedByDesignPercent : 0,
    height: round(tallest),
    bulk: round(coverage)
  };

  const concerns = survey.concerns.map(concern => {
    const value = measured[concern.id];
    const satisfaction = scoreConcern(value, concern);

    return {
      id: concern.id,
      label: concern.label,
      weight: concern.weight,
      respondentsRaising: concern.respondentsRaising,
      measured: value,
      unit: concern.unit,
      comfortableUpTo: concern.comfortableUpTo,
      unacceptableAbove: concern.unacceptableAbove,
      satisfaction: round(satisfaction, 0)
    };
  });

  const overall = concerns.reduce((sum, c) => sum + c.satisfaction * c.weight, 0);
  const lowest = concerns.reduce((a, b) => (b.satisfaction < a.satisfaction ? b : a), concerns[0]);

  return {
    concerns,
    overallSatisfaction: round(overall, 0),
    respondents: survey.respondents,
    lowestConcern: lowest,
    units: { satisfaction: '0-100' },
    disclaimer: survey.disclaimer
  };
}

/**
 * Turn one measured value into a 0-100 satisfaction score.
 *
 * Full marks up to `comfortableUpTo`, zero at `unacceptableAbove`, and a
 * straight line in between. Deliberately simple: a student should be able to
 * read this and predict the number before running it.
 */
function scoreConcern(value, concern) {
  if (value <= concern.comfortableUpTo) return 100;
  if (value >= concern.unacceptableAbove) return 0;

  const span = concern.unacceptableAbove - concern.comfortableUpTo;
  const over = value - concern.comfortableUpTo;
  return 100 * (1 - over / span);
}
