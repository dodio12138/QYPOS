UPDATE roles
SET permissions = '["manage_prints", "manage_menu_availability", "manage_orders", "adjust_service_charge", "view_kitchen", "update_item_status", "create_order", "split_order", "take_payment", "print_receipt"]'::jsonb
WHERE name = 'cashier';

UPDATE roles
SET permissions = '["manage_settings", "manage_prints", "manage_ops", "manage_menu", "manage_menu_availability", "manage_tables", "manage_orders", "manage_users", "adjust_service_charge", "adjust_discount", "view_dashboard", "view_reports", "export_reports", "view_audit_logs", "view_kitchen", "update_item_status", "create_order", "split_order", "take_payment", "print_receipt"]'::jsonb
WHERE name = 'owner';
