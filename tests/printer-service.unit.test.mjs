import test from "node:test";
import assert from "node:assert/strict";
import { buildKitchenDoc, buildOnlineOrderKitchenDoc } from "../apps/printer-service/src/worker.js";

const baseJob = {
  order: {
    service_type: "dine_in",
    order_no: "TEST-001",
    created_at: "2026-06-29T12:00:00.000Z",
  },
  table: { label: "A1" },
  settings: { locale: "zh-CN", kitchen_item_font_size: 5 },
};

test("kitchen document renders item preset notes using the configured item weight", () => {
  const items = [{
    quantity: 1,
    name_i18n: { "zh-CN": "牛肉面", "en-GB": "Beef noodles" },
    modifiers: [],
    notes: "去葱",
  }];

  const boldDoc = buildKitchenDoc({ ...baseJob, items });
  const boldNote = boldDoc.find((line) => line.type === "text" && line.text.includes("去葱"));
  assert.ok(boldNote);
  assert.equal(boldNote.bold, true);

  const regularDoc = buildKitchenDoc({
    ...baseJob,
    items,
    settings: { ...baseJob.settings, kitchen_item_bold: false },
  });
  const regularNote = regularDoc.find((line) => line.type === "text" && line.text.includes("去葱"));
  assert.ok(regularNote);
  assert.equal(regularNote.bold, false);
});

test("online-order kitchen document renders JSON order items and options", () => {
  const doc = buildOnlineOrderKitchenDoc({
    online_order: {
      external_reference: "GN-ONLINE-42",
      external_order_id: "website-order-42",
      received_at: "2026-08-22T12:00:00.000Z",
      customer: { name: "顾客", phone: "0700000000", note: "少辣" },
      items: [{ name_zh: "牛肉面", name_en: "Beef noodles", option_label_zh: "大份", quantity: 2 }]
    },
    settings: { locale: "zh-CN", kitchen_item_font_size: 5 }
  });
  assert.ok(doc.some((line) => line.type === "text" && line.text.includes("GN-ONLINE-42")));
  assert.ok(doc.some((line) => line.type === "kitchen_item" && line.name === "牛肉面" && line.qty === "2X"));
  assert.ok(doc.some((line) => line.type === "text" && line.text.includes("大份")));
  assert.ok(doc.some((line) => line.type === "text" && line.text.includes("少辣")));
});
