/**
 * Injectable I/O for the harness. Every entry point that touches the
 * outside world takes a `HarnessIo` so tests can substitute in-memory
 * sinks and inspect what the CLI wrote. Never uses `console.*` or
 * `process.*` directly — see `defaultIo()` for the production wiring.
 */

import { writeFileSync } from "node:fs";

export interface HarnessIo {
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  writeFile(path: string, text: string): void;
}

/** Real I/O — writes to process.stdout / stderr / fs. */
export function defaultIo(): HarnessIo {
  return {
    writeStdout(text: string): void {
      process.stdout.write(text);
    },
    writeStderr(text: string): void {
      process.stderr.write(text);
    },
    writeFile(path: string, text: string): void {
      writeFileSync(path, text, "utf8");
    },
  };
}

/**
 * A capturing I/O for tests. Every call appends to `stdout`, `stderr`, or
 * `files` (keyed by path). Deterministic — call order is preserved.
 */
export interface CapturedIo extends HarnessIo {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly files: Map<string, string>;
  readAll(): { stdout: string; stderr: string; files: ReadonlyMap<string, string> };
}

export function capturedIo(): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const files = new Map<string, string>();
  return {
    stdout,
    stderr,
    files,
    writeStdout(text: string): void {
      stdout.push(text);
    },
    writeStderr(text: string): void {
      stderr.push(text);
    },
    writeFile(path: string, text: string): void {
      files.set(path, text);
    },
    readAll() {
      return {
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        files,
      };
    },
  };
}
