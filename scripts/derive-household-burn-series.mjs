#!/usr/bin/env node
/**
 * CLI/import face for `deriveHouseholdBurnSeries` (see `../src/consumption-hedge.mjs` for the
 * algebra). Reads NDJSON requests on stdin and writes one burn-series record per line to
 * stdout; `--help` prints this operation's summary.
 */

import { deriveHouseholdBurnSeries } from "../src/consumption-hedge.mjs";

export { deriveHouseholdBurnSeries };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("deriveHouseholdBurnSeries — Derives a household's heating-season burn series from declared monthly bills or gallons, refusing rather than projecting a barrier when fewer than one prior heating season is given.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(deriveHouseholdBurnSeries(JSON.parse(line)))}\n`);
    }
  }
}
