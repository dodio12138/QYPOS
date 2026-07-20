// Auto-generated route module: reports

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
app.get("/dashboard/today", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_dashboard")) return;
  const today = localToday();
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const summary = await one(
    `SELECT
      COALESCE(SUM(total), 0)::numeric AS revenue,
      COALESCE(SUM(discount), 0)::numeric AS discount,
      COALESCE(SUM(net_sales), 0)::numeric AS net_sales,
      COALESCE(SUM(tax), 0)::numeric AS tax,
      COALESCE(SUM(service_charge), 0)::numeric AS service_charge,
      COUNT(*)::integer AS orders,
      COALESCE(AVG(NULLIF(total, 0)), 0)::numeric AS average_ticket,
      COUNT(*) FILTER (WHERE service_type = 'dine_in')::integer AS dine_in_orders,
      COUNT(*) FILTER (WHERE service_type = 'takeaway')::integer AS takeaway_orders
     FROM orders
     WHERE created_at::date = $1::date AND status IN ('submitted','preparing','ready','paid')`,
    [today]
  );
  const yesterdaySummary = await one(
    `SELECT
      COALESCE(SUM(total), 0)::numeric AS revenue,
      COALESCE(SUM(discount), 0)::numeric AS discount,
      COALESCE(SUM(net_sales), 0)::numeric AS net_sales,
      COALESCE(SUM(tax), 0)::numeric AS tax,
      COALESCE(SUM(service_charge), 0)::numeric AS service_charge,
      COUNT(*)::integer AS orders,
      COALESCE(AVG(NULLIF(total, 0)), 0)::numeric AS average_ticket
     FROM orders
     WHERE created_at::date = $1::date AND status IN ('submitted','preparing','ready','paid')`,
    [yesterdayStr]
  );
  const hotItems = await query(
    `SELECT oi.item_id, oi.name_i18n, SUM(oi.quantity)::integer AS quantity, SUM((oi.unit_price * oi.quantity))::numeric AS sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at::date = $1::date AND o.status NOT IN ('cancelled', 'split')
     GROUP BY oi.item_id, oi.name_i18n
     ORDER BY quantity DESC
     LIMIT 8`,
    [today]
  );
  const openOrders = await query("SELECT * FROM orders WHERE status NOT IN ('paid','cancelled','split') ORDER BY created_at DESC LIMIT 20");
  const printer = await one("SELECT status, COUNT(*)::integer FROM print_jobs GROUP BY status ORDER BY status LIMIT 1");
  return { summary, yesterdaySummary, hotItems, openOrders, printer };
});

async function buildSalesReport(from, to) {
  const params = [from, to];
  const summary = await one(
    `SELECT
      COALESCE(SUM(total), 0)::numeric AS revenue,
      COALESCE(SUM(subtotal), 0)::numeric AS subtotal,
      COALESCE(SUM(discount), 0)::numeric AS discount,
      COALESCE(SUM(net_sales), 0)::numeric AS net_sales,
      COALESCE(SUM(tax), 0)::numeric AS tax,
      COALESCE(SUM(service_charge), 0)::numeric AS service_charge,
      COUNT(*)::integer AS orders,
      COALESCE(AVG(NULLIF(total, 0)), 0)::numeric AS average_ticket,
      COUNT(*) FILTER (WHERE service_type = 'dine_in')::integer AS dine_in_orders,
      COUNT(*) FILTER (WHERE service_type = 'takeaway')::integer AS takeaway_orders
     FROM orders
     WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND status IN ('submitted','preparing','ready','paid')`,
    params
  );
  const itemUnits = await one(
    `SELECT COALESCE(SUM(oi.quantity), 0)::integer AS items_sold
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status IN ('submitted','preparing','ready','paid')`,
    params
  );
  summary.items_sold = Number(itemUnits?.items_sold || 0);
  const byDay = await query(
    `SELECT created_at::date AS day, COUNT(*)::integer AS orders, COALESCE(SUM(total), 0)::numeric AS revenue
     FROM orders
     WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND status IN ('submitted','preparing','ready','paid')
     GROUP BY created_at::date
     ORDER BY day`,
    params
  );
  const hotItems = await query(
    `WITH item_rows AS (
       SELECT
         o.created_at,
         oi.item_id,
         oi.name_i18n,
         COALESCE(oi.item_id::text, 'name:' || lower(trim(COALESCE(oi.name_i18n->>'zh-CN', oi.name_i18n->>'en-GB', '')))) AS item_key,
         oi.quantity,
         oi.unit_price
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status NOT IN ('cancelled', 'split')
     ), item_sales AS (
       SELECT
         item_key,
         (ARRAY_AGG(item_id ORDER BY created_at DESC))[1] AS item_id,
         (ARRAY_AGG(name_i18n ORDER BY created_at DESC))[1] AS name_i18n,
         SUM(quantity)::integer AS quantity,
         SUM((unit_price * quantity))::numeric AS sales
       FROM item_rows
       GROUP BY item_key
     )
     SELECT item_key, item_id, name_i18n, quantity, sales
     FROM item_sales
    ORDER BY quantity DESC, sales DESC`,
    params
  );
  const categoryMix = await query(
    `SELECT
       COALESCE(mc.id::text, 'uncategorized') AS category_id,
       COALESCE(mc.name_i18n, '{"zh-CN":"未分类","en-GB":"Uncategorized"}'::jsonb) AS name_i18n,
       COALESCE(SUM(oi.quantity), 0)::integer AS quantity,
       COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN menu_items mi ON mi.id = oi.item_id
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status IN ('submitted','preparing','ready','paid')
     GROUP BY COALESCE(mc.id::text, 'uncategorized'), COALESCE(mc.name_i18n, '{"zh-CN":"未分类","en-GB":"Uncategorized"}'::jsonb), mc.sort_order
     ORDER BY sales DESC, quantity DESC, mc.sort_order NULLS LAST`,
    params
  );
  const hotModifiers = await query(
    `SELECT oim.name_i18n AS label, COUNT(*)::integer AS quantity, COALESCE(SUM(oim.price_delta),0)::numeric AS sales
     FROM order_item_modifiers oim
     JOIN order_items oi ON oi.id = oim.order_item_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status NOT IN ('cancelled', 'split')
     GROUP BY oim.name_i18n
     ORDER BY quantity DESC
     LIMIT 20`,
    params
  );

  // common note presets (match preset label anywhere in notes) and free-form notes frequency
  const notePresets = await query(
    `SELECT np.label, COUNT(filtered.notes)::integer AS count
     FROM note_presets np
     LEFT JOIN (
       SELECT oi.notes
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day')
         AND o.status NOT IN ('cancelled', 'split')
         AND oi.notes IS NOT NULL AND oi.notes <> ''
     ) filtered ON filtered.notes ILIKE ('%' || np.label || '%')
     GROUP BY np.label
     ORDER BY count DESC
     LIMIT 20`,
    params
  );

  const commonNotes = await query(
    `SELECT oi.notes AS label, COUNT(*)::integer AS count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.notes IS NOT NULL AND oi.notes <> '' AND o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status NOT IN ('cancelled', 'split')
     GROUP BY oi.notes
     ORDER BY count DESC
     LIMIT 20`,
    params
  );

  // byTime: aggregate orders into 30-min slots across the day (0..47)
  const slotRows = await query(
    `SELECT floor(((EXTRACT(HOUR FROM o.created_at) * 60) + EXTRACT(MINUTE FROM o.created_at)) / 30)::int AS slot_index,
      COUNT(*)::int AS orders, COALESCE(SUM(o.total),0)::numeric AS revenue
     FROM orders o
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status IN ('submitted','preparing','ready','paid')
     GROUP BY slot_index
     ORDER BY slot_index`,
    params
  );
  // build full 48-slot array with labels 00:00 .. 23:30
  const byTime = Array.from({ length: 48 }).map((_, idx) => {
    const hh = String(Math.floor((idx * 30) / 60)).padStart(2, '0');
    const mm = String((idx * 30) % 60).padStart(2, '0');
    return { slot: `${hh}:${mm}`, orders: 0, revenue: 0 };
  });
  for (const r of slotRows) {
    const i = Number(r.slot_index);
    if (i >= 0 && i < byTime.length) {
      byTime[i].orders = Number(r.orders || 0);
      byTime[i].revenue = Number(r.revenue || 0);
    }
  }
  return { from, to, summary, byDay, hotItems, categoryMix, hotModifiers, notePresets, common_notes: commonNotes, byTime };
}

function buildDateSeries(from, to, rows) {
  // `row.day` comes back from pg as a JS Date representing local midnight
  // (in this process's TZ, matching the DB's `SET timezone`). Using
  // `.toISOString()` would convert to UTC and can shift the calendar date
  // backward by one day whenever the local offset is positive (e.g. BST),
  // so we must read the date using local getters instead of UTC ones.
  const dayKey = (value) => {
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  };
  const byDayMap = new Map((rows || []).map((row) => [dayKey(row.day), row]));
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const series = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const day = current.toISOString().slice(0, 10);
    const row = byDayMap.get(day);
    series.push({
      day,
      orders: row ? Number(row.orders || 0) : 0,
      revenue: row ? Number(row.revenue || 0) : 0
    });
  }
  return series;
}

function normalizeItemLookup(itemRef) {
  const raw = String(itemRef ?? "");
  if (LEGACY_UUID_PATTERN.test(raw)) {
    return { mode: "id", value: raw };
  }
  const decoded = decodeURIComponent(raw.startsWith("name:") ? raw.slice(5) : raw).trim();
  return { mode: "name", value: decoded };
}

async function buildItemSalesReport(from, to, itemRef) {
  const lookup = normalizeItemLookup(itemRef);
  const params = [from, to, lookup.value];
  const item = lookup.mode === "id"
    ? await one("SELECT id, name_i18n FROM menu_items WHERE id = $1::uuid", [lookup.value])
    : await one(
      `SELECT id, name_i18n
       FROM menu_items
       WHERE lower(trim(COALESCE(name_i18n->>'zh-CN', name_i18n->>'en-GB', ''))) = lower(trim($1))
       ORDER BY active DESC, sort_order ASC, created_at ASC
       LIMIT 1`,
      [lookup.value]
    );
  const itemFallback = item || {
    id: null,
    name_i18n: { "zh-CN": lookup.value, "en-GB": lookup.value }
  };
  const itemWhere = lookup.mode === "id"
    ? "oi.item_id = $3::uuid"
    : "lower(trim(COALESCE(oi.name_i18n->>'zh-CN', oi.name_i18n->>'en-GB', ''))) = lower(trim($3))";
  const summary = await one(
    `SELECT
      COALESCE(SUM(oi.quantity), 0)::integer AS orders,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day')
       AND o.status IN ('submitted','preparing','ready','paid')
       AND ${itemWhere}`,
    params
  );
  const byDayRows = await query(
    `SELECT o.created_at::date AS day, SUM(oi.quantity)::integer AS orders, COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day')
       AND o.status IN ('submitted','preparing','ready','paid')
       AND ${itemWhere}
     GROUP BY o.created_at::date
     ORDER BY day`,
    params
  );
  const byDay = buildDateSeries(from, to, byDayRows);

  const slotRows = await query(
    `SELECT floor(((EXTRACT(HOUR FROM o.created_at) * 60) + EXTRACT(MINUTE FROM o.created_at)) / 30)::int AS slot_index,
      SUM(oi.quantity)::int AS orders, COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day')
       AND o.status IN ('submitted','preparing','ready','paid')
       AND ${itemWhere}
     GROUP BY slot_index
     ORDER BY slot_index`,
    params
  );
  const byTime = Array.from({ length: 48 }).map((_, idx) => {
    const hh = String(Math.floor((idx * 30) / 60)).padStart(2, '0');
    const mm = String((idx * 30) % 60).padStart(2, '0');
    return { slot: `${hh}:${mm}`, orders: 0, revenue: 0 };
  });
  for (const row of slotRows) {
    const index = Number(row.slot_index);
    if (index >= 0 && index < byTime.length) {
      byTime[index].orders = Number(row.orders || 0);
      byTime[index].revenue = Number(row.revenue || 0);
    }
  }

  return { from, to, item: itemFallback, summary, byDay, byTime };
}

app.get("/reports/sales", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_reports")) return;
  const today = localToday();
  return buildSalesReport(request.query.from ?? today, request.query.to ?? today);
});

app.get("/reports/sales/items/:itemId", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_reports")) return;
  const today = localToday();
  return buildItemSalesReport(request.query.from ?? today, request.query.to ?? today, request.params.itemId);
});

app.get("/reports/sales.csv", async (request, reply) => {
  if (!await requirePermission(request, reply, "export_reports")) return;
  const today = localToday();
  const report = await buildSalesReport(request.query.from ?? today, request.query.to ?? today);
  const rows = [
    ["from", "to", "orders", "items_sold", "revenue", "subtotal", "discount", "net_sales", "tax", "service_charge", "average_ticket"],
    [
      report.from,
      report.to,
      report.summary.orders,
      report.summary.items_sold,
      report.summary.revenue,
      report.summary.subtotal,
      report.summary.discount,
      report.summary.net_sales,
      report.summary.tax,
      report.summary.service_charge,
      report.summary.average_ticket
    ],
    [],
    ["day", "orders", "revenue"],
    ...report.byDay.map((row) => [row.day, row.orders, row.revenue])
  ];
  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="sales-${report.from}-${report.to}.csv"`);
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
});

app.get("/audit-logs", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_audit_logs")) return;
  return query(
    `SELECT a.*, u.name AS actor_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
     LIMIT 2000`
  );
});
}
