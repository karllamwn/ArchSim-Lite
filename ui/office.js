// ui/office.js — the Multi-Agents Design Lab.
//
// The consultants are not rows in a chat log. They stand at desks in a room,
// and when one speaks its nameplate lights up and it says its line out loud.
// That is the argument the project makes, made visible: disciplinary reasoning
// has a body and a place, not just a function signature.
//
// The backdrop is the empty lab, so each agent is drawn at its desk: the pixel
// portrait if it has one, otherwise a coloured initial. That fallback is why a
// student can add an agent without drawing anything.
//
// Deliberately static. No walking, no collision, no game engine.

import { AGENTS } from '../agents/index.js';

// Where each consultant stands, as percentages of the backdrop. Six desks in
// three rows of two, read left to right, top to bottom. Three are taken by the
// built-in agents and three are waiting for the ones students write.
// `top` is where the consultant's FEET land, in front of the chair rather than
// on the desk, so the figure reads as standing at the workstation.
const DESKS = [
  { left: 27.8, top: 38.5 },
  { left: 71.0, top: 38.0 },
  { left: 27.2, top: 57.0 },
  { left: 70.6, top: 58.0 },
  { left: 27.8, top: 76.5 },
  { left: 69.4, top: 77.0 }
];

// Past the six desks, agents gather round the meeting table at the foot.
const MEETING_TABLE = { left: 50, top: 88 };

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
    const spot = DESKS[i] ?? {
      left: MEETING_TABLE.left + ((i - DESKS.length) - 1) * 13,
      top: MEETING_TABLE.top
    };

    const figure = document.createElement('div');
    figure.className = 'figure';
    figure.style.left = `${spot.left}%`;
    figure.style.top = `${spot.top}%`;
    figure.style.setProperty('--agent-color', agent.color);
    figure.title = `${agent.name} — ${agent.goal}`;

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
}

/**
 * Make one agent speak. Its nameplate lifts, the others dim, and its line
 * appears above its head.
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
