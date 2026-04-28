ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_profiles JSONB NOT NULL DEFAULT '[]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_printer_id TEXT NOT NULL DEFAULT 'cashier';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_interval_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ;

UPDATE roles SET permissions = '["manage_settings","manage_menu","manage_tables","manage_orders","adjust_service_charge","view_dashboard","view_reports","export_reports","view_audit_logs","view_kitchen","update_item_status","create_order","take_payment","print_receipt"]'
WHERE name = 'owner';

INSERT INTO users (role_id, name, pin)
SELECT id, 'Cashier', '1111' FROM roles WHERE name = 'cashier'
AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Cashier');

INSERT INTO users (role_id, name, pin)
SELECT id, 'Kitchen', '2222' FROM roles WHERE name = 'kitchen'
AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Kitchen');
