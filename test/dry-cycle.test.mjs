import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runConsumptionHedgeCli } from "../apps/consumption-hedge-cli.mjs";

function heatingMonths(year, values) {
  const months = ["10", "11", "12"].map((m, i) => ({ month: `${year}-${m}`, amount: String(values[i]) }));
  return months.concat(["01", "02", "03"].map((m, i) => ({ month: `${year + 1}-${m}`, amount: String(values[i + 3]) })));
}

test("burn -> position -> book -> mark -> repay -> status runs end to end and status reflects every recorded receipt", async () => {
  const root = mkdtempSync(join(tmpdir(), "consumption-hedge-dry-cycle-"));
  try {
    const readings = [...heatingMonths(2024, [150, 180, 220, 240, 210, 170]), ...heatingMonths(2025, [160, 190, 230, 250, 220, 180])];
    const burnSeries = await runConsumptionHedgeCli("burn", { input: { unit: "PROPANE_GAL", asOf: "2026-09", readings } });
    assert.equal(burnSeries.admitted, true);

    const contract = {
      pricePerGallon: "1.10", depositAmount: "150.00",
      fillWindow: { opensMonth: "2026-06", closesMonth: "2026-08" },
      cancellationTerms: "forfeits deposit if canceled after the fill window closes",
      deliveryFeeUsd: "35.00",
    };
    const position = await runConsumptionHedgeCli("position", {
      input: {
        burnSeries, contract,
        basis: { localBenchmarkSpread: 0.05, basisThreshold: 0.10 },
        spot: { winterSpotPriceEstimate: "1.45", spreadVolatility: 0.6 },
        float: { annualRate: 0.06, depositOpportunityRate: 0.04 },
        fundingSource: "pool-float",
        sleeve: { riskCapital: "5000.00", survivalCapital: "20000.00", stage: "pool-held" },
        repaymentMonths: ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
      },
    });
    assert.equal(position.admitted, true);

    const booking = await runConsumptionHedgeCli("book", {
      root,
      input: {
        date: "2026-09-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool",
        gallons: position.gallons, forwardPrice: position.forwardPrice, contractCost: position.contractCost,
        narration: "propane pre-buy fill season 2026", witness: "contract:sha256:abc123",
      },
    });
    assert.ok(booking.receipt.id);

    const mark = await runConsumptionHedgeCli("mark", {
      root,
      input: {
        date: "2027-03-15", memberId: "Chaske Sd", gallons: position.gallons, forwardPrice: position.forwardPrice,
        priceDirective: { commodity: "PROPANE_GAL", date: "2027-03-15", usdPrice: "1.45" }, delivered: true,
      },
    });
    assert.equal(mark.sign, "gain");
    assert.ok(mark.receipt.id);

    const [firstInstallment] = position.repaymentSchedule;
    const repayment = await runConsumptionHedgeCli("repay", {
      root,
      input: {
        date: "2026-10-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool",
        amount: firstInstallment.amountDue, witness: "repay:2026-10", narration: "hedge repayment installment 1 of 6",
      },
    });
    assert.ok(repayment.receipt.id);

    const status = await runConsumptionHedgeCli("status", { root });
    assert.equal(status.bookings.length, 1);
    assert.equal(status.marks.length, 1);
    assert.equal(status.repayments.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
