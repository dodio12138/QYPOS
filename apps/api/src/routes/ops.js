// Auto-generated route module: ops
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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
const DELIVEROO_SESSION_KEY = "integration:deliveroo:session";
const DELIVEROO_API_BASE = "https://restaurant-hub-data-api.deliveroo.net";
const DELIVEROO_RESTAURANT_ID = "b3471dbf-0a81-4fdb-9f50-4133b2701e43";
const DELIVEROO_ORG_ID = "574520";
const UBEREATS_SESSION_KEY = "integration:ubereats:session";
const UBEREATS_API_URL = "https://merchants.ubereats.com/manager/api/getHistoricOrders?localeCode=zh-CN";
const UBEREATS_RESTAURANT_ID = "e367614a-0810-5539-b98a-337f3e0ef1cd";
function deliverooDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) throw Object.assign(new Error("日期格式必须是 YYYY-MM-DD"), { statusCode: 400 });
  return value;
}

function normalizeDeliverooToken(value) {
  return String(value || "")
    .trim()
    .replace(/^Authorization:\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function deliverooTokenExpiry(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return Number.isFinite(Number(claims.exp)) ? Number(claims.exp) : null;
  } catch {
    return null;
  }
}

function deliverooTokenFingerprint(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 12);
}

function normalizeUberSession(value) {
  return String(value || "")
    .trim()
    .replace(/^Cookie:\s*/i, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function uberSessionExpiry(cookie) {
  const expiries = [];
  for (const piece of String(cookie || "").split(";")) {
    const separator = piece.indexOf("=");
    if (separator < 0) continue;
    const name = piece.slice(0, separator).trim();
    const value = piece.slice(separator + 1).trim();
    if (!/^(?:jwt-session|jwt-session-uem|uap-jwt-session)$/i.test(name)) continue;
    const parts = value.split(".");
    if (parts.length < 2) continue;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (Number.isFinite(Number(claims.exp))) expiries.push(Number(claims.exp));
    } catch {
      // Some session cookies are opaque; keep the cookie and use the default TTL.
    }
  }
  return expiries.length ? Math.min(...expiries) : null;
}

function parseUberMoney(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0]) * 100) : 0;
}

function uberLocalDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function uberOrderTimestamp(value) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function uberOrderSummary(order) {
  const cancelled = Boolean(String(order.canceledBy || "").trim() || String(order.missedBy || "").trim());
  return {
    order_number: order.orderId ?? null,
    short_drn: order.orderId ?? null,
    order_id: order.orderUuid || order.workflowUuid || order.orderId || null,
    status: cancelled ? "cancelled" : "delivered",
    amount_pence: parseUberMoney(order.salesTotal),
    paid_in_cash_pence: 0,
    placed_at: uberOrderTimestamp(order.requestedAt),
    rejection_reason: cancelled ? (order.canceledBy || order.missedBy || null) : null,
    net_payout_pence: parseUberMoney(order.netPayout),
    fulfillment_type: order.fulfillmentType ?? null
  };
}

function uberSyncBody({ restaurantId, periodStart, periodEnd, cursor }) {
  return {
    filters: {
      currentTab: "",
      displayCurrencyCode: "",
      locationConstraints: { cities: [], countries: [], locationUuids: [restaurantId] },
      dateFilter: {
        startDate: uberLocalDateTime(periodStart),
        endDate: uberLocalDateTime(new Date(periodEnd.getTime() - 1000)),
        lastUpdatedAt: ""
      },
      isEatsPassSubscriber: false,
      search: null,
      orderIssuesV2: [],
      issueOrderStatusFilter: [],
      displayByocIssues: false
    },
    sort: { sortColumn: "SORT_COLUMN_ORDER_COMPLETED_AT", sortDirection: "SORT_DIRECTION_DESC" },
    pagingInfo: { cursor, limit: 20, nextTable: "liveOrders" },
    pagination: { cursor, nextTable: "historyOrders", limit: 20 }
  };
}

async function uberEatsFetchOrders({ cookie, restaurantId, periodStart, periodEnd }) {
  const orders = [];
  const pages = [];
  let cursor = "";
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(UBEREATS_API_URL, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "https://merchants.ubereats.com",
        Referer: `https://merchants.ubereats.com/manager/orders?restaurantUUID=${encodeURIComponent(restaurantId)}&dateRange=custom`,
        "User-Agent": "Mozilla/5.0 QYPOS Uber Eats sales sync",
        "X-CSRF-Token": "x",
        "X-Feature-Flags": JSON.stringify({ featureKey: "OrdersList", isMobile: "false", isEmbedded: "false", userCohort: "MEMBERSHIP_LESS_THAN_500", pageName: "orders", operationMetricsUDLFlowEnabled: "true", isUEMOperationMetricsConsistencyEnabled: "true" })
      },
      body: JSON.stringify(uberSyncBody({ restaurantId, periodStart, periodEnd, cursor })),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(response.status === 401 || response.status === 403
        ? "Uber Eats 会话已失效或没有门店权限，请从后台复制最新 Cookie 后重新保存"
        : response.status === 404
          ? "Uber Eats 历史订单接口不存在或页面会话已变化"
          : `Uber Eats 请求失败 (${response.status})`);
      error.statusCode = response.status === 401 || response.status === 403 ? 401 : 502;
      error.detail = body.slice(0, 300);
      throw error;
    }
    const payload = await response.json();
    pages.push(payload);
    const batch = Array.isArray(payload?.data?.orders) ? payload.data.orders : [];
    orders.push(...batch);
    const next = payload?.data?.paginationResult?.nextCursor || payload?.paginationResult?.nextCursor || "";
    if (!next || batch.length === 0 || next === cursor) break;
    cursor = next;
  }
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const filtered = orders.map(uberOrderSummary).filter((order) => {
    const requested = Date.parse(order.placed_at || "");
    return !Number.isFinite(requested) || (requested >= start && requested < end);
  });
  return { orders: filtered, pages };
}

async function syncUberEatsSales({ session, businessDate, periodStart, periodEnd }) {
  const result = await uberEatsFetchOrders({ cookie: session.token, restaurantId: session.restaurant_id, periodStart, periodEnd });
  const delivered = result.orders.filter((order) => order.status === "delivered");
  const safePages = result.pages.map((page) => ({
    status: page?.status || null,
    ordersCount: page?.data?.ordersCount ?? null,
    paginationResult: page?.data?.paginationResult || null,
    lastUpdatedAtUtc: page?.data?.lastUpdatedAtUtc || null
  }));
  const snapshot = await one(
    `INSERT INTO delivery_sales_snapshots
     (platform, restaurant_id, org_id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, orders, raw_payload, synced_at)
     VALUES ('ubereats', $1, '', $2, $3, $4, $5, $6, $7, $8, 'GBP', $9::jsonb, $10::jsonb, now())
     ON CONFLICT (platform, restaurant_id, period_start, period_end) DO UPDATE SET
       business_date = EXCLUDED.business_date, order_count = EXCLUDED.order_count,
       delivered_order_count = EXCLUDED.delivered_order_count, gross_amount_pence = EXCLUDED.gross_amount_pence,
       paid_in_cash_pence = EXCLUDED.paid_in_cash_pence, orders = EXCLUDED.orders, raw_payload = EXCLUDED.raw_payload, synced_at = now()
     RETURNING id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, synced_at`,
    [session.restaurant_id, businessDate, periodStart.toISOString(), periodEnd.toISOString(), result.orders.length, delivered.length,
      delivered.reduce((sum, order) => sum + order.amount_pence, 0), delivered.reduce((sum, order) => sum + order.paid_in_cash_pence, 0), JSON.stringify(result.orders), JSON.stringify(safePages)]
  );
  return { ...snapshot, gross_amount: Number(snapshot.gross_amount_pence) / 100, paid_in_cash: Number(snapshot.paid_in_cash_pence) / 100 };
}

async function getUberEatsSession() {
  const cached = await redis.get(UBEREATS_SESSION_KEY);
  if (cached) return JSON.parse(cached);
  const row = await one("SELECT restaurant_id, token_ciphertext, token_iv, token_tag, token_expires_at FROM integration_credentials WHERE platform = 'ubereats'");
  if (!row) return null;
  const token = decryptDeliverooToken(row);
  const tokenExp = uberSessionExpiry(token);
  if (tokenExp && tokenExp <= Math.floor(Date.now() / 1000)) return null;
  const expiresAt = tokenExp ? new Date(tokenExp * 1000).toISOString() : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const ttlSeconds = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const session = { token, restaurant_id: row.restaurant_id, expires_at: expiresAt, token_expires_at: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null };
  await redis.set(UBEREATS_SESSION_KEY, JSON.stringify(session), "EX", ttlSeconds);
  return session;
}

function deliverooEncryptionKey() {
  return crypto.createHash("sha256")
    .update(process.env.DELIVEROO_TOKEN_ENCRYPTION_KEY || process.env.DATABASE_URL || "qypos-deliveroo-token")
    .digest();
}

function encryptDeliverooToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deliverooEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decryptDeliverooToken(row) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", deliverooEncryptionKey(), Buffer.from(row.token_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.token_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function deliverooIso(value, fallback) {
  const date = new Date(value || fallback);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error("时间格式无效"), { statusCode: 400 });
  return date;
}

function deliverooOrderSummary(order) {
  return {
    order_number: order.order_number ?? null,
    short_drn: order.short_drn ?? null,
    order_id: order.order_id ?? null,
    status: order.status ?? null,
    amount_pence: Number(order.amount?.fractional || 0),
    paid_in_cash_pence: Number(order.paid_in_cash?.fractional || 0),
    placed_at: order.timeline?.placed_at ?? null,
    rejection_reason: order.rejection_reason ?? null
  };
}

async function deliverooFetchOrders({ token, orgId, restaurantId, periodStart, periodEnd }) {
  // Normalize on every request as well as when saving the session. This keeps
  // older Redis sessions safe if the pasted value included `Bearer ` or the
  // full `Authorization:` prefix.
  const safeToken = normalizeDeliverooToken(token);
  const startDate = localDateString(periodStart);
  const lastDate = localDateString(new Date(periodEnd.getTime() - 1));
  const orders = [];
  const pages = [];
  const dayCursor = new Date(`${startDate}T00:00:00`);
  const lastDay = new Date(`${lastDate}T00:00:00`);
  for (; dayCursor <= lastDay; dayCursor.setDate(dayCursor.getDate() + 1)) {
    const day = localDateString(dayCursor);
    const nextDay = new Date(dayCursor);
    nextDay.setDate(nextDay.getDate() + 1);
    let cursor = "";
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({
        payment_type: "all",
        limit: "100",
        date: day,
        end_date: localDateString(nextDay),
        starting_after: cursor,
        sort_date: "",
        with_summary: "no"
      });
      const response = await fetch(`${DELIVEROO_API_BASE}/api/restaurants/${encodeURIComponent(restaurantId)}/orders?${params}`, {
      headers: {
        Authorization: `Bearer ${safeToken}`,
        "X-Roo-Org-Id": orgId,
        "X-Hub-Api-Caller": "https://partner-hub.deliveroo.com",
        Referer: "https://partner-hub.deliveroo.com/",
        "User-Agent": "Mozilla/5.0 QYPOS Deliveroo sales sync",
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
      const body = await response.text();
      console.warn(`[deliveroo] upstream status=${response.status} restaurant=${restaurantId} org=${orgId}`);
      const error = new Error(response.status === 401
          ? "Deliveroo 拒绝了当前 Bearer 请求；请确认粘贴的是 token 内容（可带 Bearer 前缀），并重新保存"
        : response.status === 403
          ? "Deliveroo 拒绝了当前 token，请确认登录账号和组织权限"
          : response.status === 404
            ? "Deliveroo 找不到订单接口资源，请确认当前 token 对应的餐厅和组织权限"
          : `Deliveroo 请求失败 (${response.status})`);
      error.statusCode = response.status === 401 || response.status === 403 ? 401 : 502;
      error.detail = body.slice(0, 300);
      throw error;
      }
      const payload = await response.json();
      pages.push(payload);
      const batch = Array.isArray(payload.orders) ? payload.orders : [];
      orders.push(...batch);
      const next = payload.next_starting_after
      || payload.pagination?.next_starting_after
      || payload.pagination?.next_cursor
      || payload.pagination?.next_starting_after_cursor
      || payload.next_starting_after_cursor
      || payload.next_page?.starting_after
      || payload.next_page?.cursor
      || payload.next_cursor
      || "";
      if (batch.length === 0 || batch.length >= Number(payload.total_orders || 0)) break;
      if (!next) {
        console.warn(`[deliveroo] pagination missing cursor day=${day} total=${Number(payload.total_orders || 0)} fetched=${batch.length} keys=${Object.keys(payload).sort().join(",")}`);
        throw new Error(`Deliveroo 在 ${day} 返回的订单超过单页限制，但没有提供分页游标`);
      }
      if (next === cursor) throw new Error("Deliveroo 分页游标未变化");
      cursor = next;
    }
  }
  const start = periodStart.getTime();
  const end = periodEnd.getTime();
  const filtered = orders.map(deliverooOrderSummary).filter((order) => {
    const placed = Date.parse(order.placed_at || "");
    return Number.isFinite(placed) && placed >= start && placed < end;
  });
  return { orders: filtered, pages };
}

async function syncDeliverooSales({ session, businessDate, periodStart, periodEnd }) {
  const result = await deliverooFetchOrders({
    token: session.token,
    orgId: session.org_id,
    restaurantId: session.restaurant_id,
    periodStart,
    periodEnd
  });
  const delivered = result.orders.filter((order) => order.status === "delivered");
  const snapshot = await one(
    `INSERT INTO delivery_sales_snapshots
     (platform, restaurant_id, org_id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, orders, raw_payload, synced_at)
     VALUES ('deliveroo', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'GBP', $10::jsonb, $11::jsonb, now())
     ON CONFLICT (platform, restaurant_id, period_start, period_end) DO UPDATE SET
       org_id = EXCLUDED.org_id, business_date = EXCLUDED.business_date, order_count = EXCLUDED.order_count,
       delivered_order_count = EXCLUDED.delivered_order_count, gross_amount_pence = EXCLUDED.gross_amount_pence,
       paid_in_cash_pence = EXCLUDED.paid_in_cash_pence, orders = EXCLUDED.orders, raw_payload = EXCLUDED.raw_payload, synced_at = now()
     RETURNING id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, synced_at`,
    [session.restaurant_id, session.org_id, businessDate, periodStart.toISOString(), periodEnd.toISOString(), result.orders.length, delivered.length,
      delivered.reduce((sum, order) => sum + order.amount_pence, 0), delivered.reduce((sum, order) => sum + order.paid_in_cash_pence, 0), JSON.stringify(result.orders), JSON.stringify(result.pages)]
  );
  return { ...snapshot, gross_amount: Number(snapshot.gross_amount_pence) / 100, paid_in_cash: Number(snapshot.paid_in_cash_pence) / 100 };
}

async function getDeliverooSession() {
  const cached = await redis.get(DELIVEROO_SESSION_KEY);
  if (cached) return JSON.parse(cached);
  const row = await one("SELECT restaurant_id, org_id, token_ciphertext, token_iv, token_tag, token_expires_at FROM integration_credentials WHERE platform = 'deliveroo'");
  if (!row) return null;
  const token = decryptDeliverooToken(row);
  const tokenExp = deliverooTokenExpiry(token);
  if (tokenExp && tokenExp <= Math.floor(Date.now() / 1000)) return null;
  const expiresAt = tokenExp ? new Date(tokenExp * 1000).toISOString() : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const ttlSeconds = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const session = { token, restaurant_id: row.restaurant_id, org_id: row.org_id, expires_at: expiresAt, token_expires_at: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null };
  await redis.set(DELIVEROO_SESSION_KEY, JSON.stringify(session), "EX", ttlSeconds);
  return session;
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

let lastAutomaticDeliverooSync = "";
async function runAutomaticDeliverooSync() {
  const setting = await one("SELECT delivery_auto_sync_enabled FROM settings ORDER BY updated_at DESC LIMIT 1");
  if (!setting?.delivery_auto_sync_enabled) return;
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (minute !== 0 || ![14, 23].includes(hour)) return;
  const date = localDateString(now);
  const slot = `${date}:${hour}`;
  if (lastAutomaticDeliverooSync === slot) return;
  lastAutomaticDeliverooSync = slot;
  const session = await getDeliverooSession();
  if (!session) return;
  const periodStart = new Date(`${date}T${hour === 14 ? "00:00:00" : "14:00:00"}`);
  const periodEnd = new Date(`${date}T${hour === 14 ? "14:00:00" : "23:00:00"}`);
  try {
    const snapshot = await syncDeliverooSales({ session, businessDate: date, periodStart, periodEnd });
    await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (NULL, $1, $2, $3, $4)", [
      "deliveroo.sales.auto_sync", "delivery_sales_snapshot", snapshot.id, { business_date: date, slot: hour, order_count: snapshot.order_count }
    ]);
  } catch (error) {
    console.error(`[deliveroo] automatic sync failed for ${slot}: ${error.message}`);
  }
}
const deliverooSyncTimer = setInterval(() => { runAutomaticDeliverooSync().catch((error) => console.error(`[deliveroo] scheduler error: ${error.message}`)); }, 60 * 1000);
deliverooSyncTimer.unref?.();

app.get("/ops/integrations/auto-sync", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const row = await one("SELECT delivery_auto_sync_enabled FROM settings ORDER BY updated_at DESC LIMIT 1");
  return { enabled: Boolean(row?.delivery_auto_sync_enabled), times: ["14:00", "23:00"], timezone: "Europe/London" };
});

app.put("/ops/integrations/auto-sync", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const body = request.body ?? {};
  if (typeof body.enabled !== "boolean") {
    reply.code(400);
    return { error: "enabled 必须是布尔值" };
  }
  const settings = await one(
    "UPDATE settings SET delivery_auto_sync_enabled = $1, updated_at = now() WHERE id = (SELECT id FROM settings ORDER BY updated_at DESC LIMIT 1) RETURNING delivery_auto_sync_enabled",
    [body.enabled]
  );
  await auditLog(request, "delivery.sales.auto_sync_setting", "settings", null, { enabled: body.enabled, times: ["14:00", "23:00"], timezone: "Europe/London" });
  return { enabled: Boolean(settings?.delivery_auto_sync_enabled), times: ["14:00", "23:00"], timezone: "Europe/London" };
});

app.get("/ops/integrations/deliveroo/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const session = await getDeliverooSession();
  if (!session) {
    const row = await one("SELECT restaurant_id, org_id, token_expires_at FROM integration_credentials WHERE platform = 'deliveroo'");
    return {
      configured: false,
      expired: Boolean(row?.token_expires_at && new Date(row.token_expires_at).getTime() <= Date.now()),
      restaurant_id: row?.restaurant_id || DELIVEROO_RESTAURANT_ID,
      org_id: row?.org_id || DELIVEROO_ORG_ID,
      expires_at: row?.token_expires_at ? new Date(row.token_expires_at).toISOString() : null
    };
  }
  return {
    configured: true,
    restaurant_id: DELIVEROO_RESTAURANT_ID,
    org_id: DELIVEROO_ORG_ID,
    expires_at: session.expires_at,
    token_expires_at: session.token_expires_at || null
  };
});

app.post("/ops/integrations/deliveroo/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const body = request.body ?? {};
  const token = normalizeDeliverooToken(body.token);
  const restaurantId = DELIVEROO_RESTAURANT_ID;
  const orgId = DELIVEROO_ORG_ID;
  if (!token) {
    reply.code(400);
    return { error: "需要填写 Deliveroo token、餐厅 ID 和组织 ID" };
  }
  const tokenExp = deliverooTokenExpiry(token);
  if (tokenExp && tokenExp <= Math.floor(Date.now() / 1000)) {
    console.warn(`[deliveroo] rejected expired token fingerprint=${deliverooTokenFingerprint(token)} exp=${tokenExp} now=${Math.floor(Date.now() / 1000)}`);
    reply.code(400);
    return { error: `这个 Deliveroo token 的 JWT 已过期（${new Date(tokenExp * 1000).toISOString()}），请确认复制的是当前浏览器请求里的最新 token` };
  }
  const sessionExpiresAtMs = tokenExp ? Math.min(Date.now() + 12 * 60 * 60 * 1000, tokenExp * 1000) : Date.now() + 12 * 60 * 60 * 1000;
  const expiresAt = new Date(sessionExpiresAtMs).toISOString();
  const ttlSeconds = Math.max(1, Math.ceil((sessionExpiresAtMs - Date.now()) / 1000));
  const encrypted = encryptDeliverooToken(token);
  await query(
    `INSERT INTO integration_credentials (platform, restaurant_id, org_id, token_ciphertext, token_iv, token_tag, token_expires_at, updated_at)
     VALUES ('deliveroo', $1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (platform) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id, org_id = EXCLUDED.org_id,
       token_ciphertext = EXCLUDED.token_ciphertext, token_iv = EXCLUDED.token_iv, token_tag = EXCLUDED.token_tag,
       token_expires_at = EXCLUDED.token_expires_at, updated_at = now()`,
    [restaurantId, orgId, encrypted.ciphertext, encrypted.iv, encrypted.tag, tokenExp ? new Date(tokenExp * 1000).toISOString() : null]
  );
  await redis.set(DELIVEROO_SESSION_KEY, JSON.stringify({ token, restaurant_id: restaurantId, org_id: orgId, expires_at: expiresAt, token_expires_at: tokenExp ? new Date(tokenExp * 1000).toISOString() : null }), "EX", ttlSeconds);
  await auditLog(request, "deliveroo.session.set", "integration", null, { restaurant_id: restaurantId, org_id: orgId });
  return { configured: true, restaurant_id: restaurantId, org_id: orgId, expires_at: expiresAt };
});

app.delete("/ops/integrations/deliveroo/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  await redis.del(DELIVEROO_SESSION_KEY);
  await query("DELETE FROM integration_credentials WHERE platform = 'deliveroo'");
  await auditLog(request, "deliveroo.session.clear", "integration", null, {});
  return { configured: false };
});

app.post("/ops/integrations/deliveroo/sync", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const session = await getDeliverooSession();
  if (!session) {
    reply.code(409);
    return { error: "请先设置 Deliveroo 临时 token" };
  }
  const body = request.body ?? {};
  const businessDate = deliverooDate(body.business_date);
  const periodStart = deliverooIso(body.period_start, `${businessDate}T00:00:00+01:00`);
  const periodEnd = deliverooIso(body.period_end, `${businessDate}T23:59:59+01:00`);
  if (periodEnd <= periodStart) {
    reply.code(400);
    return { error: "结束时间必须晚于开始时间" };
  }
  try {
    const snapshot = await syncDeliverooSales({ session, businessDate, periodStart, periodEnd });
    await auditLog(request, "deliveroo.sales.sync", "delivery_sales_snapshot", snapshot.id, { business_date: businessDate, order_count: snapshot.order_count });
    return { ...snapshot, gross_amount: Number(snapshot.gross_amount_pence) / 100, paid_in_cash: Number(snapshot.paid_in_cash_pence) / 100 };
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message, detail: error.detail };
  }
});

app.get("/ops/integrations/deliveroo/snapshots", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  return query(
    `SELECT id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, synced_at
     FROM delivery_sales_snapshots WHERE platform = 'deliveroo' ORDER BY period_start DESC LIMIT 100`
  ).then((rows) => rows.map((row) => ({ ...row, gross_amount: Number(row.gross_amount_pence) / 100, paid_in_cash: Number(row.paid_in_cash_pence) / 100 })));
});

let lastAutomaticUberEatsSync = "";
async function runAutomaticUberEatsSync() {
  const setting = await one("SELECT delivery_auto_sync_enabled FROM settings ORDER BY updated_at DESC LIMIT 1");
  if (!setting?.delivery_auto_sync_enabled) return;
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (minute !== 0 || ![14, 23].includes(hour)) return;
  const date = localDateString(now);
  const slot = `${date}:${hour}`;
  if (lastAutomaticUberEatsSync === slot) return;
  lastAutomaticUberEatsSync = slot;
  const session = await getUberEatsSession();
  if (!session) return;
  const periodStart = new Date(`${date}T${hour === 14 ? "00:00:00" : "14:00:00"}`);
  const periodEnd = new Date(`${date}T${hour === 14 ? "14:00:00" : "23:00:00"}`);
  try {
    const snapshot = await syncUberEatsSales({ session, businessDate: date, periodStart, periodEnd });
    await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (NULL, $1, $2, $3, $4)", [
      "ubereats.sales.auto_sync", "delivery_sales_snapshot", snapshot.id, { business_date: date, slot: hour, order_count: snapshot.order_count }
    ]);
  } catch (error) {
    console.error(`[ubereats] automatic sync failed for ${slot}: ${error.message}`);
  }
}
const uberEatsSyncTimer = setInterval(() => { runAutomaticUberEatsSync().catch((error) => console.error(`[ubereats] scheduler error: ${error.message}`)); }, 60 * 1000);
uberEatsSyncTimer.unref?.();

app.get("/ops/integrations/ubereats/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const session = await getUberEatsSession();
  if (!session) {
    const row = await one("SELECT restaurant_id, token_expires_at FROM integration_credentials WHERE platform = 'ubereats'");
    return {
      configured: false,
      expired: Boolean(row?.token_expires_at && new Date(row.token_expires_at).getTime() <= Date.now()),
      restaurant_id: row?.restaurant_id || UBEREATS_RESTAURANT_ID,
      expires_at: row?.token_expires_at ? new Date(row.token_expires_at).toISOString() : null
    };
  }
  return { configured: true, restaurant_id: UBEREATS_RESTAURANT_ID, expires_at: session.expires_at, token_expires_at: session.token_expires_at || null };
});

app.post("/ops/integrations/ubereats/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const body = request.body ?? {};
  const cookie = normalizeUberSession(body.cookie || body.token);
  if (!cookie) {
    reply.code(400);
    return { error: "需要填写 Uber Eats Cookie" };
  }
  const tokenExp = uberSessionExpiry(cookie);
  if (tokenExp && tokenExp <= Math.floor(Date.now() / 1000)) {
    reply.code(400);
    return { error: `这个 Uber Eats 会话已过期（${new Date(tokenExp * 1000).toISOString()}），请从后台复制最新 Cookie` };
  }
  const sessionExpiresAtMs = tokenExp ? Math.min(Date.now() + 12 * 60 * 60 * 1000, tokenExp * 1000) : Date.now() + 12 * 60 * 60 * 1000;
  const expiresAt = new Date(sessionExpiresAtMs).toISOString();
  const ttlSeconds = Math.max(1, Math.ceil((sessionExpiresAtMs - Date.now()) / 1000));
  const encrypted = encryptDeliverooToken(cookie);
  await query(
    `INSERT INTO integration_credentials (platform, restaurant_id, org_id, token_ciphertext, token_iv, token_tag, token_expires_at, updated_at)
     VALUES ('ubereats', $1, '', $2, $3, $4, $5, now())
     ON CONFLICT (platform) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id, org_id = EXCLUDED.org_id,
       token_ciphertext = EXCLUDED.token_ciphertext, token_iv = EXCLUDED.token_iv, token_tag = EXCLUDED.token_tag,
       token_expires_at = EXCLUDED.token_expires_at, updated_at = now()`,
    [UBEREATS_RESTAURANT_ID, encrypted.ciphertext, encrypted.iv, encrypted.tag, tokenExp ? new Date(tokenExp * 1000).toISOString() : null]
  );
  await redis.set(UBEREATS_SESSION_KEY, JSON.stringify({ token: cookie, restaurant_id: UBEREATS_RESTAURANT_ID, expires_at: expiresAt, token_expires_at: tokenExp ? new Date(tokenExp * 1000).toISOString() : null }), "EX", ttlSeconds);
  await auditLog(request, "ubereats.session.set", "integration", null, { restaurant_id: UBEREATS_RESTAURANT_ID });
  return { configured: true, restaurant_id: UBEREATS_RESTAURANT_ID, expires_at: expiresAt };
});

app.delete("/ops/integrations/ubereats/session", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  await redis.del(UBEREATS_SESSION_KEY);
  await query("DELETE FROM integration_credentials WHERE platform = 'ubereats'");
  await auditLog(request, "ubereats.session.clear", "integration", null, {});
  return { configured: false };
});

app.post("/ops/integrations/ubereats/sync", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const session = await getUberEatsSession();
  if (!session) {
    reply.code(409);
    return { error: "请先设置 Uber Eats Cookie" };
  }
  const body = request.body ?? {};
  const businessDate = deliverooDate(body.business_date);
  const periodStart = deliverooIso(body.period_start, `${businessDate}T00:00:00+01:00`);
  const periodEnd = deliverooIso(body.period_end, `${businessDate}T23:59:59+01:00`);
  if (periodEnd <= periodStart) {
    reply.code(400);
    return { error: "结束时间必须晚于开始时间" };
  }
  try {
    const snapshot = await syncUberEatsSales({ session, businessDate, periodStart, periodEnd });
    await auditLog(request, "ubereats.sales.sync", "delivery_sales_snapshot", snapshot.id, { business_date: businessDate, order_count: snapshot.order_count });
    return { ...snapshot, gross_amount: Number(snapshot.gross_amount_pence) / 100, paid_in_cash: Number(snapshot.paid_in_cash_pence) / 100 };
  } catch (error) {
    reply.code(error.statusCode || 502);
    return { error: error.message, detail: error.detail };
  }
});

app.get("/ops/integrations/ubereats/snapshots", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  return query(
    `SELECT id, business_date, period_start, period_end, order_count, delivered_order_count, gross_amount_pence, paid_in_cash_pence, currency, synced_at
     FROM delivery_sales_snapshots WHERE platform = 'ubereats' ORDER BY period_start DESC LIMIT 100`
  ).then((rows) => rows.map((row) => ({ ...row, gross_amount: Number(row.gross_amount_pence) / 100, paid_in_cash: Number(row.paid_in_cash_pence) / 100 })));
});

app.get("/ops/health", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
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
  if (!await requirePermission(request, reply, "manage_ops")) return;
  return listBackupFiles();
});

app.post("/ops/backups", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
  const file = await createBackup("manual");
  await auditLog(request, "backup.create", "backup", null, file);
  return file;
});

app.get("/ops/backups/:name", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_ops")) return;
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
}
