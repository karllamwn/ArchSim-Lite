// agents/architect.js — cares about whether the layout works as a plan.
//
// Shape: ROLE, KNOWLEDGE BASE, GOAL, TOOL. See agents/_template.js.
//
// Note this is the ARCHITECT AGENT, not the human designer. The human still
// makes every decision; this agent only argues for a workable parcel layout.

import { layoutCheck } from '../tools/layoutCheck.js';
import { SITE } from '../core/site.js';

export const architectAgent = {
  id: 'architect',
  name: 'Architect',
  color: '#6eabff',
  avatar: 'assets/agents/architect.png',

  // ── ROLE ───────────────────────────────────────────────────────────────────
  role: 'You are an architect reviewing whether a massing layout works on its '
      + 'parcel: setbacks, spacing between volumes, and how much of the site is '
      + 'covered.',

  // ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────
  knowledge: {
    source: 'Teaching values for this exercise. Setbacks match core/site.js so '
          + 'the drawing and the rulebook agree. Not a real zoning schedule.',

    setbacks: SITE.setbacks,        // metres from each site edge
    minSpacing: 8,                  // metres between two volumes, for light and air
    maxHeight: 40,                  // metres
    maxCoveragePercent: 45,         // footprint as a share of site area
    minFloorplate: 200              // m², below this a floor plate is impractical
  },

  // ── GOAL ───────────────────────────────────────────────────────────────────
  goal: 'Keep every volume inside its setbacks, at least 8 m apart, under 40 m '
      + 'tall, and the site under 45% covered — while keeping floor plates '
      + 'usable rather than shaving the building down to nothing.',

  canPropose: ['x', 'z', 'w', 'd', 'rotation', 'floors'],

  // ── TOOL ───────────────────────────────────────────────────────────────────
  tool: {
    name: 'layoutCheck',

    run(state) {
      return layoutCheck(state, architectAgent.knowledge);
    },

    summarise(result) {
      const parts = [];

      for (const v of result.volumes) {
        const s = v.setbackDistances;
        parts.push(
          `Volume ${v.id}: ${v.height} m tall, ${v.footprintArea} m² plate, ` +
          `setbacks N ${s.north} / S ${s.south} / E ${s.east} / W ${s.west} m` +
          (v.setbackIssues.length
            ? ` — short on ${v.setbackIssues.map(i => `${i.side} by ${i.shortBy} m`).join(', ')}`
            : '')
        );
      }

      for (const p of result.pairs) {
        parts.push(
          `${p.between[0]}–${p.between[1]} gap ${p.gap} m ` +
          `(need ${p.requiredGap} m)${p.overlap ? ' — footprints overlap' : ''}`
        );
      }

      parts.push(
        `Site coverage ${result.siteCoveragePercent}% of ${result.siteArea} m² ` +
        `(limit ${result.maxCoveragePercent}%), total GFA ${result.totalGFA} m². ` +
        `${result.violationCount} rule issue(s).`
      );

      return parts.join('. ');
    }
  },

  // ── GOAL, AS A NUMBER ──────────────────────────────────────────────────────
  // The same goal the sentence above states, scored 0-100 so it can be plotted.
  // Every rule issue costs 20 points; coverage over the limit costs the rest in
  // proportion to how far over it is.
  satisfaction(result) {
    let score = 100 - result.violationCount * 20;
    if (result.exceedsMaxCoverage) {
      const over = result.siteCoveragePercent - result.maxCoveragePercent;
      score -= Math.min(30, over * 2);
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  },

  // ── Demo mode ──────────────────────────────────────────────────────────────
  demo(result, state) {
    const kb = architectAgent.knowledge;

    // Worst problem first: overlaps, then setbacks, then coverage.
    const overlapping = result.pairs.find(p => p.overlap);
    if (overlapping) {
      const [a, b] = overlapping.between;
      const volume = state.volumes.find(v => v.id === b);
      return {
        argument: `Volumes ${a} and ${b} overlap in plan. That is not a layout, `
                + `it is a collision. Separate them before anything else is worth discussing.`,
        proposal: {
          volumeId: b,
          parameter: 'x',
          value: Math.min(30, volume.x + kb.minSpacing + 4),
          reason: `Move ${b} east to open the ${kb.minSpacing} m gap the layout needs.`
        }
      };
    }

    const withIssue = result.volumes.find(v => v.setbackIssues.length > 0);
    if (withIssue) {
      const issue = withIssue.setbackIssues[0];
      const volume = state.volumes.find(v => v.id === withIssue.id);
      const towardCentre = { north: 'z', south: 'z', east: 'x', west: 'x' }[issue.side];
      const direction = (issue.side === 'north' || issue.side === 'west') ? 1 : -1;

      return {
        argument: `Volume ${withIssue.id} breaks the ${issue.side} setback. It needs `
                + `${issue.required} m and has ${issue.actual} m, short by ${issue.shortBy} m.`,
        proposal: {
          volumeId: withIssue.id,
          parameter: towardCentre,
          value: volume[towardCentre] + direction * issue.shortBy,
          reason: `Shift ${withIssue.id} ${issue.shortBy} m off the ${issue.side} boundary.`
        }
      };
    }

    if (result.exceedsMaxCoverage) {
      const biggest = state.volumes.reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a));
      return {
        argument: `Coverage is ${result.siteCoveragePercent}%, over my `
                + `${kb.maxCoveragePercent}% limit. The parcel needs open ground, `
                + `not just building.`,
        proposal: {
          volumeId: biggest.id,
          parameter: 'w',
          value: Math.max(6, biggest.w - 4),
          reason: `Narrow volume ${biggest.id} to bring coverage back under the limit.`
        }
      };
    }

    return {
      argument: `The layout holds up. ${result.volumes.length} volume(s), coverage `
              + `${result.siteCoveragePercent}%, setbacks clear, ${result.totalGFA} m² GFA. `
              + `I would defend the floor plates against further shaving.`,
      proposal: null
    };
  }
};
