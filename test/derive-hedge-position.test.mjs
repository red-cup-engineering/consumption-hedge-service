import assert from "node:assert/strict";
import test from "node:test";
import { deriveHouseholdBurnSeries, deriveHedgePosition } from "../src/consumption-hedge.mjs";

function heatingMonths(year, values) {
  const months = ["10", "11", "12"].map((m, i) => ({ month: `${year}-${m}`, amount: String(values[i]) }));
  return months.concat(["01", "02", "03"].map((m, i) => ({ month: `${year + 1}-${m}`, amount: String(values[i + 3]) })));
}
const TWO_SEASONS = [
  ...heatingMonths(2024, [150, 180, 220, 240, 210, 170]),
  ...heatingMonths(2025, [160, 190, 230, 250, 220, 180]),
];
const BURN_SERIES = deriveHouseholdBurnSeries({ unit: "PROPANE_GAL", asOf: "2026-09", readings: TWO_SEASONS });
const CONTRACT = {
  pricePerGallon: "1.10", depositAmount: "150.00",
  fillWindow: { opensMonth: "2026-06", closesMonth: "2026-08" },
  cancellationTerms: "forfeits deposit if canceled after the fill window closes",
  deliveryFeeUsd: "35.00",
};
const FLOAT = { annualRate: 0.06, depositOpportunityRate: 0.04 };
const REPAYMENT_MONTHS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
const SLEEVE = { riskCapital: "5000.00", survivalCapital: "20000.00", stage: "pool-held" };

test("sizes a pre-buy position when the seasonal spread clears float cost and the basis is favorable", () => {
  const position = deriveHedgePosition({
    burnSeries: BURN_SERIES, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.10 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(position.admitted, true);
  assert.equal(position.gallons, "3609.9");
  assert.equal(position.forwardPrice, "1.10");
  assert.equal(position.contractCost, "3970.89");
  assert.equal(position.fundingSource, "pool-float");
  assert.equal(position.repaymentSchedule.length, 6);
  const scheduleSum = position.repaymentSchedule.reduce((sum, row) => sum + Number(row.amountDue), 0);
  assert.ok(Math.abs(scheduleSum - Number(position.contractCost)) < 1e-9, "the repayment schedule sums exactly to the contract cost");
  assert.equal(position.sizing.admitted, true);
  assert.equal(position.sizing.regime, "growth");
  assert.equal(position.barrierJoules, BURN_SERIES.barrierJoules);
});

test("withdraws the hedge when the local basis exceeds the declared threshold, per the basis book", () => {
  const position = deriveHedgePosition({
    burnSeries: BURN_SERIES, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.02 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(position.admitted, false);
  assert.match(position.reason, /local basis .* exceeds the declared threshold/);
});

test("withdraws the hedge when the seasonal spread does not clear float and deposit opportunity cost", () => {
  const position = deriveHedgePosition({
    burnSeries: BURN_SERIES, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.10 },
    spot: { winterSpotPriceEstimate: "1.12", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(position.admitted, false);
  assert.match(position.reason, /does not clear the float cost/);
});

test("refuses with a datum naming the missing basis field, never guessing it", () => {
  assert.throws(() => deriveHedgePosition({
    burnSeries: BURN_SERIES, contract: CONTRACT,
    basis: { basisThreshold: 0.10 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  }), /basis\.localBenchmarkSpread must be a finite number/);
});

test("refuses when the burn series itself is not admitted", () => {
  const refused = deriveHedgePosition({
    burnSeries: { admitted: false, reason: "x" }, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.10 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(refused.admitted, false);
  assert.match(refused.reason, /burn series is not admitted/);
});
