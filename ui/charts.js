// ui/charts.js — the convergence history, drawn two ways.
//
//   Radar     where the design stands right now, one axis per agent.
//   Evolution how each agent's score has moved round by round.
//
// Hand-written inline SVG. No charting library: the whole project is meant to
// be readable, and a polygon from a handful of points is less code than the
// wiring a library would need.

import { AGENTS } from '../agents/index.js';
import { subscribeHistory, meanScore } from '../core/history.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const INK = 'rgba(152, 181, 172, 0.85)';   // --muted
const LINE = 'rgba(171, 218, 201, 0.22)';  // --border
const ACCENT = '#45d1b3';

/**
 * @param {HTMLElement} container the strip under the stage
 */
export function initCharts(container) {
  container.innerHTML = '';
  container.className = 'charts';

  const evolutionBox = panel(container, 'Score by round');
  const radarBox = panel(container, 'Where it stands now');

  subscribeHistory(rounds => {
    evolutionBox.body.replaceChildren(drawEvolution(rounds));
    radarBox.body.replaceChildren(drawRadar(rounds));
  });
}

function panel(parent, title) {
  const box = document.createElement('div');
  box.className = 'chart';

  const heading = document.createElement('h3');
  heading.textContent = title;
  box.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'chart-body';
  box.appendChild(body);

  parent.appendChild(box);
  return { box, body };
}

// ── Radar ────────────────────────────────────────────────────────────────────

function drawRadar(rounds) {
  const size = 190;
  const cx = size / 2;
  const cy = size / 2 + 2;
  const radius = size / 2 - 34;

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'chart-svg' });

  if (AGENTS.length < 3) {
    svg.appendChild(el('text', {
      x: cx, y: cy, fill: INK, 'font-size': 11, 'text-anchor': 'middle'
    }, 'Needs three agents'));
    return svg;
  }

  const latest = rounds.length ? rounds[rounds.length - 1].scores : null;

  // Rings at 25 / 50 / 75 / 100, so a reader can judge a score by eye.
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    svg.appendChild(el('polygon', {
      points: ringPoints(cx, cy, radius * fraction, AGENTS.length),
      fill: 'none',
      stroke: LINE,
      'stroke-width': fraction === 1 ? 1.2 : 0.6
    }));
  }

  // One spoke and one label per agent.
  AGENTS.forEach((agent, i) => {
    const [x, y] = pointOn(cx, cy, radius, i, AGENTS.length);
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: LINE, 'stroke-width': 0.6 }));

    const [lx, ly] = pointOn(cx, cy, radius + 13, i, AGENTS.length);
    svg.appendChild(el('text', {
      x: lx, y: ly + 3,
      fill: agent.color,
      'font-size': 9,
      'text-anchor': lx < cx - 2 ? 'end' : lx > cx + 2 ? 'start' : 'middle'
    }, agent.name.slice(0, 11)));
  });

  if (!latest) {
    svg.appendChild(el('text', {
      x: cx, y: cy + 3, fill: INK, 'font-size': 9, 'text-anchor': 'middle'
    }, 'no rounds yet'));
    return svg;
  }

  // The shape itself.
  const points = AGENTS.map((agent, i) => {
    const score = latest[agent.id] ?? 0;
    return pointOn(cx, cy, radius * (score / 100), i, AGENTS.length).join(',');
  }).join(' ');

  svg.appendChild(el('polygon', {
    points,
    fill: 'rgba(69, 209, 179, 0.18)',
    stroke: ACCENT,
    'stroke-width': 1.6,
    'stroke-linejoin': 'round'
  }));

  AGENTS.forEach((agent, i) => {
    const score = latest[agent.id] ?? 0;
    const [x, y] = pointOn(cx, cy, radius * (score / 100), i, AGENTS.length);
    svg.appendChild(el('circle', { cx: x, cy: y, r: 2.6, fill: agent.color }));
  });

  svg.appendChild(el('text', {
    x: cx, y: size - 2, fill: ACCENT, 'font-size': 10, 'text-anchor': 'middle'
  }, `mean ${meanScore(latest)}`));

  return svg;
}

/** Corner points of a regular polygon, as an SVG points string. */
function ringPoints(cx, cy, radius, sides) {
  return Array.from({ length: sides }, (_, i) => pointOn(cx, cy, radius, i, sides).join(','))
    .join(' ');
}

/** Vertex i of `sides`, starting at the top and going clockwise. */
function pointOn(cx, cy, radius, i, sides) {
  const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
  return [
    +(cx + radius * Math.cos(angle)).toFixed(2),
    +(cy + radius * Math.sin(angle)).toFixed(2)
  ];
}

// ── Evolution ────────────────────────────────────────────────────────────────

function drawEvolution(rounds) {
  const width = 300;
  const height = 130;
  const pad = { left: 24, right: 8, top: 10, bottom: 18 };

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const yFor = score => pad.top + plotH * (1 - score / 100);

  // Horizontal guides at 0 / 50 / 100.
  for (const value of [0, 50, 100]) {
    const y = yFor(value);
    svg.appendChild(el('line', {
      x1: pad.left, y1: y, x2: width - pad.right, y2: y,
      stroke: LINE, 'stroke-width': value === 0 ? 1 : 0.6
    }));
    svg.appendChild(el('text', {
      x: pad.left - 5, y: y + 3, fill: INK, 'font-size': 9, 'text-anchor': 'end'
    }, String(value)));
  }

  if (rounds.length === 0) {
    svg.appendChild(el('text', {
      x: width / 2, y: height / 2, fill: INK, 'font-size': 10, 'text-anchor': 'middle'
    }, 'Run a round to start the history'));
    return svg;
  }

  // With one round there is no line to draw, so spread the single point across
  // the axis rather than stacking everything at x = 0.
  const xFor = index => rounds.length === 1
    ? pad.left + plotW / 2
    : pad.left + plotW * (index / (rounds.length - 1));

  // Round numbers along the bottom.
  rounds.forEach((entry, i) => {
    svg.appendChild(el('text', {
      x: xFor(i), y: height - 6, fill: INK, 'font-size': 9, 'text-anchor': 'middle'
    }, `R${entry.round}`));
  });

  // One line per agent.
  for (const agent of AGENTS) {
    const points = rounds.map((entry, i) => `${xFor(i)},${yFor(entry.scores[agent.id] ?? 0)}`);

    if (rounds.length > 1) {
      svg.appendChild(el('polyline', {
        points: points.join(' '),
        fill: 'none',
        stroke: agent.color,
        'stroke-width': 1.8,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      }));
    }

    rounds.forEach((entry, i) => {
      svg.appendChild(el('circle', {
        cx: xFor(i), cy: yFor(entry.scores[agent.id] ?? 0), r: 2.6, fill: agent.color
      }));
    });
  }

  // The mean, dashed: the one line that says whether the room is converging.
  if (rounds.length > 1) {
    svg.appendChild(el('polyline', {
      points: rounds.map((entry, i) => `${xFor(i)},${yFor(meanScore(entry.scores))}`).join(' '),
      fill: 'none',
      stroke: ACCENT,
      'stroke-width': 1.2,
      'stroke-dasharray': '4 3'
    }));
  }

  return svg;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
