// core/history.js — the convergence history.
//
// After every round each agent scores the design against its own goal, 0 to 100.
// Those scores, kept round by round, are what the radar and the evolution graph
// draw. Together they answer a question the transcript cannot: is the argument
// actually going anywhere?

const rounds = [];      // [{ round, scores: { agentId: number } }]
const listeners = [];

/** Register a function to run whenever a round is recorded. */
export function subscribeHistory(fn) {
  listeners.push(fn);
  fn(rounds);
}

function notify() {
  for (const fn of listeners) fn(rounds);
}

/**
 * Record one round's scores.
 * @param {number} round
 * @param {object} scores  { agentId: 0-100 }
 */
export function recordRound(round, scores) {
  const existing = rounds.find(r => r.round === round);
  if (existing) existing.scores = scores;
  else rounds.push({ round, scores });
  notify();
}

export function getHistory() {
  return rounds.slice();
}

/** The most recent round's scores, or an empty object before the first round. */
export function latestScores() {
  return rounds.length ? rounds[rounds.length - 1].scores : {};
}

/** The mean score for a round, which is the single number for "how close are we". */
export function meanScore(scores) {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
