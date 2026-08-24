// ui/conversation.js — the fourth column: who is in the room, what they just
// said, and the box the architect types into.
//
// Three blocks, matching the V2 workspace: AGENTS (the roster, with each
// agent's current score), ACTIVITY FEED (the argument as it happens), and
// AGENT CHAT (ask one of them a question).

import { state, updateVolume } from '../core/state.js';
import { runRound, isRunning, currentRound, askAgent, ASK_TOPICS } from '../core/negotiation.js';
import { getApiKey, setApiKey, hasApiKey } from '../api/gemini.js';
import { record } from '../core/log.js';
import { recordLine } from '../core/transcript.js';
import { subscribeHistory } from '../core/history.js';
import { formatValue } from '../core/parameters.js';
import { AGENTS } from '../agents/index.js';
import { speak, quiet } from './office.js';
import { captureFrame } from '../view/viewport.js';

let feed;
let statusEl;
let runAction;
let askTarget = null;
let refreshChat = () => {};
const rosterRows = new Map();

export function initConversation(container) {
  container.innerHTML = '';

  buildRoster(container);
  buildFeed(container);
  buildChat(container);
  buildKeyRow(container);
  buildActionBar();

  addSystem('Design the massing, then run a round.');
  refreshMode();
}

// ── 1. The roster ────────────────────────────────────────────────────────────

function buildRoster(container) {
  const sect = section(container, 'AGENTS');
  const list = document.createElement('div');
  list.className = 'roster';

  for (const agent of AGENTS) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    row.style.setProperty('--agent-color', agent.color);
    row.title = agent.goal;

    const dot = document.createElement('span');
    dot.className = 'roster-dot';
    row.appendChild(dot);
    row.appendChild(document.createTextNode(agent.name.toUpperCase()));

    const score = document.createElement('span');
    score.className = 'roster-score';
    score.textContent = '—';
    row.appendChild(score);

    list.appendChild(row);
    rosterRows.set(agent.id, { row, score });
  }
  sect.body.appendChild(list);

  // Scores come from the convergence history, so the roster and the radar
  // always show the same figure.
  subscribeHistory(rounds => {
    const latest = rounds.length ? rounds[rounds.length - 1].scores : null;
    for (const [id, entry] of rosterRows) {
      entry.score.textContent = latest ? ((latest[id] ?? 0) / 10).toFixed(1) : '—';
    }
  });
}

// ── 2. The activity feed ─────────────────────────────────────────────────────

function buildFeed(container) {
  const sect = section(container, 'ACTIVITY FEED');
  feed = document.createElement('div');
  feed.className = 'feed';
  sect.wrap.appendChild(feed);
  sect.body.remove();
}

function addSystem(text) {
  const row = document.createElement('div');
  row.className = 'msg msg-system';
  row.textContent = text;
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
  recordLine({ round: currentRound(), who: 'system', text, kind: 'system' });
}

function addMessage({ agent, text, evidence, kind, chips }) {
  const row = document.createElement('div');
  row.className = `msg msg-${kind ?? 'argument'}`;
  row.style.setProperty('--agent-color', agent.color);

  const head = document.createElement('div');
  head.className = 'msg-head';
  const who = document.createElement('span');
  who.className = 'msg-who';
  who.textContent = agent.name.toUpperCase();
  head.appendChild(who);
  const round = document.createElement('span');
  round.className = 'msg-round';
  round.textContent = kind === 'question' ? 'asked' : `R${currentRound()}`;
  head.appendChild(round);
  row.appendChild(head);

  if (chips?.length) {
    const chipRow = document.createElement('div');
    chipRow.className = 'chips';
    for (const c of chips) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = c;
      chipRow.appendChild(chip);
    }
    row.appendChild(chipRow);
  }

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text;
  row.appendChild(body);

  if (evidence) {
    const ev = document.createElement('div');
    ev.className = 'msg-evidence';
    ev.textContent = evidence;
    row.appendChild(ev);
  }

  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
  recordLine({ round: currentRound(), who: agent.name, text, kind });

  for (const [id, entry] of rosterRows) entry.row.classList.toggle('active', id === agent.id);
}

function addProposal({ agent, proposal, evidence, round }) {
  const card = document.createElement('div');
  card.className = 'proposal';
  card.style.setProperty('--agent-color', agent.color);

  // The validated proposal carries `from` and `to`, not `value`. Reading the
  // wrong field here writes undefined into the design on Accept.
  const change = document.createElement('div');
  change.className = 'proposal-change';
  change.innerHTML = `<b>${agent.name}</b> proposes ${proposal.volumeId} `
    + `${proposal.label ?? proposal.parameter} `
    + `${formatValue(proposal.parameter, proposal.from)} → `
    + `${formatValue(proposal.parameter, proposal.to)}`;
  card.appendChild(change);

  const why = document.createElement('div');
  why.className = 'msg-evidence';
  why.textContent = proposal.reason;
  card.appendChild(why);

  const actions = document.createElement('div');
  actions.className = 'proposal-actions';

  const accept = document.createElement('button');
  accept.className = 'btn btn-small btn-primary';
  accept.textContent = 'Accept';
  accept.onclick = () => {
    // Read the value the design actually has right now. The `from` recorded at
    // proposal time can be stale: an earlier card in the same round may have
    // already moved this parameter.
    const volume = state.volumes.find(v => v.id === proposal.volumeId);
    const before = volume ? volume[proposal.parameter] : proposal.from;

    // A card from an earlier round can still be sitting in the feed after the
    // design has moved on. Accepting one that asks for the value it already has
    // is not a decision, so do not write it into the log.
    if (before === proposal.to) {
      settle(card, actions, 'accepted');
      return;
    }

    updateVolume(proposal.volumeId, { [proposal.parameter]: proposal.to });
    record({
      round, agent: agent.name, agentColor: agent.color,
      volumeId: proposal.volumeId, parameter: proposal.parameter,
      from: before, to: proposal.to, reason: proposal.reason, evidence
    });
    settle(card, actions, 'accepted');
  };
  actions.appendChild(accept);

  const reject = document.createElement('button');
  reject.className = 'btn btn-small';
  reject.textContent = 'Reject';
  reject.onclick = () => settle(card, actions, 'rejected');
  actions.appendChild(reject);

  card.appendChild(actions);
  feed.appendChild(card);
  feed.scrollTop = feed.scrollHeight;
}

function settle(card, actions, outcome) {
  const done = document.createElement('div');
  done.className = `proposal-done ${outcome}`;
  done.textContent = outcome === 'accepted' ? '✓ accepted' : '✕ rejected';
  actions.replaceWith(done);
}

// ── 3. Agent chat ────────────────────────────────────────────────────────────

function buildChat(container) {
  const sect = section(container, 'AGENT CHAT');

  const whoRow = document.createElement('div');
  whoRow.className = 'tab-row';
  const whoButtons = AGENTS.map(agent => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = agent.name.slice(0, 5);
    b.title = agent.name;
    b.onclick = () => {
      askTarget = askTarget === agent ? null : agent;
      whoButtons.forEach(x => x.el.classList.toggle('tab-on', x.agent === askTarget));
      refreshChat();
    };
    whoRow.appendChild(b);
    return { agent, el: b };
  });
  sect.body.appendChild(whoRow);

  const row = document.createElement('div');
  row.className = 'chat-row';
  const input = document.createElement('input');
  input.className = 'chat-input';
  input.onkeydown = e => { if (e.key === 'Enter') ask(input.value.trim(), null, input); };
  row.appendChild(input);

  const send = document.createElement('button');
  send.className = 'btn btn-small';
  send.style.flex = '0 0 auto';
  send.textContent = 'SEND';
  send.onclick = () => ask(input.value.trim(), null, input);
  row.appendChild(send);
  sect.body.appendChild(row);

  const quickLabel = document.createElement('div');
  quickLabel.className = 'metric-sub';
  quickLabel.textContent = 'QUICK QUESTIONS';
  sect.body.appendChild(quickLabel);

  const quickList = document.createElement('div');
  quickList.className = 'quick-list';
  const quickButtons = ASK_TOPICS.map(topic => {
    const b = document.createElement('button');
    b.className = 'quick';
    b.textContent = topic.question;
    b.onclick = () => ask(topic.question, topic.id);
    quickList.appendChild(b);
    return b;
  });
  sect.body.appendChild(quickList);

  refreshChat = () => {
    const ready = askTarget !== null;
    const live = hasApiKey();
    quickButtons.forEach(b => { b.disabled = !ready; });
    input.disabled = !ready || !live;
    send.disabled = !ready || !live;
    input.placeholder = !live ? 'Free questions need a key'
      : ready ? `Ask ${askTarget.name}…` : 'Choose an agent';
  };
  refreshChat();
}

async function ask(question, topicId, input) {
  if (!askTarget || !question || isRunning()) return;

  addMessage({
    agent: { id: 'designer', name: 'You', color: 'var(--designer)' },
    text: question, kind: 'question'
  });
  if (input) input.value = '';

  try {
    const answer = await askAgent(askTarget, question, topicId);
    addMessage({ agent: askTarget, text: answer.text, evidence: answer.evidence, kind: 'answer' });
    speak(askTarget, answer.text);
    quiet();
  } catch (error) {
    addMessage({ agent: askTarget, text: error.message, kind: 'error' });
  }
}

// ── 4. Key ───────────────────────────────────────────────────────────────────

function buildKeyRow(container) {
  const sect = section(container, 'MODE');

  const row = document.createElement('div');
  row.className = 'chat-row';
  const input = document.createElement('input');
  input.className = 'chat-input';
  input.type = 'password';
  input.placeholder = 'Gemini API key (optional)';
  input.value = getApiKey();
  row.appendChild(input);

  const save = document.createElement('button');
  save.className = 'btn btn-small';
  save.style.flex = '0 0 auto';
  save.textContent = 'SAVE';
  save.onclick = () => { setApiKey(input.value); refreshMode(); };
  row.appendChild(save);
  sect.body.appendChild(row);

  const note = document.createElement('p');
  note.className = 'sect-note';
  note.id = 'modeNote';
  note.style.marginTop = '5px';
  sect.body.appendChild(note);
}

function refreshMode() {
  const live = hasApiKey();
  const note = document.getElementById('modeNote');
  if (note) {
    note.textContent = live
      ? 'Live mode. Agents write their own arguments. The key stays in this browser.'
      : 'Demo mode. The tools run for real, so every number is genuine — only the wording is pre-written.';
  }
  const chip = document.getElementById('modeChip');
  if (chip) {
    chip.textContent = live ? 'live' : 'demo';
    chip.classList.toggle('live', live);
  }
  refreshChat();
}

// ── 5. The bottom action bar ─────────────────────────────────────────────────

function buildActionBar() {
  statusEl = document.getElementById('status');
  const actions = document.getElementById('actions');
  actions.innerHTML = '';

  runAction = document.createElement('button');
  runAction.className = 'action action-primary';
  runAction.textContent = '▶ RUN ROUND';
  runAction.onclick = startRound;
  actions.appendChild(runAction);
}

function setStatus(text, busy = false) {
  if (!statusEl) return;
  statusEl.textContent = `◉ ${text.toUpperCase()}`;
  statusEl.classList.toggle('busy', busy);
}

async function startRound() {
  if (isRunning()) return;
  runAction.disabled = true;
  setStatus('discussion in progress', true);

  await runRound({
    onStatus: text => { setStatus(text, true); addSystem(text); },
    onMessage: entry => {
      speak(entry.agent, entry.text, entry.kind);
      addMessage({
        ...entry,
        chips: typeof entry.agent.highlights === 'function' && entry.result
          ? entry.agent.highlights(entry.result) : null
      });
    },
    onProposal: addProposal
  });

  quiet();
  runAction.disabled = false;
  runAction.textContent = '▶ RUN ANOTHER ROUND';
  setStatus(`round ${currentRound()} complete`);

  const chip = document.getElementById('roundChip');
  if (chip) chip.textContent = `ROUND ${currentRound()}`;

  captureFrame(currentRound());
}

// ── Helper ───────────────────────────────────────────────────────────────────

function section(parent, title) {
  const wrap = document.createElement('section');
  wrap.className = 'sect';

  const head = document.createElement('div');
  head.className = 'sect-head';
  head.style.cursor = 'default';
  head.innerHTML = `<span class="diamond">◆</span><span>${title}</span>`;
  wrap.appendChild(head);

  const body = document.createElement('div');
  body.className = 'sect-body';
  wrap.appendChild(body);
  parent.appendChild(wrap);

  return { wrap, body };
}
