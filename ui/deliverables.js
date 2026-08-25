// ui/deliverables.js — the right-hand column: what a round leaves behind.
//
// Three artefacts, the same three the V2 workspace produces: the conversation
// log, the design evolution graph, and the round's scorecard as a radar. Plus
// the decision log, which is the one that matters — every accepted change with
// the agent that argued for it and the evidence it cited.

import { AGENTS } from '../agents/index.js';
import { subscribeHistory, meanScore } from '../core/history.js';
import { subscribeLog, describe, toText } from '../core/log.js';
import { transcriptText } from '../core/transcript.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = 'rgba(152, 181, 172, 0.5)';
const LINE = 'rgba(171, 218, 201, 0.22)';
const ACCENT = '#45d1b3';

export function initDeliverables(container) {
  container.innerHTML = '';

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = head(container, 'ROUND DELIVERABLES');
  const count = document.createElement('span');
  count.className = 'metric-value';
  count.style.marginLeft = 'auto';
  count.style.fontSize = '14px';
  count.textContent = '0 rounds completed';
  header.appendChild(count);

  // ── Conversation log ───────────────────────────────────────────────────────
  const logHead = head(container, 'CONVERSATION LOG');
  const mdButton = exportButton('◆ MD', () => download('archsim-transcript.md', transcriptText()));
  logHead.appendChild(mdButton);

  const logNote = document.createElement('div');
  logNote.className = 'sect-body';
  logNote.innerHTML = '<div class="metric"><span class="metric-label">Rounds recorded</span>'
                    + '<span class="metric-value" id="dl-rounds">0</span></div>'
                    + '<p class="sect-note">Full agent discussion transcript.</p>';
  container.appendChild(logNote);

  // ── Design evolution ───────────────────────────────────────────────────────
  const evoHead = head(container, 'DESIGN EVOLUTION');
  const evoBody = document.createElement('div');
  evoBody.className = 'chart-body';
  const svgButton = exportButton('◆ SVG', () => {
    const svg = evoBody.querySelector('svg');
    if (svg) download('archsim-evolution.svg', new XMLSerializer().serializeToString(svg));
  });
  evoHead.appendChild(svgButton);
  container.appendChild(evoBody);

  // ── This round's scorecard ─────────────────────────────────────────────────
  const roundHead = head(container, 'ROUND —');
  const radarBody = document.createElement('div');
  radarBody.className = 'chart-body';
  container.appendChild(radarBody);

  const legend = document.createElement('div');
  legend.className = 'legend';
  container.appendChild(legend);

  const scoreLine = document.createElement('div');
  scoreLine.className = 'score-line';
  container.appendChild(scoreLine);

  // ── Decision log ───────────────────────────────────────────────────────────
  head(container, 'DECISION LOG').appendChild(
    exportButton('◆ TXT', () => download('archsim-decisions.txt', toText()))
  );
  const logBody = document.createElement('div');
  logBody.className = 'sect-body';
  container.appendChild(logBody);

  // ── Wiring ─────────────────────────────────────────────────────────────────
  subscribeHistory(rounds => {
    count.textContent = `${rounds.length} round${rounds.length === 1 ? '' : 's'} completed`;
    container.querySelector('#dl-rounds').textContent = String(rounds.length);

    evoBody.replaceChildren(drawEvolution(rounds));

    const latest = rounds.length ? rounds[rounds.length - 1] : null;
    roundHead.querySelector('h3').textContent = latest ? `ROUND ${latest.round}` : 'ROUND —';
    radarBody.replaceChildren(drawRadar(latest));
    renderLegend(legend, latest);

    scoreLine.textContent = latest
      ? `SCORE: ${(meanScore(latest.scores) / 10).toFixed(1)} / 10`
      : '';
  });

  subscribeLog(entries => {
    if (entries.length === 0) {
      logBody.innerHTML = '<p class="sect-note">No changes accepted yet.</p>';
      return;
    }
    logBody.replaceChildren(...entries.map(entry => {
      const row = document.createElement('div');
      row.className = 'log-entry';
      row.style.setProperty('--agent-color', entry.agentColor ?? ACCENT);
      row.innerHTML = describe(entry);
      return row;
    }));
  });
}

// ── Building blocks ──────────────────────────────────────────────────────────

function head(parent, title) {
  const wrap = document.createElement('div');
  wrap.className = 'deliverable-head';
  const h = document.createElement('h3');
  h.textContent = title;
  wrap.appendChild(h);
  parent.appendChild(wrap);
  return wrap;
}

function exportButton(label, onClick) {
  const b = document.createElement('button');
  b.className = 'btn btn-export';
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Radar ────────────────────────────────────────────────────────────────────

function drawRadar(latest) {
  // Wider than it is tall, and the polygon is smaller than the box, because the
  // axis labels are agent names and an agent's name is however long a student
  // makes it. Sizing the box to the polygon and then trimming the names to fit
  // is the wrong way round: it printed ENVIRONME, and clipped even that at the
  // edge of the viewBox. The chart gives the labels the room they need instead.
  const width = 230;
  const height = 190;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 52;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });

  if (AGENTS.length < 3) {
    svg.appendChild(el('text', { x: cx, y: cy, fill: INK, 'font-size': 10, 'text-anchor': 'middle' },
      'Needs three agents'));
    return svg;
  }

  for (const fraction of [0.33, 0.66, 1]) {
    svg.appendChild(el('polygon', {
      points: ring(cx, cy, radius * fraction, AGENTS.length),
      fill: 'none', stroke: LINE, 'stroke-width': fraction === 1 ? 1 : 0.5
    }));
  }

  AGENTS.forEach((agent, i) => {
    const [x, y] = vertex(cx, cy, radius, i, AGENTS.length);
    svg.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: LINE, 'stroke-width': 0.5 }));

    // Centred over the vertex rather than pushed outward from it. An outward
    // anchor needs a full label's width of clearance on each side; a centred
    // one needs half, which is what lets the whole name fit.
    const [lx, ly] = vertex(cx, cy, radius + 14, i, AGENTS.length);
    svg.appendChild(el('text', {
      x: lx, y: ly + (ly > cy ? 6 : 0),
      fill: agent.color,
      'font-family': "'Press Start 2P', monospace",
      'font-size': 5.5,
      'text-anchor': 'middle'
    }, agent.name.toUpperCase()));
  });

  if (!latest) {
    svg.appendChild(el('text', { x: cx, y: cy + 3, fill: INK, 'font-size': 9, 'text-anchor': 'middle' },
      'no rounds yet'));
    return svg;
  }

  const points = AGENTS.map((agent, i) =>
    vertex(cx, cy, radius * ((latest.scores[agent.id] ?? 0) / 100), i, AGENTS.length).join(',')
  ).join(' ');

  svg.appendChild(el('polygon', {
    points, fill: 'rgba(69, 209, 179, 0.2)', stroke: ACCENT,
    'stroke-width': 1.4, 'stroke-linejoin': 'round'
  }));

  AGENTS.forEach((agent, i) => {
    const [x, y] = vertex(cx, cy, radius * ((latest.scores[agent.id] ?? 0) / 100), i, AGENTS.length);
    svg.appendChild(el('circle', { cx: x, cy: y, r: 2.4, fill: agent.color }));
  });

  return svg;
}

function renderLegend(node, latest) {
  node.replaceChildren(...AGENTS.map(agent => {
    const item = el2('div', 'legend-item');
    item.style.setProperty('--agent-color', agent.color);
    item.appendChild(el2('span', 'legend-dot'));
    const score = latest ? ((latest.scores[agent.id] ?? 0) / 10).toFixed(1) : '—';
    item.appendChild(document.createTextNode(`${agent.name} ${score}`));
    return item;
  }));
}

// ── Evolution ────────────────────────────────────────────────────────────────

function drawEvolution(rounds) {
  const width = 248;
  const height = 108;
  const pad = { left: 20, right: 6, top: 8, bottom: 15 };
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const yFor = score => pad.top + plotH * (1 - score / 100);

  for (const value of [0, 5, 10]) {
    const y = yFor(value * 10);
    svg.appendChild(el('line', {
      x1: pad.left, y1: y, x2: width - pad.right, y2: y,
      stroke: LINE, 'stroke-width': value === 0 ? 0.9 : 0.5
    }));
    svg.appendChild(el('text', {
      x: pad.left - 4, y: y + 3, fill: INK, 'font-size': 8, 'text-anchor': 'end'
    }, String(value)));
  }

  if (rounds.length === 0) {
    svg.appendChild(el('text', {
      x: width / 2, y: height / 2, fill: INK, 'font-size': 9, 'text-anchor': 'middle'
    }, 'Run a round'));
    return svg;
  }

  const xFor = i => rounds.length === 1
    ? pad.left + plotW / 2
    : pad.left + plotW * (i / (rounds.length - 1));

  rounds.forEach((entry, i) => {
    svg.appendChild(el('text', {
      x: xFor(i), y: height - 4, fill: INK, 'font-size': 8, 'text-anchor': 'middle'
    }, `R${entry.round}`));
  });

  for (const agent of AGENTS) {
    const pts = rounds.map((entry, i) => `${xFor(i)},${yFor(entry.scores[agent.id] ?? 0)}`);
    if (rounds.length > 1) {
      svg.appendChild(el('polyline', {
        points: pts.join(' '), fill: 'none', stroke: agent.color,
        'stroke-width': 1.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }
    rounds.forEach((entry, i) => {
      svg.appendChild(el('circle', {
        cx: xFor(i), cy: yFor(entry.scores[agent.id] ?? 0), r: 2, fill: agent.color
      }));
    });
  }

  if (rounds.length > 1) {
    svg.appendChild(el('polyline', {
      points: rounds.map((e, i) => `${xFor(i)},${yFor(meanScore(e.scores))}`).join(' '),
      fill: 'none', stroke: ACCENT, 'stroke-width': 1, 'stroke-dasharray': '3 2'
    }));
  }

  return svg;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ring(cx, cy, radius, sides) {
  return Array.from({ length: sides }, (_, i) => vertex(cx, cy, radius, i, sides).join(',')).join(' ');
}

function vertex(cx, cy, radius, i, sides) {
  const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
  return [
    +(cx + radius * Math.cos(angle)).toFixed(2),
    +(cy + radius * Math.sin(angle)).toFixed(2)
  ];
}

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function el2(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
