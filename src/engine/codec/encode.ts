import { BUDGETS, type Budget, type Catalog } from "../catalog/index";
import type { Construct, Roster } from "../build/index";
import { BitWriter, base64UrlEncode, fnv1a16OverBits } from "./bitstream";

/**
 * SL1 format constants. The bit layout is fixed by architecture §3.5:
 *
 *   u8    format version                        (v1 → 1)
 *   u3    kind                                  (0 = construct, 1 = roster)
 *   u4    budget index                          [roster only]
 *   u5    construct count                       [roster only]
 *   per construct:
 *     u12 chassis code
 *     u4  commander type code                   (0 = untagged)
 *     u4  mount count
 *     per mount:
 *       u4  hardpoint index
 *       u12 mount code
 *   u16   FNV-1a-16 checksum over all preceding bits (byte-padded)
 *
 * Names, local ids, and timestamps never enter the wire format (FR-7, NFR-8).
 */

/** Wire prefix — every SL1 string begins with this. */
export const SL1_PREFIX = "SL1-";
export const FORMAT_VERSION = 1;

export const KIND_CONSTRUCT = 0;
export const KIND_ROSTER = 1;

export const VERSION_BITS = 8;
export const KIND_BITS = 3;
export const BUDGET_INDEX_BITS = 4;
export const CONSTRUCT_COUNT_BITS = 5;
export const CHASSIS_CODE_BITS = 12;
export const COMMANDER_CODE_BITS = 4;
export const MOUNT_COUNT_BITS = 4;
export const HARDPOINT_INDEX_BITS = 4;
export const MOUNT_CODE_BITS = 12;
export const CHECKSUM_BITS = 16;

/** Max encodable construct count. Roster size never exceeds MAX_SQUAD ≤ this. */
export const CONSTRUCT_COUNT_MAX = (1 << CONSTRUCT_COUNT_BITS) - 1;
/** Max encodable mount count on a single construct. */
export const MOUNT_COUNT_MAX = (1 << MOUNT_COUNT_BITS) - 1;

/**
 * The wire uses a 4-bit budget index into BUDGETS. Assumes 8 budget values;
 * the index fits in `BUDGET_INDEX_BITS`. Kept as a function so a future
 * budget table change is caught here rather than silently truncated.
 */
export function budgetIndex(budget: Budget): number {
  const index = (BUDGETS as readonly number[]).indexOf(budget as number);
  if (index < 0) {
    throw new RangeError(`Budget ${budget} is not a canonical BUDGETS entry.`);
  }
  const limit = 1 << BUDGET_INDEX_BITS;
  if (index >= limit) {
    throw new RangeError(
      `BUDGETS has grown beyond the u${BUDGET_INDEX_BITS} wire; update SL1 format.`,
    );
  }
  return index;
}

export function budgetAtIndex(index: number): Budget | null {
  if (!Number.isInteger(index) || index < 0 || index >= BUDGETS.length) return null;
  return BUDGETS[index] ?? null;
}

/**
 * Encode a single construct — used for the "share one build" flow and by
 * the roster encoder as a per-construct primitive. Catalog is accepted to
 * range-check codes; encoding an unknown code is a caller bug (validation
 * happens in the build layer), so we throw rather than emit a violated
 * wire value.
 */
export function encodeConstruct(value: Construct, catalog: Catalog): string {
  const writer = new BitWriter();
  writeHeader(writer, KIND_CONSTRUCT);
  writeConstructBody(writer, value, catalog);
  finalizeChecksum(writer);
  return SL1_PREFIX + base64UrlEncode(writer.toBytes());
}

/**
 * Encode a roster — carries the budget it was built for and every
 * construct in order (FR-7). Round-trip identity is exercised in tests.
 */
export function encodeRoster(value: Roster, budget: Budget, catalog: Catalog): string {
  if (value.constructs.length < 1) {
    throw new RangeError("encodeRoster refuses an empty roster.");
  }
  if (value.constructs.length > CONSTRUCT_COUNT_MAX) {
    throw new RangeError(
      `Roster has ${value.constructs.length} constructs; SL1 allows at most ${CONSTRUCT_COUNT_MAX}.`,
    );
  }
  const writer = new BitWriter();
  writeHeader(writer, KIND_ROSTER);
  writer.writeBits(budgetIndex(budget), BUDGET_INDEX_BITS);
  writer.writeBits(value.constructs.length, CONSTRUCT_COUNT_BITS);
  for (const construct of value.constructs) {
    writeConstructBody(writer, construct, catalog);
  }
  finalizeChecksum(writer);
  return SL1_PREFIX + base64UrlEncode(writer.toBytes());
}

function writeHeader(writer: BitWriter, kind: number): void {
  writer.writeBits(FORMAT_VERSION, VERSION_BITS);
  writer.writeBits(kind, KIND_BITS);
}

function writeConstructBody(writer: BitWriter, value: Construct, catalog: Catalog): void {
  if (!catalog.indexes.chassisByCode.has(value.chassisCode)) {
    throw new RangeError(`encodeConstruct: unknown chassis code ${value.chassisCode as number}.`);
  }
  writer.writeBits(value.chassisCode as number, CHASSIS_CODE_BITS);

  if (value.commanderCode !== null) {
    if (!catalog.indexes.commanderTypeByCode.has(value.commanderCode)) {
      throw new RangeError(
        `encodeConstruct: unknown commander code ${value.commanderCode as number}.`,
      );
    }
    writer.writeBits(value.commanderCode as number, COMMANDER_CODE_BITS);
  } else {
    writer.writeBits(0, COMMANDER_CODE_BITS);
  }

  if (value.mounts.length > MOUNT_COUNT_MAX) {
    throw new RangeError(
      `encodeConstruct: ${value.mounts.length} mounts exceeds SL1 max of ${MOUNT_COUNT_MAX}.`,
    );
  }
  writer.writeBits(value.mounts.length, MOUNT_COUNT_BITS);
  for (const mount of value.mounts) {
    writer.writeBits(mount.hardpointIndex, HARDPOINT_INDEX_BITS);
    if (!catalog.indexes.mountByCode.has(mount.mountCode)) {
      throw new RangeError(`encodeConstruct: unknown mount code ${mount.mountCode as number}.`);
    }
    writer.writeBits(mount.mountCode as number, MOUNT_CODE_BITS);
  }
}

function finalizeChecksum(writer: BitWriter): void {
  const preBits = writer.bitLength();
  const preBytes = writer.toBytes();
  const checksum = fnv1a16OverBits(preBytes, preBits);
  writer.writeBits(checksum, CHECKSUM_BITS);
}
