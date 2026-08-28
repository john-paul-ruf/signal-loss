/**
 * Canonical serialization and FNV-1a-64 hashing for `MatchState`.
 *
 * The hash is the byte-identity definition FR-29 uses. Two states hash
 * to the same digest iff their canonical serializations are equal —
 * lexicographic object-key order, integer-only numeric values, stable
 * array ordering, no functions.
 *
 * The FNV-1a-64 primitive is duplicated from `catalog/canonical` to keep
 * the match module's dependency graph honest (match → fx, catalog, build,
 * map — never a shared "hash-utils" module the engine does not otherwise
 * need).
 */

import type { MatchState, MatchConstruct, SquadState, KnownPositionEntry, EliminationEntry } from "./state";

const FNV_OFFSET_64: bigint = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME_64: bigint = 0x0000_0100_0000_01b3n;
const MASK_64: bigint = 0xffff_ffff_ffff_ffffn;

const utf8 = new TextEncoder();

/**
 * Canonical JSON stringifier: object keys emitted in lexicographic order,
 * arrays preserve their input order (callers are expected to have sorted
 * their arrays by stable id), numbers must be finite integers, and no
 * function / symbol / undefined / Map / Set / class instance is
 * permitted. Rejecting forbidden shapes rather than coercing them is
 * the FR-29 discipline (§4.4).
 */
export function canonicalize(value: unknown, path = "$"): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`canonicalize: non-finite number at ${path}.`);
    }
    if (!Number.isInteger(value)) {
      throw new RangeError(`canonicalize: non-integer number ${value} at ${path}.`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "function") {
    throw new TypeError(`canonicalize: function at ${path}.`);
  }
  if (typeof value === "symbol") {
    throw new TypeError(`canonicalize: symbol at ${path}.`);
  }
  if (typeof value === "undefined") {
    throw new TypeError(`canonicalize: undefined at ${path}.`);
  }
  if (typeof value === "bigint") {
    throw new TypeError(`canonicalize: bigint at ${path}. Use plain integers.`);
  }
  if (value instanceof Map || value instanceof Set) {
    throw new TypeError(`canonicalize: Map/Set at ${path}. Use sorted arrays.`);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i = i + 1) {
      parts.push(canonicalize(value[i], `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    // Reject class instances by checking for a null-proto or plain object.
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      throw new TypeError(`canonicalize: non-plain object at ${path}.`);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const key of keys) {
      parts.push(`${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonicalize: unsupported ${typeof value} at ${path}.`);
}

function fnv1a64Bytes(bytes: Uint8Array): bigint {
  let hash = FNV_OFFSET_64;
  for (let i = 0; i < bytes.length; i = i + 1) {
    const byte = bytes[i] as number;
    hash = (hash ^ BigInt(byte)) & MASK_64;
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash;
}

function toHex16(value: bigint): string {
  const hex = value.toString(16);
  return hex.padStart(16, "0");
}

/** FNV-1a-64 over a UTF-8 encoded string, 16-char lowercase hex. */
export function fnv1a64Hex(input: string): string {
  return toHex16(fnv1a64Bytes(utf8.encode(input)));
}

/**
 * Convert a construct into a plain, canonical-ready record. Vec2 is
 * flattened to `x`/`y` integers.
 */
function constructToRecord(c: MatchConstruct): Record<string, unknown> {
  return {
    id: c.id as number,
    squadId: c.squadId as number,
    chassisCode: c.chassisCode as number,
    commanderCode: c.commanderCode !== null ? (c.commanderCode as number) : null,
    mounts: c.mounts.map((m) => ({
      hardpointIndex: m.hardpointIndex,
      mountCode: m.mountCode as number,
    })),
    position: {
      x: c.position.x as number,
      y: c.position.y as number,
    },
    dialIndex: c.dialIndex,
    destroyed: c.destroyed,
    destroyedRound: c.destroyedRound,
    damageDealt: c.damageDealt,
    damageTaken: c.damageTaken,
    roundsAlive: c.roundsAlive,
    calledShotsFired: c.calledShotsFired,
    posturesHeld: c.posturesHeld,
  };
}

function squadToRecord(s: SquadState): Record<string, unknown> {
  return {
    id: s.id as number,
    commanderDead: s.commanderDead,
    commanderDeathRound: s.commanderDeathRound,
    poolTotal: s.poolTotal,
    poolSpent: s.poolSpent,
    eliminatedRound: s.eliminatedRound,
    totalDamageDealt: s.totalDamageDealt,
    totalDamageTaken: s.totalDamageTaken,
    totalPoolGranted: s.totalPoolGranted,
    totalPoolSpent: s.totalPoolSpent,
    totalPoolWasted: s.totalPoolWasted,
    totalCalledShots: s.totalCalledShots,
    totalPostures: s.totalPostures,
  };
}

function kpToRecord(k: KnownPositionEntry): Record<string, unknown> {
  return {
    observer: k.observer as number,
    subject: k.subject as number,
    position: { x: k.position.x as number, y: k.position.y as number },
    confirmedRound: k.confirmedRound,
  };
}

function elimToRecord(e: EliminationEntry): Record<string, unknown> {
  return {
    squadId: e.squadId as number,
    round: e.round,
    placement: e.placement,
  };
}

/**
 * Reduce a `MatchState` to a canonical record for serialization. Notably
 * excluded: `map` — the map is stable across the whole match; hashing it
 * once at match start (via its own canonical hash on `MatchConfigDigest`)
 * would be redundant. We include a summary hash of the map's identity
 * so that a state carrying a swapped map still round-trips distinctly.
 */
function stateToRecord(state: MatchState): Record<string, unknown> {
  return {
    round: state.round,
    phase: state.phase,
    config: {
      seed: state.config.seed,
      budget: state.config.budget as number,
      aiTier: state.config.aiTier,
      catalogHash: state.config.catalogHash,
      tunablesHash: state.config.tunablesHash,
    },
    map: mapToRecord(state.map),
    squads: state.squads.map((s) => squadToRecord(s)),
    constructs: state.constructs.map((c) => constructToRecord(c)),
    knownPositions: state.knownPositions.map((k) => kpToRecord(k)),
    eliminationOrder: state.eliminationOrder.map((e) => elimToRecord(e)),
    winner: state.winner !== null ? (state.winner as number) : null,
  };
}

function mapToRecord(map: MatchState["map"]): Record<string, unknown> {
  return {
    seed: map.seed,
    acceptedAttempt: map.acceptedAttempt,
    archetypeId: map.archetypeId as string,
    bounds: map.bounds.map((v) => ({ x: v.x as number, y: v.y as number })),
    walls: map.walls.map((w) => ({
      id: w.id,
      a: { x: w.a.x as number, y: w.a.y as number },
      b: { x: w.b.x as number, y: w.b.y as number },
    })),
    spawns: map.spawns.map((s) => ({
      squadIndex: s.squadIndex,
      polygon: s.polygon.map((v) => ({ x: v.x as number, y: v.y as number })),
      anchor: { x: s.anchor.x as number, y: s.anchor.y as number },
    })),
    traceSchedule: map.traceSchedule.map((t) => ({
      round: t.round,
      safeRegion: t.safeRegion.map((v) => ({ x: v.x as number, y: v.y as number })),
      damage: t.damage,
    })),
  };
}

/**
 * The canonical serialization of `state`. Two states with the same
 * hashState() digest have the same canonical serialization. Provided as
 * a debugging / test escape hatch — production replay uses `hashState`.
 */
export function canonicalStateString(state: MatchState): string {
  return canonicalize(stateToRecord(state));
}

/**
 * The FR-29 byte-identity: two MatchStates are equal iff `hashState`
 * returns the same 16-char hex digest. Throws if the state contains a
 * forbidden shape (function, Map, etc.) — the sooner an invariant break
 * surfaces the better.
 */
export function hashState(state: MatchState): string {
  return fnv1a64Hex(canonicalStateString(state));
}
