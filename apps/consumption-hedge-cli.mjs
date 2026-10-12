#!/usr/bin/env node
/**
 * `consumption-hedge` — the composed CLI face over the consumption-hedge scripts. `burn` and
 * `position` are pure; `book`, `mark`, and `repay` additionally record their result through
 * the semiotic-EAVT journal (`@red-cup-engineering/semiotic-eavt-services-section`) at `--root`; `status` reads it back.
 * Apps compose scripts and src, never the reverse.
 */
import { parseArgs } from "node:util";
import { each, put } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { deriveHouseholdBurnSeries } from "../scripts/derive-household-burn-series.mjs";
import { deriveHedgePosition } from "../scripts/derive-hedge-position.mjs";
import { bookHedgePosition } from "../scripts/book-hedge-position.mjs";
import { markHedgePosition } from "../scripts/mark-hedge-position.mjs";
import { settleHedgeRepayment } from "../scripts/settle-hedge-repayment.mjs";

const TYPE = "consumption-hedge";

/** The records of one verb, oldest first, as `{id, record}` with `record` the verb's result. */
function recordsOf(root, category) {
  return [...each(root, TYPE)]
    .filter(({ record }) => record.category === category)
    .sort((left, right) => String(left.record.at).localeCompare(String(right.record.at)) || left.address.localeCompare(right.address))
    .map(({ address, record: { category: _category, at: _at, ...result } }) => ({ id: address, record: result }));
}
const VERBS = Object.freeze(["burn", "position", "book", "mark", "repay", "status"]);

async function readStdinJson() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text);
}

/**
 * Runs one `consumption-hedge` verb: computes the operation's result and, for the three
 * effectful verbs, records it as a semantic record journal receipt under `--root`.
 * @param {"burn"|"position"|"book"|"mark"|"repay"|"status"} verb
 * @param {{root?: string, input?: object, now?: () => string}} [options]
 * @returns {Promise<object>}
 * @throws {TypeError} When `verb` is not one of `VERBS`, or an effectful verb is run without `--root`.
 */
export async function runConsumptionHedgeCli(verb, { root, input, now = () => new Date().toISOString() } = {}) {
  if (!VERBS.includes(verb)) throw new TypeError(`consumption-hedge-cli: verb must be one of ${VERBS.join(", ")}`);

  if (verb === "burn") return deriveHouseholdBurnSeries(await (input ?? readStdinJson()));
  if (verb === "position") return deriveHedgePosition(await (input ?? readStdinJson()));

  if (!root) throw new TypeError(`consumption-hedge-cli: --root is required for "${verb}" (its result is recorded as a receipt)`);

  if (verb === "status") {
    return {
      bookings: recordsOf(root, "book"),
      marks: recordsOf(root, "mark"),
      repayments: recordsOf(root, "repay"),
    };
  }

  const request = input ?? await readStdinJson();
  const result = verb === "book" ? bookHedgePosition(request)
    : verb === "mark" ? markHedgePosition(request)
      : settleHedgeRepayment(request);

  const recordedAt = now();
  const id = put(root, TYPE, { category: verb, ...result, at: recordedAt });
  return { ...result, receipt: { id, recordedAt } };
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, "object-kind": { type: "string" } },
  });
  const verb = positionals[0];
  if (!VERBS.includes(verb)) {
    process.stderr.write(`usage: consumption-hedge-cli <${VERBS.join("|")}> [--root <path>]\n`);
    process.exitCode = 2;
  } else {
    runConsumptionHedgeCli(verb, { root: values.root })
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
      });
  }
}
