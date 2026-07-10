// Auto-generated route module: orders
import crypto from "node:crypto";

export default function register({
  app,
  pool,
  redis,
  redisSub,
  sockets,
  query,
  one,
  getSettings,
  requirePermission,
  requireAnyPermission,
  auditLog,
  clientIp,
  checkRateLimit,
  emit,
  recalculateOrder,
  createPrintJob,
  getOrderItems,
  recordPayment,
  updateOrderKitchenState,
  ensureSchema,
  runMigrations,
  httpError,
  safePaymentAttempt,
  UUID_PATTERN,
  LEGACY_UUID_PATTERN,
  ADMIN_GRANT_TTL_SECONDS,
  LOGIN_RATE_WINDOW,
  LOGIN_RATE_MAX_ATTEMPTS,
  ADMIN_GRANT_RATE_MAX_ATTEMPTS,
  listBackupFiles,
  createBackup,
  userFromToken,
  adminGrantFromRequest,
  hashPin,
  verifyPin,
  normalizePermissions,
  ADMIN_GRANT_SCOPES,
  CASHIER_PERMISSIONS,
  OWNER_PERMISSIONS,
  canPatchMenuItem,
  cancelDojoTerminalSession,
  createDojoTerminalPayment,
  dojoConfig,
  getDojoPaymentIntent,
  getDojoTerminalSession,
  isDojoConfigured,
  listDojoTerminals,
  mapDojoSessionStatus,
  respondToDojoSignature,
  assertPositivePayment,
  selectPrinter,
  isValidPrinter,
  calculateTotals,
  localToday,
  parseDateOnly,
  parseTimeOnly,
  scheduleAutoBackup,
  scheduleIdleTableClear,
  insertOrderWithRetry,
  printerProfiles,
  backupDir,
  nextOrderNo,
  datePrefix
}) {
app.post("/orders", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const body = request.body ?? {};
  const serviceType = body.service_type ?? "takeaway";
  let suffix = "";
  if (serviceType === "dine_in" && body.table_id) {
    const t = await one("SELECT label FROM tables WHERE id = $1", [body.table_id]);
    suffix = t?.label ?? "";
  } else if (body.pickup_no) {
    suffix = String(body.pickup_no);
  }
  const order = await insertOrderWithRetry(serviceType, suffix, (no) => one(
    `INSERT INTO orders (order_no, service_type, table_id, pickup_no, guests, notes, status, service_charge_exempt)
     VALUES ($1, $2, $3, $4, COALESCE($5, 1), COALESCE($6, ''), 'draft', $7) RETURNING *`,
    [no, serviceType, body.table_id, body.pickup_no, body.guests, body.notes, serviceType !== "dine_in"]
  ));
  emit("order.created", order);
  await auditLog(request, "order.create", "order", order.id, { service_type: order.service_type });
  return order;
});

app.get("/orders", async (request) => {
  const params = [];
  const where = [];
  if (request.query.status) {
    params.push(request.query.status);
    where.push(`status = $${params.length}`);
  }
  if (request.query.from) {
    params.push(request.query.from);
    where.push(`created_at >= $${params.length}::date`);
  }
  if (request.query.to) {
    params.push(request.query.to);
    where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return query(`SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT 250`, params);
});

app.get("/orders/:id", async (request) => {
  const order = await one("SELECT * FROM orders WHERE id = $1", [request.params.id]);
  return { ...order, items: await getOrderItems(order.id), payments: await query("SELECT * FROM payments WHERE order_id = $1", [order.id]) };
});

app.patch("/orders/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const body = request.body ?? {};
  if (body.add_item || body.update_item) {
    const currentOrder = await one("SELECT status FROM orders WHERE id = $1", [request.params.id]);
    if (currentOrder?.status === "paid" || currentOrder?.status === "cancelled") {
      reply.code(409);
      return { error: "Cannot modify a paid or cancelled order" };
    }
  }
  if (body.update_item) {
    const item = body.update_item;
    const existingItem = await one("SELECT id, quantity, kitchen_printed_at, status FROM order_items WHERE id = $1 AND order_id = $2", [item.id, request.params.id]);
    if (!existingItem) {
      return recalculateOrder(request.params.id);
    }
    const isVoid = item.void === true || item.remove === true || Number(item.quantity) <= 0;
    if (existingItem.kitchen_printed_at && !item.void) {
      const error = new Error("Kitchen printed items are locked");
      error.statusCode = 409;
      throw error;
    }
    if (item.void) {
      const actor = await userFromToken(request);
      if (!actor?.permissions?.includes("manage_orders")) {
        reply.code(403);
        return { error: "void requires manage_orders permission" };
      }
    }
    if (existingItem.status === "served" && !item.void) {
      const error = new Error("Served items cannot be modified");
      error.statusCode = 409;
      throw error;
    }
    if (isVoid) {
      // Partial void: void_qty < current quantity → reduce instead of delete
      const voidQty = item.void_qty != null ? Number(item.void_qty) : null;
      if (item.void && voidQty != null && Number.isFinite(voidQty) && voidQty > 0 && voidQty < Number(existingItem.quantity ?? 0)) {
        await query(
          "UPDATE order_items SET quantity = quantity - $3 WHERE id = $1 AND order_id = $2",
          [item.id, request.params.id, voidQty]
        );
        await auditLog(request, "order.item.partial_void", "order_item", item.id, { order_id: request.params.id, void_qty: voidQty, reason: item.reason ?? null });
      } else {
        await query("DELETE FROM order_items WHERE id = $1 AND order_id = $2", [item.id, request.params.id]);
        const action = item.void ? "order.item.void" : "order.item.remove";
        await auditLog(request, action, "order_item", item.id, { order_id: request.params.id, reason: item.reason ?? null });
      }
    } else {
      // Support updating variant and modifiers in-place
      let variant = null;
      if (item.variant_id) {
        variant = await one(
          `SELECT v.*, i.name_i18n AS item_name_i18n, i.id AS item_id FROM menu_item_variants v JOIN menu_items i ON i.id = v.item_id WHERE v.id = $1`,
          [item.variant_id]
        );
        if (!variant) {
          reply.code(404);
          return { error: "Variant not found" };
        }
        // Ensure variant belongs to the same menu item as the original order item
        const orig = await one("SELECT item_id FROM order_items WHERE id = $1 AND order_id = $2", [item.id, request.params.id]);
        if (orig && variant.item_id !== orig.item_id) {
          reply.code(400);
          return { error: "Variant does not belong to the same item" };
        }
      }

      // Update the order_items row; if variant provided, also update variant_name_i18n and unit_price
      if (variant) {
        await query(
          `UPDATE order_items
           SET variant_id = COALESCE($3, variant_id), variant_name_i18n = COALESCE($4, variant_name_i18n), unit_price = COALESCE($5, unit_price),
               quantity = COALESCE($6, quantity), notes = COALESCE($7, notes), status = COALESCE($8, status)
           WHERE id = $1 AND order_id = $2`,
          [item.id, request.params.id, item.variant_id, variant.name_i18n, variant.price, item.quantity, item.notes, item.status]
        );
      } else {
        await query(
          `UPDATE order_items
           SET quantity = COALESCE($3, quantity), notes = COALESCE($4, notes), status = COALESCE($5, status)
           WHERE id = $1 AND order_id = $2`,
          [item.id, request.params.id, item.quantity, item.notes, item.status]
        );
      }

      // If modifier_ids provided, replace modifiers for the order item
      if (Array.isArray(item.modifier_ids)) {
        await query("DELETE FROM order_item_modifiers WHERE order_item_id = $1", [item.id]);
        for (const modifierId of item.modifier_ids) {
          const modifier = await one(
            `SELECT m.*, g.name_i18n AS group_name_i18n FROM modifiers m JOIN modifier_groups g ON g.id = m.group_id WHERE m.id = $1`,
            [modifierId]
          );
          if (!modifier) continue;
          await query(
            `INSERT INTO order_item_modifiers (order_item_id, modifier_id, group_name_i18n, name_i18n, price_delta)
             VALUES ($1, $2, $3, $4, $5)`,
            [item.id, modifier.id, modifier.group_name_i18n, modifier.name_i18n, modifier.price_delta]
          );
        }
      }

      await auditLog(request, "order.item.update", "order_item", item.id, { order_id: request.params.id, quantity: item.quantity, variant_id: item.variant_id, modifiers: item.modifier_ids });
    }
    return recalculateOrder(request.params.id);
  }

  if (body.add_item) {
    // Custom / miscellaneous line item: free-form name and price, no menu reference
    if (body.add_item.custom) {
      const c = body.add_item.custom;
      const name = String(c.name ?? "").trim();
      const price = Number(c.price);
      if (!name) {
        const error = new Error("Custom item name is required");
        error.statusCode = 400;
        throw error;
      }
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error("Custom item price must be a non-negative number");
        error.statusCode = 400;
        throw error;
      }
      const qty = Number(body.add_item.quantity ?? 1);
      const nameI18n = { "zh-CN": name, "en-GB": name };
      const variantI18n = { "zh-CN": "杂项 / Misc", "en-GB": "Misc" };
      // Custom items don't need kitchen printing — mark as already printed to skip kitchen queue
      const item = await one(
        `INSERT INTO order_items (order_id, name_i18n, variant_name_i18n, quantity, unit_price, notes, kitchen_printed_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, ''), now()) RETURNING *`,
        [request.params.id, nameI18n, variantI18n, qty, price, body.add_item.notes]
      );
      await auditLog(request, "order.item.add_custom", "order_item", item.id, { order_id: request.params.id, name, price, quantity: qty });
      return recalculateOrder(request.params.id);
    }

    const variant = await one(
      `SELECT v.*, i.name_i18n AS item_name_i18n, i.id AS item_id
       FROM menu_item_variants v JOIN menu_items i ON i.id = v.item_id WHERE v.id = $1`,
      [body.add_item.variant_id]
    );
    if (!variant) {
      const error = new Error("Variant not found");
      error.statusCode = 404;
      throw error;
    }
    const item = await one(
      `INSERT INTO order_items (order_id, item_id, variant_id, name_i18n, variant_name_i18n, quantity, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '')) RETURNING *`,
      [request.params.id, variant.item_id, variant.id, variant.item_name_i18n, variant.name_i18n, body.add_item.quantity ?? 1, variant.price, body.add_item.notes]
    );
    for (const modifierId of body.add_item.modifier_ids ?? []) {
      const modifier = await one(
        `SELECT m.*, g.name_i18n AS group_name_i18n FROM modifiers m JOIN modifier_groups g ON g.id = m.group_id WHERE m.id = $1`,
        [modifierId]
      );
      await query(
        `INSERT INTO order_item_modifiers (order_item_id, modifier_id, group_name_i18n, name_i18n, price_delta)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, modifier.id, modifier.group_name_i18n, modifier.name_i18n, modifier.price_delta]
      );
    }
    await auditLog(request, "order.item.add", "order_item", item.id, { order_id: request.params.id, variant_id: variant.id, quantity: item.quantity });
    return recalculateOrder(request.params.id);
  }

  const updated = await one(
    `UPDATE orders SET notes = COALESCE($2, notes), status = COALESCE($3, status), guests = COALESCE($4, guests), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.notes, body.status, body.guests]
  );
  emit("order.updated", updated);
  await auditLog(request, "order.update", "order", updated.id, body);
  return updated;
});

app.post("/orders/:id/recalculate", async (request, reply) => {
  const body = request.body ?? {};
  if ("service_charge_rate" in body || "service_charge_exempt" in body) {
    if (!await requirePermission(request, reply, "adjust_service_charge")) return;
  }
  if (["discount", "discount_amount", "discount_fixed", "discount_rate"].some((key) => key in body)) {
    if (!await requirePermission(request, reply, "adjust_discount")) return;
  }
  const order = await recalculateOrder(request.params.id, body);
  await auditLog(request, "order.recalculate", "order", order.id, body);
  return order;
});

app.post("/orders/:id/service-charge", async (request, reply) => {
  if (!await requirePermission(request, reply, "adjust_service_charge")) return;
  const body = request.body ?? {};
  const order = await recalculateOrder(request.params.id, {
    service_charge_rate: body.service_charge_rate,
    service_charge_exempt: body.service_charge_exempt
  });
  await auditLog(request, "order.service_charge.adjust", "order", order.id, {
    service_charge_rate: body.service_charge_rate,
    service_charge_exempt: body.service_charge_exempt,
    reason: body.reason ?? ""
  });
  return order;
});

app.post("/orders/:id/discount", async (request, reply) => {
  if (!await requirePermission(request, reply, "adjust_discount")) return;
  const body = request.body ?? {};
  if ("discount_rate" in body) {
    await query(
      "UPDATE orders SET discount_rate = $2, discount_reason = COALESCE($3, discount_reason) WHERE id = $1",
      [request.params.id, body.discount_rate, body.reason]
    );
  }
  if ("discount_fixed" in body || "discount" in body || "discount_amount" in body) {
    const fixed = Math.max(0, Number(body.discount_fixed ?? body.discount ?? body.discount_amount ?? 0));
    await query(
      "UPDATE orders SET discount_fixed = $2, discount_reason = COALESCE($3, discount_reason) WHERE id = $1",
      [request.params.id, fixed, body.reason]
    );
  }
  const order = await recalculateOrder(request.params.id);
  await auditLog(request, "order.discount.adjust", "order", order.id, { discount: order.discount, discount_rate: order.discount_rate, discount_fixed: order.discount_fixed, reason: body.reason ?? "" });
  return order;
});

// POST /orders/:id/split
// body: { splits: [{ label, items: [{ id, quantity }] }] }
app.post("/orders/:id/split", async (request, reply) => {
  if (!await requireAnyPermission(request, reply, ["split_order", "manage_orders"])) return;
  const { splits } = request.body ?? {};
  if (!Array.isArray(splits) || splits.length < 2) {
    reply.code(400); return { error: "Need at least 2 splits" };
  }
  const parent = await one("SELECT * FROM orders WHERE id = $1", [request.params.id]);
  if (!parent) { reply.code(404); return { error: "Order not found" }; }
  if (["paid", "cancelled", "split"].includes(parent.status)) {
    reply.code(409); return { error: "Cannot split this order" };
  }
  const items = await getOrderItems(parent.id);
  if (!items.length) { reply.code(400); return { error: "Order has no items" }; }

  // Validate quantities
  const qtySums = {};
  for (const split of splits) {
    for (const si of split.items ?? []) {
      qtySums[si.id] = (qtySums[si.id] ?? 0) + Number(si.quantity);
    }
  }
  for (const item of items) {
    if ((qtySums[item.id] ?? 0) !== Number(item.quantity)) {
      reply.code(400); return { error: `Quantity mismatch for item ${item.id}` };
    }
  }

  const labels = ["A", "B", "C", "D", "E", "F"];
  const newOrderIds = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      if (!(split.items ?? []).length) continue;
      const subOrderNo = `${parent.order_no}-${labels[i]}`;
      const subStatus = ["draft", "submitted"].includes(parent.status) ? parent.status : "submitted";
      const subRes = await client.query(
        `INSERT INTO orders (order_no, service_type, table_id, pickup_no, guests, status, notes,
           subtotal, net_sales, tax, service_charge, total, discount, discount_fixed,
           discount_reason, service_charge_rate, service_charge_exempt, parent_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7, 0,0,0,0,0, 0,0, '', $8,$9,$10) RETURNING *`,
        [subOrderNo, parent.service_type, parent.table_id, parent.pickup_no,
         parent.guests, subStatus, parent.notes,
         parent.service_charge_rate, parent.service_charge_exempt, parent.id]
      );
      const subId = subRes.rows[0].id;
      newOrderIds.push(subId);

      for (const si of split.items) {
        const orig = items.find(it => it.id === si.id);
        const splitQty = Number(si.quantity);
        const origQty = Number(orig.quantity);
        if (splitQty === origQty) {
          await client.query("UPDATE order_items SET order_id = $1 WHERE id = $2", [subId, si.id]);
        } else {
          // reduce original
          await client.query("UPDATE order_items SET quantity = quantity - $2 WHERE id = $1", [si.id, splitQty]);
          // create partial item in sub-order
          const newItemRes = await client.query(
            `INSERT INTO order_items (order_id, item_id, variant_id, name_i18n, variant_name_i18n, unit_price, quantity, notes, status, kitchen_printed_at)
             SELECT $1, item_id, variant_id, name_i18n, variant_name_i18n, unit_price, $2, notes, status, kitchen_printed_at
             FROM order_items WHERE id = $3 RETURNING id`,
            [subId, splitQty, si.id]
          );
          await client.query(
            `INSERT INTO order_item_modifiers (order_item_id, modifier_id, group_name_i18n, name_i18n, price_delta)
             SELECT $1, modifier_id, group_name_i18n, name_i18n, price_delta FROM order_item_modifiers WHERE order_item_id = $2`,
            [newItemRes.rows[0].id, si.id]
          );
        }
      }
    }
    await client.query("UPDATE orders SET status = 'split', updated_at = now() WHERE id = $1", [parent.id]);
    // Clean up zero-quantity items left on parent after partial moves
    await client.query("DELETE FROM order_items WHERE order_id = $1 AND quantity <= 0", [parent.id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const recalculated = [];
  for (const id of newOrderIds) recalculated.push(await recalculateOrder(id));
  emit("order.updated", { id: parent.id, status: "split" });
  for (const o of recalculated) emit("order.updated", o);
  await auditLog(request, "order.split", "order", parent.id, { sub_orders: newOrderIds });
  return { parent: await one("SELECT * FROM orders WHERE id = $1", [parent.id]), orders: recalculated };
});

// POST /orders/:id/merge — merge all non-paid children back to this order (or its parent)
app.post("/orders/:id/merge", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_orders")) return;
  const order = await one("SELECT * FROM orders WHERE id = $1", [request.params.id]);
  if (!order) { reply.code(404); return { error: "Order not found" }; }
  const targetId = order.parent_order_id ?? order.id;
  const children = await query(
    "SELECT * FROM orders WHERE parent_order_id = $1 AND status NOT IN ('paid','cancelled')",
    [targetId]
  );
  if (!children.length) { reply.code(400); return { error: "No split orders to merge" }; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const child of children) {
      await client.query("UPDATE order_items SET order_id = $1 WHERE order_id = $2", [targetId, child.id]);
      await client.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [child.id]);
    }
    await client.query("UPDATE orders SET status = 'draft', parent_order_id = NULL, updated_at = now() WHERE id = $1", [targetId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const merged = await recalculateOrder(targetId);
  emit("order.updated", merged);
  await auditLog(request, "order.merge", "order", targetId, { merged_from: children.map(c => c.id) });
  return merged;
});

app.post("/orders/:id/cancel", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_orders")) return;
  const body = request.body ?? {};
  const order = await one("UPDATE orders SET status = 'cancelled', notes = CONCAT(notes, CASE WHEN $2 = '' THEN '' ELSE E'\nCancel: ' || $2 END), updated_at = now() WHERE id = $1 RETURNING *", [
    request.params.id,
    body.reason ?? ""
  ]);
  if (order?.table_id) {
    await query("UPDATE tables SET current_order_id = NULL, status = 'available', opened_at = NULL, updated_at = now() WHERE id = $1", [order.table_id]);
    emit("table.status.updated", { table_id: order.table_id, status: "available" });
  }
  emit("order.updated", order);
  await auditLog(request, "order.cancel", "order", order.id, { reason: body.reason ?? "" });
  return order;
});

app.post("/orders/:id/submit", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const itemCount = await one("SELECT COUNT(*)::integer AS count FROM order_items WHERE order_id = $1", [request.params.id]);
  if (Number(itemCount?.count ?? 0) === 0) {
    reply.code(400);
    return { error: "Cannot submit an order with no items" };
  }
  const body = request.body ?? {};
  const shouldPrint = body.print !== false;
  const order = await recalculateOrder(request.params.id);
  // 先更新状态，再尝试打印（打印失败不影响下单）
  const updated = await one("UPDATE orders SET status = 'submitted', updated_at = now() WHERE id = $1 RETURNING *", [order.id]);
  if (updated.table_id) {
    await query("UPDATE tables SET status = 'ordered', updated_at = now() WHERE id = $1", [updated.table_id]);
    emit("table.status.updated", { table_id: updated.table_id, status: "ordered" });
  }
  emit("order.updated", updated);
  let job = null;
  if (shouldPrint) {
    try {
      job = await createPrintJob(order.id, "kitchen");
    } catch (printErr) {
      if (printErr?.message === "No new items to print to kitchen") {
        reply.code(printErr.statusCode ?? 409);
        return { error: printErr.message };
      }
      // 打印机未配置时不报错，仅跳过打印
    }
  }
  await auditLog(request, "order.submit", "order", updated.id, { print_job_id: job?.id });
  return { order: updated, print_job: job };
});

app.get("/payment-providers", async () => ({
  dojo: {
    configured: isDojoConfigured(),
    api_version: dojoConfig().version
  },
  manual: { configured: true }
}));

app.get("/payment-providers/dojo/terminals", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  if (!isDojoConfigured()) {
    reply.code(503);
    return { error: "Dojo terminal payments are not configured" };
  }
  try {
    const terminals = await listDojoTerminals();
    return terminals.map((terminal) => ({
      id: terminal.id,
      name: terminal.name || terminal.displayName || terminal.id,
      status: terminal.status || "Available",
      tid: terminal.tid || null
    }));
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message };
  }
});

app.post("/orders/:id/payment-attempts/dojo", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  if (!isDojoConfigured()) {
    reply.code(503);
    return { error: "Dojo terminal payments are not configured" };
  }
  const amount = Number(request.body?.amount);
  try {
    assertPositivePayment({ amount, change_due: 0 });
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }

  const order = await one(
    `SELECT o.*, COALESCE(SUM(p.amount - p.change_due), 0)::numeric AS paid
     FROM orders o LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.id = $1 GROUP BY o.id`,
    [request.params.id]
  );
  if (!order) { reply.code(404); return { error: "Order not found" }; }
  if (["paid", "cancelled"].includes(order.status)) { reply.code(409); return { error: "Order is already closed" }; }
  const remaining = Math.max(0, Math.round((Number(order.total) - Number(order.paid)) * 100) / 100);
  if (amount > remaining) {
    reply.code(400);
    return { error: "Dojo payment cannot exceed the remaining order balance" };
  }

  const settings = await getSettings();
  const attempt = await one(
    `INSERT INTO payment_attempts (order_id, provider, status, amount, currency, idempotency_key, terminal_id)
     VALUES ($1, 'dojo', 'created', $2, $3, $4, $5) RETURNING *`,
    [order.id, amount, String(settings?.currency || "GBP").toUpperCase(), crypto.randomUUID(), request.body?.terminal_id || null]
  );

  try {
    let terminalId = attempt.terminal_id;
    if (!terminalId) {
      const terminals = await listDojoTerminals();
      terminalId = terminals[0]?.id;
    }
    if (!terminalId) throw httpError("No available Dojo terminal was found", 409);

    const result = await createDojoTerminalPayment({
      amountMinor: Math.round(amount * 100),
      currency: attempt.currency,
      reference: order.order_no,
      description: `QYPOS ${order.order_no}`,
      terminalId,
      idempotencyKey: attempt.idempotency_key
    });
    const updated = await one(
      `UPDATE payment_attempts SET status = 'pending', provider_payment_id = $2,
       provider_session_id = $3, terminal_id = $4, provider_payload = $5::jsonb, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [attempt.id, result.paymentIntent.id, result.terminalSession.id, terminalId, JSON.stringify({ session: result.terminalSession })]
    );
    await auditLog(request, "payment.dojo.start", "payment_attempt", attempt.id, { order_id: order.id, terminal_id: terminalId, amount });
    reply.code(201);
    return safePaymentAttempt(updated);
  } catch (error) {
    const failed = await one(
      `UPDATE payment_attempts SET status = 'failed', provider_payment_id = COALESCE($2, provider_payment_id),
       error_code = $3, error_message = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [attempt.id, error.paymentIntent?.id || null, String(error.statusCode || "dojo_error"), error.message]
    );
    await auditLog(request, "payment.dojo.failed", "payment_attempt", attempt.id, { order_id: order.id, error: error.message });
    reply.code(error.statusCode || 502);
    return { error: error.message, attempt: safePaymentAttempt(failed) };
  }
});

app.get("/payment-attempts/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  let attempt = await one("SELECT * FROM payment_attempts WHERE id = $1", [request.params.id]);
  if (!attempt) { reply.code(404); return { error: "Payment attempt not found" }; }
  if (attempt.provider !== "dojo" || !["created", "pending"].includes(attempt.status)) return safePaymentAttempt(attempt);
  if (!attempt.provider_session_id) return safePaymentAttempt(attempt);

  try {
    const session = await getDojoTerminalSession(attempt.provider_session_id);
    let status = mapDojoSessionStatus(session.status);
    let paymentIntent = null;
    if (session.status === "Captured") {
      paymentIntent = await getDojoPaymentIntent(attempt.provider_payment_id);
      if (paymentIntent.status !== "Captured") status = "pending";
    }

    if (status === "succeeded") {
      const card = paymentIntent?.paymentDetails?.card || {};
      const cardDigits = String(card.cardNumber || "").replace(/\D/g, "");
      const result = await recordPayment({
        orderId: attempt.order_id,
        method: "card",
        amount: Number(attempt.amount),
        paymentAttemptId: attempt.id,
        provider: "dojo",
        providerPaymentId: attempt.provider_payment_id,
        terminalId: attempt.terminal_id,
        cardBrand: card.cardType || null,
        cardLast4: cardDigits.slice(-4) || null,
        authCode: paymentIntent?.paymentDetails?.authCode || null
      });
      attempt = await one(
        `UPDATE payment_attempts SET status = 'succeeded', provider_payload = $2::jsonb,
         error_code = NULL, error_message = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
        [attempt.id, JSON.stringify({ session, paymentIntent })]
      );
      if (!result.duplicate) {
        await auditLog(request, "payment.dojo.captured", "payment", result.payment.id, {
          order_id: attempt.order_id,
          payment_attempt_id: attempt.id,
          provider_payment_id: attempt.provider_payment_id,
          amount: attempt.amount
        });
      }
      return { ...safePaymentAttempt(attempt), order: result.order, payment: result.payment };
    }

    attempt = await one(
      `UPDATE payment_attempts SET status = $2, provider_payload = $3::jsonb,
       error_code = CASE WHEN $2 IN ('declined', 'cancelled', 'unknown') THEN $4 ELSE NULL END,
       error_message = CASE WHEN $2 = 'unknown' THEN '请检查刷卡机或终端小票后人工确认支付结果' ELSE NULL END,
       updated_at = now() WHERE id = $1 RETURNING *`,
      [attempt.id, status, JSON.stringify({ session }), session.status]
    );
    return safePaymentAttempt(attempt);
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message, attempt: safePaymentAttempt(attempt) };
  }
});

app.post("/payment-attempts/:id/cancel", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  const attempt = await one("SELECT * FROM payment_attempts WHERE id = $1", [request.params.id]);
  if (!attempt) { reply.code(404); return { error: "Payment attempt not found" }; }
  if (attempt.provider !== "dojo") { reply.code(400); return { error: "Unsupported payment provider" }; }
  if (!["created", "pending"].includes(attempt.status)) return safePaymentAttempt(attempt);
  try {
    if (attempt.provider_session_id) await cancelDojoTerminalSession(attempt.provider_session_id);
    const updated = await one("UPDATE payment_attempts SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *", [attempt.id]);
    await auditLog(request, "payment.dojo.cancel", "payment_attempt", attempt.id, { order_id: attempt.order_id });
    return safePaymentAttempt(updated);
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message, attempt: safePaymentAttempt(attempt) };
  }
});

app.post("/payment-attempts/:id/signature", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  const attempt = await one("SELECT * FROM payment_attempts WHERE id = $1", [request.params.id]);
  if (!attempt) { reply.code(404); return { error: "Payment attempt not found" }; }
  if (attempt.provider !== "dojo" || !attempt.provider_session_id) {
    reply.code(400);
    return { error: "This payment attempt has no Dojo terminal session" };
  }
  if (typeof request.body?.accepted !== "boolean") {
    reply.code(400);
    return { error: "accepted must be a boolean" };
  }
  try {
    const session = await respondToDojoSignature(attempt.provider_session_id, request.body.accepted);
    const updated = await one(
      "UPDATE payment_attempts SET provider_payload = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *",
      [attempt.id, JSON.stringify({ session })]
    );
    await auditLog(request, "payment.dojo.signature", "payment_attempt", attempt.id, { accepted: request.body.accepted });
    return safePaymentAttempt(updated);
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message, attempt: safePaymentAttempt(attempt) };
  }
});

app.post("/orders/:id/payments", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  const body = request.body ?? {};
  try {
    assertPositivePayment(body);
  } catch (error) {
    reply.code(error.statusCode ?? 400);
    return { error: error.message };
  }
  const currentOrder = await one("SELECT status FROM orders WHERE id = $1", [request.params.id]);
  if (!currentOrder) { reply.code(404); return { error: "Order not found" }; }
  if (currentOrder.status === "paid" || currentOrder.status === "cancelled") {
    reply.code(409);
    return { error: "Order is already closed" };
  }
  try {
    const result = await recordPayment({
      orderId: request.params.id,
      method: body.method,
      amount: body.amount,
      changeDue: body.change_due ?? 0
    });
    await auditLog(request, "payment.create", "payment", result.payment.id, { order_id: request.params.id, method: result.payment.method, amount: result.payment.amount });
    return { payment: result.payment, order: result.order, paid: result.paid };
  } catch (error) {
    if (error.statusCode) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post("/orders/:id/print", async (request, reply) => {
  if (!await requirePermission(request, reply, "print_receipt")) return;
  const job = await createPrintJob(request.params.id, request.body?.type ?? "receipt");
  await auditLog(request, "print.create", "print_job", job.id, { order_id: request.params.id, type: job.type });
  return job;
});

app.get("/print-jobs", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_prints")) return;
  return query("SELECT id, order_id, type, status, attempts, error, created_at, updated_at FROM print_jobs ORDER BY created_at DESC LIMIT 100");
});

app.post("/print-jobs/test", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_prints")) return;
  const settings = await getSettings();
  const printer = selectPrinter(settings, request.body?.printer_id ? "test" : "receipt");
  const selectedPrinter = request.body?.printer_id
    ? printerProfiles(settings).find((profile) => profile.id === request.body.printer_id) ?? printer
    : printer;
  if (!selectedPrinter || !isValidPrinter(selectedPrinter)) {
    reply.code(409);
    return { error: "Selected printer is not configured or enabled" };
  }
  const job = await one(
    "INSERT INTO print_jobs (type, payload) VALUES ('test', $1) RETURNING *",
    [{ settings, printer: selectedPrinter, created_at: new Date().toISOString() }]
  );
  await redis.lpush("print_jobs", job.id);
  emit("print.queued", job);
  await auditLog(request, "print.test", "print_job", job.id, { printer: selectedPrinter });
  return job;
});

app.post("/print-jobs/cash-drawer", async (request, reply) => {
  if (!await requirePermission(request, reply, "take_payment")) return;
  const settings = await getSettings();
  const printer = selectPrinter(settings, "receipt");
  if (!printer || !isValidPrinter(printer)) {
    reply.code(409);
    return { error: "No enabled printer configured — cannot open cash drawer" };
  }
  const job = await one(
    "INSERT INTO print_jobs (type, payload) VALUES ('cash_drawer', $1) RETURNING *",
    [{ settings, printer, created_at: new Date().toISOString() }]
  );
  await redis.lpush("print_jobs", job.id);
  emit("print.queued", job);
  await auditLog(request, "cash_drawer.open", "print_job", job.id, { printer: printer.name ?? printer.host });
  return job;
});

app.post("/print-jobs/:id/retry", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_prints")) return;
  const job = await one("SELECT * FROM print_jobs WHERE id = $1", [request.params.id]);
  if (!job) {
    reply.code(404);
    return { error: "Print job not found" };
  }
  // Refresh settings & printer in payload so retry uses current configuration
  const currentSettings = await getSettings();
  const refreshedPrinter = selectPrinter(currentSettings, job.type === "kitchen" ? "kitchen" : "receipt");
  const payload = { ...job.payload, settings: currentSettings, printer: refreshedPrinter ?? job.payload.printer };
  const updated = await one(
    "UPDATE print_jobs SET status = 'queued', error = NULL, payload = $2, updated_at = now() WHERE id = $1 RETURNING id, order_id, type, status, attempts, error, created_at, updated_at",
    [job.id, payload]
  );
  await redis.lpush("print_jobs", job.id);
  emit("print.queued", updated);
  await auditLog(request, "print.retry", "print_job", job.id);
  return updated;
});

app.get("/kitchen/items", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_kitchen")) return;
  return query(
  `SELECT
    oi.id,
    oi.order_id,
    oi.name_i18n,
    oi.variant_name_i18n,
    oi.quantity,
    oi.notes,
    oi.status,
    oi.created_at,
    o.order_no,
    o.service_type,
    o.table_id,
    o.pickup_no,
    t.label AS table_label
   FROM order_items oi
   JOIN orders o ON o.id = oi.order_id
   LEFT JOIN tables t ON t.id = o.table_id
   WHERE o.status NOT IN ('draft', 'paid', 'cancelled') AND oi.status <> 'served'
   ORDER BY oi.created_at ASC`
  );
});

app.patch("/orders/:orderId/items/:itemId/status", async (request, reply) => {
  if (!await requirePermission(request, reply, "update_item_status")) return;
  const status = request.body?.status;
  const allowed = new Set(["ordered", "preparing", "ready_to_serve", "served", "cancelled"]);
  if (!allowed.has(status)) {
    reply.code(400);
    return { error: "Invalid item status" };
  }
  const item = await one(
    "UPDATE order_items SET status = $3 WHERE id = $1 AND order_id = $2 RETURNING *",
    [request.params.itemId, request.params.orderId, status]
  );
  if (!item) {
    reply.code(404);
    return { error: "Order item not found" };
  }
  const order = await updateOrderKitchenState(request.params.orderId);
  emit("kitchen.item.updated", item);
  await auditLog(request, "kitchen.item.status", "order_item", item.id, { order_id: request.params.orderId, status });
  return { item, order };
});
}
