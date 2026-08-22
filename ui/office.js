// ui/office.js — the Multi-Agents Design Lab.
//
// The consultants are not rows in a chat log. They stand at desks in a room,
// and when one speaks it steps forward and says its line out loud. That is the
// argument the project is making, made visible: disciplinary reasoning has a
// body and a place, not just a function signature.
//
// Deliberately static. There is no walking, no collision, no game engine. An
// agent you write yourself gets a desk automatically, and needs no artwork —
// which is the difference between a workshop where students add agents and one
// where they first have to draw a walk cycle.

import { AGENTS } from '../agents/index.js';

// The backdrop's own proportions. The room box is fitted to these inside
// whatever space the pane has, letterboxed rather than stretched or cropped.
const ROOM_ASPECT = 1060 / 750;
const ROOM_PADDING = 10;   // px of breathing room inside the pane

// Desk positions as percentages of the backdrop, so the room scales with the
// panel. Ordered as agents appear in agents/index.js. Beyond the fifth, agents
// are spaced along the back wall.
const DESKS = [
  { left: 27, top: 62 },
  { left: 70, top: 62 },
  { left: 27, top: 97 },
  { left: 70, top: 97 },
  { left: 48, top: 52 }
];

let figures = new Map();   // agent id -> { figure, bubble }
let roomEl = null;
let speechTimer = null;

/**
 * Build the room once.
 * @param {HTMLElement} container
 */
export function initOffice(container) {
  container.innerHTML = '';
  container.className = 'office';

  const room = document.createElement('div');
  room.className = 'office-room';
  container.appendChild(room);
  roomEl = room;
  figures = new Map();

  AGENTS.forEach((agent, i) => {
    const spot = DESKS[i] ?? { left: 12 + (i - 5) * 14, top: 40 };

    const figure = document.createElement('div');
    figure.className = 'figure';
    figure.style.left = `${spot.left}%`;
    figure.style.top = `${spot.top}%`;
    figure.style.setProperty('--agent-color', agent.color);
    figure.title = `${agent.name} — ${agent.goal}`;

    // Speech bubble, hidden until this agent speaks.
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    figure.appendChild(bubble);

    // The consultant. Pixel portrait, or the initial when the agent has none.
    if (agent.avatar) {
      const img = document.createElement('img');
      img.className = 'figure-art';
      img.src = agent.avatar;
      img.alt = agent.name;
      figure.appendChild(img);
    } else {
      const tile = document.createElement('div');
      tile.className = 'figure-art figure-letter';
      tile.textContent = agent.name.charAt(0).toUpperCase();
      figure.appendChild(tile);
    }

    const nameplate = document.createElement('div');
    nameplate.className = 'figure-name';
    nameplate.textContent = agent.name;
    figure.appendChild(nameplate);

    room.appendChild(figure);
    figures.set(agent.id, { figure, bubble });
  });

  // Keep the room fitted to the pane. Safe to observe: the room is absolutely
  // positioned, so changing its size cannot change the pane's size.
  const fit = () => fitRoom(container, room);
  new ResizeObserver(fit).observe(container);
  fit();
}

/** Centre the largest box of the backdrop's proportions that fits in the pane. */
function fitRoom(pane, room) {
  const availableWidth = pane.clientWidth - ROOM_PADDING * 2;
  const availableHeight = pane.clientHeight - ROOM_PADDING * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return;

  // Try full width first; if that is too tall, the height is the limit instead.
  let width = availableWidth;
  let height = width / ROOM_ASPECT;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ROOM_ASPECT;
  }

  room.style.width = `${Math.round(width)}px`;
  room.style.height = `${Math.round(height)}px`;
  room.style.left = `${Math.round((pane.clientWidth - width) / 2)}px`;
  room.style.top = `${Math.round((pane.clientHeight - height) / 2)}px`;
}

/**
 * Make one agent speak. It steps forward, the others dim, and its line appears
 * above its head.
 *
 * @param {object} agent
 * @param {string} text     what it says
 * @param {string} [kind]   'error' tints the bubble
 */
export function speak(agent, text, kind) {
  const entry = figures.get(agent.id);
  if (!entry) return;

  clearTimeout(speechTimer);

  for (const { figure, bubble } of figures.values()) {
    figure.classList.remove('speaking');
    bubble.classList.remove('showing');
  }

  roomEl?.classList.add('has-speaker');
  entry.figure.classList.add('speaking');
  entry.bubble.textContent = trim(text);
  entry.bubble.classList.toggle('bubble-error', kind === 'error');
  entry.bubble.classList.add('showing');
}

/** Nobody is speaking. Everyone returns to their desk. */
export function quiet() {
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => {
    roomEl?.classList.remove('has-speaker');
    for (const { figure, bubble } of figures.values()) {
      figure.classList.remove('speaking');
      bubble.classList.remove('showing');
    }
  }, 2500);
}

/** A speech bubble is not a paragraph. Keep it to the first sentence or two. */
function trim(text, limit = 150) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastStop = cut.lastIndexOf('. ');
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…';
}
