# @red-cup-engineering/consumption-hedge-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

The pool's consumption hedge: the pool forward-buys what a member household burns for winter
heat, books it as inventory, and marks it against spot. Implements the
[fintech-under-energy-descent note](../../../../561-group-services-section/services/561-group-operations-services-section/services/561-group-economic-operations-services-section/services/561-group-business-operations-services-section/services/561-group-finance-operations-services-section/content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md)
section 3.2 (the consumption hedge), section 2 (the barrier is denominated in joules), and
section 3.3 (the basis book decides what is worth hedging); the sizing frame is the
[sizing-without-a-bank note](../../../../science-services-section/services/social-science-services-section/services/economics-and-business-science-services-section/services/economics-science-services-section/content/text/documents/articles/notes/2026/09/04/2026-09-04-note-on-sizing-without-a-bank.md)
sections 3 and 5 (a sleeve is an arena with its own barrier; the barrier is a time series that
rises with hazard). The pre-buy terms and prices used as fixtures below are declared parameters,
not researched facts.

## The money path, plainly

The pool's float buys the winter early, at the summer price. The member repays through the
season, at the price they would have paid anyway. The difference — less the float's cost — is
split between the pool and the member. The contract signature and the deposit are always a
member's or the band's own hands, never an agent's; the position and the books are real from
the first fixture, not a projection.

## Modules

- **`consumption-hedge`** (`.`) — the domain algebra: joule conversion (`BTU_PER_GALLON_PROPANE`,
  `JOULES_PER_BTU`, `JOULES_PER_GALLON_PROPANE`, `JOULES_PER_KWH`, `barrierJoulesForUnit`),
  heating-season grouping (`seasonForMonth`, `seasonEndMonth`), the burn series
  (`deriveHouseholdBurnSeries`), the hedge decision rule (`deriveHedgeDecision`), the position
  (`deriveHedgePosition`, composing `@red-cup-engineering/position-sizing-service`'s
  `sizePosition`), Beancount account/transaction rendering, and the booking/mark/settlement
  functions.
- **`./derive-household-burn-series`**, **`./derive-hedge-position`**,
  **`./book-hedge-position`**, **`./mark-hedge-position`**, **`./settle-hedge-repayment`** — the
  CLI/NDJSON faces over each domain function, one operation per script.
- **`./cli`** (also the `consumption-hedge` bin) — the composed app: `burn`, `position`, `book`,
  `mark`, `repay`, `status`. `burn` and `position` are pure; `book`, `mark`, and `repay` record
  their result as a receipt through the semiotic-EAVT journal (`@red-cup-engineering/semiotic-eavt-engineering-services-section`) at
  `--root`; `status` reads the journal back.

## The hedge decision

`deriveHedgeDecision` hedges only when the seasonal spread (the declared winter-spot estimate
minus the pre-buy's forward price) clears the float's cost of capital plus the deposit's
opportunity cost, **and** the local basis against the benchmark (the basis book, section 3.3) is
inside a declared threshold. Every input is declared by the caller — nothing is estimated
internally — so a missing basis or spread throws a `TypeError` naming exactly which field is
unknown, and an unfavorable basis or spread returns `{admitted: false, reason}` naming why the
hedge was withdrawn, matching the doctrine's own falsifier language.

## The position: a sleeve, not a 1:1 purchase

`deriveHedgePosition` builds a sleeve-shaped sizing request — `edge` from the hedge's measured
spread, `sleeve.barrierJoules` from the household's own average season burn converted to joules
(never dollars, so the barrier is invariant under a currency regime change) — and sizes it
through `position-sizing-service`'s `sizePosition`. The admitted stake (a dollar amount of the
pool's risk capital) is converted to gallons at the forward price; this is the growth-optimal use
of the sleeve's risk capital on the hedge's edge, not a promise to buy exactly one household's
seasonal burn — a real deployment would additionally cap gallons at some multiple of
`averageSeasonTotal`, which is future work this section does not yet gate.

**Integration gap, named plainly:** `sleeve.barrierJoules` and `sleeve.stage` are extra fields on
the sizing request beyond `position-sizing-service@0.2.0`'s current published schema
(`riskCapital`, `survivalCapital`); `sizePosition` ignores fields it does not read, so this
composes forward-compatibly today. Another lot is adding `stage` and `barrierJoules` as read
fields to that package tonight; once published, `deriveHedgePosition` needs no change — it
already sends them. Similarly, `pool-service` (this section's sibling,
`financial-engineering-services-section/services/pool-service/`) is being built tonight and was
empty at the time of this writing; `bookHedgePosition` and `settleHedgeRepayment` declare the
interface this section expects of it — a member liability account paired one-to-one with a pool
receivable account, draws and repayments each witnessed and exactly matched in amount (the
two-book law) — rather than importing anything from it.

## The two-book law

`bookHedgePosition` renders two Beancount transactions from one pre-buy fill: the member's book
debits `Assets:Inventory:Propane:<Member>` in `PROPANE_GAL` at the forward price (a cost-basis
lot, `{<price> USD}`) against a credit to `Liabilities:Pool:<Pool>`; the pool's book debits
`Assets:Receivable:Members:<Member>` against a credit to `Assets:Cash:Float:<Pool>`, for the
exact same amount. Both transactions carry the same `witness` metadata field (the contract
document's identity). `bookHedgePosition` throws rather than books when the declared
`contractCost` does not exactly equal `gallons * forwardPrice`.

## The mark

`markHedgePosition` computes `markValue = gallons × (spot − forward)` against a declared
`PROPANE_GAL`/`KWH` price-directive-shaped input (matching the `EnergyPriceDirective` shape
specified in `computer-ledger-system-services-section`'s
`content/text/documents/specifications/derive-set-of-energy-price-directives.md` — that
package was not yet published at the time of this writing; this is the second integration gap).
An undelivered mark is an interim, unbooked valuation. A delivered mark books the inventory
relief at its forward cost basis, the heating expense at the spot value the member would
otherwise have paid, and the difference to `Income:Hedge:Realized-Gain` or
`Expenses:Hedge:Realized-Loss` (omitted when the mark is exactly flat) — always a balanced
double-entry transaction, verified by `bean-check` against a scratch ledger built from this
section's own fixtures (see `test/`).

**The falsifier** (fintech note, section 3.2): if after two heating seasons the booked cost of
pre-bought propane, including the pool's float cost, exceeds the members' average spot cost, the
hedge is withdrawn. A winter spot below the forward price (`markHedgePosition`'s loss case) is
exactly this falsifier's shape at the level of one delivered position.

## Numeric discipline

Money and measured consumption (gallons, kWh) are exact decimal strings via
`@red-cup-engineering/computer-ledger-system-services-section/src/decimal.mjs`. Derived
statistics — an average season's burn, the hedge decision's per-unit costs and edge, a sizing
fraction — are floats, matching `position-sizing-service`'s own numeric discipline (see this
section's own README, "Numeric discipline").

## Fabrication

Each `scripts/` operation was born through the jsnode fabrication line
(`fabricate_jsnode_operation_package`) from a work order under `data/records/`, matching this
section's own `position-sizing-service` precedent: the line births a standalone scratch package
(no sibling `src/` to import), and the shipped copy under `scripts/` instead imports the same
functions from this package's sibling `src/consumption-hedge.mjs`, avoiding the duplication —
see each script's own work order and receipt in `data/records/` for exactly what the line birthed
and where the shipped copy diverges.
