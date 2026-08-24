// core/trace.js — the application-level trace behind Surveillance mode.
//
// The activity feed shows what an agent SAID. This shows what it was WORKING
// FROM: the instruction it was given, the tool it called, what came back, the
// reasoning it produced, and the proposal it returned. Same events, one layer
// down.
//
// It matters because the project's claim is traceability, and a claim like that
// is worth exactly as much as the evidence a sceptic can inspect. This is the
// evidence. Nothing here is generated for display; every line is emitted at the
// moment the thing it describes actually happens.

const listeners = [];
const buffer = [];        // kept so opening Surveillance mid-round is not blank
const MAX_LINES = 400;    // per session, plenty for a workshop and bounded

/** The kinds of line, matching the colours in Surveillance mode. */
export const TRACE = {
  SYS:   'sys',     // the instruction the agent was given
  EVAL:  'eval',    // a tool call and what it returned
  THINK: 'think',   // reasoning
  OUT:   'out',     // the agent's answer
  PARAM: 'param',   // a proposed parameter change
  ERR:   'err',
  META:  'meta'     // round boundaries and other bookkeeping
};

/**
 * Record one line.
 * @param {string} agentId  which pane it belongs to, or 'system'
 * @param {string} type     one of TRACE
 * @param {string} text
 */
export function trace(agentId, type, text) {
  const entry = { agentId, type, text: String(text), at: new Date() };
  buffer.push(entry);
  if (buffer.length > MAX_LINES) buffer.shift();
  for (const fn of listeners) fn(entry);
}

/** Called whenever a line is recorded. Replays the buffer on subscribe. */
export function subscribeTrace(fn) {
  listeners.push(fn);
  for (const entry of buffer) fn(entry);
}

/** Agent status shown above each pane: idle, thinking, active. */
const statusListeners = [];
const statuses = new Map();

export function setTraceStatus(agentId, status) {
  statuses.set(agentId, status);
  for (const fn of statusListeners) fn(agentId, status);
}

export function subscribeTraceStatus(fn) {
  statusListeners.push(fn);
  for (const [agentId, status] of statuses) fn(agentId, status);
}

export function clearTrace() {
  buffer.length = 0;
  for (const fn of listeners) fn(null);   // null means "wipe the panes"
}
