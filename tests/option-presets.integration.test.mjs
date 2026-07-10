import test from "node:test";
import assert from "node:assert/strict";
import { authed, loginAdmin, request, destroyMenuResources, destroyPresets } from "./helpers.mjs";

const API_BASE = process.env.API_BASE;
const describe = API_BASE ? test : test.skip;

async function setup() {
  const { token } = await loginAdmin(API_BASE);
  const req = authed(API_BASE, token);
  return { token, req };
}

describe("settings confirm-pin gate", async () => {
  test("rejects sensitive setting changes with wrong PIN", async () => {
    const { req } = await setup();
    const { token } = await loginAdmin(API_BASE);
    const originalSettings = await req("/settings");
    const changedTaxRate = Number(originalSettings.tax_rate) + 0.001;

    await assert.rejects(
      req("/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...originalSettings,
          tax_rate: changedTaxRate,
          prices_include_tax: !originalSettings.prices_include_tax,
          show_tax_on_receipt: !originalSettings.show_tax_on_receipt,
          confirm_name: process.env.TEST_ADMIN_NAME || "Owner",
          confirm_pin: "wrong-pin",
        }),
      }),
      /401/
    );
  });

  test("accepts sensitive setting changes with correct PIN", async () => {
    const { req } = await setup();
    const loginName = process.env.TEST_ADMIN_NAME || "Owner";
    const loginPin = process.env.TEST_ADMIN_PIN || "0000";
    const originalSettings = await req("/settings");
    const changedTaxRate = Number(originalSettings.tax_rate) + 0.001;

    const confirmed = await req("/settings", {
      method: "PUT",
      body: JSON.stringify({
        ...originalSettings,
        tax_rate: changedTaxRate,
        prices_include_tax: !originalSettings.prices_include_tax,
        show_tax_on_receipt: !originalSettings.show_tax_on_receipt,
        confirm_name: loginName,
        confirm_pin: loginPin,
      }),
    });
    assert.equal(Number(confirmed.tax_rate), changedTaxRate);
    assert.equal(confirmed.prices_include_tax, !originalSettings.prices_include_tax);
    assert.equal(confirmed.show_tax_on_receipt, !originalSettings.show_tax_on_receipt);

    // Restore settings
    await req("/settings", {
      method: "PUT",
      body: JSON.stringify({ ...originalSettings, confirm_name: loginName, confirm_pin: loginPin }),
    }).catch(() => {});
  });
});

describe("option preset binding & sync", async () => {
  let category, item, presets = [];

  test("create category and item for preset tests", async () => {
    const { req } = await setup();
    category = await req("/menu/categories", {
      method: "POST",
      body: JSON.stringify({ name_i18n: { "zh-CN": "IT-预设绑定", "en-GB": "IT preset binding" }, sort_order: 999 }),
    });
    item = await req("/menu/items", {
      method: "POST",
      body: JSON.stringify({
        category_id: category.id,
        name_i18n: { "zh-CN": "IT-绑定产品", "en-GB": "IT bound item" },
        variants: [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: 1 }],
      }),
    });
    assert.ok(item.id);
  });

  test("variant preset syncs to bound items until edited", async () => {
    const { req } = await setup();
    const variantPreset = await req("/menu/option-presets", {
      method: "POST",
      body: JSON.stringify({ name: "IT-规格预设", kind: "variants", payload: [{ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 10 }] }),
    });
    presets.push(variantPreset);

    await req(`/menu/items/${item.id}/apply-option-preset`, {
      method: "POST",
      body: JSON.stringify({ preset_id: variantPreset.id }),
    });

    // Update preset → synced items = 1
    const sync = await req(`/menu/option-presets/${variantPreset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ payload: [{ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 12 }] }),
    });
    assert.equal(sync.synced_items, 1);

    let menuItem = (await req("/menu")).items.find((e) => e.id === item.id);
    assert.equal(menuItem.variant_preset_id, variantPreset.id);
    assert.equal(Number(menuItem.variants[0].price), 12);

    // Manual edit breaks the binding
    await req(`/menu/items/${item.id}/variants/${menuItem.variants[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 13 }),
    });
    menuItem = (await req("/menu")).items.find((e) => e.id === item.id);
    assert.equal(menuItem.variant_preset_id, null);
    assert.equal(Number(menuItem.variants[0].price), 13);
  });

  test("modifier preset syncs to bound groups until edited", async () => {
    const { req } = await setup();
    const modifierPreset = await req("/menu/option-presets", {
      method: "POST",
      body: JSON.stringify({
        name: "IT-加料预设", kind: "modifiers",
        payload: [{
          name_i18n: { "zh-CN": "加料", "en-GB": "Extras" }, min_select: 0, max_select: 2,
          modifiers: [{ name_i18n: { "zh-CN": "鸡蛋", "en-GB": "Egg" }, price_delta: 1, default_selected: true }],
        }],
      }),
    });
    presets.push(modifierPreset);

    const group = await req("/menu/modifier-groups", {
      method: "POST",
      body: JSON.stringify({ item_id: item.id, name_i18n: { "zh-CN": "临时组", "en-GB": "Temporary" }, min_select: 0, max_select: 1 }),
    });
    await req(`/menu/modifier-groups/${group.id}/apply-option-preset`, {
      method: "POST",
      body: JSON.stringify({ preset_id: modifierPreset.id }),
    });

    const sync = await req(`/menu/option-presets/${modifierPreset.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        payload: [{
          name_i18n: { "zh-CN": "加料", "en-GB": "Extras" }, min_select: 0, max_select: 2,
          modifiers: [{ name_i18n: { "zh-CN": "鸡蛋", "en-GB": "Egg" }, price_delta: 2, default_selected: true }],
        }],
      }),
    });
    assert.equal(sync.synced_items, 1);

    let menuItem = (await req("/menu")).items.find((e) => e.id === item.id);
    assert.equal(menuItem.modifier_groups[0].preset_id, modifierPreset.id);
    assert.equal(Number(menuItem.modifier_groups[0].modifiers[0].price_delta), 2);
    assert.equal(menuItem.modifier_groups[0].modifiers[0].default_selected, true);

    // Manual edit breaks binding
    await req(`/menu/modifiers/${menuItem.modifier_groups[0].modifiers[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ price_delta: 3 }),
    });
    menuItem = (await req("/menu")).items.find((e) => e.id === item.id);
    assert.equal(menuItem.modifier_groups[0].preset_id, null);
    assert.equal(Number(menuItem.modifier_groups[0].modifiers[0].price_delta), 3);
  });

  // Cleanup
  test("cleanup preset test resources", async () => {
    const { req } = await setup();
    if (item) await req(`/menu/items/${item.id}/destroy`, { method: "DELETE" }).catch(() => {});
    await destroyPresets(req, presets.map((p) => p.id));
    if (category) await req(`/menu/categories/${category.id}/destroy`, { method: "DELETE" }).catch(() => {});
  });
});
