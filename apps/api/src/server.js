import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import Fastify from "fastify";
import Redis from "ioredis";
import pg from "pg";
import { calculateTotals } from "@qypos/shared";
import { defaultPrinterProfiles, printerProfiles, selectPrinter, isValidPrinter } from "./services/printers.js";
import { normalizePermissions, requirePermission as requirePermissionWithRedis, userFromToken as userFromTokenWithRedis } from "./services/permissions.js";
import { assertPositivePayment } from "./services/validation.js";

const { Pool } = pg;
const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const redisSub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const sockets = new Set();
const execFileAsync = promisify(execFile);
const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "../../backups");
let backupTimer = null;

async function ensureSchema() {
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_profiles JSONB NOT NULL DEFAULT '[]'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_printer_id TEXT NOT NULL DEFAULT 'cashier'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_interval_hours INTEGER NOT NULL DEFAULT 24");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ");
  await pool.query("UPDATE settings SET printer_profiles = $1 WHERE printer_profiles = '[]'::jsonb", [JSON.stringify(defaultPrinterProfiles)]);
  await pool.query(
    `UPDATE roles SET permissions = '["manage_settings","manage_menu","manage_tables","manage_orders","adjust_service_charge","view_dashboard","view_reports","export_reports","view_audit_logs","view_kitchen","update_item_status","create_order","take_payment","print_receipt"]'
     WHERE name = 'owner'`
  );
  await pool.query(
    `INSERT INTO users (role_id, name, pin)
     SELECT id, 'Cashier', '1111' FROM roles WHERE name = 'cashier'
     AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Cashier')`
  );
  await pool.query(
    `INSERT INTO users (role_id, name, pin)
     SELECT id, 'Kitchen', '2222' FROM roles WHERE name = 'kitchen'
     AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Kitchen')`
  );
}

await ensureSchema();

await app.register(cors, { origin: true });
await app.register(websocket);

await redisSub.subscribe("print_events");
redisSub.on("message", (_channel, message) => {
  const parsed = JSON.parse(message);
  emit(parsed.event, parsed.data);
});

function emit(event, data) {
  const message = JSON.stringify({ event, data });
  for (const socket of sockets) {
    if (socket?.readyState === 1) socket.send(message);
  }
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

async function userFromToken(request) {
  return userFromTokenWithRedis(request, redis);
}

async function requirePermission(request, reply, permission) {
  return requirePermissionWithRedis(request, reply, redis, permission);
}

async function auditLog(request, action, entityType, entityId = null, metadata = {}) {
  const actor = await userFromToken(request);
  await query(
    "INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)",
    [actor?.id ?? null, action, entityType, entityId, metadata]
  );
}

function orderNo() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function getSettings() {
  return one("SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1");
}

async function listBackupFiles() {
  await fs.mkdir(backupDir, { recursive: true });
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map(async (entry) => {
      const filepath = path.join(backupDir, entry.name);
      const stat = await fs.stat(filepath);
      return { name: entry.name, size: stat.size, created_at: stat.birthtime, updated_at: stat.mtime };
    }));
  return files.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function createBackup(reason = "manual") {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const filename = `qypos-${stamp}.sql`;
  const filepath = path.join(backupDir, filename);
  await execFileAsync("pg_dump", ["--dbname", process.env.DATABASE_URL, "--file", filepath], { timeout: 120000 });
  await query("UPDATE settings SET last_backup_at = now(), updated_at = now() WHERE id = (SELECT id FROM settings ORDER BY updated_at DESC LIMIT 1)");
  emit("backup.created", { filename, reason });
  return (await listBackupFiles()).find((file) => file.name === filename);
}

async function maybeAutoBackup() {
  const settings = await getSettings();
  if (!settings?.backup_enabled) return;
  const last = settings.last_backup_at ? new Date(settings.last_backup_at).getTime() : 0;
  const intervalMs = Math.max(1, Number(settings.backup_interval_hours || 24)) * 60 * 60 * 1000;
  if (Date.now() - last >= intervalMs) {
    try {
      await createBackup("auto");
    } catch (error) {
      app.log.error({ error }, "auto backup failed");
    }
  }
}

function scheduleAutoBackup() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => maybeAutoBackup(), 15 * 60 * 1000);
  maybeAutoBackup().catch((error) => app.log.error({ error }, "initial auto backup check failed"));
}

async function getOrderItems(orderId, options = {}) {
  const where = ["order_id = $1"];
  const params = [orderId];
  if (options.onlyUnprintedKitchen) where.push("kitchen_printed_at IS NULL");
  const items = await query(`SELECT * FROM order_items WHERE ${where.join(" AND ")} ORDER BY created_at`, params);
  for (const item of items) {
    item.modifiers = await query("SELECT * FROM order_item_modifiers WHERE order_item_id = $1", [item.id]);
  }
  return items;
}

async function recalculateOrder(orderId, overrides = {}) {
  const settings = await getSettings();
  const items = await getOrderItems(orderId);
  const current = await one("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (!current) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  const totals = calculateTotals(items, settings, {
    service_charge_rate: overrides.service_charge_rate ?? current?.service_charge_rate,
    service_charge_exempt: overrides.service_charge_exempt ?? current?.service_charge_exempt,
    discount: overrides.discount ?? overrides.discount_amount ?? current?.discount
  });

  const updated = await one(
    `UPDATE orders
     SET subtotal = $2, net_sales = $3, tax = $4, service_charge = $5, total = $6,
         discount = $7,
         service_charge_rate = COALESCE($8, service_charge_rate),
         service_charge_exempt = COALESCE($9, service_charge_exempt),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      totals.subtotal,
      totals.netSales,
      totals.tax,
      totals.serviceCharge,
      totals.total,
      totals.discount,
      overrides.service_charge_rate ?? null,
      overrides.service_charge_exempt ?? null
    ]
  );
  emit("order.updated", updated);
  return updated;
}

async function createPrintJob(orderId, type) {
  const order = await one("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (!order && type !== "test") {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  const items = await getOrderItems(orderId, { onlyUnprintedKitchen: type === "kitchen" });
  if (type === "kitchen" && !items.length) {
    const error = new Error("No new items to print to kitchen");
    error.statusCode = 409;
    throw error;
  }
  const payments = await query("SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at", [orderId]);
  const settings = await getSettings();
  const table = order.table_id ? await one("SELECT * FROM tables WHERE id = $1", [order.table_id]) : null;
  const printer = selectPrinter(settings, type);
  if (!printer) {
    const error = new Error(`${type === "kitchen" ? "Kitchen" : "Receipt"} printer is not configured or enabled`);
    error.statusCode = 409;
    throw error;
  }
  const payload = { order, items, payments, settings, table, printer };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO print_jobs (order_id, type, payload) VALUES ($1, $2, $3) RETURNING *",
      [orderId, type, payload]
    );
    const job = inserted.rows[0];
    if (type === "kitchen") {
      await client.query("UPDATE order_items SET kitchen_printed_at = now() WHERE id = ANY($1::uuid[]) AND kitchen_printed_at IS NULL", [items.map((item) => item.id)]);
    }
    await client.query("COMMIT");
    await redis.lpush("print_jobs", job.id);
    emit("print.queued", job);
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateOrderKitchenState(orderId) {
  const items = await query("SELECT status FROM order_items WHERE order_id = $1 AND status <> 'cancelled'", [orderId]);
  if (!items.length) return null;

  let status = "submitted";
  if (items.some((item) => item.status === "preparing")) status = "preparing";
  if (items.every((item) => ["ready_to_serve", "served"].includes(item.status))) status = "ready";

  const order = await one("UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [orderId, status]);
  if (order?.table_id) {
    const tableStatus = status === "ready" ? "ready_to_serve" : status;
    await query("UPDATE tables SET status = $2, updated_at = now() WHERE id = $1", [order.table_id, tableStatus]);
    emit("table.status.updated", { table_id: order.table_id, status: tableStatus });
  }
  emit("order.updated", order);
  return order;
}

app.get("/health", async () => {
  await pool.query("SELECT 1");
  await redis.ping();
  return { ok: true };
});

app.get("/ws", { websocket: true }, (connection) => {
  const socket = connection.socket ?? connection;
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

app.post("/auth/login", async (request, reply) => {
  const body = request.body ?? {};
  const user = await one(
    `SELECT u.id, u.name, r.name AS role, r.permissions
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.name = $1 AND u.pin = $2 AND u.active = true`,
    [body.name, body.pin]
  );
  if (!user) {
    reply.code(401);
    return { error: "Invalid credentials" };
  }
  user.permissions = normalizePermissions(user.permissions);
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`, JSON.stringify(user), "EX", 60 * 60 * 12);
  await auditLog({ headers: { authorization: `Bearer ${token}` } }, "auth.login", "user", user.id, { role: user.role });
  return { token, user };
});

app.get("/auth/me", async (request, reply) => {
  const user = await userFromToken(request);
  if (!user) {
    reply.code(401);
    return { error: "Not authenticated" };
  }
  return user;
});

app.post("/auth/logout", async (request) => {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) await redis.del(`session:${token}`);
  return { ok: true };
});

app.get("/settings", async () => {
  const settings = await getSettings();
  if (!settings) return settings;
  // Ensure printer_profiles always has the effective list (with defaults) so the frontend can display them
  return { ...settings, printer_profiles: printerProfiles(settings) };
});

app.put("/settings", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const body = request.body ?? {};
  const settings = await one(
    `UPDATE settings SET
      locale = COALESCE($1, locale),
      fallback_locale = COALESCE($2, fallback_locale),
      currency = COALESCE($3, currency),
      tax_rate = COALESCE($4, tax_rate),
      prices_include_tax = COALESCE($5, prices_include_tax),
      show_tax_on_receipt = COALESCE($6, show_tax_on_receipt),
      service_charge_rate = COALESCE($7, service_charge_rate),
      receipt_header = COALESCE($8, receipt_header),
      receipt_footer = COALESCE($9, receipt_footer),
      printer_host = COALESCE($10, printer_host),
      printer_port = COALESCE($11, printer_port),
      printer_profiles = COALESCE($12::jsonb, printer_profiles),
      kitchen_printer_id = COALESCE($13, kitchen_printer_id),
      receipt_printer_id = COALESCE($14, receipt_printer_id),
      backup_enabled = COALESCE($15::boolean, backup_enabled),
      backup_interval_hours = COALESCE($16::integer, backup_interval_hours),
      updated_at = now()
     WHERE id = (SELECT id FROM settings ORDER BY updated_at DESC LIMIT 1)
     RETURNING *`,
    [
      body.locale,
      body.fallback_locale,
      body.currency,
      body.tax_rate,
      body.prices_include_tax,
      body.show_tax_on_receipt,
      body.service_charge_rate,
      body.receipt_header,
      body.receipt_footer,
      body.printer_host,
      body.printer_port,
      body.printer_profiles === undefined ? null : JSON.stringify(body.printer_profiles),
      body.kitchen_printer_id,
      body.receipt_printer_id,
      body.backup_enabled,
      body.backup_interval_hours
    ]
  );
  emit("settings.updated", settings);
  scheduleAutoBackup();
  await auditLog(request, "settings.update", "settings", settings.id, { currency: settings.currency, tax_rate: settings.tax_rate, service_charge_rate: settings.service_charge_rate });
  return settings;
});

app.get("/menu", async () => {
  const categories = await query("SELECT * FROM menu_categories ORDER BY sort_order, name_i18n->>'zh-CN'");
  const items = await query("SELECT * FROM menu_items ORDER BY created_at");
  const variants = await query("SELECT * FROM menu_item_variants ORDER BY sort_order");
  const groups = await query("SELECT * FROM modifier_groups ORDER BY sort_order");
  const modifiers = await query("SELECT * FROM modifiers ORDER BY sort_order");
  return {
    categories,
    items: items.map((item) => ({
      ...item,
      variants: variants.filter((variant) => variant.item_id === item.id),
      modifier_groups: groups
        .filter((group) => group.item_id === item.id)
        .map((group) => ({
          ...group,
          modifiers: modifiers.filter((modifier) => modifier.group_id === group.id)
        }))
    }))
  };
});

app.post("/menu/categories", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const category = await one(
    "INSERT INTO menu_categories (name_i18n, sort_order, active) VALUES ($1, $2, COALESCE($3, true)) RETURNING *",
    [body.name_i18n, body.sort_order ?? 0, body.active]
  );
  await auditLog(request, "menu.category.create", "menu_category", category.id, { name_i18n: category.name_i18n });
  return category;
});

app.patch("/menu/categories/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const category = await one(
    `UPDATE menu_categories SET
      name_i18n = COALESCE($2, name_i18n),
      sort_order = COALESCE($3, sort_order),
      active = COALESCE($4, active)
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name_i18n, body.sort_order, body.active]
  );
  if (!category) {
    reply.code(404);
    return { error: "Category not found" };
  }
  await auditLog(request, "menu.category.update", "menu_category", category.id, body);
  return category;
});

app.delete("/menu/categories/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const category = await one("UPDATE menu_categories SET active = false WHERE id = $1 RETURNING *", [request.params.id]);
  if (!category) {
    reply.code(404);
    return { error: "Category not found" };
  }
  await auditLog(request, "menu.category.disable", "menu_category", category.id);
  return category;
});

app.delete("/menu/categories/:id/destroy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const category = await one("DELETE FROM menu_categories WHERE id = $1 RETURNING *", [request.params.id]);
  if (!category) {
    reply.code(404);
    return { error: "Category not found" };
  }
  await auditLog(request, "menu.category.destroy", "menu_category", category.id, { name_i18n: category.name_i18n });
  return category;
});

app.post("/menu/items", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const item = await one(
    `INSERT INTO menu_items (category_id, name_i18n, description_i18n, image_url, kitchen_group, active)
     VALUES ($1, $2, COALESCE($3, '{}'::jsonb), $4, COALESCE($5, 'kitchen'), COALESCE($6, true))
     RETURNING *`,
    [body.category_id, body.name_i18n, body.description_i18n, body.image_url, body.kitchen_group, body.active]
  );
  for (const variant of body.variants ?? []) {
    await query(
      "INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order) VALUES ($1, $2, $3, $4)",
      [item.id, variant.name_i18n, variant.price, variant.sort_order ?? 0]
    );
  }
  await auditLog(request, "menu.item.create", "menu_item", item.id, { name_i18n: item.name_i18n });
  return item;
});

app.patch("/menu/items/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const item = await one(
    `UPDATE menu_items SET
      category_id = COALESCE($2, category_id),
      name_i18n = COALESCE($3, name_i18n),
      description_i18n = COALESCE($4, description_i18n),
      image_url = COALESCE($5, image_url),
      kitchen_group = COALESCE($6, kitchen_group),
      active = COALESCE($7, active),
      updated_at = now()
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.category_id, body.name_i18n, body.description_i18n, body.image_url, body.kitchen_group, body.active]
  );
  await auditLog(request, "menu.item.update", "menu_item", item?.id ?? request.params.id, body);
  return item;
});

app.delete("/menu/items/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const item = await one("UPDATE menu_items SET active = false, updated_at = now() WHERE id = $1 RETURNING *", [request.params.id]);
  if (!item) {
    reply.code(404);
    return { error: "Menu item not found" };
  }
  await auditLog(request, "menu.item.disable", "menu_item", item.id);
  return item;
});

app.delete("/menu/items/:id/destroy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  // Unlink from historical order_items (preserve order history, just remove the reference)
  await query("UPDATE order_items SET item_id = NULL, variant_id = NULL WHERE item_id = $1", [request.params.id]);
  const item = await one("DELETE FROM menu_items WHERE id = $1 RETURNING *", [request.params.id]);
  if (!item) {
    reply.code(404);
    return { error: "Menu item not found" };
  }
  await auditLog(request, "menu.item.destroy", "menu_item", item.id, { name_i18n: item.name_i18n });
  return item;
});

app.post("/menu/items/:id/variants", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const variant = await one(
    "INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order, active) VALUES ($1, $2, $3, $4, COALESCE($5, true)) RETURNING *",
    [request.params.id, body.name_i18n, body.price, body.sort_order ?? 0, body.active]
  );
  await auditLog(request, "menu.variant.create", "menu_item_variant", variant.id, { item_id: request.params.id, price: variant.price });
  return variant;
});

app.patch("/menu/items/:id/variants/:variantId", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const variant = await one(
    `UPDATE menu_item_variants SET
      name_i18n = COALESCE($3, name_i18n),
      price = COALESCE($4, price),
      sort_order = COALESCE($5, sort_order),
      active = COALESCE($6, active)
     WHERE id = $1 AND item_id = $2 RETURNING *`,
    [request.params.variantId, request.params.id, body.name_i18n, body.price, body.sort_order, body.active]
  );
  if (!variant) {
    reply.code(404);
    return { error: "Variant not found" };
  }
  await auditLog(request, "menu.variant.update", "menu_item_variant", variant.id, body);
  return variant;
});

app.delete("/menu/items/:id/variants/:variantId", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const variant = await one(
    "UPDATE menu_item_variants SET active = false WHERE id = $1 AND item_id = $2 RETURNING *",
    [request.params.variantId, request.params.id]
  );
  if (!variant) {
    reply.code(404);
    return { error: "Variant not found" };
  }
  await auditLog(request, "menu.variant.disable", "menu_item_variant", variant.id);
  return variant;
});

app.post("/menu/modifier-groups", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const group = await one(
    `INSERT INTO modifier_groups (item_id, name_i18n, min_select, max_select, sort_order, active)
     VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 1), COALESCE($5, 0), COALESCE($6, true))
     RETURNING *`,
    [body.item_id, body.name_i18n, body.min_select, body.max_select, body.sort_order, body.active]
  );
  for (const modifier of body.modifiers ?? []) {
    await query(
      "INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order) VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0))",
      [group.id, modifier.name_i18n, modifier.price_delta, modifier.sort_order]
    );
  }
  await auditLog(request, "menu.modifier_group.create", "modifier_group", group.id, { item_id: group.item_id });
  return group;
});

app.patch("/menu/modifier-groups/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const group = await one(
    `UPDATE modifier_groups SET
      name_i18n = COALESCE($2, name_i18n),
      min_select = COALESCE($3, min_select),
      max_select = COALESCE($4, max_select),
      sort_order = COALESCE($5, sort_order),
      active = COALESCE($6, active)
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name_i18n, body.min_select, body.max_select, body.sort_order, body.active]
  );
  await auditLog(request, "menu.modifier_group.update", "modifier_group", group?.id ?? request.params.id, body);
  return group;
});

app.delete("/menu/modifier-groups/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const group = await one("UPDATE modifier_groups SET active = false WHERE id = $1 RETURNING *", [request.params.id]);
  if (!group) {
    reply.code(404);
    return { error: "Modifier group not found" };
  }
  await auditLog(request, "menu.modifier_group.disable", "modifier_group", group.id);
  return group;
});

app.post("/menu/modifier-groups/:id/modifiers", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const group = await one("SELECT * FROM modifier_groups WHERE id = $1", [request.params.id]);
  if (!group) {
    reply.code(404);
    return { error: "Modifier group not found" };
  }
  const body = request.body ?? {};
  const modifier = await one(
    "INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, active) VALUES ($1, $2, COALESCE($3::numeric, 0), COALESCE($4::integer, 0), COALESCE($5::boolean, true)) RETURNING *",
    [group.id, body.name_i18n, body.price_delta, body.sort_order, body.active]
  );
  await auditLog(request, "menu.modifier.create", "modifier", modifier.id, { group_id: group.id, price_delta: modifier.price_delta });
  return modifier;
});

app.patch("/menu/modifiers/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const modifier = await one(
    `UPDATE modifiers SET
      name_i18n = COALESCE($2, name_i18n),
      price_delta = COALESCE($3::numeric, price_delta),
      sort_order = COALESCE($4::integer, sort_order),
      active = COALESCE($5::boolean, active)
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name_i18n, body.price_delta, body.sort_order, body.active]
  );
  if (!modifier) {
    reply.code(404);
    return { error: "Modifier not found" };
  }
  await auditLog(request, "menu.modifier.update", "modifier", modifier.id, body);
  return modifier;
});

app.delete("/menu/modifiers/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const modifier = await one("UPDATE modifiers SET active = false WHERE id = $1 RETURNING *", [request.params.id]);
  if (!modifier) {
    reply.code(404);
    return { error: "Modifier not found" };
  }
  await auditLog(request, "menu.modifier.disable", "modifier", modifier.id);
  return modifier;
});

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
  const order = await one(
    "INSERT INTO orders (order_no, service_type, table_id, guests, status) VALUES ($1, 'dine_in', $2, $3, 'draft') RETURNING *",
    [orderNo(), table.id, request.body?.guests ?? 1]
  );
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

app.post("/orders", async (request, reply) => {
  if (!await requirePermission(request, reply, "create_order")) return;
  const body = request.body ?? {};
  const order = await one(
    `INSERT INTO orders (order_no, service_type, table_id, pickup_no, guests, notes, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 1), COALESCE($6, ''), 'draft') RETURNING *`,
    [orderNo(), body.service_type ?? "takeaway", body.table_id, body.pickup_no, body.guests, body.notes]
  );
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
    const existingItem = await one("SELECT id, kitchen_printed_at, status FROM order_items WHERE id = $1 AND order_id = $2", [item.id, request.params.id]);
    if (!existingItem) {
      return recalculateOrder(request.params.id);
    }
    if (existingItem.kitchen_printed_at) {
      const error = new Error("Kitchen printed items are locked");
      error.statusCode = 409;
      throw error;
    }
    if (existingItem.status === "served") {
      const error = new Error("Served items cannot be modified");
      error.statusCode = 409;
      throw error;
    }
    if (Number(item.quantity) <= 0 || item.remove) {
      await query("DELETE FROM order_items WHERE id = $1 AND order_id = $2", [item.id, request.params.id]);
      await auditLog(request, "order.item.remove", "order_item", item.id, { order_id: request.params.id });
    } else {
      await query(
        `UPDATE order_items
         SET quantity = COALESCE($3, quantity), notes = COALESCE($4, notes), status = COALESCE($5, status)
         WHERE id = $1 AND order_id = $2`,
        [item.id, request.params.id, item.quantity, item.notes, item.status]
      );
      await auditLog(request, "order.item.update", "order_item", item.id, { order_id: request.params.id, quantity: item.quantity });
    }
    return recalculateOrder(request.params.id);
  }

  if (body.add_item) {
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
  if ("service_charge_rate" in body || "service_charge_exempt" in body || "discount" in body || "discount_amount" in body) {
    if (!await requirePermission(request, reply, "adjust_service_charge")) return;
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
  if (!await requirePermission(request, reply, "manage_orders")) return;
  const body = request.body ?? {};
  await query("UPDATE orders SET discount = GREATEST(0, COALESCE($2::numeric, discount)), discount_reason = COALESCE($3, discount_reason) WHERE id = $1", [
    request.params.id,
    body.discount ?? body.discount_amount,
    body.reason
  ]);
  const order = await recalculateOrder(request.params.id);
  if (Number(order.discount) !== Number(body.discount ?? body.discount_amount ?? order.discount)) {
    await query("UPDATE orders SET discount = $2 WHERE id = $1", [order.id, order.discount]);
  }
  await auditLog(request, "order.discount.adjust", "order", order.id, { discount: order.discount, reason: body.reason ?? "" });
  return order;
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
  const order = await recalculateOrder(request.params.id);
  const job = await createPrintJob(order.id, "kitchen");
  const updated = await one("UPDATE orders SET status = 'submitted', updated_at = now() WHERE id = $1 RETURNING *", [order.id]);
  if (updated.table_id) {
    await query("UPDATE tables SET status = 'ordered', updated_at = now() WHERE id = $1", [updated.table_id]);
    emit("table.status.updated", { table_id: updated.table_id, status: "ordered" });
  }
  emit("order.updated", updated);
  await auditLog(request, "order.submit", "order", updated.id, { print_job_id: job.id });
  return { order: updated, print_job: job };
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
  const client = await pool.connect();
  let payment;
  let updated;
  let paid;
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query(
      "INSERT INTO payments (order_id, method, amount, change_due) VALUES ($1, $2, $3, COALESCE($4, 0)) RETURNING *",
      [request.params.id, body.method, body.amount, body.change_due]
    );
    payment = paymentResult.rows[0];
    const orderResult = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [request.params.id]);
    const order = orderResult.rows[0];
    const paidResult = await client.query("SELECT COALESCE(SUM(amount - change_due), 0)::numeric AS paid FROM payments WHERE order_id = $1", [request.params.id]);
    paid = paidResult.rows[0];
    updated = order;
    if (Number(paid.paid) >= Number(order.total)) {
      const updatedResult = await client.query("UPDATE orders SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [order.id]);
      updated = updatedResult.rows[0];
      if (updated.table_id) {
        await client.query("UPDATE tables SET status = 'needs_cleaning', updated_at = now() WHERE id = $1", [updated.table_id]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (updated?.table_id && updated.status === "paid") {
    emit("table.status.updated", { table_id: updated.table_id, status: "needs_cleaning" });
    emit("order.paid", updated);
  }
  await auditLog(request, "payment.create", "payment", payment.id, { order_id: request.params.id, method: payment.method, amount: payment.amount });
  return { payment, order: updated, paid: Number(paid.paid) };
});

app.post("/orders/:id/print", async (request, reply) => {
  if (!await requirePermission(request, reply, "print_receipt")) return;
  const job = await createPrintJob(request.params.id, request.body?.type ?? "receipt");
  await auditLog(request, "print.create", "print_job", job.id, { order_id: request.params.id, type: job.type });
  return job;
});

app.get("/print-jobs", async () => query("SELECT id, order_id, type, status, attempts, error, created_at, updated_at FROM print_jobs ORDER BY created_at DESC LIMIT 100"));

app.post("/print-jobs/test", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
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

app.post("/print-jobs/:id/retry", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const job = await one("SELECT * FROM print_jobs WHERE id = $1", [request.params.id]);
  if (!job) {
    reply.code(404);
    return { error: "Print job not found" };
  }
  const updated = await one(
    "UPDATE print_jobs SET status = 'queued', error = NULL, updated_at = now() WHERE id = $1 RETURNING id, order_id, type, status, attempts, error, created_at, updated_at",
    [job.id]
  );
  await redis.lpush("print_jobs", job.id);
  emit("print.queued", updated);
  await auditLog(request, "print.retry", "print_job", job.id);
  return updated;
});

app.get("/kitchen/items", async () => query(
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
));

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

app.get("/dashboard/today", async () => {
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
     WHERE created_at::date = CURRENT_DATE AND status IN ('submitted','preparing','ready','paid')`
  );
  const hotItems = await query(
    `SELECT oi.name_i18n, SUM(oi.quantity)::integer AS quantity, SUM((oi.unit_price * oi.quantity))::numeric AS sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at::date = CURRENT_DATE AND o.status <> 'cancelled'
     GROUP BY oi.name_i18n
     ORDER BY quantity DESC
     LIMIT 8`
  );
  const openOrders = await query("SELECT * FROM orders WHERE status NOT IN ('paid','cancelled') ORDER BY created_at DESC LIMIT 20");
  const printer = await one("SELECT status, COUNT(*)::integer FROM print_jobs GROUP BY status ORDER BY status LIMIT 1");
  return { summary, hotItems, openOrders, printer };
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
  const byDay = await query(
    `SELECT created_at::date AS day, COUNT(*)::integer AS orders, COALESCE(SUM(total), 0)::numeric AS revenue
     FROM orders
     WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND status IN ('submitted','preparing','ready','paid')
     GROUP BY created_at::date
     ORDER BY day`,
    params
  );
  const hotItems = await query(
    `SELECT oi.name_i18n, SUM(oi.quantity)::integer AS quantity, SUM((oi.unit_price * oi.quantity))::numeric AS sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day') AND o.status <> 'cancelled'
     GROUP BY oi.name_i18n
     ORDER BY quantity DESC
     LIMIT 20`,
    params
  );
  return { from, to, summary, byDay, hotItems };
}

app.get("/reports/sales", async (request, reply) => {
  if (!await requirePermission(request, reply, "view_reports")) return;
  const today = new Date().toISOString().slice(0, 10);
  return buildSalesReport(request.query.from ?? today, request.query.to ?? today);
});

app.get("/reports/sales.csv", async (request, reply) => {
  if (!await requirePermission(request, reply, "export_reports")) return;
  const today = new Date().toISOString().slice(0, 10);
  const report = await buildSalesReport(request.query.from ?? today, request.query.to ?? today);
  const rows = [
    ["from", "to", "orders", "revenue", "subtotal", "discount", "net_sales", "tax", "service_charge", "average_ticket"],
    [
      report.from,
      report.to,
      report.summary.orders,
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
     LIMIT 200`
  );
});

app.get("/ops/health", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const started = Date.now();
  const checks = [];
  async function check(name, action) {
    const start = Date.now();
    try {
      const data = await action();
      checks.push({ name, ok: true, latency_ms: Date.now() - start, data });
    } catch (error) {
      checks.push({ name, ok: false, latency_ms: Date.now() - start, error: error.message });
    }
  }

  await check("database", async () => {
    await pool.query("SELECT 1");
    const stats = await one("SELECT COUNT(*)::integer AS orders FROM orders");
    return stats;
  });
  await check("redis", async () => ({ pong: await redis.ping() }));
  await check("print_queue", async () => one("SELECT status, COUNT(*)::integer FROM print_jobs GROUP BY status ORDER BY status LIMIT 1"));
  await check("backups", async () => {
    const files = await listBackupFiles();
    return { count: files.length, latest: files[0] ?? null };
  });

  const settings = await getSettings();
  return {
    ok: checks.every((item) => item.ok),
    uptime_seconds: Math.round(process.uptime()),
    latency_ms: Date.now() - started,
    settings: {
      backup_enabled: settings.backup_enabled,
      backup_interval_hours: settings.backup_interval_hours,
      last_backup_at: settings.last_backup_at
    },
    printers: printerProfiles(settings),
    checks
  };
});

app.get("/ops/backups", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  return listBackupFiles();
});

app.post("/ops/backups", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const file = await createBackup("manual");
  await auditLog(request, "backup.create", "backup", null, file);
  return file;
});

app.get("/ops/backups/:name", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const filename = path.basename(request.params.name);
  if (!filename.endsWith(".sql")) {
    reply.code(400);
    return { error: "Invalid backup filename" };
  }
  const filepath = path.join(backupDir, filename);
  const content = await fs.readFile(filepath, "utf8");
  reply.header("Content-Type", "application/sql; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  return content;
});

const port = Number(process.env.API_PORT ?? 4000);
scheduleAutoBackup();
await app.listen({ port, host: "0.0.0.0" });
