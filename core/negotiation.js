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
import { checkValue, snapValue, getParameter, isChoice } from './parameters.js';
import { askForJSON, hasApiKey } from '../api/gemini.js';
import { shadowAnalysis } from '../tools/shadowAnalysis.js';
import { environmentalAgent } from '../agents/environmental.js';
import { recordRound } from './history.js';

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
    // Used instead of `value` when the parameter is a menu choice such as plan
    // or section. Kept as a separate field because a structured-output schema
    // wants one concrete type per property.
    choice:      { type: 'string' },
    reason:      { type: 'string' }
  },
  required: ['argument', 'wantsChange', 'volumeId', 'parameter', 'value', 'choice', 'reason']
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
    const scores = {};

    for (const agent of AGENTS) {
      onStatus(`${agent.name} is running ${agent.tool.name}…`);

      const result = agent.tool.run(state, context);
      const evidence = agent.tool.summarise(result);

      // Each agent scores the design against its own goal. This is what the
      // radar and the convergence graph plot. An agent without a satisfaction
      // function simply does not appear on them.
      if (typeof agent.satisfaction === 'function') {
        scores[agent.id] = clampScore(agent.satisfaction(result));
      }

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
      onMessage({ agent, text: reply.argument, evidence, result, kind: 'argument' });
    }

    // The scores describe the design as it stood at the start of this round.
    recordRound(roundNumber, scores);

    // ── 3. One reply round ───────────────────────────────────────────────────
    // Everybody answers before anybody proposes, so the exchange reads as a
    // discussion rather than three unrelated verdicts. This runs in demo mode
    // too: without it the room never actually argues, which is the one thing
    // the project is trying to show.
    for (const entry of opening) {
      const { agent, evidence, result } = entry;

      // What everyone else said, in a shape an agent can inspect rather than
      // just a wall of text.
      const others = opening
        .filter(o => o.agent.id !== agent.id)
        .map(o => ({
          id: o.agent.id,
          name: o.agent.name,
          argument: o.reply.argument,
          wantsChange: !!o.reply.wantsChange,
          parameter: o.reply.parameter ?? null,
          value: o.reply.value ?? null
        }));

      if (others.length === 0) continue;

      onStatus(`${agent.name} is responding…`);

      if (live) {
        try {
          const transcript = others.map(o => `${o.name}: ${o.argument}`).join('\n');
          const final = await askLive(agent, evidence, transcript);
          entry.reply = final;   // a live agent may change its mind here
          onMessage({ agent, text: final.argument, evidence, result: entry.result, kind: 'reply' });
        } catch (error) {
          onMessage({ agent, text: error.message, evidence, kind: 'error' });
        }
      } else if (typeof agent.demoReply === 'function') {
        // Demo replies do not revise the proposal — only the wording is
        // pre-written, and rewriting the proposal here would hide which agent
        // actually asked for the change.
        const text = agent.demoReply(result, state, others);
        if (text) onMessage({ agent, text, evidence, kind: 'reply' });
      }
    }

    // ── 4. Proposals, once the discussion has finished ───────────────────────
    for (const entry of opening) {
      const { agent, evidence } = entry;
      if (!entry.reply.wantsChange) continue;

      const proposal = validateProposal(agent, entry.reply);
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

    onStatus(`Round ${roundNumber} complete. Accept or reject, then run another round.`);
  } finally {
    running = false;
  }
}

// ── Talking to the model ─────────────────────────────────────────────────────

// ── Consultation: the designer asks, one agent answers ───────────────────────
//
// The other half of the negotiation. A round is the agents talking among
// themselves; this is the architect walking over to one desk and asking a
// question. Same rule applies: the agent answers from its own tool result and
// its own knowledge base, and from nothing else.

/** The three questions worth asking any agent, whatever discipline it covers. */
export const ASK_TOPICS = [
  { id: 'evidence',  label: 'Your evidence?',        question: 'What measurement are you basing that on?' },
  { id: 'threshold', label: 'What is your limit?',   question: 'What threshold are you holding the design to, and where does it come from?' },
  { id: 'remedy',    label: 'What would satisfy you?', question: 'What change would bring this within your limit?' }
];

/**
 * Ask one agent a question.
 *
 * @param {object} agent
 * @param {string} question   free text in live mode, or an ASK_TOPICS question
 * @param {string} [topicId]  set when the question came from a quick-ask chip,
 *                            which is what makes an answer possible without a key
 * @returns {Promise<{text: string, evidence: string, kind: string}>}
 */
export async function askAgent(agent, question, topicId) {
  // Measure first, exactly as a round does. An answer must rest on the design
  // as it stands right now, not on whatever the last round happened to see.
  const context = {
    shadow: shadowAnalysis(state, environmentalAgent.knowledge.testTimes)
  };
  const result = agent.tool.run(state, context);
  const evidence = agent.tool.summarise(result);

  if (hasApiKey()) {
    const reply = await askForJSON({
      system: buildSystemPrompt(agent),
      prompt: [
        `Current reading from your tool ${agent.tool.name}:`,
        evidence,
        '',
        'The architect asks you directly:',
        question,
        '',
        'Answer in two or three sentences. Cite the numbers above. Do not propose',
        'a parameter change here — this is a question, not a negotiation round.'
      ].join('\n'),
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer']
      },
      validate: r => (typeof r.answer === 'string' && r.answer.trim().length > 10
        ? null : 'The answer was empty or too short.')
    });
    return { text: reply.answer, evidence, kind: 'answer' };
  }

  // Demo mode. Free text cannot be answered without a model, but the three
  // standard questions can be, from real numbers.
  if (topicId && typeof agent.demoAnswer === 'function') {
    const text = agent.demoAnswer(topicId, result, state);
    if (text) return { text, evidence, kind: 'answer' };
  }

  return {
    text: 'In demo mode I can only answer the three standard questions. '
        + 'Add a Gemini API key above and ask me anything.',
    evidence,
    kind: 'answer'
  };
}

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
    // Spell out the menus. A model cannot guess that "section" wants the word
    // "podium" rather than a number, and a rejected proposal helps nobody.
    ...agent.canPropose.filter(isChoice).map(key => {
      const param = getParameter(key);
      return `- ${param.label} is a choice. Put the option in "choice", not "value". `
           + `Options: ${param.options.map(o => o.value).join(', ')}.`;
    }),
    '- For every other parameter put the number in "value" and leave "choice" empty.',
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

/** Keep a satisfaction score inside 0-100 whatever an agent returns. */
function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ── Turning a demo response into the same shape as a live one ────────────────

function toReply(demoResponse) {
  const p = demoResponse.proposal;

  // A demo agent writes one `value` whatever the parameter is, because that is
  // the obvious way to write it and the template should not have to explain a
  // second field. Sort it into the right slot here: a choice parameter such as
  // section carries a word, everything else a number.
  const choiceValue = p && isChoice(p.parameter) ? String(p.value) : '';
  const numberValue = p && !isChoice(p.parameter) ? p.value : 0;

  return {
    argument: demoResponse.argument,
    wantsChange: Boolean(p),
    volumeId: p ? p.volumeId : '',
    parameter: p ? p.parameter : '',
    value: numberValue,
    choice: choiceValue,
    reason: p ? p.reason : ''
  };
}

// ── Validation: nothing reaches the design without passing this ──────────────

/**
 * Check a proposal before it is ever shown to the designer.
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
function validateProposal(agent, reply) {
  const { volumeId, parameter, reason } = reply;

  // A choice parameter reads its value from `choice`, a numeric one from
  // `value`. Everything after this point treats them the same.
  const value = isChoice(parameter) ? reply.choice : reply.value;

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
      isChoice: isChoice(parameter),
      reason: String(reason || '').trim() || 'No reason given.',
      label: getParameter(parameter).label
    }
  };
}
