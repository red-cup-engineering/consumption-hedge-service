import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runConsumptionHedgeCli } from "../apps/consumption-hedge-cli.mjs";

const REQUEST = {
  date: "2026-09-05", memberId: "Chaske Sd", poolId: "Tiyospaye Pool",
  gallons: "1000", forwardPrice: "1.10", contractCost: "1100.00",
  narration: "propane pre-buy fill season 2026", witness: "contract:sha256:abc123",
};

test("book records its result in the semiotic-EAVT journal as a held record, and status reads it back", async () => {
  const root = mkdtempSync(join(tmpdir(), "consumption-hedge-journal-"));
  try {
    const booked = await runConsumptionHedgeCli("book", { root, input: REQUEST, now: () => "2026-09-05T00:00:00.000Z" });
    assert.equal(booked.type, "HedgeBookingSet");
    assert.match(booked.receipt.id, /^ni:\/\/\/sha-256;/u);

    const status = await runConsumptionHedgeCli("status", { root });
    assert.equal(status.bookings.length, 1);
    assert.equal(status.bookings[0].id, booked.receipt.id);
    assert.equal(status.bookings[0].record.memberTransaction.directive, booked.memberTransaction.directive);
    assert.deepEqual([status.marks, status.repayments], [[], []]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
