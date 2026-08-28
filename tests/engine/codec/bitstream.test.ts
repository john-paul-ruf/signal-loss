import { describe, expect, it } from "vitest";
import {
  BitReadError,
  BitReader,
  BitWriter,
  base64UrlDecode,
  base64UrlEncode,
  fnv1a16,
  fnv1a16OverBits,
} from "../../../src/engine/codec/bitstream";

describe("codec/bitstream / BitWriter → BitReader round-trip", () => {
  it("writes and reads a single small value at bit width 1", () => {
    const writer = new BitWriter();
    writer.writeBits(1, 1);
    writer.writeBits(0, 1);
    writer.writeBits(1, 1);
    const bytes = writer.toBytes();
    const reader = new BitReader(bytes, writer.bitLength());
    expect(reader.readBits(1)).toBe(1);
    expect(reader.readBits(1)).toBe(0);
    expect(reader.readBits(1)).toBe(1);
  });

  it("preserves values across a byte boundary in big-endian order", () => {
    const writer = new BitWriter();
    writer.writeBits(0xab, 8);
    writer.writeBits(0xcd, 8);
    writer.writeBits(0xef, 8);
    expect(Array.from(writer.toBytes())).toEqual([0xab, 0xcd, 0xef]);
    const reader = new BitReader(writer.toBytes(), 24);
    expect(reader.readBits(8)).toBe(0xab);
    expect(reader.readBits(8)).toBe(0xcd);
    expect(reader.readBits(8)).toBe(0xef);
  });

  it("packs unaligned widths precisely", () => {
    const writer = new BitWriter();
    writer.writeBits(0b11010, 5);
    writer.writeBits(0b011, 3);
    writer.writeBits(0b1110_0000, 8);
    const reader = new BitReader(writer.toBytes(), writer.bitLength());
    expect(reader.readBits(5)).toBe(0b11010);
    expect(reader.readBits(3)).toBe(0b011);
    expect(reader.readBits(8)).toBe(0b1110_0000);
  });

  it("round-trips arbitrary mixed widths", () => {
    const cases: Array<[number, number]> = [
      [0x0d, 4],
      [0xabc, 12],
      [1, 1],
      [0, 3],
      [0xffff, 16],
      [7, 5],
      [0x123, 12],
    ];
    const writer = new BitWriter();
    for (const [v, b] of cases) writer.writeBits(v, b);
    const reader = new BitReader(writer.toBytes(), writer.bitLength());
    for (const [v, b] of cases) expect(reader.readBits(b)).toBe(v);
  });

  it("rejects out-of-range writes", () => {
    const writer = new BitWriter();
    expect(() => writer.writeBits(-1, 4)).toThrow(RangeError);
    expect(() => writer.writeBits(16, 4)).toThrow(RangeError);
    expect(() => writer.writeBits(0, 0)).toThrow(RangeError);
    expect(() => writer.writeBits(0, 25)).toThrow(RangeError);
    expect(() => writer.writeBits(1.5, 8)).toThrow(RangeError);
  });

  it("BitReader raises BitReadError with the exact bit offset on overrun", () => {
    const reader = new BitReader(new Uint8Array([0xff, 0xff]), 12);
    reader.readBits(4);
    reader.readBits(4);
    try {
      reader.readBits(5);
      expect.fail("expected overrun");
    } catch (error) {
      expect(error).toBeInstanceOf(BitReadError);
      if (error instanceof BitReadError) {
        expect(error.bitOffset).toBe(8);
      }
    }
  });

  it("rejects negative or oversized totalBits", () => {
    expect(() => new BitReader(new Uint8Array(1), -1)).toThrow(RangeError);
    expect(() => new BitReader(new Uint8Array(1), 17)).toThrow(RangeError);
  });
});

describe("codec/bitstream / fnv1a16", () => {
  it("returns a constant for the empty input", () => {
    const empty = new Uint8Array(0);
    expect(fnv1a16(empty, 0)).toBe(fnv1a16(empty, 0));
  });

  it("changes on every single-byte perturbation", () => {
    const base = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
    const original = fnv1a16(base, base.length);
    for (let i = 0; i < base.length; i = i + 1) {
      const mutant = new Uint8Array(base);
      mutant[i] = ((mutant[i] ?? 0) ^ 0x80) & 0xff;
      expect(fnv1a16(mutant, mutant.length)).not.toBe(original);
    }
  });

  it("fnv1a16OverBits zero-pads the partial tail deterministically", () => {
    const bytes = new Uint8Array([0xab, 0xcd, 0xe0]);
    // Only the top four bits of byte 2 are considered; the LSBs must be masked
    // out prior to hashing.
    const withPad = fnv1a16OverBits(bytes, 20);
    const mutated = new Uint8Array([0xab, 0xcd, 0xef]);
    expect(fnv1a16OverBits(mutated, 20)).toBe(withPad);
  });

  it("fnv1a16OverBits reduces to fnv1a16 on byte-aligned inputs", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03]);
    expect(fnv1a16OverBits(bytes, 24)).toBe(fnv1a16(bytes, 3));
    expect(fnv1a16OverBits(bytes, 0)).toBe(fnv1a16(bytes, 0));
  });
});

describe("codec/bitstream / base64url", () => {
  const cases: Array<[string, number[]]> = [
    ["", []],
    ["AA", [0x00]],
    ["AQ", [0x01]],
    ["_w", [0xff]],
    ["AAA", [0x00, 0x00]],
    ["__8", [0xff, 0xff]],
    ["AAAA", [0x00, 0x00, 0x00]],
    ["____", [0xff, 0xff, 0xff]],
    ["AAAAAAAA", [0, 0, 0, 0, 0, 0]],
  ];

  it("round-trips fixed vectors", () => {
    for (const [encoded, expectedBytes] of cases) {
      const bytes = new Uint8Array(expectedBytes);
      const roundTrip = base64UrlEncode(bytes);
      expect(roundTrip).toBe(encoded);
      const decoded = base64UrlDecode(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(Array.from(decoded.bytes)).toEqual(expectedBytes);
    }
  });

  it("rejects a 4k+1 char length as BAD_LENGTH", () => {
    const result = base64UrlDecode("A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("BAD_LENGTH");
  });

  it("rejects an out-of-alphabet character as BAD_CHAR", () => {
    const result = base64UrlDecode("AA*A");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("BAD_CHAR");
      expect(result.failure.charOffset).toBe(2);
    }
  });

  it("rejects a tail that encodes trailing non-zero bits", () => {
    // 'AB' encodes bytes[0]=(0<<2)|(1>>>4)=0 with tail=0x01 (bottom nibble)
    const result = base64UrlDecode("AB");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("TRAILING_BITS");
  });

  it("survives a large random-shape byte sequence", () => {
    const bytes = new Uint8Array(300);
    for (let i = 0; i < bytes.length; i = i + 1) bytes[i] = (i * 37 + 11) & 0xff;
    const encoded = base64UrlEncode(bytes);
    const decoded = base64UrlDecode(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(Array.from(decoded.bytes)).toEqual(Array.from(bytes));
  });
});
