// ui/panel.js — the left-hand controls: which volume, its parameters, and the sun.
//
// Every control writes through the update functions in core/state.js. It never
// touches `state` directly, and it never talks to the viewport — the viewport
// is subscribed to the same state and redraws itself.

import {
  state, subscribe, updateVolume, updateSun,
  addVolume, removeVolume, selectVolume,
  volumeHeight, volumeGFA
} from '../core/state.js';
import { SITE } from '../core/site.js';
import { sunPosition } from '../view/sun.js';

// Which parameters the panel exposes, and their limits.
// Adding a row here is all it takes to expose a new parameter.
const VOLUME_CONTROLS = [
  { key: 'x',           label: 'East / west',   min: -30, max: 30,  step: 0.5, unit: 'm' },
  { key: 'z',           label: 'North / south', min: -20, max: 20,  step: 0.5, unit: 'm' },
  { key: 'w',           label: 'Width',         min: 6,   max: 50,  step: 0.5, unit: 'm' },
  { key: 'd',           label: 'Depth',         min: 6,   max: 34,  step: 0.5, unit: 'm' },
  { key: 'rotation',    label: 'Rotation',      min: -45, max: 45,  step: 1,   unit: '°' },
  { key: 'floors',      label: 'Floors',        min: 1,   max: 24,  step: 1,   unit: '' },
  { key: 'floorHeight', label: 'Floor height',  min: 2.7, max: 5,   step: 0.1, unit: 'm' }
];

// The four dates a shadow study normally checks. The equinoxes and solstices.
const PRESET_DATES = [
  { label: 'Mar 21', month: 3,  day: 21 },
  { label: 'Jun 21', month: 6,  day: 21 },
  { label: 'Sep 21', month: 9,  day: 21 },
  { label: 'Dec 21', month: 12, day: 21 }
];

/**
 * Build the panel once, then keep its values in sync with the state.
 * @param {HTMLElement} container
 */
export function initPanel(container) {
  container.innerHTML = '';

  const volumeTabs = section(container, 'Volumes');
  const params     = section(container, 'Parameters');
  const readout    = section(container, 'Derived');
  const sun        = section(container, 'Sun');

  // Elements we need to update later are collected as we build them.
  const sliders = {};
  const valueLabels = {};

  // ── Volume tabs ────────────────────────────────────────────────────────────
  const tabRow = el('div', 'tab-row');
  volumeTabs.appendChild(tabRow);

  const volumeButtons = el('div', 'button-row');
  volumeTabs.appendChild(volumeButtons);

  const addBtn = el('button', 'btn', '+ Add volume');
  addBtn.onclick = () => addVolume();
  volumeButtons.appendChild(addBtn);

  const removeBtn = el('button', 'btn btn-quiet', 'Remove');
  removeBtn.onclick = () => removeVolume(state.selectedId);
  volumeButtons.appendChild(removeBtn);

  // ── Parameter sliders ──────────────────────────────────────────────────────
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

    params.appendChild(row);
    sliders[control.key] = input;
    valueLabels[control.key] = value;
  }

  // ── Derived readout ────────────────────────────────────────────────────────
  const heightOut = readoutRow(readout, 'Height');
  const gfaOut    = readoutRow(readout, 'GFA');

  // ── Sun controls ───────────────────────────────────────────────────────────
  const dateRow = el('div', 'button-row');
  sun.appendChild(dateRow);

  const dateButtons = PRESET_DATES.map(preset => {
    const b = el('button', 'btn btn-small', preset.label);
    b.onclick = () => updateSun({ month: preset.month, day: preset.day });
    dateRow.appendChild(b);
    return { button: b, preset };
  });

  const hourRow = el('div', 'control');
  const hourHead = el('div', 'control-head');
  hourHead.appendChild(el('label', '', 'Time (solar)'));
  const hourValue = el('span', 'control-value');
  hourHead.appendChild(hourValue);
  hourRow.appendChild(hourHead);

  const hourInput = el('input', 'slider');
  hourInput.type = 'range';
  hourInput.min = 4;
  hourInput.max = 20;
  hourInput.step = 0.25;
  hourInput.oninput = () => updateSun({ hour: Number(hourInput.value) });
  hourRow.appendChild(hourInput);
  sun.appendChild(hourRow);

  const altOut = readoutRow(sun, 'Altitude');
  const aziOut = readoutRow(sun, 'Azimuth');

  // ── Keep everything in sync ────────────────────────────────────────────────
  subscribe(s => {
    const volume = s.volumes.find(v => v.id === s.selectedId);

    // Tabs
    tabRow.innerHTML = '';
    for (const v of s.volumes) {
      const tab = el('button', 'tab' + (v.id === s.selectedId ? ' tab-on' : ''), v.id);
      tab.onclick = () => selectVolume(v.id);
      tabRow.appendChild(tab);
    }
    removeBtn.disabled = s.volumes.length <= 1;
    addBtn.disabled = s.volumes.length >= 3;

    // Sliders
    for (const control of VOLUME_CONTROLS) {
      sliders[control.key].value = volume[control.key];
      valueLabels[control.key].textContent = `${volume[control.key]}${control.unit}`;
    }

    // Derived
    heightOut.textContent = `${volumeHeight(volume).toFixed(1)} m`;
    gfaOut.textContent = `${Math.round(volumeGFA(volume)).toLocaleString()} m²`;

    // Sun
    hourInput.value = s.sun.hour;
    hourValue.textContent = formatHour(s.sun.hour);
    for (const { button, preset } of dateButtons) {
      button.classList.toggle('btn-on', s.sun.month === preset.month && s.sun.day === preset.day);
    }

    const pos = sunPosition(s.sun.month, s.sun.day, s.sun.hour, SITE.latitude);
    altOut.textContent = pos.isUp ? `${pos.altitude.toFixed(1)}°` : 'below horizon';
    aziOut.textContent = `${pos.azimuth.toFixed(0)}°`;
  });
}

// ── Small DOM helpers ────────────────────────────────────────────────────────

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function section(parent, title) {
  const wrap = el('section', 'panel-section');
  wrap.appendChild(el('h2', '', title));
  parent.appendChild(wrap);
  return wrap;
}

function readoutRow(parent, label) {
  const row = el('div', 'readout');
  row.appendChild(el('span', 'readout-label', label));
  const value = el('span', 'readout-value', '—');
  row.appendChild(value);
  parent.appendChild(row);
  return value;
}

/** 13.25 becomes "13:15". */
function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
