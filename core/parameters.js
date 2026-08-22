// core/parameters.js — the parameters an agent is allowed to argue about.
//
// One list, used in three places: the sliders in ui/panel.js, the bounds check
// that validates a proposal, and the labels shown on proposal cards. Keeping it
// in one file means a new parameter appears everywhere at once, and an agent
// can never propose a value the slider would not allow.

export const PARAMETERS = [
  { key: 'x',           label: 'East / west',   min: -30, max: 30, step: 0.5, unit: 'm' },
  { key: 'z',           label: 'North / south', min: -20, max: 20, step: 0.5, unit: 'm' },
  { key: 'w',           label: 'Width',         min: 6,   max: 50, step: 0.5, unit: 'm' },
  { key: 'd',           label: 'Depth',         min: 6,   max: 34, step: 0.5, unit: 'm' },
  { key: 'rotation',    label: 'Rotation',      min: -45, max: 45, step: 1,   unit: '°' },
  { key: 'floors',      label: 'Floors',        min: 1,   max: 24, step: 1,   unit: '' },
  { key: 'floorHeight', label: 'Floor height',  min: 2.7, max: 5,  step: 0.1, unit: 'm' }
];

/** Look up one parameter definition by key. Returns undefined if unknown. */
export function getParameter(key) {
  return PARAMETERS.find(p => p.key === key);
}

/**
 * Is this a legal value for this parameter?
 * @returns {string|null} an error message, or null when the value is fine
 */
export function checkValue(key, value) {
  const param = getParameter(key);
  if (!param) return `"${key}" is not a design parameter.`;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${param.label} needs a number, got ${JSON.stringify(value)}.`;
  }
  if (value < param.min || value > param.max) {
    return `${param.label} must be between ${param.min} and ${param.max}, got ${value}.`;
  }
  return null;
}

/** Snap a value to the parameter's step, so proposals land on slider positions. */
export function snapValue(key, value) {
  const param = getParameter(key);
  if (!param) return value;
  const snapped = Math.round(value / param.step) * param.step;
  // Guard against floating point dust, e.g. 3.2000000000000006
  return Math.round(snapped * 1000) / 1000;
}

/** "Floors 6" or "Width 24m" — used on proposal cards and in the log. */
export function formatValue(key, value) {
  const param = getParameter(key);
  if (!param) return String(value);
  return `${value}${param.unit}`;
}
