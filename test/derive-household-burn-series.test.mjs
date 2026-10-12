import assert from "node:assert/strict";
import test from "node:test";
import { deriveHouseholdBurnSeries, JOULES_PER_GALLON_PROPANE } from "../src/consumption-hedge.mjs";

function heatingMonths(year, values) {
  const months = ["10", "11", "12"].map((m, i) => ({ month: `${year}-${m}`, amount: String(values[i]) }));
  return months.concat(["01", "02", "03"].map((m, i) => ({ month: `${year + 1}-${m}`, amount: String(values[i + 3]) })));
}

const TWO_SEASONS = [
  ...heatingMonths(2024, [150, 180, 220, 240, 210, 170]), // season 2024-2025, total 1170
  ...heatingMonths(2025, [160, 190, 230, 250, 220, 180]), // season 2025-2026, total 1230
];

test("derives two complete heating seasons and their average burn and joule barrier", () => {
  const result = deriveHouseholdBurnSeries({ unit: "PROPANE_GAL", asOf: "2026-09", readings: TWO_SEASONS });
  assert.equal(result.admitted, true);
  assert.equal(result.seasons.length, 2);
  assert.equal(result.completeSeasonCount, 2);
  assert.equal(result.seasons[0].season, "2024-2025");
  assert.equal(result.seasons[0].total, "1170");
  assert.equal(result.seasons[1].season, "2025-2026");
  assert.equal(result.seasons[1].total, "1230");
  assert.equal(result.averageSeasonTotal, 1200);
  assert.equal(result.barrierJoules, 1200 * JOULES_PER_GALLON_PROPANE);
});

test("refuses when fewer than one prior heating season is given", () => {
  const currentSeasonOnly = heatingMonths(2026, [150, 180, 220, 240, 210, 170]).slice(0, 2); // in-progress, not yet through March
  const result = deriveHouseholdBurnSeries({ unit: "PROPANE_GAL", asOf: "2026-11", readings: currentSeasonOnly });
  assert.equal(result.admitted, false);
  assert.match(result.reason, /fewer than one prior heating season/);
  assert.equal(result.seasons.length, 1);
  assert.equal(result.seasons[0].complete, false);
});

test("refuses a malformed unit", () => {
  assert.throws(() => deriveHouseholdBurnSeries({ unit: "USD", asOf: "2026-09", readings: TWO_SEASONS }), /unit must be one of/);
});
