import test from "node:test";
import assert from "node:assert/strict";

const { deleteLotteryCampaign, selectLotteryOutcome, testLotteryCampaign } = await import("../apps/api/src/services/lottery.js");
const { lotteryProbabilities, normalizedLotteryWeights } = await import("../apps/web/src/app/admin/_components/lottery-form-helpers.js");

function prizes() {
  return [
    {
      id: "drink",
      kind: "prize",
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

test("lottery test selection uses the same weighted server-side outcome", () => {
  const winning = selectLotteryOutcome(prizes(), () => 1999);
  const noPrize = selectLotteryOutcome(prizes(), () => 2000);

  assert.equal(winning.prize.id, "drink");
  assert.equal(winning.winning_segment_index, 0);
  assert.equal(noPrize.prize.id, "thanks");
  assert.equal(noPrize.winning_segment_index, 1);
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
