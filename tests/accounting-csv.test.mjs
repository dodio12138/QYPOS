import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountingCsv, serializeCsv } from "../apps/api/src/services/accounting-csv.js";

const report = {
  from: "2026-07-01",
  to: "2026-07-01",
  summary: {
    orders: 2,
    complimentary_orders: 1,
    items_sold: 3,
    dine_in_orders: 1,
    takeaway_orders: 1,
    subtotal: 20,
    discount: 5,
    net_sales: 12.5,
    tax: 2.5,
    service_charge: 0,
    revenue: 15,
    average_ticket: 15
  }
};

const orderRows = [
  {
    business_day: "2026-07-01",
    order_no: "D260701-001",
    created_at: "2026-07-01T12:00:00.000Z",
    paid_at: "2026-07-01T12:10:00.000Z",
    service_type: "dine_in",
    guests: 2,
    items_sold: 3,
    payment_methods: "cash",
    payment_providers: "manual",
    subtotal: 20,
    discount: 5,
    net_sales: 12.5,
    tax: 2.5,
    service_charge: 0,
    total: 15,
    tendered_amount: 20,
    change_due: 0,
    retained_amount: 2,
    discount_reason: "=unsafe formula",
    notes: "Customer said \"thanks\""
  },
  {
    business_day: "2026-07-01",
    order_no: "T260701-002",
    created_at: "2026-07-01T13:00:00.000Z",
    paid_at: "2026-07-01T13:00:00.000Z",
    service_type: "takeaway",
    guests: 1,
    items_sold: 0,
    payment_methods: "complimentary",
    payment_providers: "manual",
    subtotal: 0,
    discount: 0,
    net_sales: 0,
    tax: 0,
    service_charge: 0,
    total: 0,
    tendered_amount: 0,
    change_due: 0,
    retained_amount: 0,
    is_complimentary: true
  }
];

test("builds a bilingual accountant-friendly CSV with reconciliation sections", () => {
  const csv = buildAccountingCsv({
    report,
    orderRows,
    paymentRows: [{
      method: "cash",
      provider: "manual",
      transactions: 1,
      tendered_amount: 20,
      change_due: 0,
      retained_amount: 2
    }],
    settings: { currency: "GBP", prices_include_tax: true },
    generatedAt: "2026-07-02T09:00:00.000Z",
    timeZone: "Europe/London"
  });

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /会计汇总 \/ Accounting Summary/);
  assert.match(csv, /支付方式汇总 \/ Payment Method Summary/);
  assert.match(csv, /每日汇总 \/ Daily Summary/);
  assert.match(csv, /已结账订单账簿 \/ Paid Order Ledger/);
  assert.match(csv, /"2026-07-01 13:00:00"/);
  assert.match(csv, /待退款 \/ Refund due/);
  assert.match(csv, /对账差异 \/ Reconciliation difference/);
  assert.match(csv, /20,0,2,20,18,3,0/);
  assert.match(csv, /"'=unsafe formula"/);
  assert.match(csv, /"Customer said ""thanks"""/);
});

test("serializes numeric cells as numbers and protects spreadsheet formulas", () => {
  const csv = serializeCsv([
    ["label", "amount"],
    [" =SUM(A1:A2)", 12.34]
  ]);

  assert.equal(csv, "\uFEFF\"label\",\"amount\"\r\n\"' =SUM(A1:A2)\",12.34");
});
