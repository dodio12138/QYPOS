CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  fallback_locale TEXT NOT NULL DEFAULT 'en-GB',
  currency TEXT NOT NULL DEFAULT 'CNY',
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0.0000,
  prices_include_tax BOOLEAN NOT NULL DEFAULT false,
  show_tax_on_receipt BOOLEAN NOT NULL DEFAULT true,
  service_charge_rate NUMERIC(8,4) NOT NULL DEFAULT 0.0000,
  receipt_header TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT '',
  printer_host TEXT NOT NULL DEFAULT '192.168.1.100',
  printer_port INTEGER NOT NULL DEFAULT 9100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id),
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE floor_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES floor_areas(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'available',
  current_order_id UUID,
  opened_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE table_layouts (
  table_id UUID PRIMARY KEY REFERENCES tables(id) ON DELETE CASCADE,
  x NUMERIC(8,2) NOT NULL DEFAULT 0,
  y NUMERIC(8,2) NOT NULL DEFAULT 0,
  width NUMERIC(8,2) NOT NULL DEFAULT 96,
  height NUMERIC(8,2) NOT NULL DEFAULT 72,
  shape TEXT NOT NULL DEFAULT 'rect',
  rotation NUMERIC(8,2) NOT NULL DEFAULT 0
);

CREATE TABLE menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_i18n JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name_i18n JSONB NOT NULL,
  description_i18n JSONB NOT NULL DEFAULT '{}',
  image_url TEXT,
  kitchen_group TEXT NOT NULL DEFAULT 'kitchen',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name_i18n JSONB NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  name_i18n JSONB NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name_i18n JSONB NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT NOT NULL UNIQUE,
  service_type TEXT NOT NULL,
  table_id UUID REFERENCES tables(id),
  pickup_no TEXT,
  guests INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_reason TEXT NOT NULL DEFAULT '',
  net_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge_rate NUMERIC(8,4),
  service_charge_exempt BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE tables
  ADD CONSTRAINT tables_current_order_fk FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES menu_items(id),
  variant_id UUID REFERENCES menu_item_variants(id),
  name_i18n JSONB NOT NULL,
  variant_name_i18n JSONB NOT NULL DEFAULT '{}',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ordered',
  kitchen_printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_item_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id UUID REFERENCES modifiers(id),
  group_name_i18n JSONB NOT NULL DEFAULT '{}',
  name_i18n JSONB NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  change_due NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO restaurants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'QY Restaurant');

INSERT INTO settings (
  restaurant_id, locale, fallback_locale, currency, tax_rate, prices_include_tax,
  show_tax_on_receipt, service_charge_rate, receipt_header, receipt_footer
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'zh-CN', 'en-GB', 'GBP', 0.2000, false,
  true, 0.1500, 'QY Restaurant', 'Thank you / 谢谢光临'
);

INSERT INTO roles (name, permissions) VALUES
  ('owner', '["manage_settings","manage_menu","manage_tables","manage_orders","adjust_service_charge","view_dashboard","view_reports","export_reports","view_audit_logs","view_kitchen","update_item_status","create_order","take_payment","print_receipt"]'),
  ('cashier', '["create_order","take_payment","print_receipt"]'),
  ('kitchen', '["view_kitchen","update_item_status"]');

INSERT INTO users (role_id, name, pin)
SELECT id, 'Owner', '0000' FROM roles WHERE name = 'owner';
INSERT INTO users (role_id, name, pin)
SELECT id, 'Cashier', '1111' FROM roles WHERE name = 'cashier';
INSERT INTO users (role_id, name, pin)
SELECT id, 'Kitchen', '2222' FROM roles WHERE name = 'kitchen';

INSERT INTO floor_areas (id, name, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', '大厅', 1),
  ('10000000-0000-0000-0000-000000000002', '包间', 2);

INSERT INTO tables (id, area_id, label, seats, status) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A1', 2, 'available'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'A2', 4, 'available'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'A3', 4, 'available'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'B1', 6, 'available');

INSERT INTO table_layouts (table_id, x, y, width, height, shape) VALUES
  ('20000000-0000-0000-0000-000000000001', 40, 40, 92, 72, 'round'),
  ('20000000-0000-0000-0000-000000000002', 170, 40, 120, 76, 'rect'),
  ('20000000-0000-0000-0000-000000000003', 330, 40, 120, 76, 'rect'),
  ('20000000-0000-0000-0000-000000000004', 40, 170, 148, 88, 'rect');

INSERT INTO menu_categories (id, name_i18n, sort_order) VALUES
  ('30000000-0000-0000-0000-000000000001', '{"zh-CN":"主食","en-GB":"Mains"}', 1),
  ('30000000-0000-0000-0000-000000000002', '{"zh-CN":"饮品","en-GB":"Drinks"}', 2);

INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, kitchen_group) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '{"zh-CN":"牛肉面","en-GB":"Beef Noodles"}', '{"zh-CN":"招牌红烧汤底","en-GB":"Signature braised broth"}', 'hot'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '{"zh-CN":"鸡肉饭","en-GB":"Chicken Rice"}', '{}', 'hot'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '{"zh-CN":"柠檬茶","en-GB":"Lemon Tea"}', '{}', 'bar');

INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order) VALUES
  ('40000000-0000-0000-0000-000000000001', '{"zh-CN":"小份","en-GB":"Regular"}', 38, 1),
  ('40000000-0000-0000-0000-000000000001', '{"zh-CN":"大份","en-GB":"Large"}', 48, 2),
  ('40000000-0000-0000-0000-000000000002', '{"zh-CN":"标准","en-GB":"Standard"}', 42, 1),
  ('40000000-0000-0000-0000-000000000003', '{"zh-CN":"冰","en-GB":"Iced"}', 18, 1);

INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '{"zh-CN":"辣度","en-GB":"Spice"}', 0, 1, 1),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '{"zh-CN":"加料","en-GB":"Extras"}', 0, 3, 2);

INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001', '{"zh-CN":"不辣","en-GB":"Mild"}', 0, 1),
  ('50000000-0000-0000-0000-000000000001', '{"zh-CN":"中辣","en-GB":"Medium"}', 0, 2),
  ('50000000-0000-0000-0000-000000000002', '{"zh-CN":"加蛋","en-GB":"Egg"}', 5, 1),
  ('50000000-0000-0000-0000-000000000002', '{"zh-CN":"加牛肉","en-GB":"Extra Beef"}', 12, 2);
