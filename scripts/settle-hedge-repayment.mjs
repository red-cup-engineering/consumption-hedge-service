#!/usr/bin/env node
/**
 * CLI/import face for `settleHedgeRepayment` (see `../src/consumption-hedge.mjs` for the
 * algebra). Reads NDJSON requests on stdin and writes one settlement record per line to
 * stdout; `--help` prints this operation's summary.
 */

import { settleHedgeRepayment } from "../src/consumption-hedge.mjs";

export { settleHedgeRepayment };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("settleHedgeRepayment — Books one tally-credit repayment installment as a matched pair of receipts: the member's book pays down the pool liability from cash, the pool's book receives it against the matching receivable.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(settleHedgeRepayment(JSON.parse(line)))}\n`);
    }
  }
}
