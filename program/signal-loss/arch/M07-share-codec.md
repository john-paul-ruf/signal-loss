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
