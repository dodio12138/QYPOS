import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountingWorkbookSheets,
  buildAccountingXlsx
} from "../apps/api/src/services/accounting-xlsx.js";

const options = {
  report: {
    from: "2026-07-01",
    to: "2026-07-01",
    summary: {
      orders: 1,
      complimentary_orders: 0,
      items_sold: 1,
      dine_in_orders: 1,
      takeaway_orders: 0,
      subtotal: 12,
      discount: 0,
      net_sales: 10,
      tax: 2,
      service_charge: 0,
      revenue: 12,
      average_ticket: 12
    }
  },
  orderRows: [{
    business_day: "2026-07-01",
    order_no: "D260701-001",
    created_at: "2026-07-01T11:00:00.000Z",
    paid_at: "2026-07-01T11:05:00.000Z",
    service_type: "dine_in",
    guests: 2,
    items_sold: 1,
    payment_methods: "card",
    payment_providers: "manual",
    subtotal: 12,
    discount: 0,
    net_sales: 10,
    tax: 2,
    service_charge: 0,
    total: 12,
    tendered_amount: 12,
    change_due: 0,
    retained_amount: 0
  }],
  paymentRows: [{
    method: "card",
    provider: "manual",
    transactions: 1,
    tendered_amount: 12,
    change_due: 0,
    retained_amount: 0
  }],
  settings: { currency: "GBP", prices_include_tax: true },
  generatedAt: "2026-07-02T09:00:00.000Z",
  timeZone: "Europe/London"
};

test("builds four accounting workbook sheets from the shared export model", () => {
  const sheets = buildAccountingWorkbookSheets(options);

  assert.deepEqual(sheets.map((sheet) => sheet.name), [
    "说明与汇总 Summary",
    "支付对账 Payments",
    "每日汇总 Daily",
    "订单账簿 Orders"
  ]);
  assert.equal(sheets[1].rows[0][0], "支付方式 / Payment method");
  assert.equal(sheets[2].rows[0][0], "日期 / Date");
  assert.equal(sheets[3].rows[0][0], "业务日期 / Business date");
  assert.equal(sheets[3].rows[1][1], "D260701-001");
});

test("writes a valid XLSX zip buffer", async () => {
  const buffer = await buildAccountingXlsx(options);

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(buffer.length > 5000);
});
