import assert from "node:assert/strict";
import test from "node:test";
import { bookHedgePosition } from "../src/consumption-hedge.mjs";

const REQUEST = {
  date: "2026-09-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool",
  gallons: "1000", forwardPrice: "1.10", contractCost: "1100.00",
  narration: "propane pre-buy fill season 2026", witness: "contract:sha256:abc123",
};

test("books the two-book law: the member carries inventory and a pool liability, the pool carries the matching receivable", () => {
  const result = bookHedgePosition(REQUEST);
  assert.equal(result.type, "HedgeBookingSet");
  assert.equal(result.memberTransaction.directive, [
    '2026-09-05 * "propane pre-buy fill season 2026"',
    '  member_id: "Chaske Sd"',
    '  pool_id: "Tiyospaye Pool"',
    '  witness: "contract:sha256:abc123"',
    "  Assets:Inventory:Propane:Chaske-Sd  1000 PROPANE_GAL {1.10 USD}",
    "  Liabilities:Pool:Tiyospaye-Pool  -1100 USD",
  ].join("\n"));
  assert.equal(result.poolTransaction.directive, [
    '2026-09-05 * "propane pre-buy fill season 2026"',
    '  member_id: "Chaske Sd"',
    '  pool_id: "Tiyospaye Pool"',
    '  witness: "contract:sha256:abc123"',
    "  Assets:Receivable:Members:Chaske-Sd  1100.00 USD",
    "  Assets:Cash:Float:Tiyospaye-Pool  -1100 USD",
  ].join("\n"));
  assert.deepEqual(result.accountsToOpen, [
    "Assets:Cash:Float:Tiyospaye-Pool",
    "Assets:Inventory:Propane:Chaske-Sd",
    "Assets:Receivable:Members:Chaske-Sd",
    "Liabilities:Pool:Tiyospaye-Pool",
  ]);
});

test("refuses rather than books when contractCost does not exactly equal gallons * forwardPrice", () => {
  assert.throws(() => bookHedgePosition({ ...REQUEST, contractCost: "1100.01" }), /does not equal gallons \* forwardPrice/);
});
