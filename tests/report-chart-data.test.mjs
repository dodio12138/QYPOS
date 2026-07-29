import test from "node:test";
import assert from "node:assert/strict";
import { buildCumulativeTimeSeries } from "../apps/web/src/app/admin/_components/report-chart-data.js";

test("builds cumulative orders and revenue by time slot", () => {
  assert.deepEqual(
    buildCumulativeTimeSeries([
      { slot: "09:00", orders: 2, revenue: 20 },
      { slot: "09:30", orders: 0, revenue: 0 },
      { slot: "10:00", orders: 3, revenue: 45.5 },
    ]),
    [
      { orders: 2, revenue: 20 },
      { orders: 2, revenue: 20 },
      { orders: 5, revenue: 65.5 },
    ]
  );
});

test("normalizes missing and string values while accumulating", () => {
  assert.deepEqual(
    buildCumulativeTimeSeries([
      { orders: "1", revenue: "9.50" },
      {},
      { orders: 2, revenue: 10.5 },
    ]),
    [
      { orders: 1, revenue: 9.5 },
      { orders: 1, revenue: 9.5 },
      { orders: 3, revenue: 20 },
    ]
  );
});
