import test from "node:test";
import assert from "node:assert/strict";

const API_BASE = process.env.API_BASE;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function authed(token, options = {}) {
  return {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  };
}

test("POS API core flow", { skip: !API_BASE }, async () => {
  const login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Owner", pin: "0000" })
  });
  const token = login.token;
  assert.ok(token);

  const layout = await request("/floor-layouts");
  assert.ok(layout.tables.length > 0);

  const table = layout.tables[0];
  const editedLayout = structuredClone(layout);
  const editedTable = editedLayout.tables.find((item) => item.id === table.id);
  const original = { label: editedTable.label, x: editedTable.x };
  editedTable.label = `IT-${Date.now().toString().slice(-4)}`;
  editedTable.x = Number(editedTable.x) + 5;

  await request("/floor-layouts", authed(token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(editedLayout)
  }));
  const savedLayout = await request("/floor-layouts");
  const savedTable = savedLayout.tables.find((item) => item.id === table.id);
  assert.equal(savedTable.label, editedTable.label);

  savedTable.label = original.label;
  savedTable.x = original.x;
  await request("/floor-layouts", authed(token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(savedLayout)
  }));

  const clearableTable = layout.tables.find((item) => item.status === "available" && !item.current_order_id);
  if (clearableTable) {
    await request(`/tables/${clearableTable.id}/clear`, { method: "POST" });
  }

  const menu = await request("/menu");
  const variant = menu.items.flatMap((item) => item.variants).find((item) => item.active);
  assert.ok(variant);

  const category = await request("/menu/categories", authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name_i18n: { "zh-CN": "集成分类", "en-GB": "Integration" }, sort_order: 99 })
  }));
  const patchedCategory = await request(`/menu/categories/${category.id}`, authed(token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sort_order: 100, active: true })
  }));
  assert.equal(patchedCategory.sort_order, 100);

  const menuItem = await request("/menu/items", authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category_id: category.id,
      name_i18n: { "zh-CN": "集成菜品", "en-GB": "Integration Dish" },
      variants: [{ name_i18n: { "zh-CN": "小份", "en-GB": "Small" }, price: 3.5 }]
    })
  }));
  await request(`/menu/items/${menuItem.id}`, authed(token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kitchen_group: "it-kitchen", active: true })
  }));
  const addedVariant = await request(`/menu/items/${menuItem.id}/variants`, authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 5.25 })
  }));
  const patchedVariant = await request(`/menu/items/${menuItem.id}/variants/${addedVariant.id}`, authed(token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 5.75, active: true })
  }));
  assert.equal(Number(patchedVariant.price), 5.75);
  const group = await request("/menu/modifier-groups", authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: menuItem.id, name_i18n: { "zh-CN": "辣度", "en-GB": "Spice" }, min_select: 1, max_select: 1 })
  }));
  const modifier = await request(`/menu/modifier-groups/${group.id}/modifiers`, authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name_i18n: { "zh-CN": "中辣", "en-GB": "Medium" }, price_delta: 0.25 })
  }));
  const patchedModifier = await request(`/menu/modifiers/${modifier.id}`, authed(token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price_delta: 0.5 })
  }));
  assert.equal(Number(patchedModifier.price_delta), 0.5);

  const copiedTable = await request(`/tables/${table.id}/copy`, authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: `IT-COPY-${Date.now().toString().slice(-4)}` })
  }));
  assert.ok(copiedTable.id);
  await request(`/tables/${copiedTable.id}`, authed(token, { method: "DELETE" }));

  const testJob = await request("/print-jobs/test", authed(token, { method: "POST" }));
  assert.equal(testJob.type, "test");

  const order = await request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_type: "takeaway", pickup_no: `IT${Date.now().toString().slice(-3)}` })
  });

  const updated = await request(`/orders/${order.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } })
  });
  assert.ok(Number(updated.total) > 0);

  await request(`/orders/${order.id}/submit`, { method: "POST" });
  const firstPrinted = await request(`/orders/${order.id}`);
  assert.ok(firstPrinted.items[0].kitchen_printed_at);

  await assert.rejects(
    request(`/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_item: { id: firstPrinted.items[0].id, quantity: 2 } })
    }),
    /Kitchen printed items are locked/
  );

  await request(`/orders/${order.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add_item: { variant_id: variant.id, quantity: 1, modifier_ids: [] } })
  });
  const withSecondItem = await request(`/orders/${order.id}`);
  const unprintedItem = withSecondItem.items.find((item) => !item.kitchen_printed_at);
  assert.ok(unprintedItem);
  await request(`/orders/${order.id}/submit`, { method: "POST" });
  const secondPrinted = await request(`/orders/${order.id}`);
  assert.equal(secondPrinted.items.filter((item) => item.kitchen_printed_at).length, 2);

  await assert.rejects(
    request(`/orders/${order.id}/submit`, { method: "POST" }),
    /No new items to print to kitchen/
  );

  await request(`/orders/${order.id}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "receipt" })
  });

  const kitchenItems = await request("/kitchen/items");
  const kitchenItem = kitchenItems.find((item) => item.order_id === order.id);
  assert.ok(kitchenItem);

  await request(`/orders/${order.id}/items/${kitchenItem.id}/status`, authed(token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "preparing" })
  }));

  const discounted = await request(`/orders/${order.id}/discount`, authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discount: 0.5, reason: "integration test" })
  }));
  assert.equal(Number(discounted.discount), 0.5);
  const serviceAdjusted = await request(`/orders/${order.id}/service-charge`, authed(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_charge_exempt: true, reason: "integration test" })
  }));
  assert.equal(Number(serviceAdjusted.service_charge), 0);

  const fullOrder = await request(`/orders/${order.id}`);
  await request(`/orders/${order.id}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "cash", amount: Number(fullOrder.total), change_due: 0 })
  });

  const printJobs = await request("/print-jobs");
  assert.ok(printJobs.some((job) => job.order_id === order.id && job.type === "kitchen"));
  assert.ok(printJobs.some((job) => job.order_id === order.id && job.type === "receipt"));

  const report = await request(`/reports/sales?from=2020-01-01&to=2999-01-01`, authed(token));
  assert.ok(Number(report.summary.orders) >= 1);
  const audits = await request("/audit-logs", authed(token));
  assert.ok(audits.some((log) => log.action === "order.discount.adjust"));
});
