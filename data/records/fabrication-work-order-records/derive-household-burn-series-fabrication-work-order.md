# derive-household-burn-series
## Requirements
- `heating-season-grouping`: The operation must group monthly readings into heating seasons running July of a start year through June of the next, labeled `"<startYear>-<endYear>"`, where endYear is the year after startYear.
- `admits-one-complete-season`: The operation must return an admitted burn series (average season total and a joule barrier) when at least one heating season ending at or before `input.asOf` is present.
## Prohibitions
- `refuses-fewer-than-one-season`: The operation must refuse, returning a refusal datum naming the cutoff date rather than fabricating a barrier, when no season in the input is complete (ends at or before `input.asOf`). [claims: no-complete-season-no-barrier]
## Laws
- `barrier-in-joules` | Fintech under energy descent, section 2 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to the returned `barrierJoules`. | The barrier is denominated in joules (gallons x 91,500 BTU x 1055 J/BTU), invariant under a currency regime change.
- `pure-data-transformation-law` | The language law (owner-stated 2026-08-30) | v1 | .claude/rules/org-layering.md | Applies to deriveHouseholdBurnSeries as data transformation, never I/O. | I/O with a system is written in Node; a decision that is only data transformation performs no I/O of its own.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file eligible for downstream staged package-birth assays.
## Open questions
none
## Claims
- `dep-computer-ledger-system-services-section` | measured | dependency | @red-cup-engineering/computer-ledger-system-services-section@0.4.0 is published on the Group registry | none | data/records/2026-10-19-work-order-evidence/npm-view-red-cup-engineering-computer-ledger-system-services-section-0-4-0.json | sha256:abf771c66b796e6f0ad6728555dc1f4bd41bb725fec16be21c10989ef2e7873a | npm view of @red-cup-engineering/computer-ledger-system-services-section@0.4.0 returned its name, version and integrity (2026-10-19)
- `no-complete-season-no-barrier` | derived | world | Without a complete heating season there is no average season total to derive a barrier from | none | requirement:admits-one-complete-season | The requirement admits a series only when at least one season ends at or before the as-of date, and the barrier is the joule form of the average season total
## Package
```json
{"packageName":"@red-cup-engineering/scratch-derive-household-burn-series-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/computer-ledger-system-services-section":"0.4.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-derive-household-burn-series-20260905.mjs
#!/usr/bin/env node
import { parseDecimal, addDecimalStrings } from "@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs";

// Scratch-fabrication note: this circuit's birthed package shape has no src/ directory to
// import a sibling module from, so the joule-conversion and season-grouping helpers are
// duplicated here for this standalone fabrication run only. The shipped copy of this operation
// (consumption-hedge-service's scripts/derive-household-burn-series.mjs) instead imports these
// same functions from its own sibling src/consumption-hedge.mjs -- see that package's
// data/records/ for the receipt naming this friction.
const BTU_PER_GALLON_PROPANE = 91500;
const JOULES_PER_BTU = 1055;
const JOULES_PER_GALLON_PROPANE = BTU_PER_GALLON_PROPANE * JOULES_PER_BTU;
const JOULES_PER_KWH = 3.6e6;
const CONSUMPTION_UNITS = ["PROPANE_GAL", "KWH"];

function barrierJoulesForUnit(amount, unit) {
  if (unit === "PROPANE_GAL") return Number(amount) * JOULES_PER_GALLON_PROPANE;
  if (unit === "KWH") return Number(amount) * JOULES_PER_KWH;
  throw new TypeError(`derive-household-burn-series: unit must be one of ${CONSUMPTION_UNITS.join(", ")}, got ${JSON.stringify(unit)}`);
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`derive-household-burn-series: ${context} must be a plain decimal string`);
  try { parseDecimal(value); } catch { throw new TypeError(`derive-household-burn-series: ${context} must be a plain decimal string`); }
  return value;
}
const MONTH_PATTERN = /^\d{4}-\d{2}$/u;
function requireMonth(value, context) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) throw new TypeError(`derive-household-burn-series: ${context} must be a YYYY-MM month string`);
  return value;
}
function seasonForMonth(monthKey) {
  requireMonth(monthKey, "monthKey");
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}
function seasonEndMonth(season) {
  const [, endYear] = season.split("-");
  return `${endYear}-03`;
}

/**
 * Derives a household's heating-season burn series from declared monthly bills or gallons, grouped into heating seasons (July-June), refusing rather than projecting a barrier when fewer than one prior heating season (one ending at or before asOf) is given.
 * @param {{unit: "PROPANE_GAL"|"KWH", asOf: string, readings: readonly {month: string, amount: string}[]}} input
 * @returns {{admitted: true, unit: string, seasons: object[], completeSeasonCount: number, averageSeasonTotal: number, barrierJoules: number}|{admitted: false, reason: string, unit: string, seasons: object[]}}
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function deriveHouseholdBurnSeries({ unit, asOf, readings }) {
  if (!CONSUMPTION_UNITS.includes(unit)) throw new TypeError(`derive-household-burn-series: unit must be one of ${CONSUMPTION_UNITS.join(", ")}, got ${JSON.stringify(unit)}`);
  requireMonth(asOf, "asOf");
  if (!Array.isArray(readings) || readings.length === 0) throw new TypeError("derive-household-burn-series: readings must be a non-empty array");

  const bySeason = new Map();
  readings.forEach((reading, index) => {
    if (reading === null || typeof reading !== "object") throw new TypeError(`derive-household-burn-series: readings[${index}] must be an object`);
    const month = requireMonth(reading.month, `readings[${index}].month`);
    const amount = requireDecimalString(reading.amount, `readings[${index}].amount`);
    const season = seasonForMonth(month);
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season).push({ month, amount });
  });

  const seasons = [...bySeason.entries()]
    .map(([season, months]) => {
      const sortedMonths = [...months].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
      const total = addDecimalStrings(sortedMonths.map((m) => m.amount));
      const complete = seasonEndMonth(season) <= asOf;
      return { season, months: sortedMonths, monthCount: sortedMonths.length, total, complete };
    })
    .sort((a, b) => (a.season < b.season ? -1 : a.season > b.season ? 1 : 0));

  const completeSeasons = seasons.filter((row) => row.complete);
  if (completeSeasons.length < 1) {
    return {
      admitted: false,
      reason: `fewer than one prior heating season is given -- at least one season ending at or before ${asOf} is required to derive a burn series`,
      unit, seasons,
    };
  }

  const averageSeasonTotal = completeSeasons.reduce((sum, row) => sum + Number(row.total), 0) / completeSeasons.length;
  const barrierJoules = barrierJoulesForUnit(averageSeasonTotal, unit);

  return { admitted: true, unit, seasons, completeSeasonCount: completeSeasons.length, averageSeasonTotal, barrierJoules };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("deriveHouseholdBurnSeries — Derives a household's heating-season burn series from declared monthly bills or gallons, grouped into heating seasons (July-June), refusing rather than projecting a barrier when fewer than one prior heating season (one ending at or before asOf) is given.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) process.stdout.write(`${JSON.stringify(deriveHouseholdBurnSeries(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/derive-household-burn-series.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { deriveHouseholdBurnSeries } from "../scripts/scratch-derive-household-burn-series-20260905.mjs";

function heatingMonths(year, values) {
  const months = ["10", "11", "12"].map((m, i) => ({ month: `${year}-${m}`, amount: String(values[i]) }));
  return months.concat(["01", "02", "03"].map((m, i) => ({ month: `${year + 1}-${m}`, amount: String(values[i + 3]) })));
}

test("derives two complete heating seasons and their average burn and joule barrier", () => {
  const readings = [...heatingMonths(2024, [150, 180, 220, 240, 210, 170]), ...heatingMonths(2025, [160, 190, 230, 250, 220, 180])];
  const result = deriveHouseholdBurnSeries({ unit: "PROPANE_GAL", asOf: "2026-09", readings });
  assert.equal(result.admitted, true);
  assert.equal(result.completeSeasonCount, 2);
  assert.equal(result.averageSeasonTotal, 1200);
  assert.equal(result.barrierJoules, 1200 * 91500 * 1055);
});

test("refuses when fewer than one prior heating season is given", () => {
  const readings = heatingMonths(2026, [150, 180, 220, 240, 210, 170]).slice(0, 2);
  const result = deriveHouseholdBurnSeries({ unit: "PROPANE_GAL", asOf: "2026-11", readings });
  assert.equal(result.admitted, false);
  assert.match(result.reason, /fewer than one prior heating season/);
});
```
## Examples
```json name="two complete seasons, admitted"
{"input":{"unit":"PROPANE_GAL","asOf":"2026-09","readings":[{"month":"2024-10","amount":"150"},{"month":"2024-11","amount":"180"},{"month":"2024-12","amount":"220"},{"month":"2025-01","amount":"240"},{"month":"2025-02","amount":"210"},{"month":"2025-03","amount":"170"},{"month":"2025-10","amount":"160"},{"month":"2025-11","amount":"190"},{"month":"2025-12","amount":"230"},{"month":"2026-01","amount":"250"},{"month":"2026-02","amount":"220"},{"month":"2026-03","amount":"180"}]},"output":{"admitted":true,"unit":"PROPANE_GAL","seasons":[{"season":"2024-2025","months":[{"month":"2024-10","amount":"150"},{"month":"2024-11","amount":"180"},{"month":"2024-12","amount":"220"},{"month":"2025-01","amount":"240"},{"month":"2025-02","amount":"210"},{"month":"2025-03","amount":"170"}],"monthCount":6,"total":"1170","complete":true},{"season":"2025-2026","months":[{"month":"2025-10","amount":"160"},{"month":"2025-11","amount":"190"},{"month":"2025-12","amount":"230"},{"month":"2026-01","amount":"250"},{"month":"2026-02","amount":"220"},{"month":"2026-03","amount":"180"}],"monthCount":6,"total":"1230","complete":true}],"completeSeasonCount":2,"averageSeasonTotal":1200,"barrierJoules":115839000000}}
```
## Traceability
- `heating-season-grouping` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`, `node-esm-operation`
- `admits-one-complete-season` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `barrier-in-joules`, `node-esm-operation`
- `refuses-fewer-than-one-season` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `pure-data-transformation-law`
