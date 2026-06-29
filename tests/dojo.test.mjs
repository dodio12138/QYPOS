import test from "node:test";
import assert from "node:assert/strict";
import {
  createDojoTerminalPayment,
  dojoConfig,
  isDojoConfigured,
  listDojoTerminals,
  mapDojoSessionStatus
} from "../apps/api/src/services/dojo.js";

function withDojoEnv(run) {
  const previous = {
    DOJO_API_KEY: process.env.DOJO_API_KEY,
    DOJO_API_BASE_URL: process.env.DOJO_API_BASE_URL,
    DOJO_API_VERSION: process.env.DOJO_API_VERSION,
    DOJO_SOFTWARE_HOUSE_ID: process.env.DOJO_SOFTWARE_HOUSE_ID,
    DOJO_RESELLER_ID: process.env.DOJO_RESELLER_ID
  };
  Object.assign(process.env, {
    DOJO_API_KEY: "sk_sandbox_test",
    DOJO_API_BASE_URL: "https://dojo.test",
    DOJO_API_VERSION: "2026-02-27",
    DOJO_SOFTWARE_HOUSE_ID: "software-house",
    DOJO_RESELLER_ID: "reseller"
  });
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("Dojo configuration accepts explicit terminal credentials", async () => {
  await withDojoEnv(() => {
    assert.equal(isDojoConfigured(), true);
    assert.equal(dojoConfig().version, "2026-02-27");
    delete process.env.DOJO_API_KEY;
    assert.equal(isDojoConfigured(), false);
  });
});

test("Dojo sandbox configuration supplies terminal header defaults", () => {
  const config = dojoConfig({ DOJO_API_KEY: "sk_sandbox_test" });
  assert.equal(config.baseUrl, "https://api.dojo.tech");
  assert.equal(config.version, "2026-02-27");
  assert.equal(config.softwareHouseId, "softwareHouse1");
  assert.equal(config.resellerId, "reseller1");
  assert.equal(isDojoConfigured({ DOJO_API_KEY: "sk_sandbox_test" }), true);
});

test("Dojo production configuration still requires assigned terminal headers", () => {
  assert.equal(isDojoConfigured({ DOJO_API_KEY: "sk_prod_test" }), false);
});

test("Dojo terminal listing sends server-side terminal headers", async () => {
  await withDojoEnv(async () => {
    let captured;
    const terminals = await listDojoTerminals({
      fetchImpl: async (url, options) => {
        captured = { url, options };
        return jsonResponse([{ id: "tm_1", status: "Available" }]);
      }
    });
    assert.equal(terminals[0].id, "tm_1");
    assert.equal(captured.url, "https://dojo.test/terminals?statuses=Available");
    assert.equal(captured.options.headers.Authorization, "Basic sk_sandbox_test");
    assert.equal(captured.options.headers["software-house-id"], "software-house");
    assert.equal(captured.options.headers["reseller-id"], "reseller");
  });
});

test("Dojo sale creates a payment intent before its terminal session", async () => {
  await withDojoEnv(async () => {
    const calls = [];
    const result = await createDojoTerminalPayment({
      amountMinor: 1250,
      currency: "GBP",
      reference: "D260627-001",
      description: "QYPOS test",
      terminalId: "tm_1",
      idempotencyKey: "attempt-1"
    }, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
        return url.endsWith("/payment-intents")
          ? jsonResponse({ id: "pi_1", status: "Created" })
          : jsonResponse({ id: "ts_1", status: "InitiateRequested" });
      }
    });
    assert.equal(result.paymentIntent.id, "pi_1");
    assert.equal(result.terminalSession.id, "ts_1");
    assert.deepEqual(calls[0].body.amount, { value: 1250, currencyCode: "GBP" });
    assert.equal(calls[1].body.details.sale.paymentIntentId, "pi_1");
    assert.equal(calls[1].body.terminalId, "tm_1");
  });
});

test("Dojo terminal statuses map to safe local states", () => {
  assert.equal(mapDojoSessionStatus("Captured"), "succeeded");
  assert.equal(mapDojoSessionStatus("Declined"), "declined");
  assert.equal(mapDojoSessionStatus("Expired"), "unknown");
  assert.equal(mapDojoSessionStatus("EnterPin"), "pending");
});
