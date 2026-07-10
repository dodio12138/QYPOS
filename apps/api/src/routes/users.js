// Auto-generated route module: users

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
app.get("/users", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_users")) return;
  return query(
    `SELECT u.id, u.name, u.active, r.id AS role_id, r.name AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     ORDER BY u.name`
  );
});

app.get("/roles", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_users")) return;
  return query("SELECT id, name FROM roles ORDER BY name");
});

app.post("/users", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_users")) return;
  const body = request.body ?? {};
  const name = String(body.name ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!name) { reply.code(400); return { error: "Name is required" }; }
  if (!pin) { reply.code(400); return { error: "PIN is required" }; }
  const roleId = String(body.role_id ?? "");
  const role = UUID_PATTERN.test(roleId) ? await one("SELECT id FROM roles WHERE id = $1", [roleId]) : null;
  if (!role) { reply.code(400); return { error: "A valid role is required" }; }
  const exists = await one("SELECT id FROM users WHERE name = $1", [name]);
  if (exists) { reply.code(409); return { error: "User already exists" }; }
  const hashedPin = hashPin(pin);
  const user = await one(
    "INSERT INTO users (role_id, name, pin, active) VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING *",
    [role.id, name, hashedPin, body.active]
  );
  await auditLog(request, "user.create", "user", user.id, { name: user.name });
  return user;
});

app.patch("/users/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_users")) return;
  if (!UUID_PATTERN.test(request.params.id)) { reply.code(400); return { error: "Invalid user id" }; }
  const body = request.body ?? {};
  if (body.role_id !== undefined) {
    const roleId = String(body.role_id ?? "");
    const role = UUID_PATTERN.test(roleId) ? await one("SELECT id FROM roles WHERE id = $1", [roleId]) : null;
    if (!role) { reply.code(400); return { error: "A valid role is required" }; }
  }
  const hashedPin = body.pin ? hashPin(String(body.pin).trim()) : null;
  const user = await one(
    `UPDATE users SET
      name = COALESCE($2, name),
      pin = COALESCE($3, pin),
      role_id = COALESCE($4, role_id),
      active = COALESCE($5, active)
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name ?? null, hashedPin, body.role_id ?? null, body.active ?? null]
  );
  if (!user) { reply.code(404); return { error: "User not found" }; }
  await auditLog(request, "user.update", "user", user.id, { name: user.name });
  return user;
});

app.delete("/users/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_users")) return;
  if (!UUID_PATTERN.test(request.params.id)) { reply.code(400); return { error: "Invalid user id" }; }
  const user = await one("DELETE FROM users WHERE id = $1 RETURNING *", [request.params.id]);
  if (!user) { reply.code(404); return { error: "User not found" }; }
  await auditLog(request, "user.delete", "user", user.id, { name: user.name });
  return user;
});
}
