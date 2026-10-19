# derive-hedge-position
## Requirements
- `hedges-only-when-worthy`: The operation must size a pre-buy position through position-sizing-service only when the seasonal spread (declared winter spot minus the pre-buy forward price) clears the float's cost of capital plus the deposit's opportunity cost, and the local basis against the benchmark is within a declared threshold.
- `repayment-schedule-sums-exact`: The operation must spread the admitted contract cost evenly across the declared repayment months, the last installment absorbing any rounding remainder, so the schedule sums exactly to the contract cost.
## Prohibitions
- `refuses-unworthy-hedge`: The operation must refuse, naming the reason, rather than size a position when the spread does not clear cost or the basis exceeds its threshold. [claims: hedge-worth-is-the-requirement]
- `refuses-unadmitted-burn-series`: The operation must refuse, naming the reason, when given a burn series that is not itself admitted. [claims: an-unadmitted-series-has-no-barrier]
## Laws
- `sleeve-barrier-in-joules` | Fintech under energy descent, section 2 and 3.2 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to the sizing request's sleeve.barrierJoules. | The sleeve's barrier is the household's winter heating energy in joules, not dollars.
- `pure-data-transformation-law` | The language law (owner-stated 2026-08-30) | v1 | .claude/rules/org-layering.md | Applies to deriveHedgePosition as data transformation, never I/O. | I/O with a system is written in Node; a decision that is only data transformation performs no I/O of its own.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file eligible for downstream staged package-birth assays.
## Open questions
none
## Claims
- `dep-position-sizing-service` | measured | dependency | @red-cup-engineering/position-sizing-service@0.2.0 is published on the Group registry | none | data/records/2026-10-19-work-order-evidence/npm-view-red-cup-engineering-position-sizing-service-0-2-0.json | sha256:bdd8f6ad5222a081cd199266ba03a3ece45e2efaaf876ea0a4f77187aca4cfca | npm view of @red-cup-engineering/position-sizing-service@0.2.0 returned its name, version and integrity (2026-10-19)
- `dep-computer-ledger-system-services-section` | measured | dependency | @red-cup-engineering/computer-ledger-system-services-section@0.4.0 is published on the Group registry | none | data/records/2026-10-19-work-order-evidence/npm-view-red-cup-engineering-computer-ledger-system-services-section-0-4-0.json | sha256:abf771c66b796e6f0ad6728555dc1f4bd41bb725fec16be21c10989ef2e7873a | npm view of @red-cup-engineering/computer-ledger-system-services-section@0.4.0 returned its name, version and integrity (2026-10-19)
- `hedge-worth-is-the-requirement` | derived | world | A hedge is sized only when the seasonal spread clears the cost of capital plus the deposit's opportunity cost and the basis is within its threshold | none | requirement:hedges-only-when-worthy | The requirement states the two conditions under which a position is sized, so otherwise there is none to size
- `an-unadmitted-series-has-no-barrier` | derived | world | A burn series that is not admitted carries no joule barrier to hedge against | none | constraint:sleeve-barrier-in-joules | The law denominates the barrier in joules, which only an admitted series provides
## Package
```json
{"packageName":"@red-cup-engineering/scratch-derive-hedge-position-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/computer-ledger-system-services-section":"0.4.0","@red-cup-engineering/position-sizing-service":"0.2.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-derive-hedge-position-20260905.mjs
#!/usr/bin/env node
import { parseDecimal, addDecimalStrings, multiplyDecimalStrings, divideDecimalStrings, formatScaled } from "@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs";
import { sizePosition } from "@red-cup-engineering/position-sizing-service/sleeve";

// Scratch-fabrication note: the shipped copy of this operation
// (consumption-hedge-service's scripts/derive-hedge-position.mjs) imports deriveHedgePosition
// from its own sibling src/consumption-hedge.mjs, which this circuit's algebra matches exactly;
// position-sizing-service is a real published dependency in both, not duplicated.
function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`derive-hedge-position: ${context} must be a non-empty string`);
  return value;
}
function requireFiniteNumber(value, context) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`derive-hedge-position: ${context} must be a finite number, got ${JSON.stringify(value)}`);
  return value;
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`derive-hedge-position: ${context} must be a plain decimal string`);
  try { parseDecimal(value); } catch { throw new TypeError(`derive-hedge-position: ${context} must be a plain decimal string`); }
  return value;
}
const MONTH_PATTERN = /^\d{4}-\d{2}$/u;
function requireMonth(value, context) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) throw new TypeError(`derive-hedge-position: ${context} must be a YYYY-MM month string`);
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

function deriveHedgeDecision({ contract, basis, spot, float, repaymentMonths, averageSeasonTotal }) {
  const forwardPrice = Number(requireDecimalString(contract.pricePerGallon, "contract.pricePerGallon"));
  const winterSpot = Number(requireDecimalString(spot.winterSpotPriceEstimate, "spot.winterSpotPriceEstimate"));
  const depositAmount = Number(requireDecimalString(contract.depositAmount, "contract.depositAmount"));
  const localBenchmarkSpread = requireFiniteNumber(basis.localBenchmarkSpread, "basis.localBenchmarkSpread");
  const basisThreshold = requireFiniteNumber(basis.basisThreshold, "basis.basisThreshold");
  const annualRate = requireFiniteNumber(float.annualRate, "float.annualRate");
  const depositOpportunityRate = requireFiniteNumber(float.depositOpportunityRate, "float.depositOpportunityRate");
  if (!Array.isArray(repaymentMonths) || repaymentMonths.length === 0) throw new TypeError("derive-hedge-position: repaymentMonths must be a non-empty array");
  requireFiniteNumber(averageSeasonTotal, "averageSeasonTotal");
  if (averageSeasonTotal <= 0) throw new RangeError("derive-hedge-position: averageSeasonTotal must be > 0");

  const months = repaymentMonths.length;
  const seasonalSpreadPerUnit = winterSpot - forwardPrice;
  const floatCostPerUnit = annualRate * forwardPrice * (months / 12);
  const depositOpportunityCostPerUnit = (depositAmount * depositOpportunityRate * (months / 12)) / averageSeasonTotal;
  const netEdgePerUnit = seasonalSpreadPerUnit - floatCostPerUnit - depositOpportunityCostPerUnit;
  const basisOk = localBenchmarkSpread <= basisThreshold;

  if (netEdgePerUnit <= 0) {
    return { hedgeWorthy: false, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit, reason: "the seasonal spread does not clear the float cost plus the deposit's opportunity cost -- hedge withdrawn" };
  }
  if (!basisOk) {
    return { hedgeWorthy: false, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit, reason: `local basis ${localBenchmarkSpread} exceeds the declared threshold ${basisThreshold} -- hedge withdrawn` };
  }
  return { hedgeWorthy: true, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit };
}

/**
 * Builds a sleeve-shaped sizing request from a household's burn series and a pre-buy contract's terms and sizes it through position-sizing-service, converting an admitted stake into gallons at the forward price and spreading repayment evenly across the declared heating months.
 * @param {{burnSeries: object, contract: object, basis: object, spot: object, float: object, fundingSource: "pool-float"|"member-cash", sleeve: object, repaymentMonths: readonly string[]}} input
 * @returns {object} The admitted position or a refusal datum naming why nothing was sized.
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function deriveHedgePosition({ burnSeries, contract, basis, spot, float, fundingSource, sleeve, repaymentMonths }) {
  if (!burnSeries || burnSeries.admitted !== true) {
    return { admitted: false, reason: "burn series is not admitted -- at least one prior heating season's burn history is required before a position can be sized" };
  }
  requireDecimalString(contract.pricePerGallon, "contract.pricePerGallon");
  requireDecimalString(contract.depositAmount, "contract.depositAmount");
  requireDecimalString(contract.deliveryFeeUsd, "contract.deliveryFeeUsd");
  requireMonth(contract.fillWindow?.opensMonth, "contract.fillWindow.opensMonth");
  requireMonth(contract.fillWindow?.closesMonth, "contract.fillWindow.closesMonth");
  requireString(contract.cancellationTerms, "contract.cancellationTerms");
  if (fundingSource !== "pool-float" && fundingSource !== "member-cash") throw new TypeError('derive-hedge-position: fundingSource must be "pool-float" or "member-cash"');
  requireDecimalString(sleeve.riskCapital, "sleeve.riskCapital");
  requireDecimalString(sleeve.survivalCapital, "sleeve.survivalCapital");
  requireString(sleeve.stage, "sleeve.stage");

  const decision = deriveHedgeDecision({ contract, basis, spot, float, repaymentMonths, averageSeasonTotal: burnSeries.averageSeasonTotal });
  if (!decision.hedgeWorthy) {
    return { admitted: false, reason: decision.reason, decision };
  }

  const forwardPrice = contract.pricePerGallon;
  const sizingRequest = {
    edge: { drift: decision.netEdgePerUnit / Number(forwardPrice), volatility: requireFiniteNumber(spot.spreadVolatility, "spot.spreadVolatility"), riskFreeRate: 0 },
    sleeve: { riskCapital: sleeve.riskCapital, survivalCapital: sleeve.survivalCapital, barrierJoules: burnSeries.barrierJoules, stage: sleeve.stage },
    liabilityBeyondStake: false,
  };
  const sizing = sizePosition(sizingRequest);
  if (!sizing.admitted) {
    return { admitted: false, reason: `size-position refused: ${sizing.reason}`, sizingRequest, decision };
  }

  const gallons = divideDecimalStrings(sizing.stake, forwardPrice, 1);
  const contractCost = multiplyDecimalStrings(gallons, forwardPrice);

  const monthCount = repaymentMonths.length;
  const baseInstallment = divideDecimalStrings(contractCost, String(monthCount), 2);
  let allocated = "0";
  const repaymentSchedule = repaymentMonths.map((month, index) => {
    const isLast = index === monthCount - 1;
    const amountDue = isLast ? subtractDecimalStrings(contractCost, allocated) : baseInstallment;
    allocated = addDecimalStrings([allocated, amountDue]);
    return { month, amountDue };
  });

  return {
    admitted: true, gallons, forwardPrice, contractCost,
    depositAmount: contract.depositAmount, deliveryFeeUsd: contract.deliveryFeeUsd,
    fundingSource, repaymentSchedule, sizing, decision, barrierJoules: burnSeries.barrierJoules,
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("deriveHedgePosition — Builds a sleeve-shaped sizing request from a household's burn series and a pre-buy contract's terms and sizes it through position-sizing-service, converting an admitted stake into gallons at the forward price and spreading repayment evenly across the declared heating months.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(deriveHedgePosition(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/derive-hedge-position.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { deriveHedgePosition } from "../scripts/scratch-derive-hedge-position-20260905.mjs";

const BURN_SERIES = { admitted: true, unit: "PROPANE_GAL", averageSeasonTotal: 1200, barrierJoules: 115839000000 };
const CONTRACT = { pricePerGallon: "1.10", depositAmount: "150.00", fillWindow: { opensMonth: "2026-06", closesMonth: "2026-08" }, cancellationTerms: "forfeits deposit if canceled after the fill window closes", deliveryFeeUsd: "35.00" };
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
  assert.equal(position.contractCost, "3970.89");
  assert.equal(position.repaymentSchedule.length, 6);
});

test("withdraws the hedge when the local basis exceeds the declared threshold", () => {
  const position = deriveHedgePosition({
    burnSeries: BURN_SERIES, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.02 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(position.admitted, false);
  assert.match(position.reason, /local basis .* exceeds the declared threshold/);
});

test("refuses when the burn series itself is not admitted", () => {
  const refused = deriveHedgePosition({
    burnSeries: { admitted: false }, contract: CONTRACT,
    basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.10 },
    spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
    float: FLOAT, fundingSource: "pool-float", sleeve: SLEEVE, repaymentMonths: REPAYMENT_MONTHS,
  });
  assert.equal(refused.admitted, false);
  assert.match(refused.reason, /burn series is not admitted/);
});
```
## Examples
```json name="admitted position from a favorable spread and basis"
{"input":{"burnSeries":{"admitted":true,"unit":"PROPANE_GAL","averageSeasonTotal":1200,"barrierJoules":115839000000},"contract":{"pricePerGallon":"1.10","depositAmount":"150.00","fillWindow":{"opensMonth":"2026-06","closesMonth":"2026-08"},"cancellationTerms":"forfeits deposit if canceled after the fill window closes","deliveryFeeUsd":"35.00"},"basis":{"localBenchmarkSpread":0.05,"basisThreshold":0.10},"spot":{"winterSpotPriceEstimate":"1.45","spreadVolatility":0.6},"float":{"annualRate":0.06,"depositOpportunityRate":0.04},"fundingSource":"pool-float","sleeve":{"riskCapital":"5000.00","survivalCapital":"20000.00","stage":"pool-held"},"repaymentMonths":["2026-10","2026-11","2026-12","2027-01","2027-02","2027-03"]},"output":{"admitted":true,"gallons":"3609.9","forwardPrice":"1.10","contractCost":"3970.89","depositAmount":"150.00","deliveryFeeUsd":"35.00","fundingSource":"pool-float","repaymentSchedule":[{"month":"2026-10","amountDue":"661.81"},{"month":"2026-11","amountDue":"661.81"},{"month":"2026-12","amountDue":"661.81"},{"month":"2027-01","amountDue":"661.81"},{"month":"2027-02","amountDue":"661.81"},{"month":"2027-03","amountDue":"661.84"}],"sizing":{"admitted":true,"fraction":0.7941919191919187,"stake":"3970.96","regime":"growth","kellyMultipleApplied":1,"goal":null},"decision":{"hedgeWorthy":true,"netEdgePerUnit":0.31449999999999984,"seasonalSpreadPerUnit":0.34999999999999987,"floatCostPerUnit":0.033,"depositOpportunityCostPerUnit":0.0025},"barrierJoules":115839000000}}
```
## Traceability
- `hedges-only-when-worthy` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `sleeve-barrier-in-joules`, `node-esm-operation`
- `repayment-schedule-sums-exact` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
- `refuses-unworthy-hedge` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
- `refuses-unadmitted-burn-series` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
