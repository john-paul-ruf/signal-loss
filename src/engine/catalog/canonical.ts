/**
 * Canonical serialization and FNV-1a-64 hashing, scoped to catalog use.
 *
 * The FNV-1a-64 implementation is duplicated from `engine/rng/streams.ts`
 * intentionally: the catalog's dependency graph is `catalog → fx`, and
 * dragging `rng` in just for a hash primitive would break the boundary
 * (arch §7). The algorithm is 12 lines; duplication is cheaper than the
 * shared-utility module the two would otherwise need.
 */

const FNV_OFFSET_64: bigint = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME_64: bigint = 0x0000_0100_0000_01b3n;
const MASK_64: bigint = 0xffff_ffff_ffff_ffffn;

const utf8 = new TextEncoder();

/**
 * Canonical JSON stringifier: object keys are emitted in lexicographic order,
 * arrays keep their input order, numbers must be finite, and no non-JSON
 * value is accepted. Since the result depends only on content and stable
 * ordering, two logically equal catalogs hash to the same digest regardless
 * of the property insertion order used by the authoring JSON files.
 */
export function canonicalize(value: unknown, path = "$"): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`canonicalize: non-finite number at ${path}.`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i = i + 1) {
      parts.push(canonicalize(value[i], `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
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

/**
 * FNV-1a-64 over a UTF-8 encoded string, returned as a 16-character
 * lowercase hex digest.
 */
export function fnv1a64Hex(input: string): string {
  return toHex16(fnv1a64Bytes(utf8.encode(input)));
}

/**
 * Convenience: canonicalize + FNV-1a-64 + hex.
 */
export function canonicalHash(value: unknown): string {
  return fnv1a64Hex(canonicalize(value));
}
