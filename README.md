# ArchSim Lite

A small multi-agent design negotiation you can read in an afternoon and extend
in an evening. Built for a workshop; no installation, no build step.

**One agent = one knowledge base + one goal + one tool.**

---

## Run it

Open the published link, or serve the folder locally:

```bash
python -m http.server 3100
```

Then visit `http://localhost:3100`.

It works with no API key. In **demo mode** the analysis tools run for real and
only the agents' wording is pre-written, so every number you see is genuine.
Paste a free [Gemini API key](https://aistudio.google.com/apikey) to switch to
**live mode**, where the agents write their own arguments. The key is stored in
your browser and goes nowhere else.

---

## The idea

Three consultants look at the same massing and disagree, because each one
measures something different:

| Agent | Knows about | Measures with |
|---|---|---|
| **Architect** | setbacks, spacing, coverage | `layoutCheck()` |
| **Environmental** | shadow on the public park | `shadowAnalysis()` |
| **Community** | a neighbourhood survey | `surveyScore()` |

The park sits north of the site, which in the northern hemisphere is exactly
where shadows fall. Build tall and the Environmental agent objects. Build wide
and the Architect objects. There is no setting that pleases everyone, which is
the point: you have to decide, and the decision log records why.

The site sits in a block of existing buildings, and some of them shade the park
too. The shadow tool therefore reports two numbers: how much of the park is dark
altogether, and how much of that **this project** put there. The agents argue
about the second one. You cannot be asked to fix a shadow you did not cast.

**Agents never calculate.** Every number an agent says comes out of its tool, a
plain JavaScript function with no language model anywhere near it. The model
reads those numbers, argues about them, and proposes a change. You accept or
reject it. Nothing changes the design except you.

Press **Run** in the Tools panel to call any tool by hand and see the raw
numbers. They exist whether or not the agents do.

Under the stage, two charts read the history. **Now** is a radar: one axis per
agent, showing how well the current design meets each one's goal. **Convergence**
plots those scores round by round, with a dashed mean. They answer the question
the transcript cannot — is the argument actually going anywhere, and who is
still losing?

The consultants are not rows in a chat log. They stand at desks in the
Multi-Agents Design Lab, and when one speaks it steps forward and says its line.
There are six desks: three are taken, three are waiting for the agents you
write.

---

## Write your own agent

1. Copy `agents/_template.js` to `agents/yourname.js`
2. Edit the marked sections, and nothing else:
   - **ROLE** — one sentence: who is this?
   - **KNOWLEDGE BASE** — inline JSON: the only facts it may rely on
   - **GOAL** — one sentence: what is it trying to achieve?
   - **TOOL** — one pure function: state in, numbers with units out
   - **GOAL, AS A NUMBER** — the same goal scored 0 to 100, which is what puts
     your agent on the radar and the convergence graph. Optional: leave it out
     and your agent still argues, it just does not appear on the charts.
3. Add two lines to `agents/index.js`:
   ```js
   import { yourAgent } from './yourname.js';
   export const AGENTS = [ ..., yourAgent ];
   ```
4. Reload. Your agent is at the table.

Ideas that produce good arguments: heritage, traffic, noise, cost,
accessibility, ecology, fire access, wind.

Two rules worth keeping:

- **If you cannot compute it, your agent may not claim it.** Put the maths in
  the tool, not in the prompt.
- **Give it a goal that will sometimes lose.** An agent that agrees with
  everyone adds nothing to a negotiation.

An avatar is optional. Drop a small PNG in `assets/agents/` and point `avatar`
at it, or leave it out and your agent gets a coloured initial.

---

## What is where

```
index.html          the three-panel shell
core/site.js        the fixed context: site, park, surrounding blocks
core/state.js       the design world, and the only place it changes
core/formPlan.js    the footprint, as one signed distance function
core/parameters.js  what agents are allowed to argue about, and the legal range
core/negotiation.js the round protocol
core/history.js     per-round satisfaction scores, for the charts
core/log.js         the decision log
tools/              the analysis functions. No language model in this folder.
agents/             one file per agent. Start with _template.js.
api/gemini.js       the one place this project talks to a model
view/sun.js         solar position (NOAA), pure maths
view/viewport.js    the Three.js scene
ui/office.js        the Multi-Agents Design Lab
ui/deliverables.js  decision log, convergence graph and radar, hand-written SVG
ui/                 panels
```

Coordinates are metres, +X east, +Z south, so −Z is north. Sun times are local
solar time, where 12:00 means the sun is due south.

---

## Related

The full research prototype this is distilled from:
[ArchSim](https://github.com/karllamwn/ArchSim), a multi-agent negotiation
system for schematic design coupled to Grasshopper, Karamba3D and Ladybug.
ArchSim Lite keeps the idea and drops the dependencies.

---

## License

[MIT](LICENSE). Fork it, rewrite it, teach with it, publish what you build on
it — just keep the copyright notice.

The artwork in `assets/` (the Multi-Agents Design Lab and the three agent
portraits) is the author's own and comes from the ArchSim thesis project.
