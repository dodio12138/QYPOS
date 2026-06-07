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
  printer_host TEXT NOT NULL DEFAULT '192.168.1.251',
  printer_port INTEGER NOT NULL DEFAULT 9100,
  printer_profiles JSONB NOT NULL DEFAULT '[]',
  kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen',
  receipt_printer_id TEXT NOT NULL DEFAULT 'cashier',
  backup_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_interval_hours INTEGER NOT NULL DEFAULT 24,
  last_backup_at TIMESTAMPTZ,
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

INSERT INTO restaurants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Granny Noodles');

INSERT INTO settings (
  restaurant_id, locale, fallback_locale, currency, tax_rate, prices_include_tax,
  show_tax_on_receipt, service_charge_rate, receipt_header, receipt_footer,
  printer_profiles, kitchen_printer_id, receipt_printer_id
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'zh-CN', 'en-GB', 'GBP', 0.2000, true,
  false, 0.0000, 'Granny Noodles', 'Thank you / 感谢光临',
  '[{"id":"kitchen","name":"厨房打印机","role":"kitchen","connection_type":"network","charset":"GBK","host":"192.168.1.251","port":9100,"enabled":true},{"id":"cashier","name":"收银打印机","role":"receipt","connection_type":"network","charset":"GBK","host":"192.168.1.251","port":9100,"enabled":true},{"id":"bar","name":"吧台打印机","role":"bar","connection_type":"network","charset":"GBK","host":"192.168.1.102","port":9100,"enabled":false}]',
  'kitchen',
  'cashier'
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
  ('30000000-0000-0000-0000-000000000001', '{"zh-CN":"重庆小面","en-GB":"Wheat Noodles"}',            1),
  ('30000000-0000-0000-0000-000000000002', '{"zh-CN":"干拌面","en-GB":"Dry Noodles"}',                2),
  ('30000000-0000-0000-0000-000000000003', '{"zh-CN":"酸辣粉","en-GB":"Hot & Sour Glass Noodles"}',   3),
  ('30000000-0000-0000-0000-000000000004', '{"zh-CN":"饮料","en-GB":"Soft Drinks"}',                  4),
  ('30000000-0000-0000-0000-000000000005', '{"zh-CN":"小吃","en-GB":"Side Dishes"}',                  5);

INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, kitchen_group) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"素小面","en-GB":"Vegan Xiao Mian"}',
    '{"zh-CN":"蔬菜，花生","en-GB":"Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"杂酱面","en-GB":"ZaJiang Noodles"}',
    '{"zh-CN":"肉末，蔬菜，花生","en-GB":"Minced Pork, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"碗豆面","en-GB":"Peas Noodles"}',
    '{"zh-CN":"蔬菜，花生，豌豆","en-GB":"Vegetables, Peanuts, Peas"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"碗豆杂酱面","en-GB":"ZaJiang & Peas Noodles"}',
    '{"zh-CN":"肉末，蔬菜，花生，豌豆","en-GB":"Minced Pork, Vegetables, Peanuts, Peas"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"牛肉面","en-GB":"Beef Noodles"}',
    '{"zh-CN":"牛肉，蔬菜，花生","en-GB":"Beef, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"麻辣牛肉面","en-GB":"Spicy Beef Noodles"}',
    '{"zh-CN":"麻辣牛肉，蔬菜，花生","en-GB":"Spicy Beef, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"辣子鸡面","en-GB":"Sichuan Spicy Chicken Noodles"}',
    '{"zh-CN":"麻辣鸡肉，蔬菜，花生","en-GB":"Spicy Chicken, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"麻辣猪蹄面","en-GB":"Mala Pork Trotter Noodles"}',
    '{"zh-CN":"麻辣猪蹄，蔬菜，花生","en-GB":"Spicy Trotter, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"原汤猪蹄面","en-GB":"Braised Pork Trotter Noodles"}',
    '{"zh-CN":"猪蹄，蔬菜，花生","en-GB":"Trotter, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"鸡汤面","en-GB":"Chicken Soup Noodles"}',
    '{"zh-CN":"鸡肉，蔬菜","en-GB":"Chicken, Vegetables"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001',
    '{"zh-CN":"猪肚鸡汤面","en-GB":"Pork Tripe Chicken Noodles"}',
    '{"zh-CN":"猪肚，鸡肉，蔬菜","en-GB":"Pork Tripe, Chicken, Vegetables"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000002',
    '{"zh-CN":"干馏小面","en-GB":"Chongqing Xiao Mian (Dry Style)"}',
    '{"zh-CN":"蔬菜，花生","en-GB":"Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000002',
    '{"zh-CN":"干馏杂酱小面","en-GB":"ZaJiang Noodles (Dry Style)"}',
    '{"zh-CN":"肉末，蔬菜，花生","en-GB":"Minced Pork, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000002',
    '{"zh-CN":"干馏碗豆杂酱小面","en-GB":"ZaJiang & Peas Noodles (Dry Style)"}',
    '{"zh-CN":"蔬菜，花生，豌豆","en-GB":"Vegetables, Peanuts, Peas"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000003',
    '{"zh-CN":"素酸辣粉","en-GB":"Vegan Hot & Sour Glass Noodles"}',
    '{"zh-CN":"蔬菜，花生","en-GB":"Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000016', '30000000-0000-0000-0000-000000000003',
    '{"zh-CN":"杂酱酸辣粉","en-GB":"ZaJiang Hot & Sour Glass Noodles"}',
    '{"zh-CN":"肉末，蔬菜，花生","en-GB":"Minced Pork, Vegetables, Peanuts"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000017', '30000000-0000-0000-0000-000000000003',
    '{"zh-CN":"无麸质酸辣粉","en-GB":"Gluten-free Vegan Glass Noodles"}',
    '{"zh-CN":"蔬菜，花生，豌豆","en-GB":"Vegetables, Peanuts, Peas"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000018', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"雪碧","en-GB":"Sprite"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000019', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"可乐","en-GB":"Coca-Cola"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000020', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"芦荟汁","en-GB":"Aloe Vera Juice"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"王老吉","en-GB":"Wong Lo Kat Herbal Tea"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"冰红茶","en-GB":"Iced Black Tea"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"冰绿茶","en-GB":"Iced Green Tea"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000024', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"酸梅汤","en-GB":"Sour Plum Drink"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000025', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"矿泉水","en-GB":"Mineral Water"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000026', '30000000-0000-0000-0000-000000000004',
    '{"zh-CN":"气泡水","en-GB":"Sparkling Water"}', '{}', 'bar'),
  ('40000000-0000-0000-0000-000000000027', '30000000-0000-0000-0000-000000000005',
    '{"zh-CN":"重庆手工豆干","en-GB":"Handmade Spiced Dried Tofu"}',
    '{"zh-CN":"重庆风味手工豆干","en-GB":"Chongqing Style"}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000028', '30000000-0000-0000-0000-000000000005',
    '{"zh-CN":"凉拌黄瓜","en-GB":"Cucumber Salad"}', '{}', 'kitchen'),
  ('40000000-0000-0000-0000-000000000029', '30000000-0000-0000-0000-000000000005',
    '{"zh-CN":"香橘猪蹄","en-GB":"Pork Trotter"}', '{}', 'kitchen');

INSERT INTO menu_item_variants (item_id, name_i18n, price, sort_order) VALUES
  ('40000000-0000-0000-0000-000000000001', '{"zh-CN":"标准","en-GB":"Standard"}', 10.80, 1),
  ('40000000-0000-0000-0000-000000000002', '{"zh-CN":"标准","en-GB":"Standard"}', 12.80, 1),
  ('40000000-0000-0000-0000-000000000003', '{"zh-CN":"标准","en-GB":"Standard"}', 11.80, 1),
  ('40000000-0000-0000-0000-000000000004', '{"zh-CN":"标准","en-GB":"Standard"}', 13.80, 1),
  ('40000000-0000-0000-0000-000000000005', '{"zh-CN":"标准","en-GB":"Standard"}', 13.80, 1),
  ('40000000-0000-0000-0000-000000000006', '{"zh-CN":"标准","en-GB":"Standard"}', 14.80, 1),
  ('40000000-0000-0000-0000-000000000007', '{"zh-CN":"标准","en-GB":"Standard"}', 15.80, 1),
  ('40000000-0000-0000-0000-000000000008', '{"zh-CN":"标准","en-GB":"Standard"}', 15.80, 1),
  ('40000000-0000-0000-0000-000000000009', '{"zh-CN":"标准","en-GB":"Standard"}', 14.80, 1),
  ('40000000-0000-0000-0000-000000000010', '{"zh-CN":"标准","en-GB":"Standard"}', 10.80, 1),
  ('40000000-0000-0000-0000-000000000011', '{"zh-CN":"标准","en-GB":"Standard"}', 17.80, 1),
  ('40000000-0000-0000-0000-000000000012', '{"zh-CN":"标准","en-GB":"Standard"}', 10.80, 1),
  ('40000000-0000-0000-0000-000000000013', '{"zh-CN":"标准","en-GB":"Standard"}', 12.80, 1),
  ('40000000-0000-0000-0000-000000000014', '{"zh-CN":"标准","en-GB":"Standard"}', 13.80, 1),
  ('40000000-0000-0000-0000-000000000015', '{"zh-CN":"标准","en-GB":"Standard"}', 11.80, 1),
  ('40000000-0000-0000-0000-000000000016', '{"zh-CN":"标准","en-GB":"Standard"}', 13.80, 1),
  ('40000000-0000-0000-0000-000000000017', '{"zh-CN":"标准","en-GB":"Standard"}', 12.80, 1),
  ('40000000-0000-0000-0000-000000000018', '{"zh-CN":"标准","en-GB":"Standard"}',  3.80, 1),
  ('40000000-0000-0000-0000-000000000019', '{"zh-CN":"标准","en-GB":"Standard"}',  3.80, 1),
  ('40000000-0000-0000-0000-000000000020', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000021', '{"zh-CN":"标准","en-GB":"Standard"}',  3.80, 1),
  ('40000000-0000-0000-0000-000000000022', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000023', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000024', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000025', '{"zh-CN":"标准","en-GB":"Standard"}',  2.00, 1),
  ('40000000-0000-0000-0000-000000000026', '{"zh-CN":"标准","en-GB":"Standard"}',  2.00, 1),
  ('40000000-0000-0000-0000-000000000027', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000028', '{"zh-CN":"标准","en-GB":"Standard"}',  4.80, 1),
  ('40000000-0000-0000-0000-000000000029', '{"zh-CN":"标准","en-GB":"Standard"}',  8.00, 1);

INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000007', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000008', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000009', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000011', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000012', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000013', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000014', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000015', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000016', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1),
  ('50000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000017', '{"zh-CN":"加小料","en-GB":"Extra Toppings"}', 0, 5, 1);

INSERT INTO modifiers (group_id, name_i18n, price_delta, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000001','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000001','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000001','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000001','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000002','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000002','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000002','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000002','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000002','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000003','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000003','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000003','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000003','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000003','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000004','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000004','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000004','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000004','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000004','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000005','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000005','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000005','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000005','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000005','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000006','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000006','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000006','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000006','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000006','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000007','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000007','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000007','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000007','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000007','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000008','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000008','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000008','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000008','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000008','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000009','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000009','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000009','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000009','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000009','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000010','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000010','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000010','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000010','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000010','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000011','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000011','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000011','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000011','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000011','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000012','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000012','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000012','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000012','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000012','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000013','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000013','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000013','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000013','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000013','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000014','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000014','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000014','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000014','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000014','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000015','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000015','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000015','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000015','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000015','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000016','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000016','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000016','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000016','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000016','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5),
  ('50000000-0000-0000-0000-000000000017','{"zh-CN":"煎鸡蛋","en-GB":"Fried Egg"}',1.50,1),
  ('50000000-0000-0000-0000-000000000017','{"zh-CN":"豌豆","en-GB":"Peas"}',1.00,2),
  ('50000000-0000-0000-0000-000000000017','{"zh-CN":"杂酱","en-GB":"Minced Pork"}',2.00,3),
  ('50000000-0000-0000-0000-000000000017','{"zh-CN":"蔬菜","en-GB":"Vegetables"}',1.00,4),
  ('50000000-0000-0000-0000-000000000017','{"zh-CN":"牛肉","en-GB":"Beef"}',4.00,5);
