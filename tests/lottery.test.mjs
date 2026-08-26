import test from "node:test";
import assert from "node:assert/strict";

const { assertNoOverlappingLotteryCampaign, deleteLotteryCampaign, issueAdditionalLotteryTicket, lotteryClaimCodeRequired, selectLotteryOutcome, testLotteryCampaign } = await import("../apps/api/src/services/lottery.js");
const { campaignPayload, validatePrizes } = await import("../apps/api/src/routes/lottery.js");
const { lotteryProbabilities, normalizedLotteryWeights, rebalanceLotteryProbabilities } = await import("../apps/web/src/app/admin/_components/lottery-form-helpers.js");

function prizes() {
  return [
    {
      id: "drink",
      kind: "prize",
      fulfillment_type: "instant",
      name_i18n: { "zh-CN": "免费饮料", "en-GB": "Free drink" },
      weight_bps: 2000,
      stock_total: 1,
      stock_awarded: 0,
      background_color: "#f97316",
      text_color: "#fff"
    },
    {
      id: "thanks",
      kind: "no_prize",
      name_i18n: { "zh-CN": "谢谢参与", "en-GB": "Thank you" },
      weight_bps: 8000,
      stock_total: null,
      stock_awarded: 0,
      background_color: "#64748b",
      text_color: "#fff"
    }
  ];
}

test("activity campaigns default to the Lucky Wheel type and reject unknown types", () => {
  const payload = campaignPayload({
    starts_at: "2026-09-01T10:00:00.000Z",
    ends_at: "2026-09-02T10:00:00.000Z"
  });
  assert.equal(payload.activity_type, "lucky_wheel");
  assert.throws(() => campaignPayload({
    activity_type: "unknown",
    starts_at: "2026-09-01T10:00:00.000Z",
    ends_at: "2026-09-02T10:00:00.000Z"
  }), /Unsupported activity type/);
});

test("lottery test selection uses the same weighted server-side outcome", () => {
  const winning = selectLotteryOutcome(prizes(), () => 1999);
  const noPrize = selectLotteryOutcome(prizes(), () => 2000);

  assert.equal(winning.prize.id, "drink");
  assert.equal(winning.prize.fulfillment_type, "instant");
  assert.equal(winning.winning_segment_index, 0);
  assert.equal(noPrize.prize.id, "thanks");
  assert.equal(noPrize.winning_segment_index, 1);
});

test("published campaigns do not require a no-prize entry", () => {
  const prizeOnly = [
    { id: "drink", kind: "prize", weight_bps: 2500, stock_total: 20, stock_awarded: 0, enabled: true },
    { id: "discount", kind: "prize", weight_bps: 7500, stock_total: null, stock_awarded: 0, enabled: true }
  ];

  assert.doesNotThrow(() => validatePrizes(prizeOnly, { publish: true }));
  const outcome = selectLotteryOutcome(prizeOnly, () => 8000);
  assert.equal(outcome.prize.id, "discount");
});

test("an exhausted prize-only slice resolves to another available prize", () => {
  const prizeOnly = [
    { id: "drink", kind: "prize", weight_bps: 5000, stock_total: 1, stock_awarded: 1, name_i18n: {}, background_color: "#f97316", text_color: "#fff" },
    { id: "discount", kind: "prize", weight_bps: 5000, stock_total: null, stock_awarded: 0, name_i18n: {}, background_color: "#2563eb", text_color: "#fff" }
  ];

  const outcome = selectLotteryOutcome(prizeOnly, () => 100);
  assert.equal(outcome.prize.id, "discount");
  assert.equal(outcome.wheel.segments[0].effective_prize_id, "discount");
});

test("a campaign with all finite prize stock exhausted cannot draw", () => {
  const exhausted = [
    { id: "drink", kind: "prize", weight_bps: 5000, stock_total: 1, stock_awarded: 1 },
    { id: "dessert", kind: "prize", weight_bps: 5000, stock_total: 2, stock_awarded: 2 }
  ];

  assert.throws(() => selectLotteryOutcome(exhausted, () => 100), /no remaining prize stock/);
});

test("only next-use prizes generate redemption codes", () => {
  assert.equal(lotteryClaimCodeRequired({ kind: "prize", fulfillment_type: "instant" }), false);
  assert.equal(lotteryClaimCodeRequired({ kind: "prize", fulfillment_type: "voucher" }), true);
  assert.equal(lotteryClaimCodeRequired({ kind: "prize" }), true);
  assert.equal(lotteryClaimCodeRequired({ kind: "no_prize", fulfillment_type: null }), false);
});

test("campaign activation is serialized and rejects an overlapping published schedule", async () => {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes("FROM lottery_campaigns")) return { rows: [{ id: "already-running" }] };
      return { rows: [] };
    }
  };

  await assert.rejects(
    assertNoOverlappingLotteryCampaign(client, {
      id: "candidate",
      starts_at: "2026-08-24T12:00:00.000Z",
      ends_at: "2026-08-24T14:00:00.000Z"
    }),
    (error) => error.statusCode === 409 && error.code === "LOTTERY_CAMPAIGN_OVERLAP"
  );
  assert.ok(statements[0].sql.includes("pg_advisory_xact_lock"));
  assert.deepEqual(statements[1].params, ["candidate", "2026-08-24T12:00:00.000Z", "2026-08-24T14:00:00.000Z"]);
});

test("campaign activation accepts a schedule with no published overlap", async () => {
  const client = {
    async query(sql) {
      return { rows: sql.includes("FROM lottery_campaigns") ? [] : [] };
    }
  };

  await assert.doesNotReject(assertNoOverlappingLotteryCampaign(client, {
    id: "candidate",
    starts_at: "2026-08-24T14:00:00.000Z",
    ends_at: "2026-08-24T16:00:00.000Z"
  }));
});

test("staff can issue the next numbered lottery entry for the same paid order", async () => {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes("MAX(issuance_index)")) return { rows: [{ next_index: 2 }] };
      if (sql.includes("INSERT INTO lottery_tickets")) return { rows: [{ id: "ticket-2", expires_at: "2026-08-25T12:00:00.000Z", issuance_index: 2 }] };
      return { rows: [] };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); }
  };
  const pool = {
    async query(sql) {
      if (sql.includes("FROM lottery_campaigns")) {
        return { rows: [{ id: "campaign", minimum_order_total: 0, service_types: ["dine_in"], excluded_payment_methods: [], ticket_valid_minutes: 60 }] };
      }
      return { rows: [] };
    },
    async connect() { return client; }
  };

  const result = await issueAdditionalLotteryTicket({
    pool,
    order: { id: "order-1", status: "paid", service_type: "dine_in", total: 25, parent_order_id: null },
    now: new Date("2026-08-24T12:00:00.000Z")
  });

  assert.equal(result.additional, true);
  assert.equal(result.ticket_id, "ticket-2");
  assert.equal(result.issuance_index, 2);
  assert.ok(statements.some(({ sql }) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(statements.some(({ sql, params }) => sql.includes("INSERT INTO lottery_tickets") && params.at(-1) === 2));
  assert.ok(statements.some(({ sql }) => sql === "COMMIT"));
});

test("admin probability values are displayed and saved as an exact normalized 100 percent", () => {
  const editablePrizes = [
    { weight_value: 1 },
    { weight_value: 2 },
    { weight_value: 7 }
  ];

  assert.deepEqual(lotteryProbabilities(editablePrizes), [10, 20, 70]);
  assert.deepEqual(normalizedLotteryWeights(editablePrizes), [1000, 2000, 7000]);
});

test("repeating decimal probability weights still save to exactly 10000 basis points", () => {
  const weights = normalizedLotteryWeights([
    { weight_value: 1 },
    { weight_value: 1 },
    { weight_value: 1 }
  ]);

  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 10000);
  assert.ok(weights.every((weight) => weight > 0));
});

test("probability slider changes rebalance only unlocked prizes", () => {
  const prizes = [
    { weight_value: 20, locked: false },
    { weight_value: 30, locked: true },
    { weight_value: 50, locked: false }
  ];
  const adjusted = rebalanceLotteryProbabilities(prizes, 0, 40);

  assert.deepEqual(lotteryProbabilities(adjusted), [40, 30, 30]);
  assert.equal(adjusted[1].weight_value, 30);
  assert.equal(adjusted.reduce((sum, prize) => sum + prize.weight_value, 0), 100);
});

test("probability slider keeps the final unlocked prize as the remainder", () => {
  const prizes = [
    { weight_value: 20, locked: true },
    { weight_value: 30, locked: true },
    { weight_value: 50, locked: false }
  ];
  const adjusted = rebalanceLotteryProbabilities(prizes, 2, 10);

  assert.deepEqual(lotteryProbabilities(adjusted), [20, 30, 50]);
});

test("an exhausted test prize resolves to thank you without changing stock", () => {
  const campaignPrizes = prizes();
  campaignPrizes[0].stock_awarded = 1;
  const before = structuredClone(campaignPrizes);
  const outcome = selectLotteryOutcome(campaignPrizes, () => 100);

  assert.equal(outcome.prize.id, "thanks");
  assert.equal(outcome.wheel.segments[0].effective_prize_id, "thanks");
  assert.deepEqual(campaignPrizes, before);
});

test("admin test draw reads campaign data without opening a write transaction", async () => {
  const calls = [];
  const campaignPrizes = prizes();
  const pool = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("FROM lottery_campaigns")) {
        return { rows: [{ id: "campaign", internal_name: "Test", title_i18n: { "zh-CN": "测试", "en-GB": "Test" } }] };
      }
      return { rows: campaignPrizes };
    }
  };

  const result = await testLotteryCampaign({ pool, campaignId: "campaign" });

  assert.equal(result.test, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((sql) => /^SELECT/.test(sql)));
  assert.equal(campaignPrizes[0].stock_awarded, 0);
});

test("campaign deletion is soft and revokes only unused tickets", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("UPDATE lottery_campaigns")) return { rows: [{ id: "campaign" }] };
      if (sql.includes("UPDATE lottery_tickets")) return { rows: [{ id: "ticket" }], rowCount: 1 };
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); }
  };

  const result = await deleteLotteryCampaign({ pool: { connect: async () => client }, campaignId: "campaign" });

  assert.deepEqual(result, { deleted: true, id: "campaign", revoked_ticket_count: 1 });
  assert.ok(statements.some((sql) => sql.includes("deleted_at = now()")));
  assert.ok(statements.some((sql) => sql.includes("status = 'revoked'") && sql.includes("status = 'issued'")));
  assert.ok(!statements.some((sql) => /^DELETE/i.test(sql)));
  assert.ok(statements.includes("COMMIT"));
  assert.ok(statements.includes("RELEASE"));
});
