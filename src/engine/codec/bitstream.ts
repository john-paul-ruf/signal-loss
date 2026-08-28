/**
 * SL1 bit-packed IO — internal to the codec module. Big-endian bit order.
 *
 * The writer accumulates arbitrary-width unsigned integers into a byte buffer
 * and emits `Uint8Array` bytes. The reader accepts a `Uint8Array` and a total
 * bit length so callers can enforce exact consumption at the payload boundary.
 * Neither structure allocates payload-sized memory before length is validated.
 *
 * These primitives never handle the SL1 prefix, base64url alphabet, checksum,
 * or catalog lookup — those concerns live one layer up in `encode` / `decode`.
 */

const MIN_BITS = 1;
const MAX_BITS = 24;

/** Range-checked, big-endian bit sink. */
export class BitWriter {
  private bytes: Uint8Array = new Uint8Array(64);
  private byteLength = 0;
  private bitOffset = 0;

  /** Append `bits` (1..24) of `value`'s low-order bits, MSB first. */
  writeBits(value: number, bits: number): void {
    if (!Number.isInteger(bits) || bits < MIN_BITS || bits > MAX_BITS) {
      throw new RangeError(`bit width must be 1..${MAX_BITS}; got ${bits}`);
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`bit value must be a non-negative integer; got ${value}`);
    }
    const limit = 1 << bits;
    if (value >= limit) {
      throw new RangeError(`value ${value} does not fit in ${bits} bits`);
    }

    let remaining = bits;
    while (remaining > 0) {
      this.ensureByte();
      const bitIndexInByte = this.bitOffset & 0x07;
      const room = 8 - bitIndexInByte;
      const take = remaining < room ? remaining : room;
      const shift = remaining - take;
      const chunk = (value >>> shift) & ((1 << take) - 1);
      const inserted = chunk << (room - take);
      const currentByte = this.bytes[this.byteLength - 1] ?? 0;
      this.bytes[this.byteLength - 1] = (currentByte | inserted) & 0xff;
      this.bitOffset += take;
      remaining -= take;
    }
  }

  bitLength(): number {
    return this.bitOffset;
  }

  toBytes(): Uint8Array {
    return this.bytes.slice(0, this.byteLength);
  }

  private ensureByte(): void {
    if ((this.bitOffset & 0x07) !== 0) return;
    if (this.byteLength === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.byteLength] = 0;
    this.byteLength += 1;
  }
}

/**
 * BitReadError — one class carrying the bit offset of the failure. The
 * codec's public API translates these into `DecodeError.MALFORMED` with an
 * optional char offset mapped at the base64url layer.
 */
export class BitReadError extends Error {
  readonly bitOffset: number;
  constructor(message: string, bitOffset: number) {
    super(message);
    this.name = "BitReadError";
    this.bitOffset = bitOffset;
  }
}

/** Range-checked, big-endian bit source with an explicit total-bit length. */
export class BitReader {
  private readonly bytes: Uint8Array;
  private readonly totalBits: number;
  private cursor = 0;

  constructor(bytes: Uint8Array, totalBits: number) {
    if (!Number.isInteger(totalBits) || totalBits < 0) {
      throw new RangeError(`totalBits must be a non-negative integer; got ${totalBits}`);
    }
    if (totalBits > bytes.length * 8) {
      throw new RangeError(
        `totalBits ${totalBits} exceeds buffer capacity ${bytes.length * 8}`,
      );
    }
    this.bytes = bytes;
    this.totalBits = totalBits;
  }

  /** Read `bits` (1..24) big-endian; throws BitReadError on overrun. */
  readBits(bits: number): number {
    if (!Number.isInteger(bits) || bits < MIN_BITS || bits > MAX_BITS) {
      throw new RangeError(`bit width must be 1..${MAX_BITS}; got ${bits}`);
    }
    if (this.cursor + bits > this.totalBits) {
      throw new BitReadError(
        `Attempted to read ${bits} bits at offset ${this.cursor}; only ${this.totalBits - this.cursor} remain.`,
        this.cursor,
      );
    }
    let value = 0;
    let remaining = bits;
    while (remaining > 0) {
      const byteIndex = this.cursor >>> 3;
      const bitIndexInByte = this.cursor & 0x07;
      const room = 8 - bitIndexInByte;
      const take = remaining < room ? remaining : room;
      const currentByte = this.bytes[byteIndex] ?? 0;
      const shifted = (currentByte >>> (room - take)) & ((1 << take) - 1);
      value = (value << take) | shifted;
      this.cursor += take;
      remaining -= take;
    }
    return value >>> 0;
  }

  remaining(): number {
    return this.totalBits - this.cursor;
  }

  position(): number {
    return this.cursor;
  }
}

/**
 * FNV-1a 16-bit checksum over `byteLength` bytes of `bytes`. Implemented as
 * FNV-1a-32 with the 32-bit hash folded to 16 bits with XOR — one canonical
 * "FNV-1a 16" variant. The wire format (arch §3.5) reserves a `u16` checksum.
 *
 * `Math.imul` gives a well-defined 32×32→32 signed multiplication in every
 * JS runtime; no BigInt allocations, no clock reads, no locale sensitivity.
 */
export function fnv1a16(bytes: Uint8Array, byteLength: number): number {
  const OFFSET = 0x811c9dc5;
  const PRIME = 0x01000193;
  let hash = OFFSET >>> 0;
  for (let i = 0; i < byteLength; i = i + 1) {
    hash = (hash ^ ((bytes[i] ?? 0) & 0xff)) >>> 0;
    hash = Math.imul(hash, PRIME) >>> 0;
  }
  return ((hash >>> 16) ^ (hash & 0xffff)) & 0xffff;
}

/**
 * Compute FNV-1a-16 over exactly the first `bitCount` bits of `bytes`,
 * treating any partial-byte tail as zero-padded in its least-significant
 * bits. Used to derive the SL1 checksum over its preceding bits at any bit
 * offset.
 */
export function fnv1a16OverBits(bytes: Uint8Array, bitCount: number): number {
  if (!Number.isInteger(bitCount) || bitCount < 0) {
    throw new RangeError(`bitCount must be a non-negative integer; got ${bitCount}`);
  }
  const fullBytes = bitCount >>> 3;
  const partialBits = bitCount & 0x07;
  if (partialBits === 0) {
    return fnv1a16(bytes, fullBytes);
  }
  const total = fullBytes + 1;
  const scratch = new Uint8Array(total);
  scratch.set(bytes.subarray(0, fullBytes));
  const lastByte = bytes[fullBytes] ?? 0;
  const highMask = (0xff << (8 - partialBits)) & 0xff;
  scratch[fullBytes] = lastByte & highMask;
  return fnv1a16(scratch, total);
}

/**
 * Base64url encoder without `=` padding — RFC 4648 §5 alphabet. Consumers
 * hand `writer.toBytes()` here after emitting all payload bits (including
 * checksum). The bit width used by the writer's final byte is already
 * zero-padded on the LSB side, so no ambiguity remains.
 */
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64Char(index: number): string {
  // Alphabet has exactly 64 chars; every 6-bit value is defined. The index
  // is masked at the call site, so this fallback never fires under normal
  // input — it only quiets the noUncheckedIndexedAccess strict flag.
  return BASE64URL_ALPHABET.charAt(index & 0x3f);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i + 3 <= bytes.length) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out +=
      b64Char(b0 >>> 2) +
      b64Char(((b0 & 0x03) << 4) | (b1 >>> 4)) +
      b64Char(((b1 & 0x0f) << 2) | (b2 >>> 6)) +
      b64Char(b2 & 0x3f);
    i += 3;
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b0 = bytes[i] ?? 0;
    out += b64Char(b0 >>> 2) + b64Char((b0 & 0x03) << 4);
  } else if (remaining === 2) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    out +=
      b64Char(b0 >>> 2) +
      b64Char(((b0 & 0x03) << 4) | (b1 >>> 4)) +
      b64Char((b1 & 0x0f) << 2);
  }
  return out;
}

export interface Base64UrlDecodeFailure {
  readonly kind: "BAD_LENGTH" | "BAD_CHAR" | "TRAILING_BITS";
  readonly charOffset: number;
  readonly message: string;
}

export type Base64UrlDecodeResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly failure: Base64UrlDecodeFailure };

function decodeCharValue(char: string): number {
  const code = char.charCodeAt(0);
  // A-Z
  if (code >= 65 && code <= 90) return code - 65;
  // a-z
  if (code >= 97 && code <= 122) return code - 97 + 26;
  // 0-9
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 45 /* - */) return 62;
  if (code === 95 /* _ */) return 63;
  return -1;
}

/**
 * Base64url decoder without `=` padding. Rejects unknown characters,
 * inputs whose length is `4k+1` (illegal residue), and inputs whose trailing
 * unused bits are non-zero.
 */
export function base64UrlDecode(input: string): Base64UrlDecodeResult {
  const n = input.length;
  if (n === 0) {
    return { ok: true, bytes: new Uint8Array(0) };
  }
  const residue = n & 0x03;
  if (residue === 1) {
    return {
      ok: false,
      failure: {
        kind: "BAD_LENGTH",
        charOffset: n - 1,
        message: "Base64url input has an illegal 4k+1 length.",
      },
    };
  }
  const outLength = ((n >>> 2) * 3) + (residue === 0 ? 0 : residue - 1);
  const bytes = new Uint8Array(outLength);
  let outIndex = 0;
  let i = 0;
  while (i + 4 <= n) {
    const v0 = decodeCharValue(input.charAt(i));
    const v1 = decodeCharValue(input.charAt(i + 1));
    const v2 = decodeCharValue(input.charAt(i + 2));
    const v3 = decodeCharValue(input.charAt(i + 3));
    if (v0 < 0) return badChar(i);
    if (v1 < 0) return badChar(i + 1);
    if (v2 < 0) return badChar(i + 2);
    if (v3 < 0) return badChar(i + 3);
    bytes[outIndex] = ((v0 << 2) | (v1 >>> 4)) & 0xff;
    bytes[outIndex + 1] = (((v1 & 0x0f) << 4) | (v2 >>> 2)) & 0xff;
    bytes[outIndex + 2] = (((v2 & 0x03) << 6) | v3) & 0xff;
    outIndex += 3;
    i += 4;
  }
  if (residue === 2) {
    const v0 = decodeCharValue(input.charAt(i));
    const v1 = decodeCharValue(input.charAt(i + 1));
    if (v0 < 0) return badChar(i);
    if (v1 < 0) return badChar(i + 1);
    bytes[outIndex] = ((v0 << 2) | (v1 >>> 4)) & 0xff;
    if ((v1 & 0x0f) !== 0) {
      return {
        ok: false,
        failure: {
          kind: "TRAILING_BITS",
          charOffset: i + 1,
          message: "Base64url tail encodes non-zero padding bits.",
        },
      };
    }
  } else if (residue === 3) {
    const v0 = decodeCharValue(input.charAt(i));
    const v1 = decodeCharValue(input.charAt(i + 1));
    const v2 = decodeCharValue(input.charAt(i + 2));
    if (v0 < 0) return badChar(i);
    if (v1 < 0) return badChar(i + 1);
    if (v2 < 0) return badChar(i + 2);
    bytes[outIndex] = ((v0 << 2) | (v1 >>> 4)) & 0xff;
    bytes[outIndex + 1] = (((v1 & 0x0f) << 4) | (v2 >>> 2)) & 0xff;
    if ((v2 & 0x03) !== 0) {
      return {
        ok: false,
        failure: {
          kind: "TRAILING_BITS",
          charOffset: i + 2,
          message: "Base64url tail encodes non-zero padding bits.",
        },
      };
    }
  }
  return { ok: true, bytes };
}

function badChar(offset: number): Base64UrlDecodeResult {
  return {
    ok: false,
    failure: {
      kind: "BAD_CHAR",
      charOffset: offset,
      message: "Base64url input contains a character outside the alphabet.",
    },
  };
}
