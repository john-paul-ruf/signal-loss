/**
 * Public facade for the SL1 share-codec module. Consumers import from here;
 * `bitstream`, `encode`, and `decode` are implementation details.
 *
 * Contract (arch §3.5, FR-7):
 *   - `SL1-` prefix + versioned bit-packed base64url payload.
 *   - Four distinguishable failure kinds; decode never silently repairs.
 *   - No names, no local ids, no timestamps ever cross the wire.
 */

export { encodeConstruct, encodeRoster, SL1_PREFIX, FORMAT_VERSION } from "./encode";
export { decode } from "./decode";
export type { DecodeError, DecodeResult, DecodedConstruct, DecodedRoster } from "./decode";
