const MAX_RAW_PAYLOAD_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 1000;

export class OnlineOrderValidationError extends Error {
  constructor(message, code = "invalid_payload") {
    super(message);
    this.name = "OnlineOrderValidationError";
    this.code = code;
    this.statusCode = code === "not_captured" ? 422 : 400;
  }
}

function text(value, field, { required = true, max = MAX_TEXT_LENGTH } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new OnlineOrderValidationError(`${field} is required`);
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new OnlineOrderValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function integer(value, field, { min = 0, max = 2147483647 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new OnlineOrderValidationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function validateOnlineOrderPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new OnlineOrderValidationError("order payload must be an object");
  }
  const externalOrderId = text(payload.externalOrderId, "externalOrderId", { max: 200 });
  const externalReference = text(payload.reference ?? payload.externalReference, "reference", { max: 200 });
  const paymentStatus = text(payload.paymentStatus, "paymentStatus", { max: 40 });
  if (paymentStatus !== "Captured") {
    throw new OnlineOrderValidationError("only Captured orders can enter the inbox", "not_captured");
  }
  const currency = text(payload.currency, "currency", { max: 3 }).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new OnlineOrderValidationError("currency must be an ISO 4217 code");
  const paymentIntentId = text(payload.paymentIntentId, "paymentIntentId", { required: false, max: 200 });
  const totalMinor = integer(payload.totalMinor, "totalMinor");
  const createdAt = text(payload.createdAt, "createdAt", { max: 80 });
  if (Number.isNaN(Date.parse(createdAt))) throw new OnlineOrderValidationError("createdAt must be an ISO date");
  if (!payload.customer || typeof payload.customer !== "object" || Array.isArray(payload.customer)) {
    throw new OnlineOrderValidationError("customer must be an object");
  }
  if (!Array.isArray(payload.items)) throw new OnlineOrderValidationError("items must be an array");
  const items = payload.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new OnlineOrderValidationError(`items[${index}] must be an object`);
    }
    return {
      sourceItemId: text(item.sourceItemId, `items[${index}].sourceItemId`, { max: 200 }),
      nameEn: text(item.nameEn, `items[${index}].nameEn`),
      nameZh: text(item.nameZh, `items[${index}].nameZh`),
      optionLabelEn: text(item.optionLabelEn, `items[${index}].optionLabelEn`, { required: false }),
      optionLabelZh: text(item.optionLabelZh, `items[${index}].optionLabelZh`, { required: false }),
      quantity: integer(item.quantity, `items[${index}].quantity`, { min: 1, max: 100000 }),
      unitPriceMinor: integer(item.unitPriceMinor, `items[${index}].unitPriceMinor`),
      lineTotalMinor: integer(item.lineTotalMinor, `items[${index}].lineTotalMinor`)
    };
  });
  const rawBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (rawBytes > MAX_RAW_PAYLOAD_BYTES) throw new OnlineOrderValidationError("order payload is too large");
  return {
    externalOrderId,
    externalReference,
    paymentIntentId,
    paymentStatus,
    currency,
    totalMinor,
    customer: payload.customer,
    items,
    createdAt,
    rawPayload: payload
  };
}

export async function saveOnlineOrderInbox({ client, payload, connectorId, cursor }) {
  const order = validateOnlineOrderPayload(payload);
  const ownTransaction = !client.__qyposTransaction;
  if (ownTransaction) await client.query("BEGIN");
  try {
    const result = await client.query(
      `INSERT INTO online_order_inbox
        (external_order_id, external_reference, payment_intent_id, payment_status, currency, total_minor, customer_payload, raw_payload, status, last_error, received_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'received', NULL, now(), now())
       ON CONFLICT (external_order_id) DO UPDATE SET
         external_reference = EXCLUDED.external_reference,
         payment_intent_id = EXCLUDED.payment_intent_id,
         payment_status = EXCLUDED.payment_status,
         currency = EXCLUDED.currency,
         total_minor = EXCLUDED.total_minor,
         customer_payload = EXCLUDED.customer_payload,
         raw_payload = EXCLUDED.raw_payload,
         status = 'received',
         last_error = NULL,
         updated_at = now()
       RETURNING *, (xmax = 0) AS inserted`,
      [order.externalOrderId, order.externalReference, order.paymentIntentId, order.paymentStatus, order.currency,
        order.totalMinor, JSON.stringify(order.customer), JSON.stringify(order.rawPayload)]
    );
    const inbox = result.rows[0];
    await client.query("DELETE FROM online_order_inbox_items WHERE inbox_order_id = $1", [inbox.id]);
    for (const item of order.items) {
      await client.query(
        `INSERT INTO online_order_inbox_items
          (inbox_order_id, source_item_id, name_en, name_zh, option_label_en, option_label_zh, quantity, unit_price_minor, line_total_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [inbox.id, item.sourceItemId, item.nameEn, item.nameZh, item.optionLabelEn, item.optionLabelZh,
          item.quantity, item.unitPriceMinor, item.lineTotalMinor]
      );
    }
    if (connectorId) {
      await client.query(
        `INSERT INTO online_order_sync_state (connector_id, last_cursor, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (connector_id) DO UPDATE SET last_cursor = EXCLUDED.last_cursor, updated_at = now()`,
        [connectorId, cursor === undefined || cursor === null ? null : String(cursor)]
      );
    }
    if (ownTransaction) await client.query("COMMIT");
    return { inbox, itemCount: order.items.length };
  } catch (error) {
    if (ownTransaction) await client.query("ROLLBACK");
    throw error;
  }
}
