import assert from "node:assert/strict";
import test from "node:test";
import { markHedgePosition } from "../src/consumption-hedge.mjs";

const BASE = { date: "2027-03-15", memberId: "Chaske Sd", gallons: "1000", forwardPrice: "1.10" };

test("marks a gain when winter spot lands above the forward price", () => {
  const result = markHedgePosition({
    ...BASE, delivered: true,
    priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "1.45" },
  });
  assert.equal(result.sign, "gain");
  assert.equal(result.markValue, "350");
  assert.equal(result.transaction.directive, [
    '2027-03-15 * "propane hedge delivered"',
    '  member_id: "Chaske Sd"',
    '  spot_price: "1.45"',
    '  forward_price: "1.10"',
    "  Assets:Inventory:Propane:Chaske-Sd  -1000 PROPANE_GAL {1.10 USD}",
    "  Expenses:Heating:Propane  1450 USD",
    "  Income:Hedge:Realized-Gain  -350 USD",
  ].join("\n"));
});

test("marks a loss when winter spot lands below the forward price -- the falsifier's shape", () => {
  const result = markHedgePosition({
    ...BASE, delivered: true,
    priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "0.95" },
  });
  assert.equal(result.sign, "loss");
  assert.equal(result.markValue, "-150");
  assert.equal(result.transaction.directive, [
    '2027-03-15 * "propane hedge delivered"',
    '  member_id: "Chaske Sd"',
    '  spot_price: "0.95"',
    '  forward_price: "1.10"',
    "  Assets:Inventory:Propane:Chaske-Sd  -1000 PROPANE_GAL {1.10 USD}",
    "  Expenses:Heating:Propane  950 USD",
    "  Expenses:Hedge:Realized-Loss  150 USD",
  ].join("\n"));
});

test("an undelivered mark is an interim valuation only -- no transaction is booked", () => {
  const result = markHedgePosition({
    ...BASE, delivered: false,
    priceDirective: { commodity: "PROPANE_GAL", date: "2026-12-01", usdPrice: "1.20" },
  });
  assert.equal(result.sign, "gain");
  assert.equal(result.markValue, "100");
  assert.equal(result.transaction, null);
});

test("a flat mark on delivery books only the two balancing postings, no gain/loss plug", () => {
  const result = markHedgePosition({
    ...BASE, delivered: true,
    priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "1.10" },
  });
  assert.equal(result.sign, "flat");
  assert.equal(result.transaction.accounts.length, 2);
});
