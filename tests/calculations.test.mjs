import test from "node:test";
import assert from "node:assert/strict";
import { calculateTotals } from "../packages/shared/src/index.js";

test("calculates tax on top of untaxed menu prices", () => {
  const totals = calculateTotals(
    [{ unit_price: 100, quantity: 2, modifiers: [{ price_delta: 10 }] }],
    { tax_rate: 0.2, prices_include_tax: false, service_charge_rate: 0.1 }
  );

  assert.deepEqual(totals, {
    subtotal: 220,
    discount: 0,
    netSales: 220,
    tax: 44,
    serviceCharge: 26.4,
    total: 290.4
  });
});

test("splits tax out of tax-inclusive menu prices", () => {
  const totals = calculateTotals(
    [{ unit_price: 120, quantity: 1, modifiers: [] }],
    { tax_rate: 0.2, prices_include_tax: true, service_charge_rate: 0.1 }
  );

  assert.deepEqual(totals, {
    subtotal: 120,
    discount: 0,
    netSales: 100,
    tax: 20,
    serviceCharge: 12,
    total: 132
  });
});

test("applies discount before tax and service charge", () => {
  const totals = calculateTotals(
    [{ unit_price: 50, quantity: 2, modifiers: [] }],
    { tax_rate: 0.2, prices_include_tax: false, service_charge_rate: 0.1 },
    { discount: 10 }
  );

  assert.deepEqual(totals, {
    subtotal: 100,
    discount: 10,
    netSales: 90,
    tax: 18,
    serviceCharge: 10.8,
    total: 118.8
  });
});

test("caps discount at the order subtotal", () => {
  const totals = calculateTotals(
    [{ unit_price: 10, quantity: 1, modifiers: [] }],
    { tax_rate: 0.2, prices_include_tax: false, service_charge_rate: 0.15 },
    { discount: 99 }
  );
  assert.equal(totals.discount, 10);
  assert.equal(totals.total, 0);
});

test("allows service charge exemption", () => {
  const totals = calculateTotals(
    [{ unit_price: 80, quantity: 1, modifiers: [] }],
    { tax_rate: 0.1, prices_include_tax: false, service_charge_rate: 0.1 },
    { service_charge_exempt: true }
  );

  assert.equal(totals.serviceCharge, 0);
  assert.equal(totals.total, 88);
});
