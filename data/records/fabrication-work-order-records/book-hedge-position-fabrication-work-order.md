# book-hedge-position
## Requirements
- `two-book-posting`: The operation must render two Beancount transactions from one pre-buy fill: the member's book debits an inventory account in PROPANE_GAL at the forward price against a credit to a pool liability account, and the pool's book debits a receivable account against a credit to its float cash account, for the exact same amount.
- `shared-witness-metadata`: Both rendered transactions must carry the same `witness` metadata field naming the contract document's identity.
## Prohibitions
- `refuses-cost-mismatch`: The operation must throw rather than book when the declared contractCost does not exactly equal gallons multiplied by forwardPrice.
## Laws
- `two-book-law` | Fintech under energy descent, section 3.2 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to the two rendered transactions. | The pool books the position as inventory at the forward price and marks it against spot; a physical margin is hedged, never disintermediated.
- `pure-data-transformation-law` | The language law (owner-stated 2026-08-30) | v1 | .claude/rules/org-layering.md | Applies to bookHedgePosition as data transformation, never I/O. | I/O with a system is written in Node; a decision that is only data transformation performs no I/O of its own.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file eligible for downstream staged package-birth assays.
- `beancount-double-entry-syntax` | Beancount | v3.2 | https://beancount.github.io/docs/beancount_language_syntax.html | Applies to every rendered transaction. | Transactions use Beancount's plain-text double-entry syntax; conformance is verified by bean-check.
## Open questions
none
## Package
```json
{"packageName":"@red-cup-engineering/scratch-book-hedge-position-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/computer-ledger-system-services-section":"0.4.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-book-hedge-position-20260905.mjs
#!/usr/bin/env node
import { parseDecimal, formatScaled, addDecimalStrings, multiplyDecimalStrings } from "@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs";

// Scratch-fabrication note: the shipped copy of this operation
// (consumption-hedge-service's scripts/book-hedge-position.mjs) imports bookHedgePosition and
// its account/rendering helpers from the sibling src/consumption-hedge.mjs instead of the
// inline duplication this scratch circuit birthed.
function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`book-hedge-position: ${context} must be a non-empty string`);
  return value;
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`book-hedge-position: ${context} must be a plain decimal string`);
  try { parseDecimal(value); } catch { throw new TypeError(`book-hedge-position: ${context} must be a plain decimal string`); }
  return value;
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
function requireDate(value, context) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw new TypeError(`book-hedge-position: ${context} must be a YYYY-MM-DD date string`);
  return value;
}
function negateDecimalString(text) {
  const { negative, whole, frac } = parseDecimal(text);
  const magnitude = BigInt(`${whole}${frac}`);
  if (magnitude === 0n) return formatScaled(0n, frac.length);
  return formatScaled(negative ? magnitude : -magnitude, frac.length);
}
function compareDecimalStrings(a, b) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  const l = BigInt(`${left.whole}${left.frac.padEnd(scale, "0")}`) * (left.negative ? -1n : 1n);
  const r = BigInt(`${right.whole}${right.frac.padEnd(scale, "0")}`) * (right.negative ? -1n : 1n);
  if (l < r) return -1;
  if (l > r) return 1;
  return 0;
}
function toAccountComponent(text) {
  return String(text).trim().split(/[\s-]+/u).filter(Boolean)
    .map((word) => (/^\d/u.test(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)).join("-");
}
function renderMetadata(metadata) {
  return Object.entries(metadata).map(([key, value]) => `  ${key}: "${value}"`).join("\n");
}
function renderPostingLine(posting) {
  const priceSuffix = posting.pricePerUnit !== undefined ? ` {${posting.pricePerUnit} USD}` : "";
  return `  ${posting.account}  ${posting.amount} ${posting.commodity}${priceSuffix}`;
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
 * Books a pre-buy position across the two-book law: the member's book carries the inventory asset in PROPANE_GAL at the forward price against a liability to the pool, and the pool's book carries the matching receivable against its float cash, each transaction carrying the same source witness.
 * @param {{date: string, memberId: string, poolId: string, gallons: string, forwardPrice: string, contractCost: string, narration: string, witness: string}} input
 * @returns {object} The booking set with both rendered transactions and the accounts to open.
 * @throws {TypeError} When a required field is missing or malformed.
 * @throws {RangeError} When contractCost does not exactly equal gallons * forwardPrice.
 */
export function bookHedgePosition({ date, memberId, poolId, gallons, forwardPrice, contractCost, narration, witness }) {
  requireDate(date, "date");
  requireString(memberId, "memberId");
  requireString(poolId, "poolId");
  requireDecimalString(gallons, "gallons");
  requireDecimalString(forwardPrice, "forwardPrice");
  requireDecimalString(contractCost, "contractCost");
  requireString(narration, "narration");
  requireString(witness, "witness");

  const expectedCost = multiplyDecimalStrings(gallons, forwardPrice);
  if (compareDecimalStrings(expectedCost, contractCost) !== 0) {
    throw new RangeError(`book-hedge-position: contractCost ${contractCost} does not equal gallons * forwardPrice (${expectedCost}) -- exact match required`);
  }

  const metadata = { member_id: memberId, pool_id: poolId, witness };
  const inventoryAccount = `Assets:Inventory:Propane:${toAccountComponent(memberId)}`;
  const liabilityAccount = `Liabilities:Pool:${toAccountComponent(poolId)}`;
  const receivableAccount = `Assets:Receivable:Members:${toAccountComponent(memberId)}`;
  const floatAccount = `Assets:Cash:Float:${toAccountComponent(poolId)}`;

  const memberTransaction = renderHedgeTransaction({
    date, narration, metadata,
    postings: [
      { account: inventoryAccount, amount: gallons, commodity: "PROPANE_GAL", pricePerUnit: forwardPrice },
      { account: liabilityAccount, amount: negateDecimalString(contractCost), commodity: "USD" },
    ],
  });
  const poolTransaction = renderHedgeTransaction({
    date, narration, metadata,
    postings: [
      { account: receivableAccount, amount: contractCost, commodity: "USD" },
      { account: floatAccount, amount: negateDecimalString(contractCost), commodity: "USD" },
    ],
  });

  return {
    type: "HedgeBookingSet", version: 1, date, memberId, poolId, gallons, forwardPrice, contractCost, witness,
    memberTransaction: { directive: memberTransaction, accounts: [inventoryAccount, liabilityAccount] },
    poolTransaction: { directive: poolTransaction, accounts: [receivableAccount, floatAccount] },
    accountsToOpen: [inventoryAccount, liabilityAccount, receivableAccount, floatAccount].sort(),
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("bookHedgePosition — Books a pre-buy position across the two-book law: the member's book carries the inventory asset in PROPANE_GAL at the forward price against a liability to the pool, and the pool's book carries the matching receivable against its float cash, each transaction carrying the same source witness.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(bookHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/book-hedge-position.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { bookHedgePosition } from "../scripts/scratch-book-hedge-position-20260905.mjs";

const REQUEST = { date: "2026-09-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool", gallons: "1000", forwardPrice: "1.10", contractCost: "1100.00", narration: "propane pre-buy fill season 2026", witness: "contract:sha256:abc123" };

test("books the two-book law for one pre-buy fill", () => {
  const result = bookHedgePosition(REQUEST);
  assert.equal(result.type, "HedgeBookingSet");
  assert.match(result.memberTransaction.directive, /Assets:Inventory:Propane:Chaske-Sd  1000 PROPANE_GAL \{1.10 USD\}/);
  assert.match(result.poolTransaction.directive, /Assets:Receivable:Members:Chaske-Sd  1100.00 USD/);
});

test("refuses rather than books when contractCost does not exactly equal gallons * forwardPrice", () => {
  assert.throws(() => bookHedgePosition({ ...REQUEST, contractCost: "1100.01" }), /does not equal gallons \* forwardPrice/);
});
```
## Examples
```json name="pre-buy fill booked across the two-book law"
{"input":{"date":"2026-09-05","memberId":"Chaske Sd","poolId":"Tiyospaye Pool","gallons":"1000","forwardPrice":"1.10","contractCost":"1100.00","narration":"propane pre-buy fill season 2026","witness":"contract:sha256:abc123"},"output":{"type":"HedgeBookingSet","version":1,"date":"2026-09-05","memberId":"Chaske Sd","poolId":"Tiyospaye Pool","gallons":"1000","forwardPrice":"1.10","contractCost":"1100.00","witness":"contract:sha256:abc123","memberTransaction":{"directive":"2026-09-05 * \"propane pre-buy fill season 2026\"\n  member_id: \"Chaske Sd\"\n  pool_id: \"Tiyospaye Pool\"\n  witness: \"contract:sha256:abc123\"\n  Assets:Inventory:Propane:Chaske-Sd  1000 PROPANE_GAL {1.10 USD}\n  Liabilities:Pool:Tiyospaye-Pool  -1100 USD","accounts":["Assets:Inventory:Propane:Chaske-Sd","Liabilities:Pool:Tiyospaye-Pool"]},"poolTransaction":{"directive":"2026-09-05 * \"propane pre-buy fill season 2026\"\n  member_id: \"Chaske Sd\"\n  pool_id: \"Tiyospaye Pool\"\n  witness: \"contract:sha256:abc123\"\n  Assets:Receivable:Members:Chaske-Sd  1100.00 USD\n  Assets:Cash:Float:Tiyospaye-Pool  -1100 USD","accounts":["Assets:Receivable:Members:Chaske-Sd","Assets:Cash:Float:Tiyospaye-Pool"]},"accountsToOpen":["Assets:Cash:Float:Tiyospaye-Pool","Assets:Inventory:Propane:Chaske-Sd","Assets:Receivable:Members:Chaske-Sd","Liabilities:Pool:Tiyospaye-Pool"]}}
```
## Traceability
- `two-book-posting` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `two-book-law`, `beancount-double-entry-syntax`
- `shared-witness-metadata` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `two-book-law`
- `refuses-cost-mismatch` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
