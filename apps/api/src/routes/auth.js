// Auto-generated route module: auth
import fs from "node:fs/promises";
import path from "node:path";
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
app.get("/health", async () => {
  await pool.query("SELECT 1");
  await redis.ping();
  const pkg = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "../../package.json"), "utf-8"));
  return { ok: true, version: pkg.version };
});

// ── Custom error handler: prevent stack-trace leaks to clients ─────────────
app.setErrorHandler((error, request, reply) => {
  app.log.error({ err: error, url: request.url }, "unhandled error");
  const isProduction = process.env.NODE_ENV === "production";
  reply.code(error.statusCode || 500).send({
    error: isProduction ? "Internal server error" : error.message,
    ...(isProduction ? {} : { detail: error.stack?.split("\n")[0] }),
  });
});

app.get("/ws", { websocket: true }, (connection) => {
  const socket = connection.socket ?? connection;
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

app.post("/auth/login", async (request, reply) => {
  const body = request.body ?? {};
  const name = String(body.name ?? "").trim();
  const plainPin = String(body.pin ?? "").trim();
  if (!name || !plainPin) {
    reply.code(401);
    return { error: "Invalid credentials" };
  }
  // Rate limit: max N failed attempts per IP per window
  const ip = clientIp(request);
  const rateKey = `login_rate:${ip}`;
  const blocked = await checkRateLimit(rateKey, LOGIN_RATE_MAX_ATTEMPTS, LOGIN_RATE_WINDOW);
  if (blocked) {
    reply.code(429);
    return { error: "Too many login attempts. Please wait and try again." };
  }
  const row = await one(
    `SELECT u.id, u.name, u.pin, r.name AS role, r.permissions
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.name = $1 AND u.active = true`,
    [name]
  );
  if (!row) {
    reply.code(401);
    return { error: "Invalid credentials" };
  }
  const { valid, upgraded } = verifyPin(plainPin, row.pin);
  if (!valid) {
    reply.code(401);
    return { error: "Invalid credentials" };
  }
  // Reset rate limit on successful login
  await redis.del(rateKey);
  // Auto-upgrade legacy plaintext PIN to hash
  if (upgraded) {
    await pool.query("UPDATE users SET pin = $1 WHERE id = $2", [upgraded, row.id]);
  }
  const user = { id: row.id, name: row.name, role: row.role, permissions: normalizePermissions(row.permissions) };
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`, JSON.stringify(user), "EX", 60 * 60 * 12);
  await auditLog({ headers: { authorization: `Bearer ${token}` } }, "auth.login", "user", user.id, { role: user.role });
  return { token, user };
});

app.get("/auth/me", async (request, reply) => {
  const sessionUser = await userFromToken(request);
  if (!sessionUser) {
    reply.code(401);
    return { error: "Not authenticated" };
  }
  const user = await one(
    `SELECT u.id, u.name, r.name AS role, r.permissions
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.active = true`,
    [sessionUser.id]
  );
  if (!user) {
    reply.code(401);
    return { error: "Account is inactive or no longer exists" };
  }
  user.permissions = normalizePermissions(user.permissions);
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) await redis.set(`session:${token}`, JSON.stringify(user), "KEEPTTL");
  return user;
});

app.post("/auth/logout", async (request) => {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) await redis.del(`session:${token}`);
  return { ok: true };
});

app.post("/auth/admin-grant", async (request, reply) => {
  const subject = await userFromToken(request);
  if (!subject) { reply.code(401); return { error: "Not authenticated" }; }
  const body = request.body ?? {};
  const scope = String(body.scope ?? "");
  const permissions = ADMIN_GRANT_SCOPES[scope];
  if (!permissions) { reply.code(400); return { error: "Invalid admin scope" }; }
  const name = String(body.name ?? "").trim();
  const plainPin = String(body.pin ?? "").trim();
  if (!name || !plainPin) {
    reply.code(401);
    return { error: "管理员账号或 PIN 不正确，或权限不足" };
  }
  // Rate limit: max N failed admin-grant attempts per IP per window
  const ip = clientIp(request);
  const rateKey = `admin_grant_rate:${ip}`;
  const blocked = await checkRateLimit(rateKey, ADMIN_GRANT_RATE_MAX_ATTEMPTS, LOGIN_RATE_WINDOW);
  if (blocked) {
    reply.code(429);
    return { error: "Too many attempts. Please wait and try again." };
  }
  const row = await one(
    `SELECT u.id, u.name, u.pin, r.permissions
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.name = $1 AND u.active = true`,
    [name]
  );
  if (!row) {
    reply.code(401);
    return { error: "管理员账号或 PIN 不正确，或权限不足" };
  }
  const { valid, upgraded } = verifyPin(plainPin, row.pin);
  if (!valid) {
    reply.code(401);
    return { error: "管理员账号或 PIN 不正确，或权限不足" };
  }
  // Reset rate limit on success
  await redis.del(rateKey);
  if (upgraded) {
    await pool.query("UPDATE users SET pin = $1 WHERE id = $2", [upgraded, row.id]);
  }
  const admin = { id: row.id, name: row.name, permissions: normalizePermissions(row.permissions) };
  if (!permissions.every((permission) => admin.permissions.includes(permission))) {
    reply.code(401);
    return { error: "管理员账号或 PIN 不正确，或权限不足" };
  }
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`admin-grant:${token}`, JSON.stringify({
    subject_user_id: subject.id,
    admin_user_id: admin.id,
    scope,
    permissions,
  }), "EX", ADMIN_GRANT_TTL_SECONDS);
  await auditLog(request, "auth.admin_grant", "user", subject.id, { admin_user_id: admin.id, scope });
  return { token, scope, expires_in: ADMIN_GRANT_TTL_SECONDS };
});

app.delete("/auth/admin-grant", async (request) => {
  const subject = await userFromToken(request);
  const token = request.headers["x-qypos-admin-grant"] ?? null;
  if (subject && token) {
    const grant = await adminGrantFromRequest(request, subject);
    if (grant) await redis.del(`admin-grant:${token}`);
  }
  return { ok: true };
});

}
