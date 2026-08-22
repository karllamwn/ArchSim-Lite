// ui/conversation.js — the right panel: run a round, read the argument,
// accept or reject each proposal, and watch the decision log fill up.

import { state, updateVolume } from '../core/state.js';
import { runRound, isRunning, currentRound } from '../core/negotiation.js';
import { getApiKey, setApiKey, hasApiKey } from '../api/gemini.js';
import { record, subscribeLog, describe, toText } from '../core/log.js';
import { formatValue } from '../core/parameters.js';
import { speak, quiet } from './office.js';

let feed;          // the scrolling conversation
let runButton;
let modeNote;

/**
 * @param {HTMLElement} container the .panel-right element
 */
export function initConversation(container) {
  container.innerHTML = '';

  buildKeySection(container);
  buildRunSection(container);

  feed = document.createElement('div');
  feed.className = 'conversation';
  container.appendChild(feed);

  buildLogSection(container);

  addSystemLine('Design the massing, then run a round.');
  refreshMode();
}

// ── Key and mode ─────────────────────────────────────────────────────────────

function buildKeySection(container) {
  const section = sectionEl(container, 'Mode');

  const row = document.createElement('div');
  row.className = 'key-row';

  const input = document.createElement('input');
  input.className = 'key-input';
  input.type = 'password';
  input.placeholder = 'Gemini API key (optional)';
  input.value = getApiKey();
  row.appendChild(input);

  const save = document.createElement('button');
  save.className = 'btn';
  save.style.flex = '0 0 auto';
  save.textContent = 'Save';
  save.onclick = () => {
    setApiKey(input.value);
    refreshMode();
  };
  row.appendChild(save);

  section.appendChild(row);

  modeNote = document.createElement('p');
  modeNote.className = 'mode-note';
  section.appendChild(modeNote);
}

function refreshMode() {
  const live = hasApiKey();

  if (live) {
    modeNote.innerHTML = '<b>Live mode.</b> Agents write their own arguments. '
      + 'The key stays in this browser.';
  } else {
    modeNote.innerHTML = '<b>Demo mode.</b> The tools run for real, so every number '
      + 'is genuine — only the wording is pre-written. Add a key for live agents.';
  }

  // Mirror it in the top bar, where it is visible from across a room.
  const chip = document.getElementById('modeChip');
  if (chip) {
    chip.textContent = live ? 'live' : 'demo';
    chip.classList.toggle('live', live);
  }
}

// ── Run button ───────────────────────────────────────────────────────────────

function buildRunSection(container) {
  const section = sectionEl(container, 'Negotiation');

  runButton = document.createElement('button');
  runButton.className = 'btn btn-primary';
  runButton.textContent = 'Run a round';
  runButton.onclick = startRound;
  section.appendChild(runButton);
}

async function startRound() {
  if (isRunning()) return;
  runButton.disabled = true;

  await runRound({
    onStatus: text => {
      runButton.textContent = text.length > 34 ? 'Working…' : text;
      addSystemLine(text);
    },
    onMessage: entry => {
      // The room and the transcript show the same thing two ways: the agent
      // says it out loud at its desk, and it is written down on the right.
      speak(entry.agent, entry.text, entry.kind);
      addMessage(entry);
    },
    onProposal: addProposal
  });

  quiet();
  runButton.disabled = false;
  runButton.textContent = 'Run another round';

  const roundChip = document.getElementById('roundChip');
  if (roundChip) roundChip.textContent = `round ${currentRound()}`;
}

// ── Conversation items ───────────────────────────────────────────────────────

function addSystemLine(text) {
  const line = document.createElement('div');
  line.className = 'msg msg-system';
  line.textContent = text;
  feed.appendChild(line);
  scrollDown();
}

function addMessage({ agent, text, evidence, kind }) {
  const msg = document.createElement('div');
  msg.className = 'msg' + (kind === 'error' ? ' msg-error' : '');
  msg.style.setProperty('--agent-color', agent.color);

  const head = document.createElement('div');
  head.className = 'msg-head';

  head.appendChild(avatarFor(agent));

  const who = document.createElement('span');
  who.className = 'msg-who';
  who.textContent = agent.name;
  head.appendChild(who);

  const tag = document.createElement('span');
  tag.className = 'msg-round';
  tag.textContent = kind === 'reply' ? 'reply' : kind === 'error' ? 'error' : `round ${currentRound()}`;
  head.appendChild(tag);

  msg.appendChild(head);

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text;
  msg.appendChild(body);

  if (evidence) {
    const ev = document.createElement('div');
    ev.className = 'msg-evidence';
    ev.innerHTML = `<b>${agent.tool.name}()</b> ${escapeHtml(evidence)}`;
    msg.appendChild(ev);
  }

  feed.appendChild(msg);
  scrollDown();
}

function addProposal({ agent, proposal, evidence, round }) {
  const card = document.createElement('div');
  card.className = 'proposal';
  card.style.setProperty('--agent-color', agent.color);

  const change = document.createElement('div');
  change.className = 'proposal-change';
  change.appendChild(avatarFor(agent));
  const changeText = document.createElement('span');
  changeText.innerHTML =
    `<b>${escapeHtml(agent.name)}</b> proposes ${proposal.volumeId} ${proposal.label} ` +
    `${formatValue(proposal.parameter, proposal.from)} → ` +
    `${formatValue(proposal.parameter, proposal.to)}`;
  change.appendChild(changeText);
  card.appendChild(change);

  const reason = document.createElement('div');
  reason.className = 'msg-evidence';
  reason.textContent = proposal.reason;
  card.appendChild(reason);

  const actions = document.createElement('div');
  actions.className = 'proposal-actions';

  const accept = document.createElement('button');
  accept.className = 'btn btn-primary btn-small';
  accept.textContent = 'Accept';

  const reject = document.createElement('button');
  reject.className = 'btn btn-small btn-quiet';
  reject.textContent = 'Reject';

  const settle = decision => {
    const volume = state.volumes.find(v => v.id === proposal.volumeId);

    // The volume may have been deleted since the agent proposed this.
    if (!volume) {
      actions.remove();
      const gone = document.createElement('div');
      gone.className = 'proposal-done rejected';
      gone.textContent = `✕ volume ${proposal.volumeId} no longer exists`;
      card.appendChild(gone);
      return;
    }

    // Cards stay on screen across rounds, so by the time one is accepted the
    // parameter may already have moved — another proposal may have changed it,
    // or the designer may have. Read the value as it is right now, not as it
    // was when the agent spoke, or the log records a change that never happened.
    const from = volume[proposal.parameter];

    // The design only ever changes here, when the designer says so.
    if (decision === 'accepted') {
      updateVolume(proposal.volumeId, { [proposal.parameter]: proposal.to });
    }

    record({
      round,
      agentId: agent.id,
      agentName: agent.name,
      volumeId: proposal.volumeId,
      parameter: proposal.parameter,
      from,
      to: proposal.to,
      reason: proposal.reason,
      evidence,
      decision
    });

    actions.remove();
    const done = document.createElement('div');
    done.className = `proposal-done ${decision}`;
    done.textContent = decision === 'accepted' ? '✓ accepted' : '✕ rejected';
    card.appendChild(done);
  };

  accept.onclick = () => settle('accepted');
  reject.onclick = () => settle('rejected');

  actions.appendChild(accept);
  actions.appendChild(reject);
  card.appendChild(actions);

  feed.appendChild(card);
  scrollDown();
}

function scrollDown() {
  feed.scrollTop = feed.scrollHeight;
}

// ── Decision log ─────────────────────────────────────────────────────────────

function buildLogSection(container) {
  const section = sectionEl(container, 'Decision log');

  const list = document.createElement('div');
  section.appendChild(list);

  const copy = document.createElement('button');
  copy.className = 'btn btn-small';
  copy.textContent = 'Copy log';
  copy.onclick = () => navigator.clipboard?.writeText(toText());
  section.appendChild(copy);

  subscribeLog(entries => {
    list.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder';
      empty.textContent = 'Nothing decided yet.';
      list.appendChild(empty);
      copy.disabled = true;
      return;
    }

    copy.disabled = false;
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'log-entry';
      row.innerHTML =
        `<b>${escapeHtml(describe(entry))}</b> · ` +
        `<span class="log-agent">${escapeHtml(entry.agentName)}</span> · ${entry.decision}`;
      list.appendChild(row);
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The agent's pixel portrait, or a coloured initial when it has none.
 *
 * An agent you write yourself does not need artwork. Leave `avatar` off and you
 * get a tile in your agent's colour with its first letter, which is enough to
 * tell speakers apart in the conversation.
 */
export function avatarFor(agent) {
  if (agent.avatar) {
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = agent.avatar;
    img.alt = agent.name;
    img.style.borderColor = agent.color;
    return img;
  }

  const tile = document.createElement('span');
  tile.className = 'avatar avatar-letter';
  tile.textContent = agent.name.charAt(0).toUpperCase();
  tile.style.borderColor = agent.color;
  tile.style.color = agent.color;
  return tile;
}

function sectionEl(parent, title) {
  const wrap = document.createElement('section');
  wrap.className = 'panel-section';
  const h = document.createElement('h2');
  h.textContent = title;
  wrap.appendChild(h);
  parent.appendChild(wrap);
  return wrap;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
