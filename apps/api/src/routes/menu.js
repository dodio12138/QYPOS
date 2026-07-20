// Auto-generated route module: menu

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
function normalizeOptionPresetPayload(kind, payload) {
  if (!Array.isArray(payload)) throw httpError("Preset payload must be an array", 400);
  if (kind === "variants") {
    return payload.map((variant, index) => {
      const price = Number(variant.price ?? 0);
      if (!Number.isFinite(price) || price < 0) throw httpError("Variant preset prices must be non-negative", 400);
      if (!variant.name_i18n) throw httpError("Every variant preset row needs a name", 400);
      return {
        name_i18n: variant.name_i18n,
        price,
        sort_order: Number(variant.sort_order ?? index),
        active: variant.active !== false
      };
    });
  }
  if (kind === "modifiers") {
    return payload.map((group, groupIndex) => {
      const minSelect = Math.max(0, Number(group.min_select ?? 0));
      const maxSelect = Math.max(1, Number(group.max_select ?? 1));
      if (!group.name_i18n) throw httpError("Every modifier preset group needs a name", 400);
      if (minSelect > maxSelect) throw httpError("Modifier preset minimum cannot exceed maximum", 400);
      const modifiers = (Array.isArray(group.modifiers) ? group.modifiers : []).map((modifier, modifierIndex) => {
        const priceDelta = Number(modifier.price_delta ?? 0);
        if (!Number.isFinite(priceDelta)) throw httpError("Modifier preset prices must be numbers", 400);
        if (!modifier.name_i18n) throw httpError("Every modifier preset option needs a name", 400);
        return {
          name_i18n: modifier.name_i18n,
          price_delta: priceDelta,
          sort_order: Number(modifier.sort_order ?? modifierIndex),
          active: modifier.active !== false,
          default_selected: modifier.default_selected === true
        };
      });
      if (modifiers.filter((modifier) => modifier.default_selected).length > maxSelect) {
        throw httpError("Modifier preset defaults cannot exceed the group's maximum selection", 400);
      }
      return {
        name_i18n: group.name_i18n,
        min_select: minSelect,
        max_select: maxSelect,
        sort_order: Number(group.sort_order ?? groupIndex),
        active: group.active !== false,
        modifiers
      };
    });
  }
  throw httpError("Preset kind must be variants or modifiers", 400);
}

async function snapshotItemOptions(itemId, kind) {
  const item = await one("SELECT id FROM menu_items WHERE id = $1", [itemId]);
  if (!item) throw httpError("Menu item not found", 404);
  if (kind === "variants") {
    return query(
      `SELECT name_i18n, price, sort_order, active
       FROM menu_item_variants WHERE item_id = $1 ORDER BY sort_order, id`,
      [itemId]
    );
  }
  if (kind === "modifiers") {
    const groups = await query(
      `SELECT id, name_i18n, min_select, max_select, sort_order, active
       FROM modifier_groups WHERE item_id = $1 ORDER BY sort_order, id`,
      [itemId]
    );
    const modifiers = groups.length ? await query(
      `SELECT group_id, name_i18n, price_delta, sort_order, active, default_selected
       FROM modifiers WHERE group_id = ANY($1::uuid[]) ORDER BY sort_order, id`,
      [groups.map((group) => group.id)]
    ) : [];
    return groups.map(({ id, ...group }) => ({
      ...group,
      modifiers: modifiers.filter((modifier) => modifier.group_id === id).map(({ group_id, ...modifier }) => modifier)
    }));
  }
  throw httpError("Preset kind must be variants or modifiers", 400);
}

async function replaceItemOptionsFromPreset(client, itemId, preset) {
  const payload = normalizeOptionPresetPayload(preset.kind, preset.payload);
  if (!payload.length) throw httpError("Cannot bind an empty preset to a product", 400);
  if (preset.kind === "variants") {
    await client.query(
      "UPDATE order_items SET variant_id = NULL WHERE variant_id IN (SELECT id FROM menu_item_variants WHERE item_id = $1)",
      [itemId]
    );
    await client.query("DELETE FROM menu_item_variants WHERE item_id = $1", [itemId]);
    for (const variant of payload) {
      await client.query(
        `INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order, active)
         VALUES ($1, $2, $3, $4, $5)`,
        [itemId, variant.name_i18n, variant.price, variant.sort_order, variant.active]
      );
    }
    await client.query("UPDATE menu_items SET variant_preset_id = $2, updated_at = now() WHERE id = $1", [itemId, preset.id]);
    return;
  }
  await client.query(
    `UPDATE order_item_modifiers SET modifier_id = NULL
     WHERE modifier_id IN (
       SELECT m.id FROM modifiers m JOIN modifier_groups mg ON mg.id = m.group_id WHERE mg.item_id = $1
     )`,
    [itemId]
  );
  await client.query("DELETE FROM modifier_groups WHERE item_id = $1", [itemId]);
  for (const group of payload) {
    const groupResult = await client.query(
      `INSERT INTO modifier_groups (item_id, name_i18n, min_select, max_select, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [itemId, group.name_i18n, group.min_select, group.max_select, group.sort_order, group.active]
    );
    for (const modifier of group.modifiers) {
      await client.query(
        `INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, active, default_selected)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [groupResult.rows[0].id, modifier.name_i18n, modifier.price_delta, modifier.sort_order, modifier.active, modifier.default_selected]
      );
    }
  }
  await client.query("UPDATE menu_items SET modifier_preset_id = $2, updated_at = now() WHERE id = $1", [itemId, preset.id]);
}

async function snapshotModifierGroup(groupId) {
  const group = await one(
    `SELECT id, name_i18n, min_select, max_select, sort_order, active
     FROM modifier_groups WHERE id = $1`,
    [groupId]
  );
  if (!group) throw httpError("Modifier group not found", 404);
  const modifiers = await query(
    `SELECT name_i18n, price_delta, sort_order, active, default_selected
     FROM modifiers WHERE group_id = $1 ORDER BY sort_order, id`,
    [groupId]
  );
  return { ...group, modifiers };
}

async function replaceModifierGroupFromPreset(client, groupId, preset) {
  const payload = normalizeOptionPresetPayload("modifiers", preset.payload);
  if (payload.length !== 1) throw httpError("A modifier-group preset must contain exactly one group", 400);
  const template = payload[0];
  await client.query(
    "UPDATE order_item_modifiers SET modifier_id = NULL WHERE modifier_id IN (SELECT id FROM modifiers WHERE group_id = $1)",
    [groupId]
  );
  await client.query("DELETE FROM modifiers WHERE group_id = $1", [groupId]);
  const updated = await client.query(
    `UPDATE modifier_groups SET name_i18n = $2, min_select = $3, max_select = $4,
     active = $5, preset_id = $6 WHERE id = $1 RETURNING id`,
    [groupId, template.name_i18n, template.min_select, template.max_select, template.active, preset.id]
  );
  if (!updated.rowCount) throw httpError("Modifier group not found", 404);
  for (const modifier of template.modifiers) {
    await client.query(
      `INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, active, default_selected)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [groupId, modifier.name_i18n, modifier.price_delta, modifier.sort_order, modifier.active, modifier.default_selected]
    );
  }
}

app.get("/menu/option-presets", async () => {
  return query("SELECT * FROM menu_option_presets ORDER BY kind, created_at, name");
});

app.post("/menu/option-presets", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const name = String(body.name ?? "").trim();
  if (!name) { reply.code(400); return { error: "Preset name is required" }; }
  try {
    const payload = normalizeOptionPresetPayload(body.kind, body.payload ?? []);
    const preset = await one(
      `INSERT INTO menu_option_presets (name, kind, payload, active)
       VALUES ($1, $2, $3::jsonb, COALESCE($4::boolean, true)) RETURNING *`,
      [name, body.kind, JSON.stringify(payload), body.active]
    );
    await auditLog(request, "menu.option_preset.create", "menu_option_preset", preset.id, { name, kind: preset.kind });
    reply.code(201);
    return preset;
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }
});

app.patch("/menu/option-presets/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const current = await one("SELECT * FROM menu_option_presets WHERE id = $1", [request.params.id]);
  if (!current) { reply.code(404); return { error: "Option preset not found" }; }
  try {
    const kind = request.body?.kind ?? current.kind;
    if (kind !== current.kind) throw httpError("Preset kind cannot be changed after creation", 400);
    const payload = request.body?.payload === undefined
      ? current.payload
      : normalizeOptionPresetPayload(kind, request.body.payload);
    const client = await pool.connect();
    let preset;
    let linkedCount = 0;
    try {
      await client.query("BEGIN");
      const presetResult = await client.query(
        `UPDATE menu_option_presets SET name = COALESCE($2, name), kind = $3,
         payload = $4::jsonb, active = COALESCE($5::boolean, active), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [current.id, request.body?.name, kind, JSON.stringify(payload), request.body?.active]
      );
      preset = presetResult.rows[0];
      const bindingColumn = kind === "variants" ? "variant_preset_id" : "modifier_preset_id";
      const linkedItems = await client.query(`SELECT id FROM menu_items WHERE ${bindingColumn} = $1`, [preset.id]);
      linkedCount = linkedItems.rowCount;
      for (const item of linkedItems.rows) await replaceItemOptionsFromPreset(client, item.id, preset);
      if (kind === "modifiers") {
        const linkedGroups = await client.query("SELECT id FROM modifier_groups WHERE preset_id = $1", [preset.id]);
        linkedCount += linkedGroups.rowCount;
        for (const group of linkedGroups.rows) await replaceModifierGroupFromPreset(client, group.id, preset);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await auditLog(request, "menu.option_preset.update", "menu_option_preset", preset.id, { name: preset.name, kind });
    return { ...preset, synced_items: linkedCount };
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }
});

app.delete("/menu/option-presets/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const preset = await one("DELETE FROM menu_option_presets WHERE id = $1 RETURNING *", [request.params.id]);
  if (!preset) { reply.code(404); return { error: "Option preset not found" }; }
  await auditLog(request, "menu.option_preset.delete", "menu_option_preset", preset.id, { name: preset.name, kind: preset.kind });
  return preset;
});

app.post("/menu/items/:id/option-presets", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const name = String(request.body?.name ?? "").trim();
  const kind = request.body?.kind;
  if (!name) { reply.code(400); return { error: "Preset name is required" }; }
  try {
    const payload = normalizeOptionPresetPayload(kind, await snapshotItemOptions(request.params.id, kind));
    if (!payload.length) throw httpError("This product has no options to save", 400);
    const preset = await one(
      "INSERT INTO menu_option_presets (name, kind, payload) VALUES ($1, $2, $3::jsonb) RETURNING *",
      [name, kind, JSON.stringify(payload)]
    );
    const bindingColumn = kind === "variants" ? "variant_preset_id" : "modifier_preset_id";
    await query(`UPDATE menu_items SET ${bindingColumn} = $2, updated_at = now() WHERE id = $1`, [request.params.id, preset.id]);
    await auditLog(request, "menu.option_preset.capture", "menu_option_preset", preset.id, { item_id: request.params.id, name, kind });
    reply.code(201);
    return preset;
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }
});

app.post("/menu/items/:id/apply-option-preset", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const preset = await one("SELECT * FROM menu_option_presets WHERE id = $1 AND active = true", [request.body?.preset_id]);
  if (!preset) { reply.code(404); return { error: "Active option preset not found" }; }
  const item = await one("SELECT * FROM menu_items WHERE id = $1", [request.params.id]);
  if (!item) { reply.code(404); return { error: "Menu item not found" }; }
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await replaceItemOptionsFromPreset(client, item.id, preset);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await auditLog(request, "menu.option_preset.apply", "menu_item", item.id, { preset_id: preset.id, kind: preset.kind, binding: true });
    return { item_id: item.id, preset_id: preset.id, kind: preset.kind };
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }
});

app.post("/menu/modifier-groups/:id/option-presets", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const name = String(request.body?.name ?? "").trim();
  if (!name) { reply.code(400); return { error: "Preset name is required" }; }
  try {
    const group = await snapshotModifierGroup(request.params.id);
    const payload = normalizeOptionPresetPayload("modifiers", [group]);
    const client = await pool.connect();
    let preset;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "INSERT INTO menu_option_presets (name, kind, payload) VALUES ($1, 'modifiers', $2::jsonb) RETURNING *",
        [name, JSON.stringify(payload)]
      );
      preset = result.rows[0];
      await client.query("UPDATE modifier_groups SET preset_id = $2 WHERE id = $1", [group.id, preset.id]);
      await client.query("UPDATE menu_items SET modifier_preset_id = NULL WHERE id = (SELECT item_id FROM modifier_groups WHERE id = $1)", [group.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await auditLog(request, "menu.option_preset.capture_group", "menu_option_preset", preset.id, { group_id: group.id, name });
    reply.code(201);
    return preset;
  } catch (error) {
    reply.code(error.statusCode || 400);
    return { error: error.message };
  }
});

app.post("/menu/modifier-groups/:id/apply-option-preset", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const preset = await one(
    "SELECT * FROM menu_option_presets WHERE id = $1 AND kind = 'modifiers' AND active = true",
    [request.body?.preset_id]
  );
  if (!preset) { reply.code(404); return { error: "Active modifier-group preset not found" }; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await replaceModifierGroupFromPreset(client, request.params.id, preset);
    await client.query("UPDATE menu_items SET modifier_preset_id = NULL WHERE id = (SELECT item_id FROM modifier_groups WHERE id = $1)", [request.params.id]);
    await client.query("COMMIT");
    await auditLog(request, "menu.option_preset.apply_group", "modifier_group", request.params.id, { preset_id: preset.id });
    return { group_id: request.params.id, preset_id: preset.id };
  } catch (error) {
    await client.query("ROLLBACK");
    reply.code(error.statusCode || 400);
    return { error: error.message };
  } finally {
    client.release();
  }
});

app.get("/menu", async () => {
  const categories = await query("SELECT * FROM menu_categories ORDER BY sort_order, name_i18n->>'zh-CN'");
  const items = await query(
    `SELECT mi.*
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     ORDER BY COALESCE(mc.sort_order, 999), mi.sort_order, mi.created_at`
  );
  const variants = await query("SELECT * FROM menu_item_variants ORDER BY sort_order");
  const groups = await query("SELECT * FROM modifier_groups ORDER BY sort_order");
  const modifiers = await query("SELECT * FROM modifiers ORDER BY sort_order");
  const notePresets = await query("SELECT * FROM note_presets ORDER BY sort_order, created_at");
  const optionPresets = await query("SELECT * FROM menu_option_presets ORDER BY kind, created_at, name");
  return {
    categories,
    note_presets: notePresets,
    option_presets: optionPresets,
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
    `INSERT INTO menu_items (category_id, name_i18n, description_i18n, image_url, kitchen_group, active, sort_order)
     VALUES ($1, $2, COALESCE($3, '{}'::jsonb), $4, COALESCE($5, 'kitchen'), COALESCE($6, true), COALESCE($7, 0))
     RETURNING *`,
    [body.category_id, body.name_i18n, body.description_i18n, body.image_url, body.kitchen_group, body.active, body.sort_order]
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

app.post("/menu/items/:id/copy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const source = await one("SELECT * FROM menu_items WHERE id = $1", [request.params.id]);
  if (!source) {
    reply.code(404);
    return { error: "Menu item not found" };
  }
  const variants = await query("SELECT * FROM menu_item_variants WHERE item_id = $1 ORDER BY sort_order ASC", [source.id]);
  const groups = await query("SELECT * FROM modifier_groups WHERE item_id = $1 ORDER BY sort_order ASC", [source.id]);
  const modifiersByGroup = new Map();
  for (const group of groups) {
    modifiersByGroup.set(group.id, await query("SELECT * FROM modifiers WHERE group_id = $1 ORDER BY sort_order ASC", [group.id]));
  }
  const suffixedName = {
    ...source.name_i18n,
    ...(source.name_i18n?.["zh-CN"] ? { "zh-CN": `${source.name_i18n["zh-CN"]} 副本` } : {}),
    ...(source.name_i18n?.["en-GB"] ? { "en-GB": `${source.name_i18n["en-GB"]} (Copy)` } : {})
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const itemResult = await client.query(
      `INSERT INTO menu_items (category_id, name_i18n, description_i18n, image_url, kitchen_group, active, sort_order, variant_preset_id, modifier_preset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [source.category_id, suffixedName, source.description_i18n, source.image_url, source.kitchen_group, source.active, source.sort_order, source.variant_preset_id, source.modifier_preset_id]
    );
    const item = itemResult.rows[0];
    for (const variant of variants) {
      await client.query(
        "INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order, active) VALUES ($1, $2, $3, $4, $5)",
        [item.id, variant.name_i18n, variant.price, variant.sort_order, variant.active]
      );
    }
    for (const group of groups) {
      const groupResult = await client.query(
        "INSERT INTO modifier_groups (item_id, name_i18n, min_select, max_select, sort_order, active, preset_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [item.id, group.name_i18n, group.min_select, group.max_select, group.sort_order, group.active, group.preset_id]
      );
      const newGroup = groupResult.rows[0];
      for (const modifier of modifiersByGroup.get(group.id) ?? []) {
        await client.query(
          "INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, active, default_selected) VALUES ($1, $2, $3, $4, $5, $6)",
          [newGroup.id, modifier.name_i18n, modifier.price_delta, modifier.sort_order, modifier.active, modifier.default_selected]
        );
      }
    }
    await client.query("COMMIT");
    await auditLog(request, "menu.item.copy", "menu_item", item.id, { source_item_id: source.id, name_i18n: item.name_i18n });
    return item;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.patch("/menu/items/:id", async (request, reply) => {
  const body = request.body ?? {};
  const actor = await requireAnyPermission(request, reply, ["manage_menu", "manage_menu_availability"]);
  if (!actor) return;
  if (!canPatchMenuItem(actor, body)) {
    reply.code(403);
    return { error: "Only menu availability can be changed with this account" };
  }
  const item = await one(
    `UPDATE menu_items SET
      category_id = COALESCE($2, category_id),
      name_i18n = COALESCE($3, name_i18n),
      description_i18n = COALESCE($4, description_i18n),
      image_url = COALESCE($5, image_url),
      kitchen_group = COALESCE($6, kitchen_group),
      active = COALESCE($7, active),
      sort_order = COALESCE($8::integer, sort_order),
      updated_at = now()
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.category_id, body.name_i18n, body.description_i18n, body.image_url, body.kitchen_group, body.active, body.sort_order]
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
  await query("UPDATE menu_items SET variant_preset_id = NULL, updated_at = now() WHERE id = $1", [request.params.id]);
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
  await query("UPDATE menu_items SET variant_preset_id = NULL, updated_at = now() WHERE id = $1", [request.params.id]);
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
  await query("UPDATE menu_items SET variant_preset_id = NULL, updated_at = now() WHERE id = $1", [request.params.id]);
  await auditLog(request, "menu.variant.disable", "menu_item_variant", variant.id);
  return variant;
});

app.delete("/menu/items/:id/variants/:variantId/destroy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  await query(
    "UPDATE order_items SET variant_id = NULL WHERE variant_id = $1 AND item_id = $2",
    [request.params.variantId, request.params.id]
  );
  const variant = await one(
    "DELETE FROM menu_item_variants WHERE id = $1 AND item_id = $2 RETURNING *",
    [request.params.variantId, request.params.id]
  );
  if (!variant) {
    reply.code(404);
    return { error: "Variant not found" };
  }
  await query("UPDATE menu_items SET variant_preset_id = NULL, updated_at = now() WHERE id = $1", [request.params.id]);
  await auditLog(request, "menu.variant.destroy", "menu_item_variant", variant.id, { item_id: request.params.id });
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
      "INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, default_selected) VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, false))",
      [group.id, modifier.name_i18n, modifier.price_delta, modifier.sort_order, modifier.default_selected]
    );
  }
  await query("UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = $1", [group.item_id]);
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
      active = COALESCE($6, active),
      preset_id = NULL
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name_i18n, body.min_select, body.max_select, body.sort_order, body.active]
  );
  if (group) await query("UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = $1", [group.item_id]);
  await auditLog(request, "menu.modifier_group.update", "modifier_group", group?.id ?? request.params.id, body);
  return group;
});

app.delete("/menu/modifier-groups/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const group = await one("UPDATE modifier_groups SET active = false, preset_id = NULL WHERE id = $1 RETURNING *", [request.params.id]);
  if (!group) {
    reply.code(404);
    return { error: "Modifier group not found" };
  }
  await query("UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = $1", [group.item_id]);
  await auditLog(request, "menu.modifier_group.disable", "modifier_group", group.id);
  return group;
});

app.delete("/menu/modifier-groups/:id/destroy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  await query(
    "UPDATE order_item_modifiers SET modifier_id = NULL WHERE modifier_id IN (SELECT id FROM modifiers WHERE group_id = $1)",
    [request.params.id]
  );
  const group = await one("DELETE FROM modifier_groups WHERE id = $1 RETURNING *", [request.params.id]);
  if (!group) {
    reply.code(404);
    return { error: "Modifier group not found" };
  }
  await query("UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = $1", [group.item_id]);
  await auditLog(request, "menu.modifier_group.destroy", "modifier_group", group.id, { item_id: group.item_id });
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
    "INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order, active, default_selected) VALUES ($1, $2, COALESCE($3::numeric, 0), COALESCE($4::integer, 0), COALESCE($5::boolean, true), COALESCE($6::boolean, false)) RETURNING *",
    [group.id, body.name_i18n, body.price_delta, body.sort_order, body.active, body.default_selected]
  );
  if (modifier.default_selected && Number(group.max_select) === 1) {
    await query("UPDATE modifiers SET default_selected = false WHERE group_id = $1 AND id <> $2", [group.id, modifier.id]);
  }
  await query("UPDATE modifier_groups SET preset_id = NULL WHERE id = $1", [group.id]);
  await query("UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = $1", [group.item_id]);
  await auditLog(request, "menu.modifier.create", "modifier", modifier.id, { group_id: group.id, price_delta: modifier.price_delta });
  return modifier;
});

app.patch("/menu/modifiers/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const currentModifier = await one(
    "SELECT m.*, mg.max_select FROM modifiers m JOIN modifier_groups mg ON mg.id = m.group_id WHERE m.id = $1",
    [request.params.id]
  );
  if (!currentModifier) {
    reply.code(404);
    return { error: "Modifier not found" };
  }
  if (body.default_selected === true && Number(currentModifier.max_select) === 1) {
    await query("UPDATE modifiers SET default_selected = false WHERE group_id = $1 AND id <> $2", [currentModifier.group_id, request.params.id]);
  }
  const modifier = await one(
    `UPDATE modifiers SET
      name_i18n = COALESCE($2, name_i18n),
      price_delta = COALESCE($3::numeric, price_delta),
      sort_order = COALESCE($4::integer, sort_order),
      active = COALESCE($5::boolean, active),
      default_selected = COALESCE($6::boolean, default_selected)
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.name_i18n, body.price_delta, body.sort_order, body.active, body.default_selected]
  );
  if (!modifier) {
    reply.code(404);
    return { error: "Modifier not found" };
  }
  await query(
    "UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = (SELECT item_id FROM modifier_groups WHERE id = $1)",
    [modifier.group_id]
  );
  await query("UPDATE modifier_groups SET preset_id = NULL WHERE id = $1", [modifier.group_id]);
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
  await query(
    "UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = (SELECT item_id FROM modifier_groups WHERE id = $1)",
    [modifier.group_id]
  );
  await query("UPDATE modifier_groups SET preset_id = NULL WHERE id = $1", [modifier.group_id]);
  await auditLog(request, "menu.modifier.disable", "modifier", modifier.id);
  return modifier;
});

app.delete("/menu/modifiers/:id/destroy", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  await query("UPDATE order_item_modifiers SET modifier_id = NULL WHERE modifier_id = $1", [request.params.id]);
  const modifier = await one("DELETE FROM modifiers WHERE id = $1 RETURNING *", [request.params.id]);
  if (!modifier) {
    reply.code(404);
    return { error: "Modifier not found" };
  }
  await query(
    "UPDATE menu_items SET modifier_preset_id = NULL, updated_at = now() WHERE id = (SELECT item_id FROM modifier_groups WHERE id = $1)",
    [modifier.group_id]
  );
  await query("UPDATE modifier_groups SET preset_id = NULL WHERE id = $1", [modifier.group_id]);
  await auditLog(request, "menu.modifier.destroy", "modifier", modifier.id, { group_id: modifier.group_id });
  return modifier;
});

app.get("/note-presets", async () => {
  return query("SELECT * FROM note_presets ORDER BY sort_order, created_at");
});

function normalizeNotePresetCategoryIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((id) => UUID_PATTERN.test(id)))];
}

app.post("/note-presets", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const label = String(body.label ?? "").trim();
  if (!label) { reply.code(400); return { error: "label is required" }; }
  const categoryIds = normalizeNotePresetCategoryIds(body.category_ids);
  const preset = await one(
    "INSERT INTO note_presets (label, sort_order, active, category_ids) VALUES ($1, COALESCE($2, 0), COALESCE($3, true), $4::jsonb) RETURNING *",
    [label, body.sort_order, body.active, JSON.stringify(categoryIds)]
  );
  await auditLog(request, "note_preset.create", "note_preset", preset.id, { label, category_ids: categoryIds });
  return preset;
});

app.patch("/note-presets/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const body = request.body ?? {};
  const categoryIds = Object.prototype.hasOwnProperty.call(body, "category_ids")
    ? JSON.stringify(normalizeNotePresetCategoryIds(body.category_ids))
    : null;
  const preset = await one(
    `UPDATE note_presets SET
      label = COALESCE($2, label),
      sort_order = COALESCE($3, sort_order),
      active = COALESCE($4, active),
      category_ids = CASE WHEN $5::jsonb IS NULL THEN category_ids ELSE $5::jsonb END
     WHERE id = $1 RETURNING *`,
    [request.params.id, body.label, body.sort_order, body.active, categoryIds]
  );
  if (!preset) { reply.code(404); return { error: "Note preset not found" }; }
  await auditLog(request, "note_preset.update", "note_preset", preset.id, body);
  return preset;
});

app.delete("/note-presets/:id", async (request, reply) => {
  if (!await requirePermission(request, reply, "manage_menu")) return;
  const preset = await one("DELETE FROM note_presets WHERE id = $1 RETURNING *", [request.params.id]);
  if (!preset) { reply.code(404); return { error: "Note preset not found" }; }
  await auditLog(request, "note_preset.destroy", "note_preset", preset.id, { label: preset.label });
  return preset;
});
}
