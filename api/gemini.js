// api/gemini.js — the one place this project talks to a language model.
//
// Every agent goes through askForJSON(). Nothing else in the codebase should
// call the network, which keeps the "agents never compute" rule enforceable:
// this file sends text and gets structured JSON back, and that is all.
//
// The key lives in localStorage in the student's own browser. It is never sent
// anywhere except Google's endpoint.

// Models get retired. When that happens, change this one line.
const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const STORAGE_KEY = 'archsim_lite_gemini_key';

// ── Key handling ─────────────────────────────────────────────────────────────

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApiKey(key) {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
  else localStorage.removeItem(STORAGE_KEY);
}

/** True when a key is present, which is what unlocks live mode. */
export function hasApiKey() {
  return getApiKey().length > 0;
}

// ── The one call ─────────────────────────────────────────────────────────────

/**
 * Ask the model a question and insist on JSON matching a schema.
 *
 * Two layers of safety, on purpose:
 *   1. Gemini is given the schema, so it generates JSON in that shape.
 *   2. We validate the parsed object ourselves anyway, because a model can
 *      still return something surprising and app state should never be
 *      updated from unchecked output.
 *
 * @param {object} options
 * @param {string} options.system    the agent's role, knowledge and goal
 * @param {string} options.prompt    the situation, including tool results
 * @param {object} options.schema    Gemini responseSchema for the reply
 * @param {function} options.validate  (obj) => string|null, an error or null
 * @returns {Promise<object>} the validated object
 */
export async function askForJSON({ system, prompt, schema, validate }) {
  const key = getApiKey();
  if (!key) throw new Error('No API key. Paste one to use live mode.');

  // One retry: models occasionally return a shape that fails validation, and
  // asking again is usually enough. Failing twice is a real error worth showing.
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callGemini(key, system, prompt, schema);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = 'The model did not return valid JSON.';
      continue;
    }

    const problem = validate ? validate(parsed) : null;
    if (!problem) return parsed;

    lastError = problem;
  }

  throw new Error(`Rejected the model's output twice. ${lastError}`);
}

async function callGemini(key, system, prompt, schema) {
  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini returned ${response.status}. ${shorten(detail)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

function shorten(text, limit = 160) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > limit ? clean.slice(0, limit) + '…' : clean;
}
