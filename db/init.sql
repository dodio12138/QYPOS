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
  receipt_header_zh TEXT NOT NULL DEFAULT '',
  receipt_phone TEXT NOT NULL DEFAULT '',
  receipt_address TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT '',
  printer_host TEXT NOT NULL DEFAULT '192.168.1.251',
  printer_port INTEGER NOT NULL DEFAULT 9100,
  printer_profiles JSONB NOT NULL DEFAULT '[]',
  kitchen_printer_id TEXT NOT NULL DEFAULT 'kitchen',
  receipt_printer_id TEXT NOT NULL DEFAULT 'cashier',
  kitchen_item_font_size INTEGER NOT NULL DEFAULT 5,
  kitchen_item_bold BOOLEAN NOT NULL DEFAULT true,
  kitchen_qty_bold BOOLEAN NOT NULL DEFAULT true,
  backup_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_interval_hours INTEGER NOT NULL DEFAULT 24,
  auto_clear_tables_after_payment BOOLEAN NOT NULL DEFAULT false,
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

CREATE TABLE staff_schedule_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22c55e',
  hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_schedule_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES staff_schedule_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  is_off BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 1440),
  note TEXT NOT NULL DEFAULT '',
  actual_start_time TIME,
  actual_end_time TIME,
  actual_break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_break_minutes >= 0 AND actual_break_minutes <= 1440),
  actual_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date),
  CHECK (
    is_off = true
    OR (start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX staff_schedule_cells_work_date_idx ON staff_schedule_cells(work_date);

CREATE TABLE staff_schedule_time_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT '',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(start_time, end_time)
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

CREATE TABLE menu_option_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('variants', 'modifiers')),
  payload JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX menu_option_presets_kind_idx ON menu_option_presets(kind, active, created_at);

ALTER TABLE menu_items ADD COLUMN variant_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;
ALTER TABLE menu_items ADD COLUMN modifier_preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;
ALTER TABLE modifier_groups ADD COLUMN preset_id UUID REFERENCES menu_option_presets(id) ON DELETE SET NULL;
CREATE INDEX modifier_groups_preset_idx ON modifier_groups(preset_id) WHERE preset_id IS NOT NULL;
ALTER TABLE modifiers ADD COLUMN default_selected BOOLEAN NOT NULL DEFAULT false;

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
  discount_fixed NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5,2),
  discount_reason TEXT NOT NULL DEFAULT '',
  net_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge_rate NUMERIC(8,4),
  service_charge_exempt BOOLEAN NOT NULL DEFAULT false,
  parent_order_id UUID,
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

CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  provider_session_id TEXT,
  terminal_id TEXT,
  error_code TEXT,
  error_message TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payment_attempts_order_idx ON payment_attempts(order_id, created_at DESC);
CREATE UNIQUE INDEX payment_attempts_provider_payment_idx ON payment_attempts(provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;

ALTER TABLE payments ADD COLUMN payment_attempt_id UUID REFERENCES payment_attempts(id);
ALTER TABLE payments ADD COLUMN provider TEXT;
ALTER TABLE payments ADD COLUMN provider_payment_id TEXT;
ALTER TABLE payments ADD COLUMN terminal_id TEXT;
ALTER TABLE payments ADD COLUMN card_brand TEXT;
ALTER TABLE payments ADD COLUMN card_last4 TEXT;
ALTER TABLE payments ADD COLUMN auth_code TEXT;
CREATE UNIQUE INDEX payments_attempt_idx ON payments(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_payment_idx ON payments(provider, provider_payment_id) WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;

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

CREATE TABLE note_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category_ids JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- Seed data (regenerated from live DB via pg_dump --data-only --column-inserts)
-- =========================================================================

--
--
--
-- Data for Name: floor_areas; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO floor_areas (id, name, sort_order) VALUES ('10000000-0000-0000-0000-000000000001', '大厅', 1);
--
-- Data for Name: note_presets; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO note_presets (label, sort_order) VALUES ('白人辣', 1);
INSERT INTO note_presets (label, sort_order) VALUES ('重庆人辣', 2);
INSERT INTO note_presets (label, sort_order) VALUES ('去葱', 3);
--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO menu_categories (id, name_i18n, sort_order, active) VALUES ('30000000-0000-0000-0000-000000000001', '{"en-GB": "Wheat Noodles", "zh-CN": "重庆小面"}', 1, true);
INSERT INTO menu_categories (id, name_i18n, sort_order, active) VALUES ('30000000-0000-0000-0000-000000000002', '{"en-GB": "Dry Noodles", "zh-CN": "干拌面"}', 2, true);
INSERT INTO menu_categories (id, name_i18n, sort_order, active) VALUES ('30000000-0000-0000-0000-000000000003', '{"en-GB": "Hot & Sour Glass Noodles", "zh-CN": "酸辣粉"}', 3, true);
INSERT INTO menu_categories (id, name_i18n, sort_order, active) VALUES ('30000000-0000-0000-0000-000000000004', '{"en-GB": "Soft Drinks", "zh-CN": "饮料"}', 4, true);
INSERT INTO menu_categories (id, name_i18n, sort_order, active) VALUES ('30000000-0000-0000-0000-000000000005', '{"en-GB": "Side Dishes", "zh-CN": "小吃"}', 5, true);
--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Vegan Xiao Mian", "zh-CN": "素小面"}', '{"en-GB": "Vegetables, Peanuts", "zh-CN": "蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '{"en-GB": "ZaJiang Noodles", "zh-CN": "杂酱面"}', '{"en-GB": "Minced Pork, Vegetables, Peanuts", "zh-CN": "肉末，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Peas Noodles", "zh-CN": "碗豆面"}', '{"en-GB": "Vegetables, Peanuts, Peas", "zh-CN": "蔬菜，花生，豌豆"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '{"en-GB": "ZaJiang & Peas Noodles", "zh-CN": "碗豆杂酱面"}', '{"en-GB": "Minced Pork, Vegetables, Peanuts, Peas", "zh-CN": "肉末，蔬菜，花生，豌豆"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Beef Noodles", "zh-CN": "牛肉面"}', '{"en-GB": "Beef, Vegetables, Peanuts", "zh-CN": "牛肉，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Spicy Beef Noodles", "zh-CN": "麻辣牛肉面"}', '{"en-GB": "Spicy Beef, Vegetables, Peanuts", "zh-CN": "麻辣牛肉，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Sichuan Spicy Chicken Noodles", "zh-CN": "辣子鸡面"}', '{"en-GB": "Spicy Chicken, Vegetables, Peanuts", "zh-CN": "麻辣鸡肉，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Mala Pork Trotter Noodles", "zh-CN": "麻辣猪蹄面"}', '{"en-GB": "Spicy Trotter, Vegetables, Peanuts", "zh-CN": "麻辣猪蹄，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Braised Pork Trotter Noodles", "zh-CN": "原汤猪蹄面"}', '{"en-GB": "Trotter, Vegetables, Peanuts", "zh-CN": "猪蹄，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Chicken Soup Noodles", "zh-CN": "鸡汤面"}', '{"en-GB": "Chicken, Vegetables", "zh-CN": "鸡肉，蔬菜"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', '{"en-GB": "Pork Tripe Chicken Noodles", "zh-CN": "猪肚鸡汤面"}', '{"en-GB": "Pork Tripe, Chicken, Vegetables", "zh-CN": "猪肚，鸡肉，蔬菜"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.472507+00', '2026-06-07 16:25:27.472507+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000002', '{"en-GB": "Chongqing Xiao Mian (Dry Style)", "zh-CN": "干馏小面"}', '{"en-GB": "Vegetables, Peanuts", "zh-CN": "蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.474248+00', '2026-06-07 16:25:27.474248+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000002', '{"en-GB": "ZaJiang Noodles (Dry Style)", "zh-CN": "干馏杂酱小面"}', '{"en-GB": "Minced Pork, Vegetables, Peanuts", "zh-CN": "肉末，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.474248+00', '2026-06-07 16:25:27.474248+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000002', '{"en-GB": "ZaJiang & Peas Noodles (Dry Style)", "zh-CN": "干馏碗豆杂酱小面"}', '{"en-GB": "Vegetables, Peanuts, Peas", "zh-CN": "蔬菜，花生，豌豆"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.474248+00', '2026-06-07 16:25:27.474248+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000003', '{"en-GB": "Vegan Hot & Sour Glass Noodles", "zh-CN": "素酸辣粉"}', '{"en-GB": "Vegetables, Peanuts", "zh-CN": "蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.475275+00', '2026-06-07 16:25:27.475275+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000016', '30000000-0000-0000-0000-000000000003', '{"en-GB": "ZaJiang Hot & Sour Glass Noodles", "zh-CN": "杂酱酸辣粉"}', '{"en-GB": "Minced Pork, Vegetables, Peanuts", "zh-CN": "肉末，蔬菜，花生"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.475275+00', '2026-06-07 16:25:27.475275+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000017', '30000000-0000-0000-0000-000000000003', '{"en-GB": "Gluten-free Vegan Glass Noodles", "zh-CN": "无麸质酸辣粉"}', '{"en-GB": "Vegetables, Peanuts, Peas", "zh-CN": "蔬菜，花生，豌豆"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.475275+00', '2026-06-07 16:25:27.475275+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000018', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Sprite", "zh-CN": "雪碧"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000019', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Coca-Cola", "zh-CN": "可乐"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000020', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Aloe Vera Juice", "zh-CN": "芦荟汁"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Wong Lo Kat Herbal Tea", "zh-CN": "王老吉"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Iced Black Tea", "zh-CN": "冰红茶"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Iced Green Tea", "zh-CN": "冰绿茶"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000024', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Sour Plum Drink", "zh-CN": "酸梅汤"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000025', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Mineral Water", "zh-CN": "矿泉水"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000026', '30000000-0000-0000-0000-000000000004', '{"en-GB": "Sparkling Water", "zh-CN": "气泡水"}', '{}', NULL, 'bar', true, '2026-06-07 16:25:27.476068+00', '2026-06-07 16:25:27.476068+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000027', '30000000-0000-0000-0000-000000000005', '{"en-GB": "Handmade Spiced Dried Tofu", "zh-CN": "重庆手工豆干"}', '{"en-GB": "Chongqing Style", "zh-CN": "重庆风味手工豆干"}', NULL, 'kitchen', true, '2026-06-07 16:25:27.477154+00', '2026-06-07 16:25:27.477154+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000028', '30000000-0000-0000-0000-000000000005', '{"en-GB": "Cucumber Salad", "zh-CN": "凉拌黄瓜"}', '{}', NULL, 'kitchen', true, '2026-06-07 16:25:27.477154+00', '2026-06-07 16:25:27.477154+00');
INSERT INTO menu_items (id, category_id, name_i18n, description_i18n, image_url, kitchen_group, active, created_at, updated_at) VALUES ('40000000-0000-0000-0000-000000000029', '30000000-0000-0000-0000-000000000005', '{"en-GB": "Pork Trotter", "zh-CN": "香橘猪蹄"}', '{}', NULL, 'kitchen', true, '2026-06-07 16:25:27.477154+00', '2026-06-07 16:25:27.477154+00');
--
-- Data for Name: menu_item_variants; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('fe93376c-e94c-478b-9576-f0a4dd630615', '40000000-0000-0000-0000-000000000001', '{"en-GB": "Standard", "zh-CN": "标准"}', 10.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('dd741682-2059-4392-b646-228b9160dd66', '40000000-0000-0000-0000-000000000002', '{"en-GB": "Standard", "zh-CN": "标准"}', 12.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('532f36cb-5b91-453b-bea9-e0c8098695f3', '40000000-0000-0000-0000-000000000003', '{"en-GB": "Standard", "zh-CN": "标准"}', 11.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('60f7cbf6-9e44-4ac5-9e99-22f2253a1a71', '40000000-0000-0000-0000-000000000004', '{"en-GB": "Standard", "zh-CN": "标准"}', 13.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('e735f473-76f3-4ebd-b34a-0d1bc9aa4755', '40000000-0000-0000-0000-000000000005', '{"en-GB": "Standard", "zh-CN": "标准"}', 13.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('239e585b-e717-4ed0-b170-c76b76ba7eb2', '40000000-0000-0000-0000-000000000006', '{"en-GB": "Standard", "zh-CN": "标准"}', 14.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('ec895a1d-1675-47b8-806b-fdc17d776662', '40000000-0000-0000-0000-000000000007', '{"en-GB": "Standard", "zh-CN": "标准"}', 15.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('660cb21c-d2b4-44a8-9974-a20fdf2070f3', '40000000-0000-0000-0000-000000000008', '{"en-GB": "Standard", "zh-CN": "标准"}', 15.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('d66b24b9-6e9b-4e51-9532-6bb0f8c60693', '40000000-0000-0000-0000-000000000009', '{"en-GB": "Standard", "zh-CN": "标准"}', 14.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('a6106d16-aede-4df1-9ac8-8c2f47e9eb92', '40000000-0000-0000-0000-000000000010', '{"en-GB": "Standard", "zh-CN": "标准"}', 10.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('5da07f8f-749e-45a1-b6eb-01134f63bde6', '40000000-0000-0000-0000-000000000011', '{"en-GB": "Standard", "zh-CN": "标准"}', 17.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('e1074cee-5605-40e7-ade4-15a3fe3ddeee', '40000000-0000-0000-0000-000000000012', '{"en-GB": "Standard", "zh-CN": "标准"}', 10.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('8c3bfeef-d257-4788-9d9b-6beb4c7bddf8', '40000000-0000-0000-0000-000000000013', '{"en-GB": "Standard", "zh-CN": "标准"}', 12.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('39a55e8c-6108-468e-86ed-3cce6e12e777', '40000000-0000-0000-0000-000000000014', '{"en-GB": "Standard", "zh-CN": "标准"}', 13.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('877993db-ebbf-48ad-9ed2-f0e28b96bc77', '40000000-0000-0000-0000-000000000015', '{"en-GB": "Standard", "zh-CN": "标准"}', 11.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('ddd2f47d-243f-4e9f-bc90-c287e5658bee', '40000000-0000-0000-0000-000000000016', '{"en-GB": "Standard", "zh-CN": "标准"}', 13.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('88467f20-750a-4617-bdb1-2167c23d5e54', '40000000-0000-0000-0000-000000000017', '{"en-GB": "Standard", "zh-CN": "标准"}', 12.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('2507937e-b931-4769-8692-247d7ead3ed8', '40000000-0000-0000-0000-000000000018', '{"en-GB": "Standard", "zh-CN": "标准"}', 3.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('ce6a2602-f3ff-42d6-8406-bb5452433233', '40000000-0000-0000-0000-000000000019', '{"en-GB": "Standard", "zh-CN": "标准"}', 3.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('9dfbba8c-863b-4a63-b930-58756807d96d', '40000000-0000-0000-0000-000000000020', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('6d9d4d6f-9b0a-44c0-99f6-b4f87b2356e3', '40000000-0000-0000-0000-000000000021', '{"en-GB": "Standard", "zh-CN": "标准"}', 3.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('93f64f08-7159-4ad4-84cb-5be780efa2c6', '40000000-0000-0000-0000-000000000022', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('36e7e60b-6c59-4dac-8cbf-bf0383acb876', '40000000-0000-0000-0000-000000000023', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('48c48234-5c04-448d-a3cc-c3b1208d0335', '40000000-0000-0000-0000-000000000024', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('65b21004-6b29-4e29-95ce-2a8f096142d4', '40000000-0000-0000-0000-000000000025', '{"en-GB": "Standard", "zh-CN": "标准"}', 2.00, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('0137eb03-ca40-406d-8579-abebed8c10c0', '40000000-0000-0000-0000-000000000026', '{"en-GB": "Standard", "zh-CN": "标准"}', 2.00, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('ee71cc24-0930-461b-89a1-798f95659eab', '40000000-0000-0000-0000-000000000027', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('7abf1ce7-7386-4886-b727-c46df42c7f5f', '40000000-0000-0000-0000-000000000028', '{"en-GB": "Standard", "zh-CN": "标准"}', 4.80, 1, true);
INSERT INTO menu_item_variants (id, item_id, name_i18n, price, sort_order, active) VALUES ('cf1fb813-a247-44f0-9cb1-244d7e62b248', '40000000-0000-0000-0000-000000000029', '{"en-GB": "Standard", "zh-CN": "标准"}', 8.00, 1, true);
--
-- Data for Name: modifier_groups; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000007', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000008', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000016', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000001', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000003', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000006', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000009', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000010', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000011', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000012', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000014', '40000000-0000-0000-0000-000000000013', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000015', '40000000-0000-0000-0000-000000000014', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000016', '40000000-0000-0000-0000-000000000015', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
INSERT INTO modifier_groups (id, item_id, name_i18n, min_select, max_select, sort_order, active) VALUES ('50000000-0000-0000-0000-000000000017', '40000000-0000-0000-0000-000000000017', '{"en-GB": "Extra Toppings", "zh-CN": "加小料"}', 0, 5, 1, true);
--
-- Data for Name: modifiers; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('a3e7dcf0-9927-4c86-8136-ec4ab5cc2ea4', '50000000-0000-0000-0000-000000000001', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('ee5a45ea-8ce6-4f1d-a3e7-8f75ac0e0a7c', '50000000-0000-0000-0000-000000000001', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('02c8a692-b3a8-4313-b773-6d304101f937', '50000000-0000-0000-0000-000000000001', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('abae5852-18f8-480a-b3a5-ace717a566e6', '50000000-0000-0000-0000-000000000001', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('25997e2a-980f-49de-b913-e94670733877', '50000000-0000-0000-0000-000000000001', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('63321b5b-fc99-4755-9e66-676cae6b1ef6', '50000000-0000-0000-0000-000000000002', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f923137b-aa11-4b6a-a896-d652bd156d50', '50000000-0000-0000-0000-000000000002', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('b91fccc9-cfc5-4b2a-84bf-33a8154a287f', '50000000-0000-0000-0000-000000000002', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('17878f55-04b8-4658-92c0-28b2fd059683', '50000000-0000-0000-0000-000000000002', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('952c11b1-7575-4627-8a1c-d01058ef4be2', '50000000-0000-0000-0000-000000000002', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('21b317f6-2456-442b-9fec-f14375b946a2', '50000000-0000-0000-0000-000000000003', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('175738a2-74b8-4e4a-ad37-3cbd9e84ca80', '50000000-0000-0000-0000-000000000003', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('fa4bf85d-d730-4510-9a3b-97a2ee8a66c7', '50000000-0000-0000-0000-000000000003', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('1f1531eb-b400-47f0-9aba-22b0d6db2486', '50000000-0000-0000-0000-000000000003', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('23938ad2-2f30-48c0-9eaf-a74e1c7e6a8b', '50000000-0000-0000-0000-000000000003', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('13eb8a0c-c28c-4601-929b-9c7a7653878d', '50000000-0000-0000-0000-000000000004', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('2d33b3dd-8b22-4b37-8bc6-b838c306f1cc', '50000000-0000-0000-0000-000000000004', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('63e83771-4fb5-4978-ab7b-0a2dfeaa31ec', '50000000-0000-0000-0000-000000000004', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('2f347518-2fa3-4d54-8375-d51e458b701a', '50000000-0000-0000-0000-000000000004', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('a6413eae-ba59-4d4b-af63-f0904bc065ad', '50000000-0000-0000-0000-000000000004', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('491a77b8-ffe9-49d4-b376-65c721099fe3', '50000000-0000-0000-0000-000000000005', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('788bb1ea-a0d8-481d-9e3a-bb3b41c76d20', '50000000-0000-0000-0000-000000000005', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('435d42e0-ffcb-4cd9-b728-8a287d230a72', '50000000-0000-0000-0000-000000000005', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('a86cd139-3e44-4395-9804-dd2ea3b99dc0', '50000000-0000-0000-0000-000000000005', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('614cf3de-ad93-48af-902c-242ed85d8d5e', '50000000-0000-0000-0000-000000000005', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('2f394da9-749d-4467-b49e-831d80cc904a', '50000000-0000-0000-0000-000000000006', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('9016bb4b-dab9-47d2-96db-78540a78e4a5', '50000000-0000-0000-0000-000000000006', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f518106f-fc0d-4818-8dae-d0c215b14fb0', '50000000-0000-0000-0000-000000000006', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('eda89b38-d668-46c1-8f5b-839f083f6b71', '50000000-0000-0000-0000-000000000006', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('2d96d1e5-05fa-48bb-a8b1-fd24987a61a0', '50000000-0000-0000-0000-000000000006', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('09456b1d-b0dc-4f7d-8c32-014eb307976c', '50000000-0000-0000-0000-000000000007', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('c1945780-81a5-440a-9e69-860262d0b515', '50000000-0000-0000-0000-000000000007', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('4ca971bc-7226-4a20-9d35-4986af10208d', '50000000-0000-0000-0000-000000000007', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('fd1570e6-4002-4fda-8a01-eba720411fb4', '50000000-0000-0000-0000-000000000007', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('07e998b8-c1de-4d2f-8ee8-2466a42ed8bc', '50000000-0000-0000-0000-000000000007', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('12edbb5a-b86c-4082-bddd-031060aebf01', '50000000-0000-0000-0000-000000000008', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('9316800b-5679-4714-aa9d-1044d5bc5d26', '50000000-0000-0000-0000-000000000008', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('fce16bcf-00a0-4006-9fc0-ba6d244b8c65', '50000000-0000-0000-0000-000000000008', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f3f96ba0-0c56-47f3-910a-da3083127a93', '50000000-0000-0000-0000-000000000008', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('dffa12d1-40a3-4534-90a4-703a71575207', '50000000-0000-0000-0000-000000000008', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('9311d4bb-1630-4834-b0a3-534dc13b1e25', '50000000-0000-0000-0000-000000000009', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('e28fd994-7c1d-4522-a19e-fa8c7d61b48c', '50000000-0000-0000-0000-000000000009', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('c743445b-f2cb-489e-93dd-c093a180004a', '50000000-0000-0000-0000-000000000009', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('07b7509c-69f1-4454-8ae5-8d6fcbb506c3', '50000000-0000-0000-0000-000000000009', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('85fd127b-bc37-4290-9032-a49dbdd3db1e', '50000000-0000-0000-0000-000000000009', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('be56ca0e-20ae-466e-bb85-280d621849ac', '50000000-0000-0000-0000-000000000010', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('42b1d00d-fbea-4bf9-b5ba-260d31796213', '50000000-0000-0000-0000-000000000010', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f9383cae-11d7-48f9-a283-b5df1708d8ba', '50000000-0000-0000-0000-000000000010', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('287b86e7-5dd4-4de4-8362-10af978dc0e8', '50000000-0000-0000-0000-000000000010', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('777f07d1-b690-41c9-93c3-2ed12ab97b3f', '50000000-0000-0000-0000-000000000010', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('83fce825-d606-4f3b-96b2-4be00ea0de56', '50000000-0000-0000-0000-000000000011', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('74b973d5-fd67-435b-a9c4-089ef077e248', '50000000-0000-0000-0000-000000000011', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('d98ce1a8-1094-49d4-94d9-97c201b8a0b6', '50000000-0000-0000-0000-000000000011', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('deda3cf7-2300-408e-97c8-f4dccaea35aa', '50000000-0000-0000-0000-000000000011', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('da65650a-afd1-4870-9e7b-1c9ffa2e9c23', '50000000-0000-0000-0000-000000000011', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('7e97b95e-3068-4dd9-947c-a35fde90c8dd', '50000000-0000-0000-0000-000000000012', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('32a7f6d6-ad9d-49c7-b0b0-841ca5437d3c', '50000000-0000-0000-0000-000000000012', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('bfe00525-4aa9-4b18-957d-d46b18019240', '50000000-0000-0000-0000-000000000012', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('8337779e-c9db-4508-b393-1381bf85e343', '50000000-0000-0000-0000-000000000012', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('9cba4897-3cb4-46f2-9d39-406702bae4bc', '50000000-0000-0000-0000-000000000012', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('c1f14456-d2e4-4a2f-84d4-379f8e22dd7c', '50000000-0000-0000-0000-000000000013', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f2abb324-7663-42c0-aff8-5807d77f50ef', '50000000-0000-0000-0000-000000000013', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('936c5cb1-d511-43de-81eb-05c66188f540', '50000000-0000-0000-0000-000000000013', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('9bf9f896-4066-43cb-b5df-cd0287d973cb', '50000000-0000-0000-0000-000000000013', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('31be2297-1567-4cfa-95c4-cd08da59f31a', '50000000-0000-0000-0000-000000000013', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('a7fe9d00-16bc-46fc-bb35-c0a3be5af0bc', '50000000-0000-0000-0000-000000000014', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('33f4ca78-2c34-4798-a1c5-5f3aa0653298', '50000000-0000-0000-0000-000000000014', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('6db28e3e-e7fe-41e5-b1d4-5ca92de1f5d5', '50000000-0000-0000-0000-000000000014', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('e51dca0b-53bf-41db-8546-37d6b4107f25', '50000000-0000-0000-0000-000000000014', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('bba24759-57a3-4046-84cb-5759a931a009', '50000000-0000-0000-0000-000000000014', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('35e1c0f3-2957-4338-a9d5-b9bccf58461e', '50000000-0000-0000-0000-000000000015', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('56d1cf35-4d0a-4946-8d8b-7ef82b8920e5', '50000000-0000-0000-0000-000000000015', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('56616f52-a4a5-4c72-a905-4ebf54fe3e6b', '50000000-0000-0000-0000-000000000015', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('161e0bda-8830-4cb4-a6db-4d6a323b5b28', '50000000-0000-0000-0000-000000000015', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('7628f6d5-abf7-4b22-92dd-f28d7e445468', '50000000-0000-0000-0000-000000000015', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('714a7c1a-f9c0-493d-80cc-d4622191b714', '50000000-0000-0000-0000-000000000016', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('0bc1bb66-5d6c-457f-b127-0ced731a860e', '50000000-0000-0000-0000-000000000016', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('3106c81b-559b-465d-89e2-3a08b03dc7a3', '50000000-0000-0000-0000-000000000016', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('48bd09bc-226f-4f84-afb8-434efb5d4a1a', '50000000-0000-0000-0000-000000000016', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('85b07b31-9c8c-4b5e-b9d6-05ec6409174f', '50000000-0000-0000-0000-000000000016', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('f0fc4d18-c668-4a36-9931-33fc87087754', '50000000-0000-0000-0000-000000000017', '{"en-GB": "Fried Egg", "zh-CN": "煎鸡蛋"}', 1.50, 1, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('12895fb0-e5ff-46ca-8109-e38d97ab0202', '50000000-0000-0000-0000-000000000017', '{"en-GB": "Peas", "zh-CN": "豌豆"}', 1.00, 2, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('189410a5-43b3-46b6-9b37-eeb0dcdb82cd', '50000000-0000-0000-0000-000000000017', '{"en-GB": "Minced Pork", "zh-CN": "杂酱"}', 2.00, 3, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('3e00d480-8148-4257-ab61-84d4c8556b88', '50000000-0000-0000-0000-000000000017', '{"en-GB": "Vegetables", "zh-CN": "蔬菜"}', 1.00, 4, true);
INSERT INTO modifiers (id, group_id, name_i18n, price_delta, sort_order, active) VALUES ('259c4195-4e60-4e44-91f4-471e8cf1e679', '50000000-0000-0000-0000-000000000017', '{"en-GB": "Beef", "zh-CN": "牛肉"}', 4.00, 5, true);
--
-- Data for Name: restaurants; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO restaurants (id, name, created_at) VALUES ('00000000-0000-0000-0000-000000000001', 'Granny Noodles', '2026-04-27 01:56:30.027622+00');
--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO roles (id, name, permissions) VALUES ('db34163f-e19c-4793-8465-4196ae955a4b', 'cashier', '["manage_prints", "view_staff_schedules", "manage_menu_availability", "manage_orders", "adjust_service_charge", "view_kitchen", "update_item_status", "create_order", "split_order", "take_payment", "print_receipt"]');
INSERT INTO roles (id, name, permissions) VALUES ('6daba10f-057c-432d-a804-0e0ff49bea17', 'kitchen', '["view_kitchen", "update_item_status"]');
INSERT INTO roles (id, name, permissions) VALUES ('bb065e2e-a231-43c5-9122-34418460fa36', 'owner', '["manage_settings", "manage_prints", "manage_ops", "view_staff_schedules", "manage_staff_schedules", "manage_menu", "manage_menu_availability", "manage_tables", "manage_orders", "manage_users", "adjust_service_charge", "adjust_discount", "view_dashboard", "view_reports", "export_reports", "view_audit_logs", "view_kitchen", "update_item_status", "create_order", "split_order", "take_payment", "print_receipt"]');
--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO settings (id, restaurant_id, locale, fallback_locale, currency, tax_rate, prices_include_tax, show_tax_on_receipt, service_charge_rate, receipt_header, receipt_footer, printer_host, printer_port, updated_at, printer_profiles, kitchen_printer_id, receipt_printer_id, kitchen_item_font_size, kitchen_item_bold, backup_enabled, backup_interval_hours, auto_clear_tables_after_payment, last_backup_at, receipt_address, receipt_header_zh, receipt_phone) VALUES ('aa62c2e5-3685-41e5-bef2-0b635c5ee3c5', '00000000-0000-0000-0000-000000000001', 'zh-CN', 'en-GB', 'GBP', 0.2000, true, true, 0.1200, 'Granny Noodles', 'Thank you / 感谢光临', '192.168.1.251', 9100, '2026-06-08 04:10:26.068483+00', '[{"id": "printer-51562", "host": "192.168.68.100", "name": "新打印机", "port": 9100, "charset": "GBK", "enabled": true, "connection_type": "network"}, {"id": "printer-01540", "name": "USB1", "charset": "GBK", "enabled": true, "device_path": "/dev/usb/lp0", "connection_type": "usb"}, {"id": "printer-39598", "mac": "04:7F:0E:4A:92:F6", "name": "蓝牙打印机", "channel": 1, "charset": "GBK", "enabled": true, "device_path": "/dev/rfcomm0", "connection_type": "bluetooth"}]', 'printer-51562', 'printer-51562', 5, true, false, 24, false, '2026-04-28 00:54:50.625059+00', '37, Centurion House, Jewry St, London EC3N 2ER', '秦云老太婆摊摊面', '');
--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '1', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '3', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '4', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '5', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '6', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '7', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '8', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '9', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '10', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '11', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '12', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '13', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', '14', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', '15', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', '16', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000001', '17', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', '18', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000001', '19', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', '20', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', '21', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001', '22', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000001', '23', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000001', '24', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000001', '25', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000001', '26', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000001', '27', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000001', '28', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000001', '29', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
INSERT INTO tables (id, area_id, label, seats, status, current_order_id, opened_at, updated_at) VALUES ('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000001', '30', 4, 'available', NULL, NULL, '2026-06-08 08:54:30.080334+00');
--
-- Data for Name: table_layouts; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000001', 24.00, 24.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000002', 120.00, 24.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000003', 216.00, 24.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000004', 312.00, 24.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000005', 408.00, 24.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000006', 24.00, 120.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000007', 120.00, 120.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000008', 216.00, 120.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000009', 312.00, 120.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000010', 408.00, 120.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000011', 24.00, 216.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000012', 120.00, 216.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000013', 216.00, 216.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000014', 312.00, 216.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000015', 408.00, 216.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000016', 24.00, 312.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000017', 120.00, 312.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000018', 216.00, 312.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000019', 312.00, 312.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000020', 408.00, 312.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000021', 24.00, 408.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000022', 120.00, 408.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000023', 216.00, 408.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000024', 312.00, 408.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000025', 408.00, 408.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000026', 24.00, 504.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000027', 120.00, 504.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000028', 216.00, 504.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000029', 312.00, 504.00, 72.00, 72.00, 'round', 0.00);
INSERT INTO table_layouts (table_id, x, y, width, height, shape, rotation) VALUES ('20000000-0000-0000-0000-000000000030', 408.00, 504.00, 72.00, 72.00, 'round', 0.00);
--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--
INSERT INTO users (id, role_id, name, pin, active) VALUES ('37a786e3-a9a5-4ee9-8718-babc9ba31c82', 'bb065e2e-a231-43c5-9122-34418460fa36', 'Owner', '0000', true);
INSERT INTO users (id, role_id, name, pin, active) VALUES ('c7da7ea1-f093-485b-a418-ce34bc26a5b2', 'db34163f-e19c-4793-8465-4196ae955a4b', 'Cashier', '1111', true);
INSERT INTO users (id, role_id, name, pin, active) VALUES ('27540f02-121b-43a2-9020-85d16f07b314', '6daba10f-057c-432d-a804-0e0ff49bea17', 'Kitchen', '2222', true);

INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('09:00-14:00', '09:00', '14:00', 1);
INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('11:30-14:00', '11:30', '14:00', 2);
INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('12:00-16:00', '12:00', '16:00', 3);
INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('14:00-20:00', '14:00', '20:00', 4);
INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('14:00-22:30', '14:00', '22:30', 5);
INSERT INTO staff_schedule_time_presets (label, start_time, end_time, sort_order) VALUES ('20:30-22:30', '20:30', '22:30', 6);
--
--
