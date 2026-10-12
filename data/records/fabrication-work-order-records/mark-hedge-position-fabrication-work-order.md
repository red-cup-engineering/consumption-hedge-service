# mark-hedge-position
## Requirements
- `mark-against-spot`: The operation must compute markValue as gallons times (spot minus forward) from a declared PROPANE_GAL/KWH price-directive-shaped input.
- `book-realized-on-delivery`: When delivered is true, the operation must return a balanced Beancount transaction relieving the inventory at its forward cost basis, recognizing the heating expense at spot value, and plugging the difference to a realized gain or loss account, omitted when the mark is exactly flat.
## Prohibitions
- `no-transaction-when-undelivered`: The operation must return `transaction: null` when delivered is false; an undelivered mark is an interim valuation only, never booked.
## Laws
- `mark-against-spot-law` | Fintech under energy descent, section 3.2 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to the returned markValue and its sign. | The pool books the position as inventory at the forward price and marks it against the winter spot price.
- `pure-data-transformation-law` | The language law (owner-stated 2026-08-30) | v1 | .claude/rules/org-layering.md | Applies to markHedgePosition as data transformation, never I/O. | I/O with a system is written in Node; a decision that is only data transformation performs no I/O of its own.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file eligible for downstream staged package-birth assays.
- `beancount-double-entry-syntax` | Beancount | v3.2 | https://beancount.github.io/docs/beancount_language_syntax.html | Applies to the rendered delivered transaction. | Transactions use Beancount's plain-text double-entry syntax; conformance is verified by bean-check.
## Open questions
none
## Package
```json
{"packageName":"@red-cup-engineering/scratch-mark-hedge-position-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/computer-ledger-system-services-section":"0.4.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-mark-hedge-position-20260905.mjs
#!/usr/bin/env node
import { parseDecimal, formatScaled, addDecimalStrings, multiplyDecimalStrings } from "@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs";

// Scratch-fabrication note: the shipped copy of this operation
// (consumption-hedge-service's scripts/mark-hedge-position.mjs) imports markHedgePosition and
// its account/rendering/decimal helpers from the sibling src/consumption-hedge.mjs instead of
// the inline duplication this scratch circuit birthed.
const CONSUMPTION_UNITS = ["PROPANE_GAL", "KWH"];
function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`mark-hedge-position: ${context} must be a non-empty string`);
  return value;
}
function requireBoolean(value, context) {
  if (typeof value !== "boolean") throw new TypeError(`mark-hedge-position: ${context} must be a boolean, got ${JSON.stringify(value)}`);
  return value;
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`mark-hedge-position: ${context} must be a plain decimal string`);
  try { parseDecimal(value); } catch { throw new TypeError(`mark-hedge-position: ${context} must be a plain decimal string`); }
  return value;
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
function requireDate(value, context) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw new TypeError(`mark-hedge-position: ${context} must be a YYYY-MM-DD date string`);
  return value;
}
function negateDecimalString(text) {
  const { negative, whole, frac } = parseDecimal(text);
  const magnitude = BigInt(`${whole}${frac}`);
  if (magnitude === 0n) return formatScaled(0n, frac.length);
  return formatScaled(negative ? magnitude : -magnitude, frac.length);
}
function subtractDecimalStrings(a, b) {
  return addDecimalStrings([a, negateDecimalString(b)]);
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
 * Marks a booked position against the latest PROPANE_GAL/KWH price directive: markValue = gallons x (spot minus forward). When delivered is true, books the realized gain or loss: the inventory is relieved at its forward cost basis, the heating expense is recognized at the spot value the member would otherwise have paid, and the difference is booked to a realized gain or loss account, omitted when the mark is exactly flat. An undelivered mark is an interim, unbooked valuation only.
 * @param {{date: string, memberId: string, gallons: string, forwardPrice: string, priceDirective: {commodity: "PROPANE_GAL"|"KWH", date: string, usdPrice: string}, delivered: boolean}} input
 * @returns {object} The mark record, with a `transaction` when delivered, else null.
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function markHedgePosition({ date, memberId, gallons, forwardPrice, priceDirective, delivered }) {
  requireDate(date, "date");
  requireDecimalString(gallons, "gallons");
  requireDecimalString(forwardPrice, "forwardPrice");
  if (priceDirective === null || typeof priceDirective !== "object") throw new TypeError("mark-hedge-position: priceDirective must be an object");
  if (!CONSUMPTION_UNITS.includes(priceDirective.commodity)) throw new TypeError(`mark-hedge-position: priceDirective.commodity must be one of ${CONSUMPTION_UNITS.join(", ")}`);
  requireDate(priceDirective.date, "priceDirective.date");
  requireDecimalString(priceDirective.usdPrice, "priceDirective.usdPrice");
  requireBoolean(delivered, "delivered");

  const differencePerUnit = subtractDecimalStrings(priceDirective.usdPrice, forwardPrice);
  const markValue = multiplyDecimalStrings(gallons, differencePerUnit);
  const markCmp = compareDecimalStrings(markValue, "0");
  const sign = markCmp > 0 ? "gain" : markCmp < 0 ? "loss" : "flat";

  let transaction = null;
  if (delivered) {
    requireString(memberId, "memberId");
    const inventoryAccount = `Assets:Inventory:Propane:${toAccountComponent(memberId)}`;
    const heatingExpenseAccount = "Expenses:Heating:Propane";
    const spotValue = multiplyDecimalStrings(gallons, priceDirective.usdPrice);
    const metadata = { member_id: memberId, spot_price: priceDirective.usdPrice, forward_price: forwardPrice };
    const postings = [
      { account: inventoryAccount, amount: negateDecimalString(gallons), commodity: priceDirective.commodity, pricePerUnit: forwardPrice },
      { account: heatingExpenseAccount, amount: spotValue, commodity: "USD" },
    ];
    const accounts = [inventoryAccount, heatingExpenseAccount];
    if (sign !== "flat") {
      const plugAccount = sign === "gain" ? "Income:Hedge:Realized-Gain" : "Expenses:Hedge:Realized-Loss";
      postings.push({ account: plugAccount, amount: negateDecimalString(markValue), commodity: "USD" });
      accounts.push(plugAccount);
    }
    transaction = { directive: renderHedgeTransaction({ date, narration: "propane hedge delivered", metadata, postings }), accounts };
  }

  return { type: "HedgePositionMark", version: 1, gallons, forwardPrice, spotPrice: priceDirective.usdPrice, markValue, sign, delivered, transaction };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("markHedgePosition — Marks a booked position against the latest PROPANE_GAL/KWH price directive: markValue = gallons x (spot minus forward). When delivered is true, books the realized gain or loss: the inventory is relieved at its forward cost basis, the heating expense is recognized at the spot value the member would otherwise have paid, and the difference is booked to a realized gain or loss account, omitted when the mark is exactly flat. An undelivered mark is an interim, unbooked valuation only.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(markHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/mark-hedge-position.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { markHedgePosition } from "../scripts/scratch-mark-hedge-position-20260905.mjs";

const BASE = { date: "2027-03-15", memberId: "Chaske Sd", gallons: "1000", forwardPrice: "1.10" };

test("marks a gain when winter spot lands above the forward price", () => {
  const result = markHedgePosition({ ...BASE, delivered: true, priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "1.45" } });
  assert.equal(result.sign, "gain");
  assert.equal(result.markValue, "350");
});

test("marks a loss when winter spot lands below the forward price -- the falsifier's shape", () => {
  const result = markHedgePosition({ ...BASE, delivered: true, priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "0.95" } });
  assert.equal(result.sign, "loss");
  assert.equal(result.markValue, "-150");
});

test("an undelivered mark books no transaction", () => {
  const result = markHedgePosition({ ...BASE, delivered: false, priceDirective: { commodity: "PROPANE_GAL", date: "2026-12-01", usdPrice: "1.20" } });
  assert.equal(result.transaction, null);
});
```
## Examples
```json name="delivered mark, gain"
{"input":{"date":"2027-03-15","memberId":"Chaske Sd","gallons":"1000","forwardPrice":"1.10","priceDirective":{"commodity":"PROPANE_GAL","date":"2027-03-15","usdPrice":"1.45"},"delivered":true},"output":{"type":"HedgePositionMark","version":1,"gallons":"1000","forwardPrice":"1.10","spotPrice":"1.45","markValue":"350","sign":"gain","delivered":true,"transaction":{"directive":"2027-03-15 * \"propane hedge delivered\"\n  member_id: \"Chaske Sd\"\n  spot_price: \"1.45\"\n  forward_price: \"1.10\"\n  Assets:Inventory:Propane:Chaske-Sd  -1000 PROPANE_GAL {1.10 USD}\n  Expenses:Heating:Propane  1450 USD\n  Income:Hedge:Realized-Gain  -350 USD","accounts":["Assets:Inventory:Propane:Chaske-Sd","Expenses:Heating:Propane","Income:Hedge:Realized-Gain"]}}}
```
## Traceability
- `mark-against-spot` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `mark-against-spot-law`, `node-esm-operation`
- `book-realized-on-delivery` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `beancount-double-entry-syntax`, `mark-against-spot-law`
- `no-transaction-when-undelivered` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
