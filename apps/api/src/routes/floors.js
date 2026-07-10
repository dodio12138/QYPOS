// Auto-generated route module: floors

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
app.get("/floor-layouts", async () => {
  const areas = await query("SELECT * FROM floor_areas ORDER BY sort_order, name");
  const tables = await query(
    `SELECT t.*, l.x, l.y, l.width, l.height, l.shape, l.rotation,
      o.total AS current_total,
      COALESCE(item_counts.item_count, 0)::integer AS current_item_count,
      EXTRACT(EPOCH FROM (now() - t.opened_at))::INTEGER AS open_seconds
     FROM tables t
     JOIN floor_areas fa ON fa.id = t.area_id
     JOIN table_layouts l ON l.table_id = t.id
     LEFT JOIN orders o ON o.id = t.current_order_id
     LEFT JOIN (
       SELECT order_id, COUNT(*)::integer AS item_count
       FROM order_items
       GROUP BY order_id
     ) item_counts ON item_counts.order_id = t.current_order_id
     ORDER BY fa.sort_order, l.y, l.x, t.label`
  );
  return { areas, tables };
});

app.post("/floor-areas", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const body = request.body ?? {};
  const area = await one(
    "INSERT INTO floor_areas (name, sort_order) VALUES ($1, COALESCE($2, 0)) RETURNING *",
    [body.name, body.sort_order]
  );
  await auditLog(request, "floor_area.create", "floor_area", area.id, { name: area.name });
  return area;
});

app.patch("/floor-areas/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const body = request.body ?? {};
  const area = await one(
    "UPDATE floor_areas SET name = COALESCE($2, name), sort_order = COALESCE($3, sort_order) WHERE id = $1 RETURNING *",
    [request.params.id, body.name, body.sort_order]
  );
  if (!area) {
    reply.code(404);
    return { error: "Area not found" };
  }
  await auditLog(request, "floor_area.update", "floor_area", area.id, body);
  return area;
});

app.delete("/floor-areas/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const tableCount = await one("SELECT COUNT(*)::integer AS count FROM tables WHERE area_id = $1", [request.params.id]);
  if (Number(tableCount?.count ?? 0) > 0) {
    reply.code(409);
    return { error: "Area still has tables" };
  }
  const area = await one("DELETE FROM floor_areas WHERE id = $1 RETURNING *", [request.params.id]);
  if (!area) {
    reply.code(404);
    return { error: "Area not found" };
  }
  await auditLog(request, "floor_area.delete", "floor_area", area.id);
  return area;
});

app.put("/floor-layouts", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const area of request.body?.areas ?? []) {
      await client.query(
        `INSERT INTO floor_areas (id, name, sort_order) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, COALESCE($3::integer, 0))
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
        [area.id, area.name, area.sort_order ?? 0]
      );
    }
    for (const table of request.body?.tables ?? []) {
      const saved = await client.query(
        `INSERT INTO tables (id, area_id, label, seats, status)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2::uuid, $3, COALESCE($4::integer, 2), COALESCE($5, 'available'))
         ON CONFLICT (id) DO UPDATE SET area_id = EXCLUDED.area_id, label = EXCLUDED.label, seats = EXCLUDED.seats, updated_at = now()
         RETURNING id`,
        [table.id, table.area_id, table.label, table.seats ?? 2, table.status]
      );
      await client.query(
        `INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation)
         VALUES ($1::uuid, COALESCE($2::numeric, 0), COALESCE($3::numeric, 0), COALESCE($4::numeric, 96), COALESCE($5::numeric, 72), COALESCE($6, 'rect'), COALESCE($7::numeric, 0))
         ON CONFLICT (table_id) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, width = EXCLUDED.width,
           height = EXCLUDED.height, shape = EXCLUDED.shape, rotation = EXCLUDED.rotation`,
        [saved.rows[0].id, table.x ?? 0, table.y ?? 0, table.width ?? 96, table.height ?? 72, table.shape ?? "rect", table.rotation]
      );
    }
    await client.query("COMMIT");
    emit("table.status.updated", { changed: true });
    await auditLog(request, "floor_layout.update", "floor_layout", null, { areas: request.body?.areas?.length ?? 0, tables: request.body?.tables?.length ?? 0 });
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/tables/:id/copy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const source = await one(
    `SELECT t.*, l.x, l.y, l.width, l.height, l.shape, l.rotation
     FROM tables t
     JOIN table_layouts l ON l.table_id = t.id
     WHERE t.id = $1`,
    [request.params.id]
  );
  if (!source) {
    reply.code(404);
    return { error: "Table not found" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const copied = await client.query(
      `INSERT INTO tables (area_id, label, seats, status)
       VALUES ($1, $2, $3, 'available') RETURNING *`,
      [source.area_id, request.body?.label ?? `${source.label}-copy`, source.seats]
    );
    const table = copied.rows[0];
    await client.query(
      `INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [table.id, Number(source.x) + 24, Number(source.y) + 24, source.width, source.height, source.shape, source.rotation]
    );
    await client.query("COMMIT");
    emit("table.status.updated", { changed: true });
    await auditLog(request, "table.copy", "table", table.id, { source_table_id: source.id });
    return table;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.delete("/tables/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_tables")) return;
  const table = await one("SELECT * FROM tables WHERE id = $1", [request.params.id]);
  if (!table) {
    reply.code(404);
    return { error: "Table not found" };
  }
  if (table.current_order_id) {
    reply.code(409);
    return { error: "Cannot delete a table with an active order" };
  }
  const deleted = await one("DELETE FROM tables WHERE id = $1 RETURNING *", [table.id]);
  emit("table.status.updated", { changed: true });
  await auditLog(request, "table.delete", "table", deleted.id, { label: deleted.label });
  return deleted;
});

app.post("/tables/:id/open", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const table = await one("SELECT * FROM tables WHERE id = $1", [request.params.id]);
  if (!table) {
    const error = new Error("Table not found");
    error.statusCode = 404;
    throw error;
  }
  if (table.current_order_id) {
    const existing = await one("SELECT * FROM orders WHERE id = $1", [table.current_order_id]);
    if (existing && existing.status !== 'paid' && existing.status !== 'cancelled') return existing;
  }
  const order = await insertOrderWithRetry("dine_in", table.label, (no) => one(
    "INSERT INTO orders (order_no, service_type, table_id, guests, status) VALUES ($1, 'dine_in', $2, $3, 'draft') RETURNING *",
    [no, table.id, request.body?.guests ?? 1]
  ));
  await query(
    "UPDATE tables SET current_order_id = $1, status = 'opened', opened_at = now(), updated_at = now() WHERE id = $2",
    [order.id, table.id]
  );
  emit("table.status.updated", { table_id: table.id, status: "opened" });
  emit("order.created", order);
  await auditLog(request, "table.open", "order", order.id, { table_id: table.id, table_label: table.label });
  return order;
});

app.post("/tables/:id/clear", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const table = await one("SELECT * FROM tables WHERE id = $1", [request.params.id]);
  if (!table) {
    reply.code(404);
    return { error: "Table not found" };
  }
  if (table.current_order_id) {
    const order = await one("SELECT * FROM orders WHERE id = $1", [table.current_order_id]);
    const itemCount = await one("SELECT COUNT(*)::integer AS count FROM order_items WHERE order_id = $1", [table.current_order_id]);
    const hasItems = Number(itemCount?.count ?? 0) > 0;
    if (order && hasItems && order.status !== "paid" && order.status !== "cancelled") {
      reply.code(409);
      return { error: "Unpaid orders cannot be cleared" };
    }
    if (order && !hasItems && order.status !== "paid" && order.status !== "cancelled") {
      await query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [order.id]);
    }
  }
  const updated = await one(
    "UPDATE tables SET current_order_id = NULL, status = 'available', opened_at = NULL, updated_at = now() WHERE id = $1 RETURNING *",
    [table.id]
  );
  emit("table.status.updated", updated);
  await auditLog(request, "table.clear", "table", updated.id, { label: updated.label });
  return updated;
});
}
