import test from "node:test";
import assert from "node:assert/strict";

const API_BASE = process.env.API_BASE;

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

test("bound option presets sync until a product option is edited", { skip: !API_BASE }, async () => {
  const loginName = process.env.TEST_ADMIN_NAME || "Owner";
  const loginPin = process.env.TEST_ADMIN_PIN || "0000";
  const login = await request("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({
      name: loginName,
      pin: loginPin
    })
  });
  const token = login.token;
  let category;
  let item;
  let originalSettings;
  let settingsChanged = false;
  const presets = [];

  try {
    originalSettings = await request("/settings");
    const changedTaxRate = Number(originalSettings.tax_rate) + 0.001;
    await assert.rejects(
      request("/settings", token, {
        method: "PUT",
        body: JSON.stringify({
          ...originalSettings,
          tax_rate: changedTaxRate,
          prices_include_tax: !originalSettings.prices_include_tax,
          show_tax_on_receipt: !originalSettings.show_tax_on_receipt,
          confirm_name: loginName,
          confirm_pin: "wrong-pin"
        })
      }),
      /401/
    );
    const confirmedSettings = await request("/settings", token, {
      method: "PUT",
      body: JSON.stringify({
        ...originalSettings,
        tax_rate: changedTaxRate,
        prices_include_tax: !originalSettings.prices_include_tax,
        show_tax_on_receipt: !originalSettings.show_tax_on_receipt,
        confirm_name: loginName,
        confirm_pin: loginPin
      })
    });
    settingsChanged = true;
    assert.equal(Number(confirmedSettings.tax_rate), changedTaxRate);
    assert.equal(confirmedSettings.prices_include_tax, !originalSettings.prices_include_tax);
    assert.equal(confirmedSettings.show_tax_on_receipt, !originalSettings.show_tax_on_receipt);

    category = await request("/menu/categories", token, {
      method: "POST",
      body: JSON.stringify({ name_i18n: { "zh-CN": "IT-预设绑定", "en-GB": "IT preset binding" }, sort_order: 999 })
    });
    item = await request("/menu/items", token, {
      method: "POST",
      body: JSON.stringify({
        category_id: category.id,
        name_i18n: { "zh-CN": "IT-绑定产品", "en-GB": "IT bound item" },
        variants: [{ name_i18n: { "zh-CN": "标准", "en-GB": "Standard" }, price: 1 }]
      })
    });

    const variantPreset = await request("/menu/option-presets", token, {
      method: "POST",
      body: JSON.stringify({
        name: "IT-规格预设",
        kind: "variants",
        payload: [{ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 10 }]
      })
    });
    presets.push(variantPreset);
    await request(`/menu/items/${item.id}/apply-option-preset`, token, {
      method: "POST",
      body: JSON.stringify({ preset_id: variantPreset.id })
    });
    const variantSync = await request(`/menu/option-presets/${variantPreset.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ payload: [{ name_i18n: { "zh-CN": "大份", "en-GB": "Large" }, price: 12 }] })
    });
    assert.equal(variantSync.synced_items, 1);
    let menuItem = (await request("/menu")).items.find((entry) => entry.id === item.id);
    assert.equal(menuItem.variant_preset_id, variantPreset.id);
    assert.equal(Number(menuItem.variants[0].price), 12);
    await request(`/menu/items/${item.id}/variants/${menuItem.variants[0].id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ price: 13 })
    });
    menuItem = (await request("/menu")).items.find((entry) => entry.id === item.id);
    assert.equal(menuItem.variant_preset_id, null);
    assert.equal(Number(menuItem.variants[0].price), 13);

    const modifierPreset = await request("/menu/option-presets", token, {
      method: "POST",
      body: JSON.stringify({
        name: "IT-加料预设",
        kind: "modifiers",
        payload: [{
          name_i18n: { "zh-CN": "加料", "en-GB": "Extras" }, min_select: 0, max_select: 2,
          modifiers: [{ name_i18n: { "zh-CN": "鸡蛋", "en-GB": "Egg" }, price_delta: 1, default_selected: true }]
        }]
      })
    });
    presets.push(modifierPreset);
    const modifierGroup = await request("/menu/modifier-groups", token, {
      method: "POST",
      body: JSON.stringify({
        item_id: item.id,
        name_i18n: { "zh-CN": "临时组", "en-GB": "Temporary" },
        min_select: 0,
        max_select: 1
      })
    });
    await request(`/menu/modifier-groups/${modifierGroup.id}/apply-option-preset`, token, {
      method: "POST",
      body: JSON.stringify({ preset_id: modifierPreset.id })
    });
    const modifierSync = await request(`/menu/option-presets/${modifierPreset.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ payload: [{
        name_i18n: { "zh-CN": "加料", "en-GB": "Extras" }, min_select: 0, max_select: 2,
        modifiers: [{ name_i18n: { "zh-CN": "鸡蛋", "en-GB": "Egg" }, price_delta: 2, default_selected: true }]
      }] })
    });
    assert.equal(modifierSync.synced_items, 1);
    menuItem = (await request("/menu")).items.find((entry) => entry.id === item.id);
    assert.equal(menuItem.modifier_groups[0].preset_id, modifierPreset.id);
    assert.equal(Number(menuItem.modifier_groups[0].modifiers[0].price_delta), 2);
    assert.equal(menuItem.modifier_groups[0].modifiers[0].default_selected, true);
    await request(`/menu/modifiers/${menuItem.modifier_groups[0].modifiers[0].id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ price_delta: 3 })
    });
    menuItem = (await request("/menu")).items.find((entry) => entry.id === item.id);
    assert.equal(menuItem.modifier_groups[0].preset_id, null);
    assert.equal(Number(menuItem.modifier_groups[0].modifiers[0].price_delta), 3);
  } finally {
    if (settingsChanged && originalSettings) {
      await request("/settings", token, {
        method: "PUT",
        body: JSON.stringify({ ...originalSettings, confirm_name: loginName, confirm_pin: loginPin })
      }).catch(() => {});
    }
    if (item) await request(`/menu/items/${item.id}/destroy`, token, { method: "DELETE" }).catch(() => {});
    for (const preset of presets) {
      await request(`/menu/option-presets/${preset.id}`, token, { method: "DELETE" }).catch(() => {});
    }
    if (category) await request(`/menu/categories/${category.id}/destroy`, token, { method: "DELETE" }).catch(() => {});
  }
});
