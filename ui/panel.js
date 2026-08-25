// ui/panel.js — the left column: what the site is, what you have drawn, and
// what the tools currently measure.
//
// Laid out like the V2 workspace: collapsible sections of dense label/value
// rows, with the editable design parameters in the middle. Everything here is
// read straight from the tools, so the numbers on the left and the numbers an
// agent cites in the transcript can never drift apart.

import {
  state, subscribe, updateVolume, updateSun,
  addVolume, removeVolume, selectVolume, setForm,
  volumeHeight, volumeGFA
} from '../core/state.js';
import { SITE, PARK, CONTEXT } from '../core/site.js';
import { sunPosition } from '../view/sun.js';
import { PARAMETERS as VOLUME_CONTROLS } from '../core/parameters.js';
import {
  BASE_SHAPES, PLAN_TYPES, SECTION_TYPES,
  BASE_PARAMS, PLAN_PARAMS, SECTION_PARAMS, volumeToSlabs
} from '../core/form.js';

import { shadowAnalysis } from '../tools/shadowAnalysis.js';
import { envelopeCheck } from '../tools/envelopeCheck.js';
import { surveyScore } from '../tools/surveyScore.js';
import { sitePlannerAgent } from '../agents/sitePlanner.js';
import { environmentalAgent } from '../agents/environmental.js';
import { communityAgent } from '../agents/community.js';

const PRESET_DATES = [
  { label: 'Mar 21', month: 3,  day: 21 },
  { label: 'Jun 21', month: 6,  day: 21 },
  { label: 'Sep 21', month: 9,  day: 21 },
  { label: 'Dec 21', month: 12, day: 21 }
];

export function initPanel(container) {
  container.innerHTML = '';

  // Order matters. The controls come first, because the plan and section
  // pickers are the most interesting thing in this column and burying them
  // under two blocks of readouts hides the fact that a volume can be anything
  // other than a box. The two reference sections start collapsed for the same
  // reason: they are worth reading, but not before you have drawn anything.
  const params  = section(container, 'DESIGN PARAMS');
  const massing = section(container, 'MASSING METRICS');
  const shadow  = section(container, 'SHADOW (park)');
  const envelope = section(container, 'ENVELOPE');
  const survey  = section(container, 'COMMUNITY SURVEY');
  const zoning  = section(container, 'SITE & ZONING', true);
  const sun     = section(container, 'SUN', true);

  // ── Site and zoning: fixed, so build it once ───────────────────────────────
  const s = SITE.setbacks;
  metric(zoning, 'Site', `${SITE.width} × ${SITE.depth} m`);
  metric(zoning, 'Site area', `${SITE.width * SITE.depth} m²`);
  metric(zoning, 'Latitude', `${SITE.latitude}° N`);
  metric(zoning, 'Setbacks N/S/E/W', `${s.north}/${s.south}/${s.east}/${s.west} m`);
  metric(zoning, 'Max height', `${sitePlannerAgent.knowledge.maxHeight} m`);
  metric(zoning, 'Max coverage', `${sitePlannerAgent.knowledge.maxCoveragePercent}%`);
  metric(zoning, 'Park', `${PARK.width} × ${PARK.depth} m, north`);
  metric(zoning, 'Context blocks', String(CONTEXT.length));

  // ── Everything below is rebuilt whenever the design changes ────────────────
  const massingBody = massing.body;
  const shadowBody = shadow.body;
  const envelopeBody = envelope.body;
  const surveyBody = survey.body;

  // ── Volume tabs ────────────────────────────────────────────────────────────
  const tabRow = el('div', 'tab-row');
  params.body.appendChild(tabRow);

  // ── Base, plan and section ─────────────────────────────────────────────────
  // Three menus, matching the three axes in core/form.js. They are separate
  // because they compose: an elliptical base can carry a courtyard plan and sit
  // on a podium section, and folding any two together would rule that out.
  // The sliders belonging to each choice appear only when it is selected, so
  // the panel never shows a control that would do nothing.
  const pickers = [
    { title: 'BASE SHAPE', options: BASE_SHAPES,   key: 'base' },
    { title: 'PLAN',       options: PLAN_TYPES,    key: 'plan' },
    { title: 'SECTION',    options: SECTION_TYPES, key: 'section' }
  ].map(({ title, options, key }) => {
    params.body.appendChild(el('div', 'metric-sub', title));
    const row = el('div', 'button-row pick');
    params.body.appendChild(row);
    // One per row, so there is room for the real name rather than the four
    // letters that fitted when these sat side by side. `short` is still there
    // for anywhere genuinely tight.
    const buttons = options.map(option => {
      const b = el('button', 'btn btn-small', option.label);
      b.onclick = () => setForm(state.selectedId, { [key]: option.id });
      row.appendChild(b);
      return { b, id: option.id };
    });
    return { key, buttons };
  });

  const sizeLabel = el('div', 'metric-sub', 'SIZE & POSITION');
  params.body.appendChild(sizeLabel);

  const sliders = {};
  const sliderLabels = {};
  const sliderRows = {};
  for (const control of VOLUME_CONTROLS) {
    const row = el('div', 'control');
    const head = el('div', 'control-head');
    head.appendChild(el('label', '', control.label));
    const value = el('span', 'control-value');
    head.appendChild(value);
    row.appendChild(head);

    const input = el('input', 'slider');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.oninput = () => updateVolume(state.selectedId, { [control.key]: Number(input.value) });
    row.appendChild(input);

    params.body.appendChild(row);
    sliders[control.key] = input;
    sliderLabels[control.key] = value;
    sliderRows[control.key] = row;
  }

  const volumeButtons = el('div', 'button-row');
  volumeButtons.style.marginTop = '8px';
  params.body.appendChild(volumeButtons);

  const addBtn = el('button', 'btn btn-small', '+ Volume');
  addBtn.onclick = () => addVolume();
  volumeButtons.appendChild(addBtn);

  const removeBtn = el('button', 'btn btn-small btn-quiet', 'Remove');
  removeBtn.onclick = () => removeVolume(state.selectedId);
  volumeButtons.appendChild(removeBtn);

  // ── Sun controls ───────────────────────────────────────────────────────────
  const dateRow = el('div', 'button-row');
  sun.body.appendChild(dateRow);
  const dateButtons = PRESET_DATES.map(preset => {
    const b = el('button', 'btn btn-small', preset.label);
    b.onclick = () => updateSun({ month: preset.month, day: preset.day });
    dateRow.appendChild(b);
    return { button: b, preset };
  });

  const hourRow = el('div', 'control');
  hourRow.style.marginTop = '7px';
  const hourHead = el('div', 'control-head');
  hourHead.appendChild(el('label', '', 'Time (solar)'));
  const hourValue = el('span', 'control-value');
  hourHead.appendChild(hourValue);
  hourRow.appendChild(hourHead);
  const hourInput = el('input', 'slider');
  hourInput.type = 'range';
  hourInput.min = 4; hourInput.max = 20; hourInput.step = 0.25;
  hourInput.oninput = () => updateSun({ hour: Number(hourInput.value) });
  hourRow.appendChild(hourInput);
  sun.body.appendChild(hourRow);

  const sunAlt = metric(sun.body, 'Altitude', '—');
  const sunAzi = metric(sun.body, 'Azimuth', '—');

  // ── Keep it all in sync ────────────────────────────────────────────────────
  subscribe(s2 => {
    const volume = s2.volumes.find(v => v.id === s2.selectedId);

    // Tabs
    tabRow.replaceChildren(...s2.volumes.map(v => {
      const tab = el('button', 'tab' + (v.id === s2.selectedId ? ' tab-on' : ''), v.id);
      tab.onclick = () => selectVolume(v.id);
      return tab;
    }));
    removeBtn.disabled = s2.volumes.length <= 1;
    addBtn.disabled = s2.volumes.length >= 3;

    // Base, plan and section
    const defaults = { base: 'rect', plan: 'solid', section: 'straight' };
    for (const { key, buttons } of pickers) {
      for (const { b, id } of buttons) {
        b.classList.toggle('btn-on', (volume[key] ?? defaults[key]) === id);
      }
    }

    // Sliders. A form dial appears only while the choice it belongs to is the
    // one selected.
    const relevant = new Set([
      ...(BASE_PARAMS[volume.base ?? 'rect'] ?? []),
      ...(PLAN_PARAMS[volume.plan ?? 'solid'] ?? []),
      ...(SECTION_PARAMS[volume.section ?? 'straight'] ?? [])
    ]);
    const formKeys = new Set([
      ...Object.values(BASE_PARAMS).flat(),
      ...Object.values(PLAN_PARAMS).flat(),
      ...Object.values(SECTION_PARAMS).flat()
    ]);

    for (const control of VOLUME_CONTROLS) {
      sliders[control.key].value = volume[control.key];
      sliderLabels[control.key].textContent = `${volume[control.key]}${control.unit}`;
      if (formKeys.has(control.key)) {
        sliderRows[control.key].style.display = relevant.has(control.key) ? '' : 'none';
      }
    }

    // Sun
    hourInput.value = s2.sun.hour;
    hourValue.textContent = formatHour(s2.sun.hour);
    for (const { button, preset } of dateButtons) {
      button.classList.toggle('btn-on', s2.sun.month === preset.month && s2.sun.day === preset.day);
    }
    const pos = sunPosition(s2.sun.month, s2.sun.day, s2.sun.hour, SITE.latitude);
    sunAlt.textContent = pos.isUp ? `${pos.altitude.toFixed(1)}°` : 'below horizon';
    sunAzi.textContent = `${pos.azimuth.toFixed(0)}°`;

    // Run the same tools the agents run, so the panel and the argument agree.
    const shadowResult = shadowAnalysis(s2, environmentalAgent.knowledge.testTimes);
    const envelopeResult = envelopeCheck(s2, sitePlannerAgent.knowledge);
    const surveyResult = surveyScore(s2, shadowResult, communityAgent.knowledge);

    renderMassing(massingBody, s2, volume, envelopeResult);
    renderShadow(shadowBody, shadowResult);
    renderEnvelope(envelopeBody, envelopeResult);
    renderSurvey(surveyBody, surveyResult);
  });
}

// ── Section renderers ────────────────────────────────────────────────────────

function renderMassing(body, state, volume, layout) {
  body.replaceChildren();
  metric(body, 'Volumes', String(state.volumes.length));
  metric(body, 'Total GFA', `${layout.totalGFA.toLocaleString()} m²`);
  metric(body, 'Site coverage', `${layout.siteCoveragePercent}%`,
    layout.exceedsMaxCoverage ? 'warn' : 'good');

  sub(body, `VOLUME ${volume.id}`);
  const slabs = volumeToSlabs(volume);
  const nameOf = (list, id, fallback) =>
    (list.find(x => x.id === (id ?? fallback)) ?? list[0]).label;
  metric(body, 'Base', nameOf(BASE_SHAPES, volume.base, 'rect'));
  metric(body, 'Plan', nameOf(PLAN_TYPES, volume.plan, 'solid'));
  metric(body, 'Section', nameOf(SECTION_TYPES, volume.section, 'straight'));
  metric(body, 'Bands', String(slabs.length));
  metric(body, 'Footprint', `${volume.w} × ${volume.d} m`);
  metric(body, 'Floors', String(volume.floors));
  metric(body, 'Height', `${volumeHeight(volume).toFixed(1)} m`);
  metric(body, 'GFA', `${Math.round(volumeGFA(volume)).toLocaleString()} m²`);
  metric(body, 'Rotation', `${volume.rotation}°`);
}

function renderShadow(body, result) {
  body.replaceChildren();
  const worst = result.worst;
  if (!worst) {
    body.appendChild(el('p', 'sect-note', 'Sun below horizon at every test time.'));
    return;
  }
  const kb = environmentalAgent.knowledge;
  metric(body, 'Park area', `${result.parkArea} m²`);
  metric(body, 'Sample points', String(result.sampleCount));

  sub(body, `WORST · ${worst.label.toUpperCase()}`);
  metric(body, 'Sun altitude', `${worst.sunAltitude}°`);
  metric(body, 'Shaded, total', `${worst.shadowedPercent}%`);
  metric(body, 'By existing', `${worst.existingPercent}%`);
  metric(body, 'Added by design', `${worst.addedByDesignPercent}%`,
    worst.addedByDesignPercent > kb.acceptableShadowPercent ? 'warn' : 'good');
  metric(body, 'Threshold', `${kb.acceptableShadowPercent}%`);

  sub(body, 'AVERAGE ACROSS TIMES');
  metric(body, 'Total', `${result.averageShadowedPercent}%`);
  metric(body, 'Added', `${result.averageAddedByDesignPercent}%`);
}

function renderEnvelope(body, result) {
  body.replaceChildren();
  metric(body, 'Rule issues', String(result.violationCount),
    result.violationCount ? 'warn' : 'good');

  for (const v of result.volumes) {
    sub(body, `VOLUME ${v.id} SETBACKS`);
    for (const side of ['north', 'south', 'east', 'west']) {
      const issue = v.setbackIssues.find(i => i.side === side);
      metric(body, side.charAt(0).toUpperCase() + side.slice(1),
        `${v.setbackDistances[side]} m`, issue ? 'warn' : '');
    }
  }

  if (result.pairs.length) {
    sub(body, 'SPACING');
    for (const p of result.pairs) {
      metric(body, p.between.join(' – '),
        p.overlap ? 'overlap' : `${p.gap} m`,
        (p.overlap || p.tooClose) ? 'warn' : 'good');
    }
  }
}

function renderSurvey(body, result) {
  body.replaceChildren();
  metric(body, 'Overall', `${result.overallSatisfaction}/100`,
    result.overallSatisfaction >= communityAgent.knowledge.satisfactionFloor ? 'good' : 'warn');
  metric(body, 'Respondents', String(result.respondents));

  sub(body, 'BY CONCERN');
  for (const c of result.concerns) {
    metric(body, c.label, `${c.satisfaction}/100`, c.satisfaction < 50 ? 'warn' : '');
  }

  const note = el('p', 'sect-note', `Fictional survey data, invented for this exercise.`);
  note.style.marginTop = '5px';
  body.appendChild(note);
}

// ── Small DOM helpers ────────────────────────────────────────────────────────

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A collapsible section. Returns { body } for callers to fill. */
function section(parent, title, collapsed = false) {
  const wrap = el('section', 'sect' + (collapsed ? ' collapsed' : ''));

  const head = el('button', 'sect-head');
  head.appendChild(el('span', 'diamond', '◆'));
  head.appendChild(el('span', '', title));
  const caret = el('span', 'caret', collapsed ? '▸' : '▾');
  head.appendChild(caret);
  head.onclick = () => {
    wrap.classList.toggle('collapsed');
    caret.textContent = wrap.classList.contains('collapsed') ? '▸' : '▾';
  };
  wrap.appendChild(head);

  const body = el('div', 'sect-body');
  wrap.appendChild(body);
  parent.appendChild(wrap);

  return { wrap, body };
}

/** One label/value row. Returns the value node so it can be updated in place. */
function metric(parent, label, value, tone = '') {
  const target = parent.body ?? parent;
  const row = el('div', 'metric');
  row.appendChild(el('span', 'metric-label', label));
  const val = el('span', 'metric-value' + (tone ? ' ' + tone : ''), value);
  row.appendChild(val);
  target.appendChild(row);
  return val;
}

/** A small heading inside a section. */
function sub(parent, text) {
  parent.appendChild(el('div', 'metric-sub', text));
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
