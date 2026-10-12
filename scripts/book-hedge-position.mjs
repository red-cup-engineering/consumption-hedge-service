#!/usr/bin/env node
/**
 * CLI/import face for `bookHedgePosition` (see `../src/consumption-hedge.mjs` for the algebra).
 * Reads NDJSON requests on stdin and writes one booking-set record per line to stdout;
 * `--help` prints this operation's summary.
 */

import { bookHedgePosition } from "../src/consumption-hedge.mjs";

export { bookHedgePosition };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("bookHedgePosition — Books a pre-buy position across the two-book law: the member's book carries the inventory asset against a liability to the pool, and the pool's book carries the matching receivable, each witnessed.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(bookHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
