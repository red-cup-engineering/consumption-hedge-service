/**
 * `consumption-hedge` — the pool forward-buys what the household burns, booked as inventory at
 * the forward price and marked against winter spot (fintech-under-energy-descent note, section
 * 3.2; barrier-in-joules law, section 2; basis book, section 3.3; sleeve-as-arena, sizing-
 * without-a-bank note, sections 3 and 5). Money and measured consumption cross as exact decimal
 * strings; derived statistics are floats, matching `position-sizing-service`'s own discipline.
 */
import {
  parseDecimal,
  formatScaled,
  addDecimalStrings,
  multiplyDecimalStrings,
  divideDecimalStrings,
} from "./decimal.mjs";
import { sizePosition } from "@red-cup-engineering/position-sizing-service/sleeve";
import { toAccountComponent } from "@red-cup-engineering/pool-service";

// ── the barrier is denominated in joules (fintech note, section 2) ─────────────────────────

/** BTU per gallon of propane (US DOE / EIA heat-content convention). */
export const BTU_PER_GALLON_PROPANE = 91500;
/** Joules per BTU (International Table BTU). */
export const JOULES_PER_BTU = 1055;
/** Joules per gallon of propane: `BTU_PER_GALLON_PROPANE * JOULES_PER_BTU`. */
export const JOULES_PER_GALLON_PROPANE = BTU_PER_GALLON_PROPANE * JOULES_PER_BTU;
/** Joules per kilowatt-hour. */
export const JOULES_PER_KWH = 3.6e6;

/** The two commodities this sleeve prices consumption in. */
export const CONSUMPTION_UNITS = Object.freeze(["PROPANE_GAL", "KWH"]);

/**
 * Joules of heating energy in a quantity of a unit, at a declared joules-per-unit rate.
 * @param {number} amount
 * @param {number} joulesPerUnit
 * @returns {number}
 */
function joulesForAmount(amount, joulesPerUnit) {
  return Number(amount) * joulesPerUnit;
}

/**
 * Joules of heating energy in a quantity of propane.
 * @param {number} gallons
 * @returns {number}
 */
export function joulesForGallonsPropane(gallons) {
  return joulesForAmount(gallons, JOULES_PER_GALLON_PROPANE);
}

/**
 * Joules of heating energy in a quantity of electricity.
 * @param {number} kwh
 * @returns {number}
 */
export function joulesForKwh(kwh) {
  return joulesForAmount(kwh, JOULES_PER_KWH);
}

/**
 * Joules of heating energy for a quantity in a declared consumption unit.
 * @param {number} amount
 * @param {"PROPANE_GAL"|"KWH"} unit
 * @returns {number}
 * @throws {TypeError} When `unit` is not one of `CONSUMPTION_UNITS`.
 */
export function barrierJoulesForUnit(amount, unit) {
  if (unit === "PROPANE_GAL") return joulesForGallonsPropane(amount);
  if (unit === "KWH") return joulesForKwh(amount);
  throw new TypeError(`consumption-hedge: unit must be one of ${CONSUMPTION_UNITS.join(", ")}, got ${JSON.stringify(unit)}`);
}

// ── decimal helpers (a script's own small helpers, matching the ledger section's convention) ──

/**
 * The exact negation of a plain decimal string, via `parseDecimal`/`formatScaled` so the sign
 * flip never touches a floating-point number.
 * @param {string} text
 * @returns {string}
 */
export function negateDecimalString(text) {
  const { negative, whole, frac } = parseDecimal(text);
  const magnitude = BigInt(`${whole}${frac}`);
  if (magnitude === 0n) return formatScaled(0n, frac.length);
  return formatScaled(negative ? magnitude : -magnitude, frac.length);
}

/**
 * Exact `a - b` for plain decimal strings.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function subtractDecimalStrings(a, b) {
  return addDecimalStrings([a, negateDecimalString(b)]);
}

/**
 * Exact three-way comparison of two plain decimal strings, never via float.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareDecimalStrings(a, b) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  const l = BigInt(`${left.whole}${left.frac.padEnd(scale, "0")}`) * (left.negative ? -1n : 1n);
  const r = BigInt(`${right.whole}${right.frac.padEnd(scale, "0")}`) * (right.negative ? -1n : 1n);
  if (l < r) return -1;
  if (l > r) return 1;
  return 0;
}

// ── field validation ─────────────────────────────────────────────────────────────────────

function requireString(value, context) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`consumption-hedge: ${context} must be a non-empty string`);
  return value;
}
function requireBoolean(value, context) {
  if (typeof value !== "boolean") throw new TypeError(`consumption-hedge: ${context} must be a boolean, got ${JSON.stringify(value)}`);
  return value;
}
function requireFiniteNumber(value, context) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`consumption-hedge: ${context} must be a finite number, got ${JSON.stringify(value)}`);
  return value;
}
function requireDecimalString(value, context) {
  if (typeof value !== "string") throw new TypeError(`consumption-hedge: ${context} must be a plain decimal string`);
  try {
    parseDecimal(value);
  } catch {
    throw new TypeError(`consumption-hedge: ${context} must be a plain decimal string`);
  }
  return value;
}

/**
 * Requires `value` to match a declared date-shaped pattern.
 * @param {*} value
 * @param {string} context
 * @param {RegExp} pattern
 * @param {string} label Human-readable shape name for the thrown message.
 * @returns {string}
 */
function requireDatePattern(value, context, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`consumption-hedge: ${context} must be a ${label} string`);
  return value;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/u;
function requireMonth(value, context) {
  return requireDatePattern(value, context, MONTH_PATTERN, "YYYY-MM month");
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
function requireDate(value, context) {
  return requireDatePattern(value, context, DATE_PATTERN, "YYYY-MM-DD date");
}

// ── heating-season grouping: July of one year through June of the next ─────────────────────

/**
 * The heating-season label ("2026-2027") a `YYYY-MM` month belongs to. A season runs July of
 * its start year through June of the next, so the summer fill months and the winter heating
 * months of one heating cycle share one label.
 * @param {string} monthKey
 * @returns {string}
 */
export function seasonForMonth(monthKey) {
  requireMonth(monthKey, "monthKey");
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * The last heating month (`YYYY-03`, March of the season's second year) of a season label, the
 * point at or after which the season is counted complete.
 * @param {string} season
 * @returns {string}
 */
export function seasonEndMonth(season) {
  const [, endYear] = season.split("-");
  return `${endYear}-03`;
}

// ── the household burn record ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BurnSeasonRow
 * @property {string} season
 * @property {readonly {month: string, amount: string}[]} months
 * @property {number} monthCount
 * @property {string} total
 * @property {boolean} complete
 * @typedef {Object} AdmittedBurnSeries
 * @property {true} admitted
 * @property {"PROPANE_GAL"|"KWH"} unit
 * @property {readonly BurnSeasonRow[]} seasons
 * @property {number} completeSeasonCount
 * @property {number} averageSeasonTotal
 * @property {number} barrierJoules
 * @typedef {Object} RefusedBurnSeries
 * @property {false} admitted
 * @property {string} reason
 * @property {"PROPANE_GAL"|"KWH"} unit
 * @property {readonly BurnSeasonRow[]} seasons
 */

/**
 * Derives a household's heating-season burn series from declared monthly bills or gallons,
 * grouped into heating seasons (July–June), refusing rather than projecting a barrier when
 * fewer than one prior heating season (one ending at or before `asOf`) is given.
 * @param {{unit: "PROPANE_GAL"|"KWH", asOf: string, readings: readonly {month: string, amount: string}[]}} input
 * @returns {AdmittedBurnSeries|RefusedBurnSeries}
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function deriveHouseholdBurnSeries({ unit, asOf, readings }) {
  if (!CONSUMPTION_UNITS.includes(unit)) throw new TypeError(`consumption-hedge: unit must be one of ${CONSUMPTION_UNITS.join(", ")}, got ${JSON.stringify(unit)}`);
  requireMonth(asOf, "asOf");
  if (!Array.isArray(readings) || readings.length === 0) throw new TypeError("consumption-hedge: readings must be a non-empty array");

  const bySeason = new Map();
  readings.forEach((reading, index) => {
    if (reading === null || typeof reading !== "object") throw new TypeError(`consumption-hedge: readings[${index}] must be an object`);
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
      return Object.freeze({ season, months: Object.freeze(sortedMonths), monthCount: sortedMonths.length, total, complete });
    })
    .sort((a, b) => (a.season < b.season ? -1 : a.season > b.season ? 1 : 0));

  const completeSeasons = seasons.filter((row) => row.complete);
  if (completeSeasons.length < 1) {
    return Object.freeze({
      admitted: false,
      reason: `fewer than one prior heating season is given -- at least one season ending at or before ${asOf} is required to derive a burn series`,
      unit,
      seasons,
    });
  }

  const averageSeasonTotal = completeSeasons.reduce((sum, row) => sum + Number(row.total), 0) / completeSeasons.length;
  const barrierJoules = barrierJoulesForUnit(averageSeasonTotal, unit);

  return Object.freeze({
    admitted: true,
    unit,
    seasons,
    completeSeasonCount: completeSeasons.length,
    averageSeasonTotal,
    barrierJoules,
  });
}

// ── the hedge decision rule (fintech note, sections 3.2 and 3.3) ───────────────────────────

/**
 * @typedef {Object} HedgeDecision
 * @property {boolean} hedgeWorthy
 * @property {number} netEdgePerUnit
 * @property {number} seasonalSpreadPerUnit
 * @property {number} floatCostPerUnit
 * @property {number} depositOpportunityCostPerUnit
 * @property {string} [reason]
 */

/**
 * Whether the local basis against the benchmark and the seasonal spread clear the float cost
 * plus the deposit's opportunity cost — the fintech note's hedge decision rule (section 3.2,
 * read with the basis book of section 3.3). Every input is declared; nothing is estimated
 * internally.
 * @param {{contract: {pricePerGallon: string, depositAmount: string},
 *   basis: {localBenchmarkSpread: number, basisThreshold: number},
 *   spot: {winterSpotPriceEstimate: string}, float: {annualRate: number, depositOpportunityRate: number},
 *   repaymentMonths: readonly string[], averageSeasonTotal: number}} input
 * @returns {HedgeDecision}
 */
export function deriveHedgeDecision({ contract, basis, spot, float, repaymentMonths, averageSeasonTotal }) {
  const forwardPrice = Number(requireDecimalString(contract.pricePerGallon, "contract.pricePerGallon"));
  const winterSpot = Number(requireDecimalString(spot.winterSpotPriceEstimate, "spot.winterSpotPriceEstimate"));
  const depositAmount = Number(requireDecimalString(contract.depositAmount, "contract.depositAmount"));
  const localBenchmarkSpread = requireFiniteNumber(basis.localBenchmarkSpread, "basis.localBenchmarkSpread");
  const basisThreshold = requireFiniteNumber(basis.basisThreshold, "basis.basisThreshold");
  const annualRate = requireFiniteNumber(float.annualRate, "float.annualRate");
  const depositOpportunityRate = requireFiniteNumber(float.depositOpportunityRate, "float.depositOpportunityRate");
  if (!Array.isArray(repaymentMonths) || repaymentMonths.length === 0) throw new TypeError("consumption-hedge: repaymentMonths must be a non-empty array");
  requireFiniteNumber(averageSeasonTotal, "averageSeasonTotal");
  if (averageSeasonTotal <= 0) throw new RangeError("consumption-hedge: averageSeasonTotal must be > 0");

  const months = repaymentMonths.length;
  const seasonalSpreadPerUnit = winterSpot - forwardPrice;
  const floatCostPerUnit = annualRate * forwardPrice * (months / 12);
  const depositOpportunityCostPerUnit = (depositAmount * depositOpportunityRate * (months / 12)) / averageSeasonTotal;
  const netEdgePerUnit = seasonalSpreadPerUnit - floatCostPerUnit - depositOpportunityCostPerUnit;
  const basisOk = localBenchmarkSpread <= basisThreshold;

  if (netEdgePerUnit <= 0) {
    return {
      hedgeWorthy: false, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit,
      reason: "the seasonal spread does not clear the float cost plus the deposit's opportunity cost -- hedge withdrawn",
    };
  }
  if (!basisOk) {
    return {
      hedgeWorthy: false, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit,
      reason: `local basis ${localBenchmarkSpread} exceeds the declared threshold ${basisThreshold} -- hedge withdrawn`,
    };
  }
  return { hedgeWorthy: true, netEdgePerUnit, seasonalSpreadPerUnit, floatCostPerUnit, depositOpportunityCostPerUnit };
}

// ── the position: a sleeve-shaped sizing request to size-position ──────────────────────────

/**
 * @typedef {Object} AdmittedHedgePosition
 * @property {true} admitted
 * @property {string} gallons
 * @property {string} forwardPrice
 * @property {string} contractCost
 * @property {string} depositAmount
 * @property {string} deliveryFeeUsd
 * @property {"pool-float"|"member-cash"} fundingSource
 * @property {readonly {month: string, amountDue: string}[]} repaymentSchedule
 * @property {object} sizing
 * @property {HedgeDecision} decision
 * @property {number} barrierJoules
 * @typedef {Object} RefusedHedgePosition
 * @property {false} admitted
 * @property {string} reason
 * @property {HedgeDecision} [decision]
 * @property {object} [sizingRequest]
 */

/**
 * Builds a sleeve-shaped sizing request from a household's burn series and a pre-buy contract's
 * terms and sizes it through `position-sizing-service`, converting an admitted stake into
 * gallons at the forward price and spreading repayment evenly across the declared heating
 * months (the last installment absorbing any rounding remainder). Refuses, naming which input
 * is unknown or unfavorable, rather than sizing on a missing or unworthy basis.
 * @param {{burnSeries: AdmittedBurnSeries, contract: {pricePerGallon: string, depositAmount: string,
 *   fillWindow: {opensMonth: string, closesMonth: string}, cancellationTerms: string, deliveryFeeUsd: string},
 *   basis: {localBenchmarkSpread: number, basisThreshold: number},
 *   spot: {winterSpotPriceEstimate: string, spreadVolatility: number},
 *   float: {annualRate: number, depositOpportunityRate: number},
 *   fundingSource: "pool-float"|"member-cash",
 *   sleeve: {riskCapital: string, survivalCapital: string, stage: string},
 *   repaymentMonths: readonly string[]}} input
 * @returns {AdmittedHedgePosition|RefusedHedgePosition}
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
  if (fundingSource !== "pool-float" && fundingSource !== "member-cash") throw new TypeError('consumption-hedge: fundingSource must be "pool-float" or "member-cash"');
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

  return Object.freeze({
    admitted: true,
    gallons,
    forwardPrice,
    contractCost,
    depositAmount: contract.depositAmount,
    deliveryFeeUsd: contract.deliveryFeeUsd,
    fundingSource,
    repaymentSchedule: Object.freeze(repaymentSchedule),
    sizing,
    decision,
    barrierJoules: burnSeries.barrierJoules,
  });
}

// ── Beancount rendering: accounts and transactions (two-book law) ──────────────────────────

/** One Beancount account path from a prefix and a `toAccountComponent`-derived id segment. */
function beancountAccount(prefix, id) {
  return `${prefix}:${toAccountComponent(id)}`;
}

/** The member's inventory account for pre-bought propane. @param {string} memberId @returns {string} */
export function memberInventoryAccount(memberId) {
  return beancountAccount("Assets:Inventory:Propane", memberId);
}
/** The member's liability account to a pool for a hedge draw. @param {string} poolId @returns {string} */
export function memberPoolLiabilityAccount(poolId) {
  return beancountAccount("Liabilities:Pool", poolId);
}
/** The pool's receivable account for a member's hedge draw. @param {string} memberId @returns {string} */
export function poolReceivableAccount(memberId) {
  return beancountAccount("Assets:Receivable:Members", memberId);
}
/** The pool's float cash account. @param {string} poolId @returns {string} */
export function poolFloatAccount(poolId) {
  return beancountAccount("Assets:Cash:Float", poolId);
}
/** The member's operating cash account. @returns {string} */
export function memberCashAccount() {
  return "Assets:Cash:Operating";
}

function renderMetadata(metadata) {
  return Object.entries(metadata)
    .map(([key, value]) => `  ${key}: "${value}"`)
    .join("\n");
}
function renderPostingLine(posting) {
  const priceSuffix = posting.pricePerUnit !== undefined ? ` {${posting.pricePerUnit} USD}` : "";
  return `  ${posting.account}  ${posting.amount} ${posting.commodity}${priceSuffix}`;
}

/**
 * Renders one Beancount transaction from a narration, string metadata, and a list of postings.
 * @param {{date: string, narration: string, metadata: Record<string,string>, postings: readonly {account: string, amount: string, commodity: string, pricePerUnit?: string}[]}} input
 * @returns {string}
 * @throws {TypeError} When `date` is not `YYYY-MM-DD`.
 */
export function renderHedgeTransaction({ date, narration, metadata, postings }) {
  requireDate(date, "date");
  const lines = [`${date} * "${narration}"`];
  const renderedMetadata = renderMetadata(metadata);
  if (renderedMetadata !== "") lines.push(renderedMetadata);
  for (const posting of postings) lines.push(renderPostingLine(posting));
  return lines.join("\n");
}

/**
 * @typedef {Object} HedgeBookingSet
 * @property {"HedgeBookingSet"} type
 * @property {1} version
 * @property {string} date
 * @property {string} memberId
 * @property {string} poolId
 * @property {string} gallons
 * @property {string} forwardPrice
 * @property {string} contractCost
 * @property {string} witness
 * @property {{directive: string, accounts: string[]}} memberTransaction
 * @property {{directive: string, accounts: string[]}} poolTransaction
 * @property {readonly string[]} accountsToOpen
 */

/**
 * Books a pre-buy position across the two-book law: the member's book carries the inventory
 * asset in `PROPANE_GAL` at the forward price against a liability to the pool, and the pool's
 * book carries the matching receivable against its float cash, each transaction carrying the
 * same source witness.
 * @param {{date: string, memberId: string, poolId: string, gallons: string, forwardPrice: string,
 *   contractCost: string, narration: string, witness: string}} input
 * @returns {HedgeBookingSet}
 * @throws {TypeError} When a required field is missing or malformed.
 * @throws {RangeError} When `contractCost` does not exactly equal `gallons * forwardPrice`.
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
    throw new RangeError(`consumption-hedge: contractCost ${contractCost} does not equal gallons * forwardPrice (${expectedCost}) -- exact match required`);
  }

  const metadata = { member_id: memberId, pool_id: poolId, witness };
  const inventoryAccount = memberInventoryAccount(memberId);
  const liabilityAccount = memberPoolLiabilityAccount(poolId);
  const receivableAccount = poolReceivableAccount(memberId);
  const floatAccount = poolFloatAccount(poolId);

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

  return Object.freeze({
    type: "HedgeBookingSet", version: 1, date, memberId, poolId, gallons, forwardPrice, contractCost, witness,
    memberTransaction: Object.freeze({ directive: memberTransaction, accounts: [inventoryAccount, liabilityAccount] }),
    poolTransaction: Object.freeze({ directive: poolTransaction, accounts: [receivableAccount, floatAccount] }),
    accountsToOpen: Object.freeze([inventoryAccount, liabilityAccount, receivableAccount, floatAccount].sort()),
  });
}

// ── the mark: position × (spot − forward) ───────────────────────────────────────────────────

/**
 * @typedef {Object} HedgePositionMark
 * @property {"HedgePositionMark"} type
 * @property {1} version
 * @property {string} gallons
 * @property {string} forwardPrice
 * @property {string} spotPrice
 * @property {string} markValue
 * @property {"gain"|"loss"|"flat"} sign
 * @property {boolean} delivered
 * @property {{directive: string, accounts: string[]}|null} transaction
 */

/**
 * Marks a booked position against the latest `PROPANE_GAL`/`KWH` price directive:
 * `markValue = gallons × (spot − forward)`. When `delivered` is true, books the realized
 * gain or loss: the inventory is relieved at its forward cost basis, the heating expense is
 * recognized at the spot value the member would otherwise have paid, and the difference is
 * booked to `Income:Hedge:Realized-Gain` or `Expenses:Hedge:Realized-Loss` (omitted when the
 * mark is exactly flat, matching the house's redemption-postings convention). An undelivered
 * mark is an interim, unbooked valuation only.
 * @param {{date: string, memberId: string, gallons: string, forwardPrice: string,
 *   priceDirective: {commodity: "PROPANE_GAL"|"KWH", date: string, usdPrice: string}, delivered: boolean}} input
 * @returns {HedgePositionMark}
 * @throws {TypeError} When a required field is missing or malformed.
 */
export function markHedgePosition({ date, memberId, gallons, forwardPrice, priceDirective, delivered }) {
  requireDate(date, "date");
  requireDecimalString(gallons, "gallons");
  requireDecimalString(forwardPrice, "forwardPrice");
  if (priceDirective === null || typeof priceDirective !== "object") throw new TypeError("consumption-hedge: priceDirective must be an object");
  if (!CONSUMPTION_UNITS.includes(priceDirective.commodity)) throw new TypeError(`consumption-hedge: priceDirective.commodity must be one of ${CONSUMPTION_UNITS.join(", ")}`);
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
    const inventoryAccount = memberInventoryAccount(memberId);
    const heatingExpenseAccount = "Expenses:Heating:Propane";
    const contractCost = multiplyDecimalStrings(gallons, forwardPrice);
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
    transaction = Object.freeze({
      directive: renderHedgeTransaction({ date, narration: "propane hedge delivered", metadata, postings }),
      accounts,
      contractCost, spotValue,
    });
  }

  return Object.freeze({
    type: "HedgePositionMark", version: 1,
    gallons, forwardPrice, spotPrice: priceDirective.usdPrice, markValue, sign, delivered,
    transaction,
  });
}

// ── settlement: one repayment as a matched pair of receipts ────────────────────────────────

/**
 * @typedef {Object} HedgeRepaymentSettlement
 * @property {"HedgeRepaymentSettlement"} type
 * @property {1} version
 * @property {string} date
 * @property {string} memberId
 * @property {string} poolId
 * @property {string} amount
 * @property {string} witness
 * @property {{directive: string, accounts: string[]}} memberTransaction
 * @property {{directive: string, accounts: string[]}} poolTransaction
 */

/**
 * One tally-credit repayment installment as a matched pair of receipts: the member's book pays
 * down the pool liability from cash, the pool's book receives the payment against the matching
 * member receivable, both witnessed and for the exact same amount.
 * @param {{date: string, memberId: string, poolId: string, amount: string, witness: string, narration: string}} input
 * @returns {HedgeRepaymentSettlement}
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
  const liabilityAccount = memberPoolLiabilityAccount(poolId);
  const cashAccount = memberCashAccount();
  const receivableAccount = poolReceivableAccount(memberId);
  const floatAccount = poolFloatAccount(poolId);

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

  return Object.freeze({
    type: "HedgeRepaymentSettlement", version: 1, date, memberId, poolId, amount, witness,
    memberTransaction: Object.freeze({ directive: memberTransaction, accounts: [liabilityAccount, cashAccount] }),
    poolTransaction: Object.freeze({ directive: poolTransaction, accounts: [floatAccount, receivableAccount] }),
  });
}
