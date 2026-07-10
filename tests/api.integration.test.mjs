import test from "node:test";
import assert from "node:assert/strict";
import { authed, loginAdmin, request, destroyMenuResources } from "./helpers.mjs";

const API_BASE = process.env.API_BASE;
const describe = API_BASE ? test : test.skip;

// ── Shared setup: login & get a token ───────────────────────────────────────

async function setup() {
  const { token } = await loginAdmin(API_BASE);
  const req = authed(API_BASE, token);
  return { token, req };
}

// ── Shared fixtures: get a usable variant & table ───────────────────────────

async function getFixture(req) {
  const menu = await req("/menu");
  const variant = menu.items.flatMap((i) => i.variants).find((v) => v.active);
  assert.ok(variant, "need at least one active variant");

  const layout = await req("/floor-layouts");
  const table = layout.tables[0];
  assert.ok(table, "need at least one table");

  return { variant, table, layout, menu };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Subtests
// ═══════════════════════════════════════════════════════════════════════════════

describe("auth", async () => {
  test("login succeeds with valid credentials", async () => {
    const { token } = await setup();
    assert.ok(token);
  });

  test("login rejects wrong PIN", async () => {
    await assert.rejects(
      request(API_BASE, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ name: "Owner", pin: "wrong" }),
      }),
      /401/
    );
  });

  test("unauthenticated requests are rejected where required", async () => {
    await assert.rejects(
      request(API_BASE, "/orders", {
        method: "POST",
        body: JSON.stringify({ service_type: "takeaway", pickup_no: "NOAUTH" }),
      }),
      /401/
    );
  });

  test("public GET endpoints work without auth", async () => {
    const menu = await request(API_BASE, "/menu");
    assert.ok(menu.items.length >= 0);
    const layout = await request(API_BASE, "/floor-layouts");
    assert.ok(layout.tables.length >= 0);
  });
});

describe("menu CRUD", async () => {
  let categoryId, itemId;

  test("create category", async () => {
    const { req } = await setup();
    const cat = await req("/menu/categories", {
      method: "POST",
      body: JSON.stringify({ name_i18n: { "zh-CN": "集成分类", "en-GB": "Integration" }, sort_order: 99 }),
    });
    assert.ok(cat.id);
    categoryId = cat.id;
  });

  test("patch category sort order", async () => {
    const { req } = await setup();
    const patched = await req(`/menu/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ sort_order: 100, active: true }),
    });
    assert.equal(patched.sort_order, 100);
  });

  test("create menu item with variant", async () => {
    const { req } = await setup();
    const item = await req("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: categoryId,
        name_i18n: { "zh-CN": "集成菜品", "en-GB": "Integration Dish" },
        variants: [{ name_i18n: { "zh-CN": "小份", "en-GB": "Small" }, price: 3.5 }],
      }),
    });
    itemId = item.id;
    assert.ok(item.id);
  });

  test("patch menu item attributes", async () => {
    const { req } = await setup();
    await req(`/menu/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ kitchen_group: "it-kitchen", active: true }),
    });
  });

  test("add and update variant", async () => {
    const { req } = await setup();
    const added = await req(`/menu/items/${itemId}/variants`, {
      method: "POST",
      body: JSON.stringify({ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 5.25 }),
    });
    const patched = await req(`/menu/items/${itemId}/variants/${added.id}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 5.75, active: true }),
    });
    assert.equal(Number(patched.price), 5.75);
  });

  test("add modifier group and modifier", async () => {
    const { req } = await setup();
    const group = await req("/menu/modifier-groups", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, name_i18n: { "zh-CN": "辣度", "en-GB": "Spice" }, min_select: 1, max_select: 1 }),
    });
    const mod = await req(`/menu/modifier-groups/${group.id}/modifiers`, {
      method: "POST",
      body: JSON.stringify({ name_i18n: { "zh-CN": "中辣", "en-GB": "Medium" }, price_delta: 0.25 }),
    });
    const patched = await req(`/menu/modifiers/${mod.id}`, {
      method: "PATCH",
      body: JSON.stringify({ price_delta: 0.5 }),
    });
    assert.equal(Number(patched.price_delta), 0.5);
  });

  // Cleanup after all menu subtests
  test("cleanup menu fixtures", async () => {
    const { req } = await setup();
    await destroyMenuResources(req, { itemId, categoryId });
  });
});

describe("floor layout", async () => {
  test("update table label and position, then restore", async () => {
    const { req } = await setup();
    const layout = await req("/floor-layouts");
    const table = layout.tables[0];
    const original = { label: table.label, x: table.x };

    const edited = structuredClone(layout);
    const editedTable = edited.tables.find((t) => t.id === table.id);
    editedTable.label = `IT-${Date.now().toString().slice(-4)}`;
    editedTable.x = Number(editedTable.x) + 5;

    await req("/floor-layouts", { method: "PUT", body: JSON.stringify(edited) });
    const saved = await req("/floor-layouts");
    const savedTable = saved.tables.find((t) => t.id === table.id);
    assert.equal(savedTable.label, editedTable.label);

    // Restore original
    savedTable.label = original.label;
    savedTable.x = original.x;
    await req("/floor-layouts", { method: "PUT", body: JSON.stringify(saved) });
  });

  test("copy and delete a table", async () => {
    const { req } = await setup();
    const layout = await req("/floor-layouts");
    const table = layout.tables[0];

    const copied = await req(`/tables/${table.id}/copy`, {
      method: "POST",
      body: JSON.stringify({ label: `IT-COPY-${Date.now().toString().slice(-4)}` }),
    });
    assert.ok(copied.id);
    await req(`/tables/${copied.id}`, { method: "DELETE" });
  });

  test("clear an available table requires auth", async () => {
    const { req } = await setup();
    const layout = await req("/floor-layouts");
    const clearable = layout.tables.find((t) => t.status === "available" && !t.current_order_id);
    if (!clearable) return; // skip if all tables are occupied

    // Unauthed clear should fail
    await assert.rejects(
      request(API_BASE, `/tables/${clearable.id}/clear`, { method: "POST" }),
      /401/
    );
    // Authed clear should succeed
    await req(`/tables/${clearable.id}/clear`, { method: "POST" });
  });
});

describe("order lifecycle", async () => {
  test("create a takeaway order and verify total", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT${Date.now().toString().slice(-3)}` }),
    });

    const updated = await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });
    assert.ok(Number(updated.total) > 0);
  });

  test("kitchen print: first submit prints, subsequent without new items is rejected", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT-KP-${Date.now().toString().slice(-3)}` }),
    });
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });

    await req(`/orders/${order.id}/submit`, { method: "POST" });
    const printed = await req(`/orders/${order.id}`);
    assert.ok(printed.items[0].kitchen_printed_at, "first item should be kitchen-printed");

    // Kitchen-printed items are locked
    await assert.rejects(
      req(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ update_item: { id: printed.items[0].id, quantity: 2 } }),
      }),
      /Kitchen printed items are locked/
    );

    // Submit again without new items → rejected
    await assert.rejects(
      req(`/orders/${order.id}/submit`, { method: "POST" }),
      /No new items to print to kitchen/
    );

    // Add a second item and submit again
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });
    await req(`/orders/${order.id}/submit`, { method: "POST" });
    const second = await req(`/orders/${order.id}`);
    assert.equal(second.items.filter((i) => i.kitchen_printed_at).length, 2);
  });

  test("apply discount then exempt service charge", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT-DC-${Date.now().toString().slice(-3)}` }),
    });
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 2, modifier_ids: [] } }),
    });

    const discounted = await req(`/orders/${order.id}/discount`, {
      method: "POST",
      body: JSON.stringify({ discount: 0.5, reason: "integration test" }),
    });
    assert.equal(Number(discounted.discount), 0.5);

    const exempt = await req(`/orders/${order.id}/service-charge`, {
      method: "POST",
      body: JSON.stringify({ service_charge_exempt: true, reason: "integration test" }),
    });
    assert.equal(Number(exempt.service_charge), 0);
  });

  test("payment rejects zero amount and double-pay", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT-PAY-${Date.now().toString().slice(-3)}` }),
    });
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });

    const fullOrder = await req(`/orders/${order.id}`);

    // Zero amount rejected
    await assert.rejects(
      req(`/orders/${order.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ method: "cash", amount: 0, change_due: 0 }),
      }),
      /Payment amount must be greater than zero/
    );

    // Valid payment
    await req(`/orders/${order.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ method: "cash", amount: Number(fullOrder.total), change_due: 0 }),
    });

    // Double-pay rejected
    await assert.rejects(
      req(`/orders/${order.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ method: "cash", amount: 1, change_due: 0 }),
      }),
      /Order is already closed/
    );
  });

  test("kitchen status update and receipt print", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT-KS-${Date.now().toString().slice(-3)}` }),
    });
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });
    await req(`/orders/${order.id}/submit`, { method: "POST" });

    // Check kitchen board
    const kitchenItems = await req("/kitchen/items");
    const ki = kitchenItems.find((k) => k.order_id === order.id);
    assert.ok(ki, "order should appear on kitchen board");

    // Update item status
    await req(`/orders/${order.id}/items/${ki.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "preparing" }),
    });

    // Print receipt
    await req(`/orders/${order.id}/print`, {
      method: "POST",
      body: JSON.stringify({ type: "receipt" }),
    });

    // Verify print jobs exist
    const jobs = await req("/print-jobs");
    assert.ok(jobs.some((j) => j.order_id === order.id && j.type === "kitchen"));
    assert.ok(jobs.some((j) => j.order_id === order.id && j.type === "receipt"));
  });
});

describe("settings & printer", async () => {
  test("toggle auto-clear and verify table clears after payment", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);
    const layout = await req("/floor-layouts");

    const clearable = layout.tables.find((t) => t.status === "available" && !t.current_order_id);
    if (!clearable) return; // skip

    // Enable auto-clear
    await req("/settings", {
      method: "PUT",
      body: JSON.stringify({ auto_clear_tables_after_payment: true }),
    });

    // Open, order, pay
    const dineIn = await req(`/tables/${clearable.id}/open`, {
      method: "POST",
      body: JSON.stringify({ guests: 1 }),
    });
    const updated = await req(`/orders/${dineIn.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });
    await req(`/orders/${dineIn.id}/payments`, {
      method: "POST",
      body: JSON.stringify({ method: "cash", amount: Number(updated.total), change_due: 0 }),
    });

    // Table should be auto-cleared
    const after = await req("/floor-layouts");
    const cleared = after.tables.find((t) => t.id === clearable.id);
    assert.equal(cleared.status, "available");
    assert.equal(cleared.current_order_id, null);

    // Restore
    await req("/settings", {
      method: "PUT",
      body: JSON.stringify({ auto_clear_tables_after_payment: false }),
    });
  });

  test("manage printer profiles", async () => {
    const { req } = await setup();

    const settings = await req("/settings");
    const profile = {
      id: `it-${Date.now().toString().slice(-5)}`,
      name: "Integration Printer",
      role: "receipt",
      host: "192.168.1.250",
      port: 9100,
      enabled: true,
    };

    const updated = await req("/settings", {
      method: "PUT",
      body: JSON.stringify({
        ...settings,
        printer_profiles: [...(settings.printer_profiles || []), profile],
        receipt_printer_id: profile.id,
        backup_enabled: false,
        backup_interval_hours: 24,
      }),
    });
    assert.ok(updated.printer_profiles.some((p) => p.id === profile.id));
  });

  test("receipt print fails when no printer is enabled", async () => {
    const { req } = await setup();
    const { variant } = await getFixture(req);

    const order = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT-RPF-${Date.now().toString().slice(-3)}` }),
    });
    await req(`/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } }),
    });

    // Disable all printers
    const settings = await req("/settings");
    const disabled = (settings.printer_profiles || []).map((p) => ({ ...p, enabled: false }));
    await req("/settings", {
      method: "PUT",
      body: JSON.stringify({ printer_profiles: disabled, receipt_printer_id: disabled[0]?.id || settings.receipt_printer_id }),
    });

    await assert.rejects(
      req(`/orders/${order.id}/print`, {
        method: "POST",
        body: JSON.stringify({ type: "receipt" }),
      }),
      /Receipt printer is not configured or enabled/
    );

    // Restore
    await req("/settings", {
      method: "PUT",
      body: JSON.stringify({ printer_profiles: settings.printer_profiles, receipt_printer_id: settings.receipt_printer_id }),
    });
  });
});

describe("ops & reports", async () => {
  test("health check", async () => {
    const { req } = await setup();
    const health = await req("/ops/health");
    assert.equal(typeof health.ok, "boolean");
    assert.ok(health.checks.some((c) => c.name === "database"));
  });

  test("backup list and create", async () => {
    const { req } = await setup();
    const before = await req("/ops/backups");
    assert.ok(Array.isArray(before));

    const backup = await req("/ops/backups", { method: "POST" });
    assert.ok(backup.name.endsWith(".sql"));

    const after = await req("/ops/backups");
    assert.ok(after.some((f) => f.name === backup.name));
  });

  test("test print job", async () => {
    const { req } = await setup();
    const job = await req("/print-jobs/test", { method: "POST" });
    assert.equal(job.type, "test");
  });

  test("sales report returns orders", async () => {
    const { req } = await setup();
    const report = await req("/reports/sales?from=2020-01-01&to=2999-01-01");
    assert.ok(Number(report.summary.orders) >= 1);
  });

  test("audit log contains entries", async () => {
    const { req } = await setup();
    const audits = await req("/audit-logs");
    assert.ok(Array.isArray(audits));
  });
});
