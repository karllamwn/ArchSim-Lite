// ui/debug.js — call the tools by hand and read what they return.
//
// This panel exists for one teaching reason: the numbers exist before the
// agents do. Press a button, get a measurement. No language model is involved
// at any point here.

import { state } from '../core/state.js';
import { AGENTS } from '../agents/index.js';
import { shadowAnalysis } from '../tools/shadowAnalysis.js';
import { environmentalAgent } from '../agents/environmental.js';
import { avatarFor } from './conversation.js';

/**
 * @param {HTMLElement} container a .panel-section to fill
 */
export function initDebug(container) {
  const intro = document.createElement('p');
  intro.className = 'placeholder';
  intro.textContent = 'Run an agent\'s tool on the current design. Same functions the agents use.';
  container.appendChild(intro);

  for (const agent of AGENTS) {
    const block = document.createElement('div');
    block.className = 'tool-block';

    const head = document.createElement('div');
    head.className = 'tool-name';
    head.appendChild(avatarFor(agent));

    const label = document.createElement('span');
    label.style.flex = '1';
    label.innerHTML =
      `<span style="color:${agent.color}">${agent.name}</span> <code>${agent.tool.name}()</code>`;
    head.appendChild(label);

    block.appendChild(head);

    const runBtn = document.createElement('button');
    runBtn.className = 'btn btn-small';
    runBtn.textContent = 'Run';
    head.appendChild(runBtn);

    const output = document.createElement('pre');
    output.className = 'tool-output';
    output.hidden = true;
    block.appendChild(output);

    runBtn.onclick = () => {
      try {
        // Shadow is shared context: compute it once, hand it to whoever needs it.
        const context = {
          shadow: shadowAnalysis(state, environmentalAgent.knowledge.testTimes)
        };
        const result = agent.tool.run(state, context);

        output.hidden = false;
        output.textContent =
          agent.tool.summarise(result) +
          '\n\nRAW RESULT\n' +
          JSON.stringify(result, null, 1);
      } catch (error) {
        output.hidden = false;
        output.textContent = 'Tool threw an error:\n' + error.message;
      }
    };

    container.appendChild(block);
  }
}
