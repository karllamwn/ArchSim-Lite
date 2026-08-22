// core/log.js — the decision log.
//
// Every accepted proposal is recorded with who asked for it, what changed, and
// the evidence behind it. This is the artefact the negotiation leaves behind:
// not the design, but the reasons for it.

import { formatValue } from './parameters.js';

const entries = [];
const listeners = [];

/** Register a function to run whenever the log gains an entry. */
export function subscribeLog(fn) {
  listeners.push(fn);
  fn(entries);
}

function notify() {
  for (const fn of listeners) fn(entries);
}

/**
 * Record a decision.
 * @param {object} entry
 * @param {number} entry.round
 * @param {string} entry.agentId
 * @param {string} entry.agentName
 * @param {string} entry.volumeId
 * @param {string} entry.parameter
 * @param {number} entry.from
 * @param {number} entry.to
 * @param {string} entry.reason    the agent's stated reason
 * @param {string} entry.evidence  the tool line the agent argued from
 * @param {string} entry.decision  'accepted' or 'rejected'
 */
export function record(entry) {
  entries.push({ ...entry, at: new Date().toISOString() });
  notify();
}

export function getEntries() {
  return entries.slice();
}

/** A one-line human reading of an entry, used by the log panel. */
export function describe(entry) {
  const from = formatValue(entry.parameter, entry.from);
  const to = formatValue(entry.parameter, entry.to);
  return `R${entry.round} · ${entry.volumeId} ${entry.parameter} ${from} → ${to}`;
}

/**
 * The whole log as plain text, for copying into a report.
 * This is what a student hands in alongside the design.
 */
export function toText() {
  if (entries.length === 0) return 'No decisions recorded yet.';

  return entries.map(e => {
    const from = formatValue(e.parameter, e.from);
    const to = formatValue(e.parameter, e.to);
    return [
      `Round ${e.round} — ${e.decision.toUpperCase()}`,
      `  ${e.volumeId}.${e.parameter}: ${from} → ${to}`,
      `  proposed by: ${e.agentName}`,
      `  reason: ${e.reason}`,
      `  evidence: ${e.evidence}`
    ].join('\n');
  }).join('\n\n');
}
