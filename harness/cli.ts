#!/usr/bin/env -S npx tsx
/**
 * Executable entry point for the SIGNAL LOSS headless harness.
 *
 * The actual CLI logic lives in `tests/harness/support/cli.ts` so that
 * `tsconfig.app.json`'s `include: ["tests"]` typechecks it; this file is
 * intentionally thin. Invoked by `npm run harness -- <battery> [flags]`
 * or directly via `tsx harness/cli.ts <battery> [flags]`.
 *
 * `harness/**` is excluded from tsconfig.app.json / tsconfig.node.json —
 * tsx runs this file at runtime without a separate typecheck pass.
 */

import { defaultIo } from "../tests/harness/support/io";
import { runCli } from "../tests/harness/support/cli";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const code = await runCli(argv, defaultIo());
  process.exit(code);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`sl: fatal — ${message}\n`);
  process.exit(4);
});
