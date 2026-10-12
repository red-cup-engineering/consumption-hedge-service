#!/usr/bin/env node
/**
 * CLI/import face for `deriveHedgePosition` (see `../src/consumption-hedge.mjs` for the
 * algebra). Reads NDJSON requests on stdin and writes one position or refusal record per line
 * to stdout; `--help` prints this operation's summary.
 */

import { deriveHedgePosition } from "../src/consumption-hedge.mjs";

export { deriveHedgePosition };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("deriveHedgePosition — Sizes a pre-buy propane/electricity position from a household's burn series and a pre-buy contract's terms through position-sizing-service, refusing rather than sizing when the basis, spread, or sizing sleeve forbids it.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(deriveHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
