// Auto-generated route module: ops
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
