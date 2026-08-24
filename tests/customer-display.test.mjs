import test from "node:test";
import assert from "node:assert/strict";

const { deterministicLotteryStopUnit, distinctAdjacentWheelColors, equalWheelSliceBounds, equalWheelTargetAngle, lotterySafeStopAngle, lotteryWheelLabelLayout, lotteryWheelSeparatorWidth, LOTTERY_SPIN_MS, lotteryDrawPayload, lotteryPresentationPhase, lotteryTickSchedule, lotteryWheelRotation } = await import("../apps/web/src/app/customer-display/customer-display-helpers.js");
const { customerDisplayMatchesOrder, displaySettings, shouldRefreshCustomerDisplayOrder } = await import("../apps/api/src/services/customer-display.js");
const { nextPosLotteryFeedback, POS_LOTTERY_FEEDBACK_MS } = await import("../apps/web/src/app/_components/customer-display-control-helpers.js");

test("customer display draw sends the ticket, action token, revision, and idempotency key", () => {
  const payload = lotteryDrawPayload({
    revision: 42,
    payload: {
      ticketId: "ticket-123",
      actionToken: "action-456"
    }
  }, "draw-789");

  assert.deepEqual(payload, {
    ticket_id: "ticket-123",
    action_token: "action-456",
    revision: 42,
    idempotency_key: "draw-789"
  });
});

test("cashier draw controls only operate the lottery linked to the selected order", () => {
  const state = { payload: { order_id: "order-a" } };

  assert.equal(customerDisplayMatchesOrder(state, "order-a"), true);
  assert.equal(customerDisplayMatchesOrder(state, "order-b"), false);
  assert.equal(customerDisplayMatchesOrder(state, null), false);
});

test("order adjustments only refresh the matching bill on the customer display", () => {
  assert.equal(shouldRefreshCustomerDisplayOrder({ mode: "bill", payload: { order_id: "order-a" } }, "order-a"), true);
  assert.equal(shouldRefreshCustomerDisplayOrder({ mode: "paid", payload: { order_id: "order-a" } }, "order-a"), true);
  assert.equal(shouldRefreshCustomerDisplayOrder({ mode: "bill", payload: { order_id: "order-b" } }, "order-a"), false);
  assert.equal(shouldRefreshCustomerDisplayOrder({ mode: "lottery_ready", payload: { order_id: "order-a" } }, "order-a"), false);
});

test("POS only shows newly observed lottery results and does not restore feedback after refresh", () => {
  const existingDraw = { draw_id: "draw-a", prize_snapshot: { kind: "prize" } };
  const initial = nextPosLotteryFeedback({ initialized: false, seenDrawId: null }, existingDraw);
  assert.equal(initial.feedback, null);
  assert.equal(initial.tracker.seenDrawId, "draw-a");

  const noDraw = nextPosLotteryFeedback({ initialized: false, seenDrawId: null }, null);
  const newDraw = nextPosLotteryFeedback(noDraw.tracker, existingDraw);
  assert.equal(newDraw.feedback, existingDraw);
  assert.equal(nextPosLotteryFeedback(newDraw.tracker, existingDraw).feedback, null);
  assert.equal(POS_LOTTERY_FEEDBACK_MS, 15000);
});

test("customer display remains touch controlled when a legacy cashier setting is stored", () => {
  assert.equal(displaySettings({ customer_display_interaction_mode: "cashier_controlled" }).interaction_mode, "customer_touch");
});

test("lottery result stays hidden until its wheel animation completes", () => {
  const result = { mode: "lottery_result", revision: 18 };

  assert.equal(lotteryPresentationPhase(result, 0), "drawing");
  assert.equal(lotteryPresentationPhase(result, 18), "result");
});

test("lottery wheel keeps the same numeric stop angle after spinning", () => {
  const spinningRotation = lotteryWheelRotation("lottery_result", true, 135);
  const settledRotation = lotteryWheelRotation("lottery_result", false, 135);

  assert.equal(spinningRotation, 3015);
  assert.equal(settledRotation, spinningRotation);
});

test("lottery sound ticks accelerate and then slow before the ten-second finish", () => {
  const ticks = lotteryTickSchedule();
  const earlyGap = ticks[1] - ticks[0];
  const middleIndex = Math.floor(ticks.length / 2);
  const middleGap = ticks[middleIndex] - ticks[middleIndex - 1];
  const lateGap = ticks.at(-1) - ticks.at(-2);

  assert.equal(LOTTERY_SPIN_MS, 10000);
  assert.ok(earlyGap > middleGap);
  assert.ok(lateGap > middleGap);
  assert.ok(ticks.at(-1) < LOTTERY_SPIN_MS);
});

test("lottery wheel display slices are equal and independent of prize probability", () => {
  assert.deepEqual(equalWheelSliceBounds(0, 4), { start: 0, end: 0.25 });
  assert.deepEqual(equalWheelSliceBounds(3, 4), { start: 0.75, end: 1 });
  assert.equal(equalWheelTargetAngle(1, 4), 225);
});

test("lottery wheel labels turn radially and shrink for crowded or long prize names", () => {
  const fourSlices = lotteryWheelLabelLayout(4, "免费饮料", "Free drink", 180);
  const twelveSlices = lotteryWheelLabelLayout(12, "免费饮料", "Free drink", 180);
  const longEnglish = lotteryWheelLabelLayout(12, "免费饮料", "Twenty percent off next order", 0);

  assert.equal(fourSlices.rotation, 360);
  assert.ok(twelveSlices.chineseFontSize < fourSlices.chineseFontSize);
  assert.ok(longEnglish.englishFontSize < twelveSlices.englishFontSize);
  assert.ok(lotteryWheelSeparatorWidth(12) >= 0.3);
});

test("lottery wheel replaces adjacent duplicate colours including the closing edge", () => {
  const repeated = distinctAdjacentWheelColors(Array(12).fill("#f97316"));
  const closingConflict = distinctAdjacentWheelColors(["#f97316", "#0f766e", "#f97316"]);
  const similarOranges = distinctAdjacentWheelColors(["#f59e0b", "#f97316", "#2563eb"]);
  const alreadyDistinct = ["#f97316", "#0f766e", "#2563eb"];

  assert.ok(repeated.every((color, index) => color.toLowerCase() !== repeated[(index + 1) % repeated.length].toLowerCase()));
  assert.notEqual(closingConflict.at(-1).toLowerCase(), closingConflict[0].toLowerCase());
  assert.notEqual(similarOranges[1].toLowerCase(), "#f97316");
  assert.deepEqual(distinctAdjacentWheelColors(alreadyDistinct), alreadyDistinct);
});

test("lottery stop positions vary by draw while keeping away from slice boundaries", () => {
  const seeds = Array.from({ length: 20 }, (_, index) => `draw-${index}`);
  const angles = seeds.map((seed) => lotterySafeStopAngle(1, 4, seed));

  assert.ok(new Set(angles.map((angle) => angle.toFixed(4))).size > 10);
  assert.ok(angles.every((angle) => angle >= 198 && angle <= 252));
  assert.equal(lotterySafeStopAngle(1, 4, "draw-3"), lotterySafeStopAngle(1, 4, "draw-3"));
  assert.equal(deterministicLotteryStopUnit("draw-3"), deterministicLotteryStopUnit("draw-3"));
});
