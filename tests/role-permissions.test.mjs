import test from "node:test";
import assert from "node:assert/strict";
import {
  CASHIER_PERMISSIONS,
  ADMIN_GRANT_SCOPES,
  OWNER_PERMISSIONS,
  canPatchMenuItem,
} from "../apps/api/src/services/role-permissions.js";

test("cashier can operate orders but cannot adjust discounts or restricted admin areas", () => {
  for (const permission of [
    "manage_orders",
    "adjust_service_charge",
    "manage_menu_availability",
    "manage_prints",
    "view_kitchen",
    "create_order",
    "split_order",
    "take_payment",
    "print_receipt",
  ]) {
    assert.ok(CASHIER_PERMISSIONS.includes(permission), permission);
  }
  for (const permission of [
    "adjust_discount",
    "view_dashboard",
    "manage_users",
    "manage_ops",
    "manage_tables",
    "manage_menu",
    "manage_settings",
  ]) {
    assert.equal(CASHIER_PERMISSIONS.includes(permission), false, permission);
  }
});

test("admin-gated sections grant only their own backend permissions", () => {
  assert.deepEqual(ADMIN_GRANT_SCOPES.discount, ["adjust_discount"]);
  assert.deepEqual(ADMIN_GRANT_SCOPES.settings, ["manage_settings", "manage_prints"]);
  assert.deepEqual(ADMIN_GRANT_SCOPES.users, ["manage_users"]);
  assert.deepEqual(ADMIN_GRANT_SCOPES.ops, ["manage_ops", "manage_settings", "manage_prints"]);
  assert.deepEqual(ADMIN_GRANT_SCOPES.layout, ["manage_tables"]);
  assert.ok(ADMIN_GRANT_SCOPES.dashboard.includes("view_dashboard"));
  assert.equal(ADMIN_GRANT_SCOPES.dashboard.includes("manage_users"), false);
});

test("cashier menu access only accepts a boolean availability patch", () => {
  const cashier = { permissions: CASHIER_PERMISSIONS };
  assert.equal(canPatchMenuItem(cashier, { active: false }), true);
  assert.equal(canPatchMenuItem(cashier, { active: true, sort_order: 2 }), false);
  assert.equal(canPatchMenuItem(cashier, { name_i18n: { "zh-CN": "改名" } }), false);
  assert.equal(canPatchMenuItem(cashier, { active: "false" }), false);
  assert.equal(canPatchMenuItem({ permissions: OWNER_PERMISSIONS }, { name_i18n: {} }), true);
});
