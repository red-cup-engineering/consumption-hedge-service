# settle-hedge-repayment
## Requirements
- `matched-pair-repayment`: The operation must render one repayment installment as two Beancount transactions: the member's book pays down the pool liability from cash, and the pool's book receives it against the matching member receivable, both for the exact same declared amount.
- `shared-witness-metadata`: Both rendered transactions must carry the same `witness` metadata field.
## Prohibitions
- `refuses-malformed-amount`: The operation must throw a TypeError naming the field when `amount` is not a plain decimal string.
## Laws
- `tally-credit-draw-law` | Fintech under energy descent, section 3.2 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to both rendered transactions. | The member repays through the heating months as tally credit; a default is a mismatch held in FOUR, never an eviction.
- `pure-data-transformation-law` | The language law (owner-stated 2026-08-30) | v1 | .claude/rules/org-layering.md | Applies to settleHedgeRepayment as data transformation, never I/O. | I/O with a system is written in Node; a decision that is only data transformation performs no I/O of its own.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file eligible for downstream staged package-birth assays.
- `beancount-double-entry-syntax` | Beancount | v3.2 | https://beancount.github.io/docs/beancount_language_syntax.html | Applies to both rendered transactions. | Transactions use Beancount's plain-text double-entry syntax; conformance is verified by bean-check.
## Open questions
none
## Package
```json
{"packageName":"@red-cup-engineering/scratch-settle-hedge-repayment-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/computer-ledger-system-services-section":"0.4.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-settle-hedge-repayment-20260905.mjs
#!/usr/bin/env node
import { parseDecimal, formatScaled } from "@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs";

// Scratch-fabrication note: the shipped copy of this operation
// (consumption-hedge-service's scripts/settle-hedge-repayment.mjs) imports settleHedgeRepayment
// and its account/rendering helpers from the sibling src/consumption-hedge.mjs instead of the
// inline duplication this scratch circuit birthed.
function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`settle-hedge-repayment: ${context} must be a non-empty string`);
  return value;
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`settle-hedge-repayment: ${context} must be a plain decimal string`);
  try { parseDecimal(value); } catch { throw new TypeError(`settle-hedge-repayment: ${context} must be a plain decimal string`); }
  return value;
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
function requireDate(value, context) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw new TypeError(`settle-hedge-repayment: ${context} must be a YYYY-MM-DD date string`);
  return value;
}
function negateDecimalString(text) {
  const { negative, whole, frac } = parseDecimal(text);
  const magnitude = BigInt(`${whole}${frac}`);
  if (magnitude === 0n) return formatScaled(0n, frac.length);
  return formatScaled(negative ? magnitude : -magnitude, frac.length);
}
function toAccountComponent(text) {
  return String(text).trim().split(/[\s-]+/u).filter(Boolean)
    .map((word) => (/^\d/u.test(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)).join("-");
}
function renderMetadata(metadata) {
  return Object.entries(metadata).map(([key, value]) => `  ${key}: "${value}"`).join("\n");
}
function renderPostingLine(posting) {
  return `  ${posting.account}  ${posting.amount} ${posting.commodity}`;
}
function renderHedgeTransaction({ date, narration, metadata, postings }) {
  requireDate(date, "date");
  const lines = [`${date} * "${narration}"`];
  const renderedMetadata = renderMetadata(metadata);
  if (renderedMetadata !== "") lines.push(renderedMetadata);
  for (const posting of postings) lines.push(renderPostingLine(posting));
  return lines.join("\n");
}

/**
 * One tally-credit repayment installment as a matched pair of receipts: the member's book pays down the pool liability from cash, the pool's book receives the payment against the matching member receivable, both witnessed and for the exact same amount.
 * @param {{date: string, memberId: string, poolId: string, amount: string, witness: string, narration: string}} input
 * @returns {object} The repayment settlement with both rendered transactions.
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function settleHedgeRepayment({ date, memberId, poolId, amount, witness, narration }) {
  requireDate(date, "date");
  requireString(memberId, "memberId");
  requireString(poolId, "poolId");
  requireDecimalString(amount, "amount");
  requireString(witness, "witness");
  requireString(narration, "narration");

  const metadata = { member_id: memberId, pool_id: poolId, witness };
  const liabilityAccount = `Liabilities:Pool:${toAccountComponent(poolId)}`;
  const cashAccount = "Assets:Cash:Operating";
  const receivableAccount = `Assets:Receivable:Members:${toAccountComponent(memberId)}`;
  const floatAccount = `Assets:Cash:Float:${toAccountComponent(poolId)}`;

  const memberTransaction = renderHedgeTransaction({
    date, narration, metadata,
    postings: [
      { account: liabilityAccount, amount, commodity: "USD" },
      { account: cashAccount, amount: negateDecimalString(amount), commodity: "USD" },
    ],
  });
  const poolTransaction = renderHedgeTransaction({
    date, narration, metadata,
    postings: [
      { account: floatAccount, amount, commodity: "USD" },
      { account: receivableAccount, amount: negateDecimalString(amount), commodity: "USD" },
    ],
  });

  return {
    type: "HedgeRepaymentSettlement", version: 1, date, memberId, poolId, amount, witness,
    memberTransaction: { directive: memberTransaction, accounts: [liabilityAccount, cashAccount] },
    poolTransaction: { directive: poolTransaction, accounts: [floatAccount, receivableAccount] },
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("settleHedgeRepayment — One tally-credit repayment installment as a matched pair of receipts: the member's book pays down the pool liability from cash, the pool's book receives the payment against the matching member receivable, both witnessed and for the exact same amount.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(settleHedgeRepayment(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/settle-hedge-repayment.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { settleHedgeRepayment } from "../scripts/scratch-settle-hedge-repayment-20260905.mjs";

test("settles one repayment as a matched pair of receipts for the exact same amount", () => {
  const result = settleHedgeRepayment({ date: "2026-10-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool", amount: "183.33", witness: "repay:2026-10", narration: "hedge repayment installment 1 of 6" });
  assert.equal(result.type, "HedgeRepaymentSettlement");
  assert.match(result.memberTransaction.directive, /Liabilities:Pool:Tiyospaye-Pool  183.33 USD/);
  assert.match(result.poolTransaction.directive, /Assets:Cash:Float:Tiyospaye-Pool  183.33 USD/);
});

test("refuses a malformed amount", () => {
  assert.throws(() => settleHedgeRepayment({ date: "2026-10-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool", amount: "not-a-number", witness: "repay:2026-10", narration: "hedge repayment installment 1 of 6" }), /amount must be a plain decimal string/);
});
```
## Examples
```json name="one repayment installment settled"
{"input":{"date":"2026-10-05","memberId":"Chaske Sd","poolId":"Tiyospaye Pool","amount":"183.33","witness":"repay:2026-10","narration":"hedge repayment installment 1 of 6"},"output":{"type":"HedgeRepaymentSettlement","version":1,"date":"2026-10-05","memberId":"Chaske Sd","poolId":"Tiyospaye Pool","amount":"183.33","witness":"repay:2026-10","memberTransaction":{"directive":"2026-10-05 * \"hedge repayment installment 1 of 6\"\n  member_id: \"Chaske Sd\"\n  pool_id: \"Tiyospaye Pool\"\n  witness: \"repay:2026-10\"\n  Liabilities:Pool:Tiyospaye-Pool  183.33 USD\n  Assets:Cash:Operating  -183.33 USD","accounts":["Liabilities:Pool:Tiyospaye-Pool","Assets:Cash:Operating"]},"poolTransaction":{"directive":"2026-10-05 * \"hedge repayment installment 1 of 6\"\n  member_id: \"Chaske Sd\"\n  pool_id: \"Tiyospaye Pool\"\n  witness: \"repay:2026-10\"\n  Assets:Cash:Float:Tiyospaye-Pool  183.33 USD\n  Assets:Receivable:Members:Chaske-Sd  -183.33 USD","accounts":["Assets:Cash:Float:Tiyospaye-Pool","Assets:Receivable:Members:Chaske-Sd"]}}}
```
## Traceability
- `matched-pair-repayment` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `tally-credit-draw-law`, `beancount-double-entry-syntax`
- `shared-witness-metadata` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `tally-credit-draw-law`
- `refuses-malformed-amount` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
