# M07 — Share codec

> **Path:** `./src/engine/codec/`
> **Imports from:** M05, M06
> **Status:** planned for full v1

## Public API
- encodeConstruct, encodeRoster, and decode
- SL1 bit-packed Base64url format with checksum
- MALFORMED, UNKNOWN_ENTRY, ILLEGAL, and VERSION_UNSUPPORTED failures

## Internal Structure

| Area | Path |
|---|---|
| Bit IO | `./src/engine/codec/bitstream.ts` |
| Encoding | `./src/engine/codec/encode.ts` |
| Decoding | `./src/engine/codec/decode.ts` |
| Facade | `./src/engine/codec/index.ts` |

## Conventions and Invariants
- Validate length/checksum before payload-sized allocation.
- Names, timestamps, and local IDs never enter the wire format.
- Decode validates but never repairs; round-trip is property-tested.

## Change History

| Date | Change |
|---|---|
| 2026-08-28 | Genesis/Forge contract recorded; implementation pending. |

<!-- SESSION-02 -->

## M07 — Share codec

Public API (`./src/engine/codec/index.ts`):

```ts
export function encodeConstruct(value: Construct, catalog: Catalog): string;
export function encodeRoster(value: Roster, budget: Budget, catalog: Catalog): string;
export function decode(input: string, catalog: Catalog): DecodeResult;

export const SL1_PREFIX = "SL1-";
export const FORMAT_VERSION = 1;

export type DecodeError =
  | { kind: "MALFORMED"; message: string; offset?: number }
  | { kind: "UNKNOWN_ENTRY"; code: number; entry: "chassis" | "mount" | "commander" }
  | { kind: "ILLEGAL"; violations: readonly Violation[] }
  | { kind: "VERSION_UNSUPPORTED"; version: number };
export type DecodeResult =
  | { ok: true; value: DecodedConstruct | DecodedRoster }
  | { ok: false; error: DecodeError };
```

Wire format (bit-packed, big-endian bit order, base64url without `=` padding):

```
SL1-<base64url payload>
payload bits:
  u8    format version                              (v1 → 1)
  u3    kind                                        (0 construct, 1 roster)
  u4    budget index                                [roster only, 0..7 → 25..200]
  u5    construct count                             [roster only, 1..CONSTRUCT_COUNT_MAX]
  per construct:
    u12 chassis code
    u4  commander code                              (0 = untagged)
    u4  mount count
    per mount:
      u4  hardpoint index
      u12 mount code
  u16   FNV-1a-16 checksum over the preceding bits (byte-padded)
```

Invariants:

- Decode validates prefix, version, kind, exact consumption, checksum, and
  base64url alphabet/length BEFORE catalog lookup. UNKNOWN_ENTRY is only
  surfaced after checksum passes.
- No name, id, or timestamp is ever emitted (NFR-8).
- Round-trip is property-tested: `decode(encode(r)) ≡ r` under semantic
  equivalence (mount composition + order, budget, commander tag).
- Zero engine dependencies (§2.1); FNV-1a-16 implementation is local
  (`bitstream.fnv1a16` / `fnv1a16OverBits`).

