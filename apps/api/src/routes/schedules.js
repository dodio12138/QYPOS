// Auto-generated route module: schedules

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
app.get("/staff-schedules", async (request, reply) => {
  if (!await requireAnyPermission(request, reply, ["view_staff_schedules", "manage_staff_schedules"])) return;
  const weekStart = parseDateOnly(request.query?.week_start ?? localToday());
  if (!weekStart) { reply.code(400); return { error: "A valid week_start date is required" }; }
  const employees = await query(
    `SELECT id, name, color, hourly_wage, sort_order, active
     FROM staff_schedule_employees
     WHERE active = true
     ORDER BY sort_order, created_at, name`
  );
  const cells = await query(
    `SELECT id, employee_id, work_date::text AS work_date, is_off,
            to_char(start_time, 'HH24:MI') AS start_time,
            to_char(end_time, 'HH24:MI') AS end_time,
            break_minutes, note,
            to_char(actual_start_time, 'HH24:MI') AS actual_start_time,
            to_char(actual_end_time, 'HH24:MI') AS actual_end_time,
            actual_break_minutes, actual_note
     FROM staff_schedule_cells
     WHERE work_date >= $1::date AND work_date < ($1::date + INTERVAL '7 days')
     ORDER BY work_date, employee_id`,
    [weekStart]
  );
  const revenueRows = await query(
    `SELECT d::date::text AS day, COALESCE(SUM(o.total), 0) AS revenue
     FROM generate_series($1::date, $1::date + INTERVAL '6 days', '1 day') d
     LEFT JOIN orders o ON o.created_at::date = d::date
       AND o.status NOT IN ('cancelled', 'draft')
     GROUP BY d
     ORDER BY d`,
    [weekStart]
  );
  return { week_start: weekStart, employees, cells, daily_revenue: revenueRows };
});

app.get("/staff-schedules/time-presets", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_staff_schedules")) return;
  return query(
    `SELECT id, label,
            to_char(start_time, 'HH24:MI') AS start_time,
            to_char(end_time, 'HH24:MI') AS end_time,
            sort_order
     FROM staff_schedule_time_presets
     WHERE active = true
     ORDER BY sort_order, start_time, end_time`
  );
});

app.post("/staff-schedules/time-presets", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  const body = request.body ?? {};
  const startTime = parseTimeOnly(body.start_time);
  const endTime = parseTimeOnly(body.end_time);
  if (!startTime || !endTime) { reply.code(400); return { error: "Start and end time are required" }; }
  const label = String(body.label ?? `${startTime}-${endTime}`).trim() || `${startTime}-${endTime}`;
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const preset = await one(
    `INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order, active)
     VALUES ($1, $2::time, $3::time, $4, true)
     ON CONFLICT (start_time, end_time) DO UPDATE
     SET label = EXCLUDED.label,
         active = true,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()
     RETURNING id, label,
               to_char(start_time, 'HH24:MI') AS start_time,
               to_char(end_time, 'HH24:MI') AS end_time,
               sort_order`,
    [label, startTime, endTime, sortOrder]
  );
  await auditLog(request, "staff_schedule.time_preset.save", "staff_schedule_time_preset", preset.id, { actor_id: actor.id, start_time: startTime, end_time: endTime });
  return preset;
});

app.delete("/staff-schedules/time-presets/:id", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  if (!UUID_PATTERN.test(request.params.id)) { reply.code(400); return { error: "Invalid preset id" }; }
  const preset = await one(
    `UPDATE staff_schedule_time_presets
     SET active = false, updated_at = now()
     WHERE id = $1 AND active = true
     RETURNING id`,
    [request.params.id]
  );
  if (!preset) { reply.code(404); return { error: "Preset not found" }; }
  await auditLog(request, "staff_schedule.time_preset.delete", "staff_schedule_time_preset", preset.id, { actor_id: actor.id });
  return { ok: true };
});

app.post("/staff-schedules/employees", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  const body = request.body ?? {};
  const name = String(body.name ?? "").trim();
  if (!name) { reply.code(400); return { error: "Name is required" }; }
  const color = /^#[0-9a-f]{6}$/i.test(String(body.color ?? "")) ? body.color : "#22c55e";
  const hourlyWage = Number.isFinite(Number(body.hourly_wage)) ? Math.max(0, Number(body.hourly_wage)) : 0;
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  const employee = await one(
    `INSERT INTO staff_schedule_employees (name, color, hourly_wage, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, color, hourly_wage, sort_order, active`,
    [name, color, hourlyWage, sortOrder]
  );
  await auditLog(request, "staff_schedule.employee.create", "staff_schedule_employee", employee.id, { actor_id: actor.id, name });
  return employee;
});

app.patch("/staff-schedules/employees/:id", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  if (!UUID_PATTERN.test(request.params.id)) { reply.code(400); return { error: "Invalid employee id" }; }
  const body = request.body ?? {};
  const name = body.name === undefined ? null : String(body.name ?? "").trim();
  if (body.name !== undefined && !name) { reply.code(400); return { error: "Name is required" }; }
  const color = body.color === undefined ? null : String(body.color ?? "");
  if (body.color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) { reply.code(400); return { error: "Color must be #RRGGBB" }; }
  const hourlyWage = body.hourly_wage === undefined ? null : Number(body.hourly_wage);
  if (body.hourly_wage !== undefined && (!Number.isFinite(hourlyWage) || hourlyWage < 0)) { reply.code(400); return { error: "Hourly wage must be a positive number" }; }
  const sortOrder = body.sort_order === undefined ? null : Number(body.sort_order);
  if (body.sort_order !== undefined && !Number.isFinite(sortOrder)) { reply.code(400); return { error: "Sort order must be a number" }; }
  const employee = await one(
    `UPDATE staff_schedule_employees
     SET name = COALESCE($2, name),
         color = COALESCE($3, color),
         hourly_wage = COALESCE($4, hourly_wage),
         sort_order = COALESCE($5, sort_order),
         updated_at = now()
     WHERE id = $1 AND active = true
     RETURNING id, name, color, hourly_wage, sort_order, active`,
    [request.params.id, name, color, hourlyWage, sortOrder]
  );
  if (!employee) { reply.code(404); return { error: "Employee not found" }; }
  await auditLog(request, "staff_schedule.employee.update", "staff_schedule_employee", employee.id, { actor_id: actor.id });
  return employee;
});

app.delete("/staff-schedules/employees/:id", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  if (!UUID_PATTERN.test(request.params.id)) { reply.code(400); return { error: "Invalid employee id" }; }
  const employee = await one(
    `UPDATE staff_schedule_employees
     SET active = false, updated_at = now()
     WHERE id = $1 AND active = true
     RETURNING id`,
    [request.params.id]
  );
  if (!employee) { reply.code(404); return { error: "Employee not found" }; }
  await auditLog(request, "staff_schedule.employee.delete", "staff_schedule_employee", employee.id, { actor_id: actor.id });
  return { ok: true };
});

app.put("/staff-schedules/cells", async (request, reply) => {
  const actor = await requirePermission(request, reply, "manage_staff_schedules");
  if (!actor) return;
  const body = request.body ?? {};
  const employeeId = String(body.employee_id ?? "");
  const workDate = parseDateOnly(body.work_date);
  if (!UUID_PATTERN.test(employeeId)) { reply.code(400); return { error: "Invalid employee id" }; }
  if (!workDate) { reply.code(400); return { error: "A valid work_date is required" }; }
  const employee = await one("SELECT id FROM staff_schedule_employees WHERE id = $1 AND active = true", [employeeId]);
  if (!employee) { reply.code(404); return { error: "Employee not found" }; }

  const clear = Boolean(body.clear);
  if (clear) {
    await query("DELETE FROM staff_schedule_cells WHERE employee_id = $1 AND work_date = $2::date", [employeeId, workDate]);
    await auditLog(request, "staff_schedule.cell.clear", "staff_schedule_employee", employeeId, { actor_id: actor.id, work_date: workDate });
    return { ok: true, cleared: true };
  }

  const isOff = Boolean(body.is_off);
  const startTime = isOff ? null : parseTimeOnly(body.start_time);
  const endTime = isOff ? null : parseTimeOnly(body.end_time);
  const breakMinutes = Math.max(0, Math.round(Number(body.break_minutes ?? 0)));
  const note = String(body.note ?? "").trim();
  const actualStartTime = body.actual_start_time ? parseTimeOnly(body.actual_start_time) : null;
  const actualEndTime = body.actual_end_time ? parseTimeOnly(body.actual_end_time) : null;
  const actualBreakMinutes = Math.max(0, Math.round(Number(body.actual_break_minutes ?? 0)));
  const actualNote = String(body.actual_note ?? "").trim();
  if (!isOff && (!startTime || !endTime)) { reply.code(400); return { error: "Start and end time are required unless OFF is selected" }; }
  if (!Number.isFinite(breakMinutes) || breakMinutes > 1440) { reply.code(400); return { error: "Break minutes must be between 0 and 1440" }; }
  if ((body.actual_start_time && !actualStartTime) || (body.actual_end_time && !actualEndTime)) { reply.code(400); return { error: "Actual start and end time must be valid times" }; }
  if ((actualStartTime && !actualEndTime) || (!actualStartTime && actualEndTime)) { reply.code(400); return { error: "Actual start and end time must be entered together" }; }
  if (!Number.isFinite(actualBreakMinutes) || actualBreakMinutes > 1440) { reply.code(400); return { error: "Actual break minutes must be between 0 and 1440" }; }

  const cell = await one(
    `INSERT INTO staff_schedule_cells (employee_id, work_date, is_off, start_time, end_time, break_minutes, note, actual_start_time, actual_end_time, actual_break_minutes, actual_note)
     VALUES ($1, $2::date, $3, $4::time, $5::time, $6, $7, $8::time, $9::time, $10, $11)
     ON CONFLICT (employee_id, work_date) DO UPDATE
     SET is_off = EXCLUDED.is_off,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         break_minutes = EXCLUDED.break_minutes,
         note = EXCLUDED.note,
         actual_start_time = EXCLUDED.actual_start_time,
         actual_end_time = EXCLUDED.actual_end_time,
         actual_break_minutes = EXCLUDED.actual_break_minutes,
         actual_note = EXCLUDED.actual_note,
         updated_at = now()
     RETURNING id, employee_id, work_date::text AS work_date, is_off,
               to_char(start_time, 'HH24:MI') AS start_time,
               to_char(end_time, 'HH24:MI') AS end_time,
               break_minutes, note,
               to_char(actual_start_time, 'HH24:MI') AS actual_start_time,
               to_char(actual_end_time, 'HH24:MI') AS actual_end_time,
               actual_break_minutes, actual_note`,
    [employeeId, workDate, isOff, startTime, endTime, breakMinutes, note, actualStartTime, actualEndTime, actualBreakMinutes, actualNote]
  );
  await auditLog(request, "staff_schedule.cell.save", "staff_schedule_cell", cell.id, { actor_id: actor.id, employee_id: employeeId, work_date: workDate });
  return cell;
});

}
