import test from "node:test";
import assert from "node:assert/strict";
import { buildKitchenDoc } from "../apps/printer-service/src/worker.js";

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
