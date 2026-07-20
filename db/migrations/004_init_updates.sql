-- 004_init_updates.sql
-- Idempotent migration generated from recent init.sql changes

-- Orders table extensions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_fixed NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id);

-- Settings additions
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_address TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_header_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_profiles JSONB NOT NULL DEFAULT '[]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_printer_id TEXT NOT NULL DEFAULT 'cashier';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_interval_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ;

-- Ensure preset table exists and seed defaults
CREATE TABLE IF NOT EXISTS note_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category_ids JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE note_presets ADD COLUMN IF NOT EXISTS category_ids JSONB NOT NULL DEFAULT '[]';

INSERT INTO note_presets (label, sort_order)
SELECT v.label, v.sort_order FROM (VALUES
  ('白人辣', 1), ('重庆人辣', 2), ('去葱', 3)
) AS v(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM note_presets np WHERE np.label = v.label);

-- Update owner role permissions (idempotent)
UPDATE roles SET permissions = '["manage_settings","manage_menu","manage_tables","manage_orders","adjust_service_charge","view_dashboard","view_reports","export_reports","view_audit_logs","view_kitchen","update_item_status","create_order","take_payment","print_receipt"]'
WHERE name = 'owner';

-- Ensure default users exist
INSERT INTO users (role_id, name, pin)
SELECT id, 'Cashier', '1111' FROM roles WHERE name = 'cashier'
  AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Cashier');

INSERT INTO users (role_id, name, pin)
SELECT id, 'Kitchen', '2222' FROM roles WHERE name = 'kitchen'
  AND NOT EXISTS (SELECT 1 FROM users WHERE name = 'Kitchen');
