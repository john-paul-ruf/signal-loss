import type {
  Budget,
  Catalog,
  ChassisCode,
  CommanderCode,
  MountCode,
} from "../catalog/index";
import type {
  Construct,
  MountAssignment,
  Roster,
  Violation,
} from "../build/index";
import { validateConstruct, validateRoster } from "../build/index";
import {
  BitReadError,
  BitReader,
  base64UrlDecode,
  fnv1a16OverBits,
} from "./bitstream";
import {
  BUDGET_INDEX_BITS,
  CHASSIS_CODE_BITS,
  CHECKSUM_BITS,
  COMMANDER_CODE_BITS,
  CONSTRUCT_COUNT_BITS,
  FORMAT_VERSION,
  HARDPOINT_INDEX_BITS,
  KIND_BITS,
  KIND_CONSTRUCT,
  KIND_ROSTER,
  MOUNT_CODE_BITS,
  MOUNT_COUNT_BITS,
  SL1_PREFIX,
  VERSION_BITS,
  budgetAtIndex,
} from "./encode";

/**
 * The four distinguishable decode failures (FR-7, arch §3.5). The composer's
 * import banner and the roster-import screen both render one message per
 * discriminant, so no discriminant may be silently coalesced.
 *
 * `MALFORMED` — prefix / base64 / bit-length / checksum / structural bounds.
 * `UNKNOWN_ENTRY` — every code (chassis/mount/commander) is validated
 *   against `catalog` before the return; the first unknown code wins.
 * `ILLEGAL` — the payload decodes to a well-shaped `Construct` or `Roster`
 *   but fails `validateRoster` / `validateConstruct`. The violations are
 *   returned untouched (arch §3.5 — never repair toward legality).
 * `VERSION_UNSUPPORTED` — the leading `u8` version is not the one this build
 *   knows how to parse.
 */
export type DecodeError =
  | { readonly kind: "MALFORMED"; readonly message: string; readonly offset?: number }
  | {
      readonly kind: "UNKNOWN_ENTRY";
      readonly code: number;
      readonly entry: "chassis" | "mount" | "commander";
    }
  | { readonly kind: "ILLEGAL"; readonly violations: readonly Violation[] }
  | { readonly kind: "VERSION_UNSUPPORTED"; readonly version: number };

export type DecodeResult =
  | { readonly ok: true; readonly value: DecodedConstruct | DecodedRoster }
  | { readonly ok: false; readonly error: DecodeError };

export interface DecodedConstruct {
  readonly kind: "construct";
  readonly construct: Construct;
}

export interface DecodedRoster {
  readonly kind: "roster";
  readonly budget: Budget;
  readonly roster: Roster;
}

/**
 * decode — the single entry point (arch §3.5). All four failure classes are
 * returned via `Result`. Never throws for user input; the only throws are
 * fatal invariant violations (e.g. writer bug that produced illegal bit
 * widths), which by construction can't reach this path.
 */
export function decode(input: string, catalog: Catalog): DecodeResult {
  if (typeof input !== "string") {
    return malformed("Input is not a string.");
  }
  if (!input.startsWith(SL1_PREFIX)) {
    return malformed(
      `Expected leading ${JSON.stringify(SL1_PREFIX)} prefix.`,
      0,
    );
  }
  const payload = input.slice(SL1_PREFIX.length);
  if (payload.length === 0) {
    return malformed("Empty SL1 payload.", SL1_PREFIX.length);
  }
  const decoded = base64UrlDecode(payload);
  if (!decoded.ok) {
    return malformed(
      decoded.failure.message,
      SL1_PREFIX.length + decoded.failure.charOffset,
    );
  }
  const bytes = decoded.bytes;
  if (bytes.length < 2) {
    return malformed("SL1 payload is too short to contain a header and checksum.");
  }

  // The base64url decoder emits bytes whose bit length is bytes.length * 8;
  // any trailing base64 padding bits are already the LSBs of the last byte
  // and will be verified as zero after checksum extraction below.
  const reader = new BitReader(bytes, bytes.length * 8);

  let version: number;
  try {
    version = reader.readBits(VERSION_BITS);
  } catch (error) {
    return bitReaderFailure(error);
  }
  if (version !== FORMAT_VERSION) {
    return { ok: false, error: { kind: "VERSION_UNSUPPORTED", version } };
  }

  let kind: number;
  try {
    kind = reader.readBits(KIND_BITS);
  } catch (error) {
    return bitReaderFailure(error);
  }
  if (kind !== KIND_CONSTRUCT && kind !== KIND_ROSTER) {
    return malformed(`Unknown SL1 kind ${kind}.`);
  }

  let structural:
    | { readonly kind: "construct"; readonly construct: Construct }
    | {
        readonly kind: "roster";
        readonly budget: Budget;
        readonly roster: Roster;
      };
  let unknownEntry: DecodeError | null = null;
  try {
    if (kind === KIND_CONSTRUCT) {
      const parsed = readConstruct(reader, catalog);
      if (parsed.unknown !== null) {
        unknownEntry = parsed.unknown;
      }
      structural = { kind: "construct", construct: parsed.construct };
    } else {
      const budgetIx = reader.readBits(BUDGET_INDEX_BITS);
      const budget = budgetAtIndex(budgetIx);
      if (budget === null) {
        return malformed(`Unknown budget index ${budgetIx}.`);
      }
      const constructCount = reader.readBits(CONSTRUCT_COUNT_BITS);
      if (constructCount < 1) {
        return malformed("Roster payload declares zero constructs.");
      }
      const constructs: Construct[] = [];
      for (let i = 0; i < constructCount; i = i + 1) {
        const parsed = readConstruct(reader, catalog);
        if (parsed.unknown !== null && unknownEntry === null) {
          unknownEntry = parsed.unknown;
        }
        constructs.push(parsed.construct);
      }
      structural = {
        kind: "roster",
        budget,
        roster: { constructs },
      };
    }
  } catch (error) {
    return bitReaderFailure(error);
  }

  const preChecksumBits = reader.position();

  // Checksum must be verified *before* looking up catalog entries against the
  // structural payload. But we also collect UNKNOWN_ENTRY above so we can
  // surface it once checksum passes — a corrupted string that also happens
  // to reference an unknown code should still be MALFORMED, not
  // UNKNOWN_ENTRY.
  let checksum: number;
  try {
    checksum = reader.readBits(CHECKSUM_BITS);
  } catch (error) {
    return bitReaderFailure(error);
  }

  const expectedChecksum = fnv1a16OverBits(bytes, preChecksumBits);
  if (expectedChecksum !== checksum) {
    return malformed(
      `Checksum mismatch: expected ${expectedChecksum}, got ${checksum}.`,
    );
  }

  // Reject any leftover non-zero bits after the checksum — the base64url
  // decoder already checks the char-boundary tail, but reading through the
  // whole buffer guards against structurally-short payloads padded with
  // stray bits.
  if (!allZeroBitsRemain(reader)) {
    return malformed("SL1 payload has trailing non-zero bits after the checksum.");
  }

  if (unknownEntry !== null) {
    return { ok: false, error: unknownEntry };
  }

  // Legality classification — the codec never mutates toward legality
  // (FR-7, arch §3.5). Violations are surfaced as ILLEGAL.
  const violations =
    structural.kind === "construct"
      ? validateConstruct(structural.construct, catalog)
      : validateRoster(structural.roster, catalog, structural.budget);
  if (violations.length > 0) {
    return { ok: false, error: { kind: "ILLEGAL", violations } };
  }

  if (structural.kind === "construct") {
    return { ok: true, value: { kind: "construct", construct: structural.construct } };
  }
  return {
    ok: true,
    value: { kind: "roster", budget: structural.budget, roster: structural.roster },
  };
}

interface ReadConstruct {
  readonly construct: Construct;
  readonly unknown: DecodeError | null;
}

function readConstruct(reader: BitReader, catalog: Catalog): ReadConstruct {
  const chassisCode = reader.readBits(CHASSIS_CODE_BITS) as ChassisCode;
  let unknown: DecodeError | null = null;
  if (!catalog.indexes.chassisByCode.has(chassisCode)) {
    unknown = { kind: "UNKNOWN_ENTRY", code: chassisCode as number, entry: "chassis" };
  }

  const commanderRaw = reader.readBits(COMMANDER_CODE_BITS);
  let commanderCode: CommanderCode | null;
  if (commanderRaw === 0) {
    commanderCode = null;
  } else {
    commanderCode = commanderRaw as CommanderCode;
    if (unknown === null && !catalog.indexes.commanderTypeByCode.has(commanderCode)) {
      unknown = { kind: "UNKNOWN_ENTRY", code: commanderRaw, entry: "commander" };
    }
  }

  const mountCount = reader.readBits(MOUNT_COUNT_BITS);
  const mounts: MountAssignment[] = [];
  for (let i = 0; i < mountCount; i = i + 1) {
    const hardpointIndex = reader.readBits(HARDPOINT_INDEX_BITS);
    const mountCode = reader.readBits(MOUNT_CODE_BITS) as MountCode;
    if (unknown === null && !catalog.indexes.mountByCode.has(mountCode)) {
      unknown = { kind: "UNKNOWN_ENTRY", code: mountCode as number, entry: "mount" };
    }
    mounts.push({ hardpointIndex, mountCode });
  }

  return {
    construct: { chassisCode, commanderCode, mounts },
    unknown,
  };
}

function malformed(message: string, offset?: number): DecodeResult {
  const error: DecodeError =
    offset === undefined
      ? { kind: "MALFORMED", message }
      : { kind: "MALFORMED", message, offset };
  return { ok: false, error };
}

function bitReaderFailure(error: unknown): DecodeResult {
  if (error instanceof BitReadError) {
    return malformed(error.message, error.bitOffset);
  }
  if (error instanceof Error) {
    return malformed(error.message);
  }
  return malformed("SL1 payload could not be parsed.");
}

function allZeroBitsRemain(reader: BitReader): boolean {
  while (reader.remaining() >= 8) {
    if (reader.readBits(8) !== 0) return false;
  }
  const tail = reader.remaining();
  if (tail === 0) return true;
  return reader.readBits(tail) === 0;
}
