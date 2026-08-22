// core/negotiation.js — the round protocol.
//
// One round, in order:
//   1. Measure once. The shadow analysis runs a single time and is shared, so
//      every agent argues from the same numbers.
//   2. Each agent runs its own tool and makes an opening argument.
//   3. One reply round. Each agent reads the others and answers once, then
//      settles on a final proposal (or drops it).
//   4. Proposals go to the designer as accept/reject cards.
//
// In demo mode steps 2 and 3 use each agent's pre-written wording. The tools
// still run for real, so the numbers are always genuine — only the prose is
// canned. That split is the point of the exercise.

import { state } from './state.js';
import { AGENTS } from '../agents/index.js';
import { checkValue, snapValue, getParameter } from './parameters.js';
import { askForJSON, hasApiKey } from '../api/gemini.js';
import { shadowAnalysis } from '../tools/shadowAnalysis.js';
import { environmentalAgent } from '../agents/environmental.js';

let roundNumber = 0;
let running = false;

export function currentRound() { return roundNumber; }
export function isRunning() { return running; }

// The shape every agent reply must take. Flat on purpose: models are far more
// reliable filling a flat object than a nested one.
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    argument:    { type: 'string' },
    wantsChange: { type: 'boolean' },
    volumeId:    { type: 'string' },
    parameter:   { type: 'string' },
    value:       { type: 'number' },
    reason:      { type: 'string' }
  },
  required: ['argument', 'wantsChange', 'volumeId', 'parameter', 'value', 'reason']
};

/**
 * Run one negotiation round.
 *
 * @param {object} handlers
 * @param {function} handlers.onStatus    (text) => void
 * @param {function} handlers.onMessage   ({agent, text, evidence, kind}) => void
 * @param {function} handlers.onProposal  ({agent, proposal, evidence, round}) => void
 */
export async function runRound({ onStatus, onMessage, onProposal }) {
  if (running) return;
  running = true;
  roundNumber++;

  const live = hasApiKey();

  try {
    onStatus(`Round ${roundNumber} — ${live ? 'live' : 'demo'} mode`);

    // ── 1. Measure once, share with everyone ─────────────────────────────────
    const context = {
      shadow: shadowAnalysis(state, environmentalAgent.knowledge.testTimes)
    };

    // ── 2. Opening arguments ─────────────────────────────────────────────────
    const opening = [];

    for (const agent of AGENTS) {
      onStatus(`${agent.name} is running ${agent.tool.name}…`);

      const result = agent.tool.run(state, context);
      const evidence = agent.tool.summarise(result);

      let reply;
      try {
        reply = live
          ? await askLive(agent, evidence, null)
          : toReply(agent.demo(result, state));
      } catch (error) {
        onMessage({ agent, text: error.message, evidence, kind: 'error' });
        continue;
      }

      opening.push({ agent, reply, evidence, result });
      onMessage({ agent, text: reply.argument, evidence, kind: 'argument' });
    }

    // ── 3. One reply round, then final proposals ─────────────────────────────
    for (const entry of opening) {
      const { agent, evidence, result } = entry;

      const others = opening
        .filter(o => o.agent.id !== agent.id)
        .map(o => `${o.agent.name}: ${o.reply.argument}`)
        .join('\n');

      let final = entry.reply;

      if (live && others) {
        onStatus(`${agent.name} is responding…`);
        try {
          final = await askLive(agent, evidence, others);
          onMessage({ agent, text: final.argument, evidence, kind: 'reply' });
        } catch (error) {
          onMessage({ agent, text: error.message, evidence, kind: 'error' });
        }
      }

      if (final.wantsChange) {
        const proposal = validateProposal(agent, final);
        if (proposal.ok) {
          onProposal({ agent, proposal: proposal.value, evidence, round: roundNumber });
        } else {
          onMessage({
            agent,
            text: `Proposal rejected before it reached you: ${proposal.error}`,
            evidence,
            kind: 'error'
          });
        }
      }
    }

    onStatus(`Round ${roundNumber} complete. Accept or reject, then run another round.`);
  } finally {
    running = false;
  }
}

// ── Talking to the model ─────────────────────────────────────────────────────

async function askLive(agent, evidence, otherArguments) {
  const system = buildSystemPrompt(agent);
  const prompt = buildUserPrompt(agent, evidence, otherArguments);

  return askForJSON({
    system,
    prompt,
    schema: REPLY_SCHEMA,
    validate: reply => {
      if (typeof reply.argument !== 'string' || reply.argument.trim().length < 10) {
        return 'The argument was empty or too short.';
      }
      if (reply.wantsChange) {
        const check = validateProposal(agent, reply);
        if (!check.ok) return check.error;
      }
      return null;
    }
  });
}

function buildSystemPrompt(agent) {
  return [
    agent.role,
    '',
    'YOUR GOAL: ' + agent.goal,
    '',
    'YOUR KNOWLEDGE BASE (the only facts you may rely on):',
    JSON.stringify(agent.knowledge, null, 2),
    '',
    'RULES YOU MUST FOLLOW:',
    '- Every number you state must come from the tool result you are given.',
    '  You may not estimate, extrapolate or invent a figure.',
    '- Stay inside your own discipline. Do not argue about matters that belong',
    '  to the other consultants.',
    `- You may only propose changes to: ${agent.canPropose.join(', ')}.`,
    '- Keep the argument to at most three sentences. Be direct. Disagree when',
    '  the numbers say you should.',
    '- Set wantsChange to false when the design already meets your goal. Filling',
    '  the other fields is still required; they will be ignored.'
  ].join('\n');
}

function buildUserPrompt(agent, evidence, otherArguments) {
  const volumes = state.volumes.map(v =>
    `  ${v.id}: ${v.w}x${v.d} m, ${v.floors} floors at ${v.floorHeight} m ` +
    `(${(v.floors * v.floorHeight).toFixed(1)} m tall), centre (${v.x}, ${v.z}), ` +
    `rotated ${v.rotation}°`
  ).join('\n');

  const parts = [
    `CURRENT DESIGN (round ${roundNumber}):`,
    volumes,
    '',
    `YOUR TOOL (${agent.tool.name}) RETURNED:`,
    evidence
  ];

  if (otherArguments) {
    parts.push(
      '',
      'THE OTHER CONSULTANTS SAID:',
      otherArguments,
      '',
      'Answer them in one or two sentences, then give your final position. You',
      'may keep your proposal, change it, or drop it by setting wantsChange to false.'
    );
  } else {
    parts.push('', 'Give your opening argument and, if the numbers warrant it, one proposal.');
  }

  return parts.join('\n');
}

// ── Turning a demo response into the same shape as a live one ────────────────

function toReply(demoResponse) {
  const p = demoResponse.proposal;
  return {
    argument: demoResponse.argument,
    wantsChange: Boolean(p),
    volumeId: p ? p.volumeId : '',
    parameter: p ? p.parameter : '',
    value: p ? p.value : 0,
    reason: p ? p.reason : ''
  };
}

// ── Validation: nothing reaches the design without passing this ──────────────

/**
 * Check a proposal before it is ever shown to the designer.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
function validateProposal(agent, reply) {
  const { volumeId, parameter, value, reason } = reply;

  if (!agent.canPropose.includes(parameter)) {
    return { ok: false, error: `${agent.name} may not propose changes to "${parameter}".` };
  }

  const volume = state.volumes.find(v => v.id === volumeId);
  if (!volume) {
    return { ok: false, error: `There is no volume "${volumeId}".` };
  }

  const problem = checkValue(parameter, value);
  if (problem) return { ok: false, error: problem };

  const snapped = snapValue(parameter, value);
  if (snapped === volume[parameter]) {
    return { ok: false, error: `${parameter} is already ${snapped}; that is not a change.` };
  }

  return {
    ok: true,
    value: {
      volumeId,
      parameter,
      from: volume[parameter],
      to: snapped,
      reason: String(reason || '').trim() || 'No reason given.',
      label: getParameter(parameter).label
    }
  };
}
