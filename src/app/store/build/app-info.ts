/**
 * Real app metadata for status readouts. Boot states the running build
 * version rather than a mock placeholder — the value is read from the single
 * source of truth (package.json) at build time, not hand-copied.
 */
import packageJson from "../../../../package.json";

export const APP_VERSION: string = packageJson.version;
