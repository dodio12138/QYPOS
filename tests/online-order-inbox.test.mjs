import test from "node:test";
import assert from "node:assert/strict";
import { saveOnlineOrderInbox, validateOnlineOrderPayload } from "../apps/api/src/services/online-order-inbox.js";

const payload = {
  externalOrderId: "website-order-1",
  reference: "GN-260822-AB12CD34",
  paymentStatus: "Captured",
  paymentIntentId: "pi_live_1",
  currency: "gbp",
  totalMinor: 1480,
  customer: { name: "Customer", phone: "+447000000000", email: "customer@example.com", note: "No onions" },
  items: [{
    sourceItemId: "website-item-1",
    nameEn: "Vegan Cold Xiao Mian",
    nameZh: "素小面",
    optionLabelEn: "Large",
    optionLabelZh: "大份",
    quantity: 1,
    unitPriceMinor: 1480,
    lineTotalMinor: 1480
  }],
  createdAt: "2026-08-22T12:00:00.000Z"
};

test("validates captured orders and preserves the raw payload", () => {
  const result = validateOnlineOrderPayload(payload);
  assert.equal(result.currency, "GBP");
  assert.equal(result.externalOrderId, payload.externalOrderId);
  assert.deepEqual(result.rawPayload, payload);
  assert.throws(() => validateOnlineOrderPayload({ ...payload, paymentStatus: "Authorized" }), /Captured/);
});

test("saves the inbox order and its item snapshot in one transaction", async () => {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes("INSERT INTO online_order_inbox")) {
        return { rows: [{ id: "inbox-1", external_order_id: payload.externalOrderId }] };
      }
      return { rows: [] };
    }
  };
  const result = await saveOnlineOrderInbox({ client, payload, connectorId: "restaurant-pos-1", cursor: "124" });
  assert.equal(result.inbox.id, "inbox-1");
  assert.equal(result.itemCount, 1);
  assert.equal(statements.filter((item) => item.sql.includes("INSERT INTO online_order_inbox_items")).length, 1);
  assert.match(statements.find((item) => item.sql.includes("INSERT INTO online_order_inbox"))?.sql, /ON CONFLICT \(external_order_id\)/);
  assert.ok(statements.some((item) => item.sql.includes("online_order_sync_state")));
  assert.ok(statements.some((item) => item.sql === "COMMIT"));
  assert.ok(!statements.some((item) => /INSERT INTO (orders|order_items|payments|print_jobs)/.test(item.sql)));
});
