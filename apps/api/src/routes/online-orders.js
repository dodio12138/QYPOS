import crypto from "node:crypto";
import { saveOnlineOrderInbox } from "../services/online-order-inbox.js";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signatureFor(secret, timestamp, method, path, body) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${method} ${path}.${body}`).digest("hex")}`;
}

async function verifyConnectorRequest({ request, redis, secret, body }) {
  if (!secret) return false;
  const timestamp = String(request.headers["x-qypos-sync-timestamp"] || "");
  const signature = String(request.headers["x-qypos-sync-signature"] || "");
  const connectorId = String(request.headers["x-qypos-connector-id"] || request.body?.connectorId || "");
  const timestampNumber = Number(timestamp);
  if (!connectorId || !/^\d+$/.test(timestamp) || !Number.isFinite(timestampNumber)
    || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > MAX_CLOCK_SKEW_SECONDS) return false;
  const path = request.url.split("?")[0];
  const expected = signatureFor(secret, timestamp, request.method, path, body);
  if (!safeEqual(signature, expected)) return false;
  const replayKey = `online-order-sync:nonce:${connectorId}:${timestamp}:${signature}`;
  return Boolean(await redis.set(replayKey, "1", "NX", "EX", MAX_CLOCK_SKEW_SECONDS));
}

function limitOffset(request) {
  const limit = Math.min(100, Math.max(1, Number.parseInt(request.query?.limit || "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(request.query?.offset || "0", 10) || 0);
  return { limit, offset };
}

function publicInboxOrder(row) {
  return {
    id: row.id,
    external_order_id: row.external_order_id,
    external_reference: row.external_reference,
    payment_intent_id: row.payment_intent_id,
    payment_status: row.payment_status,
    currency: row.currency,
    total_minor: Number(row.total_minor),
    customer: row.customer_payload || {},
    status: row.status,
    last_error: row.last_error,
    received_at: row.received_at,
    updated_at: row.updated_at
  };
}

function publicInboxItems(items) {
  return items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price_minor: Number(item.unit_price_minor),
    line_total_minor: Number(item.line_total_minor)
  }));
}

async function loadInboxOrder(pool, id) {
  const order = await pool.query("SELECT * FROM online_order_inbox WHERE id = $1", [id]);
  if (!order.rows[0]) return null;
  const items = await pool.query(
    `SELECT id, source_item_id, name_en, name_zh, option_label_en, option_label_zh, quantity, unit_price_minor, line_total_minor
     FROM online_order_inbox_items WHERE inbox_order_id = $1 ORDER BY id`,
    [id]
  );
  return { ...publicInboxOrder(order.rows[0]), raw_payload: order.rows[0].raw_payload, items: publicInboxItems(items.rows) };
}

function eventOrderSummary(result) {
  return {
    id: result.inbox.id,
    external_order_id: result.inbox.external_order_id,
    external_reference: result.inbox.external_reference,
    payment_status: result.inbox.payment_status,
    currency: result.inbox.currency,
    total_minor: Number(result.inbox.total_minor),
    received_at: result.inbox.received_at,
    test: false
  };
}

function testAlertOrder() {
  return {
    id: `test-online-order-${Date.now()}`,
    external_order_id: "test-online-order",
    external_reference: "TEST-GN-ALERT",
    payment_status: "Captured",
    currency: "GBP",
    total_minor: 1480,
    customer: { name: "测试顾客 / Test customer", phone: "+44 7000 000000", note: "这是弹窗测试，不是真实订单" },
    items: [{
      source_item_id: "test-item",
      name_en: "Test Noodles",
      name_zh: "测试面",
      option_label_en: "Large",
      option_label_zh: "大份",
      quantity: 1,
      unit_price_minor: 1480,
      line_total_minor: 1480
    }],
    received_at: new Date().toISOString(),
    test: true
  };
}

async function queueOnlineOrderKitchenPrint({ pool, redis, emit, auditLog, request, settings, printer, onlineOrder, audit = true }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`online-order-kitchen:${onlineOrder.id}`]);
    const existing = await client.query(
      `SELECT * FROM print_jobs
       WHERE type = 'online_order_kitchen'
         AND payload->>'online_order_id' = $1
         AND status IN ('queued', 'printing', 'succeeded')
       ORDER BY created_at DESC LIMIT 1`,
      [onlineOrder.id]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return { ...existing.rows[0], duplicate: true };
    }
    const result = await client.query(
      "INSERT INTO print_jobs (order_id, type, payload) VALUES (NULL, 'online_order_kitchen', $1) RETURNING *",
      [{
        online_order_id: onlineOrder.id,
        online_order: onlineOrder,
        settings,
        printer,
        created_at: new Date().toISOString()
      }]
    );
    const job = result.rows[0];
    await client.query("COMMIT");
    await redis.lpush("print_jobs", job.id);
    emit("print.queued", job);
    if (audit) await auditLog(request, "online_order.print_kitchen", "online_order_inbox", onlineOrder.id, { print_job_id: job.id });
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default function register({ app, pool, redis, requirePermission, query, emit, getSettings, selectPrinter, isValidPrinter, auditLog }) {
  app.get("/ops/online-orders", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_ops")) return;
    const { limit, offset } = limitOffset(request);
    const [rows, count] = await Promise.all([
      query(
        `SELECT id, external_order_id, external_reference, payment_intent_id, payment_status, currency, total_minor,
                customer_payload, status, last_error, received_at, updated_at
         FROM online_order_inbox ORDER BY received_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query("SELECT COUNT(*)::integer AS total FROM online_order_inbox")
    ]);
    return { items: rows.map(publicInboxOrder), total: count[0]?.total || 0, limit, offset };
  });

  app.get("/ops/online-orders/:id", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_ops")) return;
    const order = await loadInboxOrder(pool, request.params.id);
    if (!order) {
      reply.code(404);
      return { error: "Online order not found" };
    }
    return order;
  });

  app.get("/online-orders/:id", async (request, reply) => {
    if (!await requirePermission(request, reply, "print_receipt")) return;
    const order = await loadInboxOrder(pool, request.params.id);
    if (!order) {
      reply.code(404);
      return { error: "Online order not found" };
    }
    return order;
  });

  app.post("/online-orders/:id/print-kitchen", async (request, reply) => {
    if (!await requirePermission(request, reply, "print_receipt")) return;
    const onlineOrder = await loadInboxOrder(pool, request.params.id);
    if (!onlineOrder) {
      reply.code(404);
      return { error: "Online order not found" };
    }
    const settings = await getSettings();
    const printer = selectPrinter(settings, "kitchen");
    if (!printer || !isValidPrinter(printer)) {
      reply.code(409);
      return { error: "Kitchen printer is not configured or enabled" };
    }
    return queueOnlineOrderKitchenPrint({ pool, redis, emit, auditLog, request, settings, printer, onlineOrder });
  });

  app.post("/online-orders/test-print-kitchen", async (request, reply) => {
    if (!await requirePermission(request, reply, "print_receipt")) return;
    const settings = await getSettings();
    const printer = selectPrinter(settings, "kitchen");
    if (!printer || !isValidPrinter(printer)) {
      reply.code(409);
      return { error: "Kitchen printer is not configured or enabled" };
    }
    return queueOnlineOrderKitchenPrint({
      pool, redis, emit, auditLog, request, settings, printer,
      onlineOrder: testAlertOrder(),
      audit: false
    });
  });

  app.get("/internal/online-orders/sync-state", async (request, reply) => {
    const body = "";
    if (!await verifyConnectorRequest({ request, redis, secret: process.env.ONLINE_ORDER_IMPORT_SECRET || process.env.ONLINE_ORDER_SYNC_SECRET, body })) {
      reply.code(401);
      return { error: "Invalid connector signature" };
    }
    const connectorId = String(request.query?.connectorId || request.headers["x-qypos-connector-id"] || "");
    const row = await pool.query("SELECT connector_id, last_cursor, updated_at FROM online_order_sync_state WHERE connector_id = $1", [connectorId]);
    return row.rows[0] || { connector_id: connectorId, last_cursor: null, updated_at: null };
  });

  app.post("/internal/online-orders/import", async (request, reply) => {
    const body = JSON.stringify(request.body ?? {});
    if (!await verifyConnectorRequest({ request, redis, secret: process.env.ONLINE_ORDER_IMPORT_SECRET || process.env.ONLINE_ORDER_SYNC_SECRET, body })) {
      reply.code(401);
      return { error: "Invalid connector signature" };
    }
    const { connectorId, cursor, order } = request.body ?? {};
    if (typeof connectorId !== "string" || !connectorId || typeof order !== "object" || !order) {
      reply.code(400);
      return { error: "connectorId and order are required" };
    }
    try {
      const client = await pool.connect();
      try {
        client.__qyposTransaction = true;
        await client.query("BEGIN");
        const result = await saveOnlineOrderInbox({ client, payload: order, connectorId, cursor });
        await client.query("COMMIT");
        if (result.inbox.inserted) emit("online_order.received", eventOrderSummary(result));
        return { ok: true, id: result.inbox.id, external_order_id: result.inbox.external_order_id, item_count: result.itemCount };
      } catch (error) {
        await client.query("ROLLBACK");
        reply.code(error.statusCode || 400);
        return { error: error.message, code: error.code };
      } finally {
        client.release();
      }
    } catch (error) {
      reply.code(500);
      return { error: "Online order import failed" };
    }
  });

  app.post("/ops/online-orders/test-alert", async (request, reply) => {
    if (!await requirePermission(request, reply, "manage_ops")) return;
    emit("online_order.received", testAlertOrder());
    return { ok: true };
  });
}
