import assert from "node:assert/strict";
import test from "node:test";
import { settleHedgeRepayment } from "../src/consumption-hedge.mjs";

test("settles one repayment as a matched pair of receipts for the exact same amount", () => {
  const result = settleHedgeRepayment({
    date: "2026-10-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool",
    amount: "183.33", witness: "repay:2026-10", narration: "hedge repayment installment 1 of 6",
  });
  assert.equal(result.type, "HedgeRepaymentSettlement");
  assert.equal(result.memberTransaction.directive, [
    '2026-10-05 * "hedge repayment installment 1 of 6"',
    '  member_id: "Chaske Sd"',
    '  pool_id: "Tiyospaye Pool"',
    '  witness: "repay:2026-10"',
    "  Liabilities:Pool:Tiyospaye-Pool  183.33 USD",
    "  Assets:Cash:Operating  -183.33 USD",
  ].join("\n"));
  assert.equal(result.poolTransaction.directive, [
    '2026-10-05 * "hedge repayment installment 1 of 6"',
    '  member_id: "Chaske Sd"',
    '  pool_id: "Tiyospaye Pool"',
    '  witness: "repay:2026-10"',
    "  Assets:Cash:Float:Tiyospaye-Pool  183.33 USD",
    "  Assets:Receivable:Members:Chaske-Sd  -183.33 USD",
  ].join("\n"));
});
