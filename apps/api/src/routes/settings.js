// Auto-generated route module: settings

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
app.get("/settings", async () => {
  const settings = await getSettings();
  if (!settings) return settings;
  // Ensure printer_profiles always has the effective list (with defaults) so the frontend can display them
  return { ...settings, printer_profiles: printerProfiles(settings) };
});

app.put("/settings", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_settings")) return;
  const body = request.body ?? {};
  const currentSettings = await getSettings();
  const taxRateChanged = body.tax_rate !== undefined && Number(body.tax_rate) !== Number(currentSettings.tax_rate);
  const serviceRateChanged = body.service_charge_rate !== undefined && Number(body.service_charge_rate) !== Number(currentSettings.service_charge_rate);
  const taxIncludedChanged = body.prices_include_tax !== undefined && Boolean(body.prices_include_tax) !== Boolean(currentSettings.prices_include_tax);
  const showTaxChanged = body.show_tax_on_receipt !== undefined && Boolean(body.show_tax_on_receipt) !== Boolean(currentSettings.show_tax_on_receipt);
  if (taxRateChanged || serviceRateChanged || taxIncludedChanged || showTaxChanged) {
    const actor = await userFromToken(request);
    const grant = await adminGrantFromRequest(request, actor);
    if (grant?.permissions?.includes("manage_settings")) {
      // already admin-granted, skip confirm
    } else if (actor) {
      const row = await one(
        "SELECT pin FROM users WHERE id = $1 AND name = $2 AND active = true",
        [actor.id, String(body.confirm_name ?? "").trim()]
      );
      if (!row || !verifyPin(String(body.confirm_pin ?? ""), row.pin).valid) {
        reply.code(401);
        return { error: "修改税务或服务费设置需要输入当前账号名和 PIN" };
      }
    } else {
      reply.code(401);
      return { error: "修改税务或服务费设置需要输入当前账号名和 PIN" };
    }
  }
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
      receipt_address = COALESCE($17, receipt_address),
      receipt_header_zh = COALESCE($18, receipt_header_zh),
      receipt_phone = COALESCE($19, receipt_phone),
      auto_clear_tables_after_payment = COALESCE($20::boolean, auto_clear_tables_after_payment),
      kitchen_item_font_size = COALESCE($21::integer, kitchen_item_font_size),
      kitchen_item_bold = COALESCE($22::boolean, kitchen_item_bold),
      kitchen_qty_bold = COALESCE($23::boolean, kitchen_qty_bold),
      auto_clear_empty_tables_after_idle = COALESCE($24::boolean, auto_clear_empty_tables_after_idle),
      auto_clear_empty_tables_idle_minutes = COALESCE($25::integer, auto_clear_empty_tables_idle_minutes),
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
      body.backup_interval_hours,
      body.receipt_address,
      body.receipt_header_zh,
      body.receipt_phone,
      body.auto_clear_tables_after_payment,
      body.kitchen_item_font_size,
      body.kitchen_item_bold,
      body.kitchen_qty_bold,
      body.auto_clear_empty_tables_after_idle,
      body.auto_clear_empty_tables_idle_minutes
    ]
  );
  // Auto-heal printer routing: if the configured kitchen/receipt printer id is missing
  // from the saved profiles entirely, fall back to the first enabled profile so the route
  // still resolves. We deliberately do NOT re-route based on isValidPrinter() (which checks
  // host/device_path), so a freshly-added USB printer with a not-yet-filled device_path
  // keeps the user's selection; print-time selectPrinter() handles the runtime fallback.
  const profiles = printerProfiles(settings);
  const firstEnabled = profiles.find((p) => p.enabled !== false) ?? profiles[0];
  const patches = {};
  if (firstEnabled && !profiles.some((p) => p.id === settings.kitchen_printer_id)) {
    patches.kitchen_printer_id = firstEnabled.id;
  }
  if (firstEnabled && !profiles.some((p) => p.id === settings.receipt_printer_id)) {
    patches.receipt_printer_id = firstEnabled.id;
  }
  if (Object.keys(patches).length) {
    Object.assign(settings, await one(
      "UPDATE settings SET kitchen_printer_id = COALESCE($2, kitchen_printer_id), receipt_printer_id = COALESCE($3, receipt_printer_id), updated_at = now() WHERE id = $1 RETURNING *",
      [settings.id, patches.kitchen_printer_id ?? null, patches.receipt_printer_id ?? null]
    ));
  }
  emit("settings.updated", settings);
  scheduleAutoBackup();
  scheduleIdleTableClear();
  await auditLog(request, "settings.update", "settings", settings.id, { currency: settings.currency, tax_rate: settings.tax_rate, service_charge_rate: settings.service_charge_rate });
  return settings;
});

}
