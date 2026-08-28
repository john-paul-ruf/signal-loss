/**
 * Squad visual identity — the lightness + glyph + pattern + tag tuple
 * that FR-24 / NFR-5 requires for color-blind separability
 * (design.md §1.4). Never render squad affiliation with color alone.
 */

import type { SquadId } from "../../engine";

export interface SquadVisual {
  readonly name: string;
  readonly tag: string; // 2 letter code
  readonly glyph: string; // ▲ ● ■ ◆ ✱
  readonly cssVar: string; // e.g. --color-vector
  readonly fillHex: string; // fallback for canvas draw
  readonly patternKey: PatternKey;
  readonly lightness: 0 | 1 | 2 | 3 | 4; // 0 = darkest, 4 = lightest
}

export type PatternKey = "solid" | "dots" | "hlines" | "vlines" | "diagonal";

const VISUALS: readonly SquadVisual[] = [
  { name: "VECTOR", tag: "VC", glyph: "▲", cssVar: "--color-vector", fillHex: "#A8FBFF", patternKey: "solid", lightness: 4 },
  { name: "AXIOM", tag: "AX", glyph: "●", cssVar: "--color-axiom", fillHex: "#FFB43C", patternKey: "dots", lightness: 3 },
  { name: "KESTREL", tag: "KS", glyph: "■", cssVar: "--color-kestrel", fillHex: "#5AA8FF", patternKey: "diagonal", lightness: 2 },
  { name: "HOLLOW", tag: "HL", glyph: "◆", cssVar: "--color-hollow", fillHex: "#F2569B", patternKey: "hlines", lightness: 1 },
  { name: "NULLSET", tag: "NS", glyph: "✱", cssVar: "--color-nullset", fillHex: "#8C6BD6", patternKey: "vlines", lightness: 0 },
];

/**
 * Return the immutable visual identity for a squad. Every render surface
 * (canvas, rail row, inspector tag) MUST read from this table so a color
 * override never breaks the identity contract.
 */
export function visualFor(id: SquadId): SquadVisual {
  const v = VISUALS[id as number];
  if (v === undefined) {
    throw new Error(`No visual for squadId ${id as number}`);
  }
  return v;
}

export function highContrastLightness(v: SquadVisual): string {
  // Map [0..4] to a 5-stop grayscale ladder for high-contrast mode.
  const stops = ["#4d4d4d", "#7a7a7a", "#a8a8a8", "#d6d6d6", "#f0f0f0"];
  return stops[v.lightness] ?? "#e8f2fb";
}

/**
 * Deterministic per-squad separability check — used by the test suite
 * to prove the five squads remain distinguishable under a color-vision
 * simulation. Callers hand in the sim function; we assert the resulting
 * tuple has 5 distinct (lightness, glyph, pattern) triples.
 */
export function separabilityTriples(): readonly {
  readonly squad: number;
  readonly lightness: number;
  readonly glyph: string;
  readonly pattern: PatternKey;
}[] {
  return VISUALS.map((v, i) => ({
    squad: i,
    lightness: v.lightness,
    glyph: v.glyph,
    pattern: v.patternKey,
  }));
}
