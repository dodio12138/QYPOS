import test from "node:test";
import assert from "node:assert/strict";
import {
  averageMetric,
  elapsedShiftHours,
  hasScheduleDayStarted,
} from "../apps/web/src/app/admin/_components/schedule-metrics.js";

test("elapsed shift hours exclude future work and cap completed work", () => {
  const cell = {
    is_off: false,
    start_time: "09:00",
    end_time: "17:00",
    break_minutes: 60,
  };

  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 29, 8, 30)), 0);
  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 29, 13, 0)), 3.5);
  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 29, 18, 0)), 7);
});

test("elapsed shift hours use actual attendance and actual OFF", () => {
  const cell = {
    is_off: false,
    start_time: "09:00",
    end_time: "17:00",
    break_minutes: 60,
    actual_start_time: "10:00",
    actual_end_time: "14:00",
    actual_break_minutes: 0,
  };

  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 29, 12, 0)), 2);
  assert.equal(elapsedShiftHours({ ...cell, actual_is_off: true }, "2026-07-29", new Date(2026, 6, 29, 12, 0)), 0);
});

test("elapsed shift hours handle overnight work", () => {
  const cell = {
    is_off: false,
    start_time: "20:00",
    end_time: "02:00",
    break_minutes: 0,
  };

  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 29, 23, 0)), 3);
  assert.equal(elapsedShiftHours(cell, "2026-07-29", new Date(2026, 6, 30, 1, 0)), 5);
});

test("metric averages ignore unavailable days and include zero values", () => {
  assert.equal(averageMetric([100, null, 0, undefined, 50]), 50);
  assert.equal(averageMetric([null, undefined]), null);
  assert.equal(hasScheduleDayStarted("2026-07-29", new Date(2026, 6, 28, 23, 59)), false);
  assert.equal(hasScheduleDayStarted("2026-07-29", new Date(2026, 6, 29, 0, 0)), true);
});
