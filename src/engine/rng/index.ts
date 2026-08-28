/**
 * Public facade for the RNG module. Consumers import from here; internals
 * (`pcg32.ts`, `streams.ts`) are not part of the engine boundary.
 *
 * Contract (per architecture §3.2):
 *   • Consumers never draw from the root RNG; they draw from named streams.
 *   • Every draw returns [value, nextState]; RNG values are immutable.
 *   • Resolution modules (match/, view/) do not import this module — enforced
 *     by review and repeated in the M04 arch file.
 */

export { type Rng, nextInt, nextRange, pick, shuffle } from "./pcg32";
export { fnv1a64, rngFromSeed, stream } from "./streams";
