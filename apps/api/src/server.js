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
import { calculateTotals, localToday } from "@qypos/shared";
import { defaultPrinterProfiles, printerProfiles, selectPrinter, isValidPrinter } from "./services/printers.js";
import { normalizePermissions, hashPin, verifyPin, userFromToken as userFromTokenWithRedis } from "./services/permissions.js";
import { assertPositivePayment } from "./services/validation.js";
import { ADMIN_GRANT_SCOPES, CASHIER_PERMISSIONS, OWNER_PERMISSIONS, canPatchMenuItem } from "./services/role-permissions.js";
import {
  cancelDojoTerminalSession,
  createDojoTerminalPayment,
  dojoConfig,
  getDojoPaymentIntent,
  getDojoTerminalSession,
  isDojoConfigured,
  listDojoTerminals,
  mapDojoSessionStatus,
  respondToDojoSignature
} from "./services/dojo.js";

// ── Re‑export services for route modules ──────────────────────────────────
export { calculateTotals, localToday } from "@qypos/shared";
export { defaultPrinterProfiles, printerProfiles, selectPrinter, isValidPrinter } from "./services/printers.js";
export { normalizePermissions, hashPin, verifyPin, userFromToken as userFromTokenWithRedis } from "./services/permissions.js";
export { assertPositivePayment } from "./services/validation.js";
export { ADMIN_GRANT_SCOPES, CASHIER_PERMISSIONS, OWNER_PERMISSIONS, canPatchMenuItem } from "./services/role-permissions.js";
export {
  cancelDojoTerminalSession,
  createDojoTerminalPayment,
  dojoConfig,
  getDojoPaymentIntent,
  getDojoTerminalSession,
  isDojoConfigured,
  listDojoTerminals,
  mapDojoSessionStatus,
  respondToDojoSignature
} from "./services/dojo.js";

const { Pool } = pg;
export const app = Fastify({ logger: true });
const tz = process.env.TZ || 'Europe/London';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', async (client) => {
  await client.query(`SET timezone TO '${tz}'`);
});
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
export const redisSub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
export const sockets = new Set();
export const execFileAsync = promisify(execFile);
export const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), "../../backups");
let backupTimer = null;
let idleClearTimer = null;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEGACY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ADMIN_GRANT_TTL_SECONDS = 60 * 30;
export const LOGIN_RATE_WINDOW = 60;       // seconds
export const LOGIN_RATE_MAX_ATTEMPTS = 10;  // max failures per window per IP
export const ADMIN_GRANT_RATE_MAX_ATTEMPTS = 5;

// ── Rate limiting helper ──────────────────────────────────────────────────
export async function checkRateLimit(key, maxAttempts, windowSec) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count > maxAttempts;
}

export function clientIp(request) {
  return request.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || request.headers["x-real-ip"]
    || request.socket?.remoteAddress
    || "unknown";
}

export async function ensureSchema() {
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_fixed NUMERIC(10,2) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2)");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id)");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_address TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_header_zh TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_phone TEXT NOT NULL DEFAULT ''");
  await pool.query(`UPDATE settings
    SET receipt_header = 'Granny Noodles',
        receipt_header_zh = '秦云老太婆摊摊面'
    WHERE receipt_header_zh = '' AND receipt_header LIKE '%秦云老太婆%'`);
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_profiles JSONB NOT NULL DEFAULT '[]'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_printer_id TEXT NOT NULL DEFAULT 'cashier'");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_item_font_size INTEGER NOT NULL DEFAULT 5");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_item_bold BOOLEAN NOT NULL DEFAULT true");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_qty_bold BOOLEAN NOT NULL DEFAULT true");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_interval_hours INTEGER NOT NULL DEFAULT 24");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_clear_tables_after_payment BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_clear_empty_tables_after_idle BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_clear_empty_tables_idle_minutes INTEGER NOT NULL DEFAULT 60");
  await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ");
  await pool.query(`CREATE TABLE IF NOT EXISTS menu_option_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('variants', 'modifiers')),
    payload JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS menu_option_presets_kind_idx ON menu_option_presets(kind, active, created_at)");
  await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variant_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modifier_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS modifier_groups_preset_idx ON modifier_groups(preset_id) WHERE preset_id IS NOT NULL");
  await pool.query("ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS default_selected BOOLEAN NOT NULL DEFAULT false");
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider_payment_id TEXT,
    provider_session_id TEXT,
    terminal_id TEXT,
    error_code TEXT,
    error_message TEXT,
    provider_payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_attempt_id UUID REFERENCES payment_attempts(id)");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS terminal_id TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_brand TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_last4 TEXT");
  await pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS auth_code TEXT");
  await pool.query("CREATE INDEX IF NOT EXISTS payment_attempts_order_idx ON payment_attempts(order_id, created_at DESC)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_payment_idx ON payment_attempts(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS payments_attempt_idx ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_idx ON payments(provider, provider_payment_id) WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL");
  await pool.query("UPDATE settings SET printer_profiles = $1 WHERE printer_profiles = '[]'::jsonb", [JSON.stringify(defaultPrinterProfiles)]);
  await pool.query(`CREATE TABLE IF NOT EXISTS note_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    category_ids JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("ALTER TABLE note_presets ADD COLUMN IF NOT EXISTS category_ids JSONB NOT NULL DEFAULT '[]'");
  const presetCount = await pool.query("SELECT COUNT(*)::int AS n FROM note_presets");
  if (presetCount.rows[0].n === 0) {
    await pool.query(
      `INSERT INTO note_presets (label, sort_order) VALUES ('白人辣', 1), ('重庆人辣', 2), ('去葱', 3)`
    );
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_schedule_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#22c55e',
    hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query("ALTER TABLE staff_schedule_employees ADD COLUMN IF NOT EXISTS hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0");
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_schedule_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES staff_schedule_employees(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    is_off BOOLEAN NOT NULL DEFAULT false,
    start_time TIME,
    end_time TIME,
    break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 1440),
    note TEXT NOT NULL DEFAULT '',
    actual_start_time TIME,
    actual_end_time TIME,
    actual_break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_break_minutes >= 0 AND actual_break_minutes <= 1440),
    actual_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, work_date),
    CHECK (
      is_off = true
      OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    )
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS staff_schedule_cells_work_date_idx ON staff_schedule_cells(work_date)");
  await pool.query("ALTER TABLE staff_schedule_cells ADD COLUMN IF NOT EXISTS actual_start_time TIME");
  await pool.query("ALTER TABLE staff_schedule_cells ADD COLUMN IF NOT EXISTS actual_end_time TIME");
  await pool.query("ALTER TABLE staff_schedule_cells ADD COLUMN IF NOT EXISTS actual_break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_break_minutes >= 0 AND actual_break_minutes <= 1440)");
  await pool.query("ALTER TABLE staff_schedule_cells ADD COLUMN IF NOT EXISTS actual_note TEXT NOT NULL DEFAULT ''");
  await pool.query(`CREATE TABLE IF NOT EXISTS staff_schedule_time_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL DEFAULT '',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(start_time, end_time)
  )`);
  await pool.query(`INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order)
    VALUES
      ('09:00-14:00', '09:00', '14:00', 1),
      ('11:30-14:00', '11:30', '14:00', 2),
      ('12:00-16:00', '12:00', '16:00', 3),
      ('14:00-20:00', '14:00', '20:00', 4),
      ('14:00-22:30', '14:00', '22:30', 5),
      ('20:30-22:30', '20:30', '22:30', 6)
    ON CONFLICT (start_time, end_time) DO NOTHING`);
  await pool.query(
    "UPDATE roles SET permissions = $1::jsonb WHERE name = 'owner'",
    [JSON.stringify(OWNER_PERMISSIONS)]
  );
  await pool.query(
    "UPDATE roles SET permissions = $1::jsonb WHERE name = 'cashier'",
    [JSON.stringify(CASHIER_PERMISSIONS)]
  );
  await pool.query(
    `INSERT INTO users (role_id, name, pin)
     SELECT id, 'Cashier', $1 FROM roles WHERE name = 'cashier'
     AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Cashier')`,
    [hashPin('1111')]
  );
  await pool.query(
    `INSERT INTO users (role_id, name, pin)
     SELECT id, 'Kitchen', $1 FROM roles WHERE name = 'kitchen'
     AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Kitchen')`,
    [hashPin('2222')]
  );
}

export async function runMigrations() {
  const migrationsDir = path.resolve(process.cwd(), '..', '..', 'db', 'migrations');
  try {
    await fs.access(migrationsDir);
  } catch (err) {
    app.log.info({ migrationsDir }, 'migrations directory not present, skipping');
    return;
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const appliedRes = await pool.query('SELECT name FROM migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  // Older production images did not copy db/migrations into the API image. Those
  // databases were kept compatible by ensureSchema() and therefore have the old
  // schema changes but no migration ledger. Baseline only the known legacy files
  // so their seed SQL is not replayed over live menu/order data.
  const legacyBaseline = new Set([
    '002_runtime_compat.sql',
    '003_granny_noodles_menu.sql',
    '004_init_updates.sql',
    '005_auto_clear_tables.sql',
    '006_kitchen_print_style.sql'
  ]);
  for (const file of files.filter((name) => legacyBaseline.has(name) && !applied.has(name))) {
    await pool.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
    applied.add(file);
    app.log.info({ file }, 'baselined legacy migration');
  }
  for (const file of files) {
    if (applied.has(file)) continue;
    const full = path.join(migrationsDir, file);
    app.log.info({ file }, 'applying migration');
    const sql = await fs.readFile(full, 'utf8');
    await pool.query('BEGIN');
    try {
      // execute SQL script (may contain multiple statements)
      await pool.query(sql);
      await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      app.log.info({ file }, 'migration applied');
    } catch (err) {
      await pool.query('ROLLBACK');
      app.log.error({ err, file }, 'migration failed');
      throw err;
    }
  }
}

// Run migrations first, then ensure compatible schema
await runMigrations();
await ensureSchema();

await app.register(cors, {
  origin: process.env.NODE_ENV === "production"
    ? (process.env.CORS_ORIGIN || "http://localhost:3000")
    : [/^https?:\/\/localhost(:\d+)?$/], // dev: allow any localhost port
});
await app.register(websocket);

await redisSub.subscribe("print_events");
redisSub.on("message", (_channel, message) => {
  try {
    const parsed = JSON.parse(message);
    emit(parsed.event, parsed.data);
  } catch (err) {
    app.log.error({ err }, "Failed to parse print_events message");
  }
});

export function emit(event, data) {
  const message = JSON.stringify({ event, data });
  for (const socket of sockets) {
    if (socket?.readyState === 1) socket.send(message);
  }
}

export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function parseDateOnly(value) {
  const text = String(value ?? "").slice(0, 10);
  if (!DATE_ONLY_PATTERN.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return text;
}

export function parseTimeOnly(value) {
  const text = String(value ?? "").trim();
  if (!TIME_PATTERN.test(text)) return null;
  const [hours, minutes] = text.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return text;
}

export async function userFromToken(request) {
  return userFromTokenWithRedis(request, redis);
}

export async function adminGrantFromRequest(request, user) {
  const token = request.headers["x-qypos-admin-grant"] ?? request.query?.admin_grant ?? null;
  if (!token || !user) return null;
  const payload = await redis.get(`admin-grant:${token}`);
  if (!payload) return null;
  try {
    const grant = JSON.parse(payload);
    return grant.subject_user_id === user.id ? grant : null;
  } catch {
    return null;
  }
}

export async function requirePermission(request, reply, permission) {
  const user = await userFromToken(request);
  if (!user) {
    reply.code(401);
    return null;
  }
  if (!permission || user.permissions.includes(permission)) return user;
  const grant = await adminGrantFromRequest(request, user);
  if (grant?.permissions?.includes(permission)) return user;
  reply.code(403);
  return null;
}

export async function requireAnyPermission(request, reply, permissions) {
  const user = await userFromToken(request);
  if (!user) {
    reply.code(401);
    return null;
  }
  const grant = await adminGrantFromRequest(request, user);
  if (!permissions.some((permission) => user.permissions.includes(permission) || grant?.permissions?.includes(permission))) {
    reply.code(403);
    return null;
  }
  return user;
}

export async function auditLog(request, action, entityType, entityId = null, metadata = {}) {
  const actor = await userFromToken(request);
  await query(
    "INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)",
    [actor?.id ?? null, action, entityType, entityId, metadata]
  );
}

export function datePrefix(d = new Date()) {
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function nextOrderNo(serviceType, suffix = "") {
  const stem = `${serviceType === "dine_in" ? "D" : "T"}${datePrefix()}`;
  const row = await one(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(order_no, '-', 2) AS INTEGER)), 0) AS max_seq
     FROM orders WHERE order_no LIKE $1`,
    [`${stem}-%`]
  );
  const next = Number(row?.max_seq ?? 0) + 1;
  const seq = String(next).padStart(3, "0");
  const tag = String(suffix || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
  return tag ? `${stem}-${seq}-${tag}` : `${stem}-${seq}`;
}

export async function insertOrderWithRetry(serviceType, suffix, build) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const no = await nextOrderNo(serviceType, suffix);
    try {
      return await build(no);
    } catch (e) {
      if (e?.code !== "23505") throw e;
    }
  }
  throw new Error("Failed to allocate order number after retries");
}

export async function getSettings() {
  return one("SELECT * FROM settings ORDER BY updated_at DESC LIMIT 1");
}

export function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function safePaymentAttempt(attempt) {
  if (!attempt) return null;
  const payload = attempt.provider_payload || {};
  const session = payload.session || {};
  const events = Array.isArray(session.notificationEvents) ? session.notificationEvents : [];
  return {
    id: attempt.id,
    order_id: attempt.order_id,
    provider: attempt.provider,
    status: attempt.status,
    amount: Number(attempt.amount),
    currency: attempt.currency,
    provider_payment_id: attempt.provider_payment_id,
    provider_session_id: attempt.provider_session_id,
    terminal_id: attempt.terminal_id,
    error_code: attempt.error_code,
    error_message: attempt.error_message,
    terminal_status: session.status || null,
    terminal_prompt: events.at(-1)?.notificationType || null,
    created_at: attempt.created_at,
    updated_at: attempt.updated_at
  };
}

export async function recordPayment({
  orderId,
  method,
  amount,
  changeDue = 0,
  paymentAttemptId = null,
  provider = null,
  providerPaymentId = null,
  terminalId = null,
  cardBrand = null,
  cardLast4 = null,
  authCode = null
}) {
  const client = await pool.connect();
  let payment;
  let updated;
  let paid;
  let tableStatus;
  try {
    await client.query("BEGIN");
    if (paymentAttemptId) {
      await client.query("SELECT id FROM payment_attempts WHERE id = $1 FOR UPDATE", [paymentAttemptId]);
      const existing = await client.query("SELECT * FROM payments WHERE payment_attempt_id = $1", [paymentAttemptId]);
      if (existing.rows[0]) {
        payment = existing.rows[0];
        const orderResult = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
        updated = orderResult.rows[0];
        const paidResult = await client.query("SELECT COALESCE(SUM(amount - change_due), 0)::numeric AS paid FROM payments WHERE order_id = $1", [orderId]);
        paid = paidResult.rows[0];
        await client.query("COMMIT");
        return { payment, order: updated, paid: Number(paid.paid), duplicate: true };
      }
    }

    const orderResult = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    const order = orderResult.rows[0];
    if (!order) throw httpError("Order not found", 404);
    if (order.status === "paid" || order.status === "cancelled") throw httpError("Order is already closed", 409);

    const paymentResult = await client.query(
      `INSERT INTO payments
       (order_id, method, amount, change_due, payment_attempt_id, provider, provider_payment_id, terminal_id, card_brand, card_last4, auth_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [orderId, method, amount, changeDue, paymentAttemptId, provider, providerPaymentId, terminalId, cardBrand, cardLast4, authCode]
    );
    payment = paymentResult.rows[0];
    const paidResult = await client.query("SELECT COALESCE(SUM(amount - change_due), 0)::numeric AS paid FROM payments WHERE order_id = $1", [orderId]);
    paid = paidResult.rows[0];
    updated = order;
    if (Number(paid.paid) >= Number(order.total)) {
      const updatedResult = await client.query("UPDATE orders SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1 RETURNING *", [order.id]);
      updated = updatedResult.rows[0];
      if (updated.table_id) {
        const settingsResult = await client.query("SELECT auto_clear_tables_after_payment FROM settings ORDER BY updated_at DESC LIMIT 1");
        const autoClear = Boolean(settingsResult.rows[0]?.auto_clear_tables_after_payment);
        if (autoClear) {
          await client.query("UPDATE tables SET current_order_id = NULL, status = 'available', opened_at = NULL, updated_at = now() WHERE id = $1", [updated.table_id]);
          tableStatus = "available";
        } else {
          await client.query("UPDATE tables SET status = 'needs_cleaning', updated_at = now() WHERE id = $1", [updated.table_id]);
          tableStatus = "needs_cleaning";
        }
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
    emit("table.status.updated", { table_id: updated.table_id, status: tableStatus ?? "needs_cleaning" });
    emit("order.paid", updated);
  }
  return { payment, order: updated, paid: Number(paid.paid), duplicate: false };
}

export async function listBackupFiles() {
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

export async function createBackup(reason = "manual") {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const filename = `qypos-${stamp}.sql`;
  const filepath = path.join(backupDir, filename);
  await execFileAsync("pg_dump", ["--dbname", process.env.DATABASE_URL, "--file", filepath], { timeout: 120000 });
  await query("UPDATE settings SET last_backup_at = now(), updated_at = now() WHERE id = (SELECT id FROM settings ORDER BY updated_at DESC LIMIT 1)");
  emit("backup.created", { filename, reason });
  return (await listBackupFiles()).find((file) => file.name === filename);
}

export async function maybeAutoBackup() {
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

export function scheduleAutoBackup() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => maybeAutoBackup(), 15 * 60 * 1000);
  maybeAutoBackup().catch((error) => app.log.error({ error }, "initial auto backup check failed"));
}

export async function maybeAutoClearIdleEmptyTables() {
  const settings = await getSettings();
  if (!settings?.auto_clear_empty_tables_after_idle) return;
  const idleMinutes = Math.max(1, Number(settings.auto_clear_empty_tables_idle_minutes || 60));
  const stale = await query(
    `SELECT t.id AS table_id, t.label, o.id AS order_id
     FROM tables t
     JOIN orders o ON o.id = t.current_order_id
     WHERE t.status = 'opened'
       AND o.status = 'draft'
       AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
       AND o.updated_at < now() - ($1 || ' minutes')::interval`,
    [idleMinutes]
  );
  for (const row of stale) {
    try {
      await query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [row.order_id]);
      const updated = await one(
        "UPDATE tables SET current_order_id = NULL, status = 'available', opened_at = NULL, updated_at = now() WHERE id = $1 RETURNING *",
        [row.table_id]
      );
      emit("table.status.updated", updated);
      await query(
        "INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (NULL, 'table.auto_clear_idle', 'table', $1, $2)",
        [row.table_id, { label: row.label, order_id: row.order_id, idle_minutes: idleMinutes }]
      );
    } catch (error) {
      app.log.error({ error, table_id: row.table_id }, "auto clear idle empty table failed");
    }
  }
}

export function scheduleIdleTableClear() {
  if (idleClearTimer) clearInterval(idleClearTimer);
  idleClearTimer = setInterval(() => maybeAutoClearIdleEmptyTables(), 5 * 60 * 1000);
  maybeAutoClearIdleEmptyTables().catch((error) => app.log.error({ error }, "initial idle table clear check failed"));
}

export async function getOrderItems(orderId, options = {}) {
  const where = ["order_id = $1"];
  const params = [orderId];
  if (options.onlyUnprintedKitchen) where.push("kitchen_printed_at IS NULL");
  const items = await query(`SELECT * FROM order_items WHERE ${where.join(" AND ")} ORDER BY created_at`, params);
  for (const item of items) {
    item.modifiers = await query("SELECT * FROM order_item_modifiers WHERE order_item_id = $1", [item.id]);
  }
  return items;
}

export async function recalculateOrder(orderId, overrides = {}) {
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
    // Takeaway/delivery default to no service charge; dine-in follows the global rate
    // unless explicitly toggled per-order. Explicit overrides (incl. false) still win.
    service_charge_exempt: overrides.service_charge_exempt
      ?? current?.service_charge_exempt
      ?? (current?.service_type !== "dine_in"),
    discount_rate: overrides.discount_rate !== undefined ? overrides.discount_rate : (current?.discount_rate != null ? Number(current.discount_rate) : null),
    discount_fixed: overrides.discount_fixed !== undefined ? overrides.discount_fixed : Number(current?.discount_fixed ?? 0),
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

export async function createPrintJob(orderId, type) {
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

export async function updateOrderKitchenState(orderId) {
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

// ── Route modules ──────────────────────────────────────────────────────────
import registerAuth from "./routes/auth.js";
import registerSchedules from "./routes/schedules.js";
import registerUsers from "./routes/users.js";
import registerSettings from "./routes/settings.js";
import registerMenu from "./routes/menu.js";
import registerFloors from "./routes/floors.js";
import registerOrders from "./routes/orders.js";
import registerReports from "./routes/reports.js";
import registerOps from "./routes/ops.js";

const routeCtx = {
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
  datePrefix,
};

registerAuth(routeCtx);
registerSchedules(routeCtx);
registerUsers(routeCtx);
registerSettings(routeCtx);
registerMenu(routeCtx);
registerFloors(routeCtx);
registerOrders(routeCtx);
registerReports(routeCtx);
registerOps(routeCtx);

// ── Start server ──────────────────────────────────────────────────────────
const port = Number(process.env.API_PORT ?? 4000);
scheduleAutoBackup();
scheduleIdleTableClear();
await app.listen({ port, host: "0.0.0.0" });
