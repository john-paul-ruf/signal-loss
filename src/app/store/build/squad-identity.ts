/**
 * The five squad identities (design.md §1.4). Identity reads as lightness rank
 * (primary) → glyph (secondary) → hue (tertiary) → two-letter tag (always
 * rendered), so the board stays legible under full greyscale and every colour
 * vision type (NFR-5). These are design-system constants, not catalog content.
 */
export interface SquadIdentity {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly glyph: string;
  readonly colorVar: string;
  /** Approximate CIE L* lightness rank, monotone and ≥8 apart. */
  readonly lightness: number;
  readonly isPlayer: boolean;
}

export const SQUAD_LADDER: readonly SquadIdentity[] = [
  { id: "vector", name: "VECTOR", tag: "VC", glyph: "▲", colorVar: "var(--color-vector)", lightness: 94, isPlayer: true },
  { id: "axiom", name: "AXIOM", tag: "AX", glyph: "■", colorVar: "var(--color-axiom)", lightness: 80, isPlayer: false },
  { id: "kestrel", name: "KESTREL", tag: "KS", glyph: "◆", colorVar: "var(--color-kestrel)", lightness: 68, isPlayer: false },
  { id: "hollow", name: "HOLLOW", tag: "HL", glyph: "⬡", colorVar: "var(--color-hollow)", lightness: 60, isPlayer: false },
  { id: "nullset", name: "NULLSET", tag: "NS", glyph: "●", colorVar: "var(--color-nullset)", lightness: 50, isPlayer: false },
];
