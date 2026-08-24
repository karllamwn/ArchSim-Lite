// core/transcript.js — everything that was said, kept for export.
//
// The decision log in core/log.js records what CHANGED. This records what was
// SAID. Between them they are the paper trail: the argument, and its outcome.

const lines = [];   // [{ round, who, text, kind }]

export function recordLine(entry) {
  lines.push(entry);
}

export function transcriptLines() {
  return lines.slice();
}

/** The whole discussion as markdown, for the MD export button. */
export function transcriptText() {
  const out = ['# ArchSim Lite — agent discussion', ''];
  let currentRound = null;

  for (const line of lines) {
    if (line.round !== currentRound) {
      currentRound = line.round;
      out.push('', `## Round ${currentRound ?? '—'}`, '');
    }
    if (line.kind === 'system') out.push(`_${line.text}_`, '');
    else out.push(`**${line.who}** — ${line.text}`, '');
  }

  if (lines.length === 0) out.push('_Nothing recorded yet._');
  return out.join('\n');
}
