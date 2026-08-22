import test from "node:test";
import assert from "node:assert/strict";
import { OnlineOrderConnector, connectorConfig, isWithinMonitoringHours, parseSseText, signedHeaders } from "../apps/online-order-connector/src/worker.js";

test("connector monitors only during the configured opening window", () => {
  const config = connectorConfig({
    ONLINE_ORDER_BASE_URL: "https://example.test",
    ONLINE_ORDER_SYNC_SECRET: "sync-secret",
    ONLINE_ORDER_IMPORT_SECRET: "import-secret"
  });
  assert.equal(config.openTime, "11:00");
  assert.equal(config.closeTime, "22:05");
  assert.equal(config.timeZone, "Europe/London");
  assert.equal(isWithinMonitoringHours(new Date("2026-08-22T09:59:00.000Z"), config), false);
  assert.equal(isWithinMonitoringHours(new Date("2026-08-22T10:00:00.000Z"), config), true);
  assert.equal(isWithinMonitoringHours(new Date("2026-08-22T21:04:00.000Z"), config), true);
  assert.equal(isWithinMonitoringHours(new Date("2026-08-22T21:05:00.000Z"), config), false);
});

test("parses SSE events and preserves multiline data", () => {
  const events = parseSseText(": heartbeat\nid: 124\nevent: order.available\ndata: {\"orderId\":\ndata: \"website-order-1\"}\n\n");
  assert.deepEqual(events, [{ event: "order.available", id: "124", data: "{\"orderId\":\n\"website-order-1\"}" }]);
});

test("connector fetches, imports, and ACKs an available order", async () => {
  const calls = [];
  const order = {
    externalOrderId: "website-order-1",
    reference: "GN-1",
    paymentStatus: "Captured",
    currency: "GBP",
    totalMinor: 100,
    customer: { name: "Customer" },
    items: [{ sourceItemId: "item-1", nameEn: "Noodles", nameZh: "面", quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
    createdAt: "2026-08-22T12:00:00.000Z"
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        if (url.includes("/api/pos/orders/") && !url.endsWith("/ack")) return order;
        return { ok: true };
      }
    };
  };
  const connector = new OnlineOrderConnector({
    baseUrl: "https://example.test",
    syncSecret: "sync-secret",
    importSecret: "import-secret",
    connectorId: "restaurant-pos-1",
    cursor: "123",
    localApiUrl: "http://api:4000",
    reconnectMinMs: 1,
    reconnectMaxMs: 2
  }, { fetchImpl, logger: { info() {}, error() {}, warn() {} } });
  await connector.handleEvent({ event: "order.available", id: "124", data: JSON.stringify({ orderId: "website-order-1" }) });
  assert.equal(connector.cursor, "124");
  assert.equal(calls.length, 3);
  assert.match(calls[1].options.body, /"cursor":"124"/);
  assert.equal(calls[1].options.headers["X-QYPOS-Connector-Id"], "restaurant-pos-1");
  assert.equal(calls[2].options.method, "POST");
  assert.match(calls[2].url, /\/ack$/);
  assert.match(signedHeaders({ secret: "secret", method: "GET", url: "https://example.test/path" })["X-QYPOS-Sync-Signature"], /^sha256=/);
});
