#!/usr/bin/env node
/**
 * CLI/import face for `markHedgePosition` (see `../src/consumption-hedge.mjs` for the algebra).
 * Reads NDJSON requests on stdin and writes one mark record per line to stdout; `--help`
 * prints this operation's summary.
 */

import { markHedgePosition } from "../src/consumption-hedge.mjs";

export { markHedgePosition };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("markHedgePosition — Marks a booked position against the latest PROPANE_GAL/KWH price directive (position x (spot - forward)), booking the realized gain or loss on delivery.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(markHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
