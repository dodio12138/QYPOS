export const OWNER_PERMISSIONS = [
  "manage_settings",
  "manage_prints",
  "manage_ops",
  "view_staff_schedules",
  "manage_staff_schedules",
  "manage_menu",
  "manage_menu_availability",
  "manage_tables",
  "manage_orders",
  "manage_users",
  "adjust_service_charge",
  "adjust_discount",
  "view_dashboard",
  "view_reports",
  "export_reports",
  "view_audit_logs",
  "view_kitchen",
  "update_item_status",
  "create_order",
  "split_order",
  "take_payment",
  "print_receipt",
];

export const CASHIER_PERMISSIONS = [
  "manage_prints",
  "view_staff_schedules",
  "manage_menu_availability",
  "manage_orders",
  "adjust_service_charge",
  "view_kitchen",
  "update_item_status",
  "create_order",
  "split_order",
  "take_payment",
  "print_receipt",
];

export const ADMIN_GRANT_SCOPES = {
  discount: ["adjust_discount"],
  settings: ["manage_settings", "manage_prints"],
  dashboard: ["view_dashboard", "view_reports", "export_reports", "view_audit_logs"],
  reports: ["view_reports", "export_reports"],
  users: ["manage_users"],
  ops: ["manage_ops", "manage_settings", "manage_prints"],
  layout: ["manage_tables"],
  schedule: ["view_staff_schedules", "manage_staff_schedules"],
};

export function canPatchMenuItem(user, body) {
  const permissions = user?.permissions ?? [];
  if (permissions.includes("manage_menu")) return true;
  if (!permissions.includes("manage_menu_availability")) return false;
  const keys = Object.keys(body ?? {});
  return keys.length === 1 && keys[0] === "active" && typeof body.active === "boolean";
}
