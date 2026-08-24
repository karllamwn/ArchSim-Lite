// ui/surveillance.js — Surveillance mode.
//
// A full-screen grid, one pane per agent, showing what each was working from
// while the round ran: the instruction it was given, the tool it called and
// what came back, its reasoning, and the proposal it returned.
//
// The activity feed shows what an agent said. This shows why it could say it.
// The project claims the negotiation is traceable, and a claim like that is
// worth what a sceptic can check — so this is the pane that has to exist.
//
// Built to match the V2 workspace: monospace log lines, timestamp, a tag per
// line type, a blinking cursor on the newest, and a status above each pane.

import { AGENTS } from '../agents/index.js';
import { subscribeTrace, subscribeTraceStatus, clearTrace } from '../core/trace.js';
import { currentRound } from '../core/negotiation.js';

// Line type -> tag and CSS class. Same vocabulary as V2.
const LINE = {
  sys:   { tag: '[SYS]',   cls: 'sv-sys' },
  eval:  { tag: '[EVAL]',  cls: 'sv-eval' },
  think: { tag: '[THINK]', cls: 'sv-think' },
  out:   { tag: '[OUT]',   cls: 'sv-out' },
  param: { tag: '[PARAM]', cls: 'sv-param' },
  err:   { tag: '[ERR]',   cls: 'sv-err' },
  meta:  { tag: '[META]',  cls: 'sv-meta' }
};

const scrolls = new Map();    // agentId -> the scrolling log element
const statusEls = new Map();
let panel;
let roundLabel;

export function initSurveillance(container) {
  panel = container;
  panel.className = 'surveillance';
  panel.hidden = true;
  panel.innerHTML = '';

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'sv-header';

  const title = document.createElement('span');
  title.className = 'sv-title';
  title.textContent = '⌬ SURVEILLANCE MODE';
  header.appendChild(title);

  roundLabel = document.createElement('span');
  roundLabel.className = 'sv-round';
  roundLabel.textContent = 'STANDBY';
  header.appendChild(roundLabel);

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  header.appendChild(spacer);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'action';
  clearBtn.textContent = 'CLEAR';
  clearBtn.onclick = () => clearTrace();
  header.appendChild(clearBtn);

  const exitBtn = document.createElement('button');
  exitBtn.className = 'action';
  exitBtn.textContent = 'EXIT';
  exitBtn.onclick = () => hideSurveillance();
  header.appendChild(exitBtn);

  panel.appendChild(header);

  // ── One pane per agent, plus one for the engine itself ─────────────────────
  const grid = document.createElement('div');
  grid.className = 'sv-grid';
  panel.appendChild(grid);

  const panes = [
    ...AGENTS.map(a => ({ id: a.id, name: a.name, color: a.color })),
    { id: 'system', name: 'Negotiation engine', color: 'var(--muted)' }
  ];

  for (const pane of panes) {
    const cell = document.createElement('div');
    cell.className = 'sv-pane';
    cell.style.setProperty('--agent-color', pane.color);

    const head = document.createElement('div');
    head.className = 'sv-pane-head';
    head.textContent = `◉ ${pane.name.toUpperCase()}`;
    cell.appendChild(head);

    const status = document.createElement('div');
    status.className = 'sv-status';
    status.textContent = 'IDLE';
    cell.appendChild(status);
    statusEls.set(pane.id, status);

    const scroll = document.createElement('div');
    scroll.className = 'sv-scroll';
    cell.appendChild(scroll);
    scrolls.set(pane.id, scroll);

    grid.appendChild(cell);
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  subscribeTrace(entry => {
    if (entry === null) {          // CLEAR
      for (const scroll of scrolls.values()) scroll.replaceChildren();
      return;
    }
    appendLine(entry);
  });

  subscribeTraceStatus((agentId, status) => {
    const el = statusEls.get(agentId);
    if (!el) return;
    el.textContent = status.toUpperCase();
    el.className = `sv-status sv-status-${status}`;
  });

  // Escape leaves, the way a full-screen overlay should.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) hideSurveillance();
  });
}

function appendLine({ agentId, type, text, at }) {
  const scroll = scrolls.get(agentId) ?? scrolls.get('system');
  if (!scroll) return;

  // The cursor marks the newest line only.
  scroll.querySelector('.sv-cursor')?.remove();

  const line = document.createElement('div');
  line.className = 'sv-line';

  const time = document.createElement('span');
  time.className = 'sv-time';
  time.textContent = at.toLocaleTimeString('en-GB', { hour12: false });
  line.appendChild(time);

  const meta = LINE[type] ?? LINE.meta;
  const body = document.createElement('span');
  body.className = meta.cls;
  body.textContent = ` ${meta.tag} ${text}`;
  line.appendChild(body);

  const cursor = document.createElement('span');
  cursor.className = 'sv-cursor';
  line.appendChild(cursor);

  scroll.appendChild(line);
  scroll.scrollTop = scroll.scrollHeight;
}

export function showSurveillance() {
  panel.hidden = false;
  const round = currentRound();
  roundLabel.textContent = round ? `ROUND ${round}` : 'STANDBY';
  document.getElementById('tabNegotiation')?.classList.remove('mode-tab-on');
  document.getElementById('tabSurveillance')?.classList.add('mode-tab-on');
}

export function hideSurveillance() {
  panel.hidden = true;
  document.getElementById('tabSurveillance')?.classList.remove('mode-tab-on');
  document.getElementById('tabNegotiation')?.classList.add('mode-tab-on');
}
