import net from "node:net";
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import Redis from "ioredis";
import pg from "pg";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { formatMoney } from "@qypos/shared";

// ── Font registration ─────────────────────────────────────────────────────────
function findCJKFonts() {
  const dirs = ["/usr/share/fonts/noto", "/usr/share/fonts", "/usr/local/share/fonts"];
  const exts = [".otf", ".ttf", ".ttc"];
  const hints = ["CJK", "SC", "CN", "noto", "Noto"];
  const found = [];
  for (const dir of dirs) {
    try {
      for (const file of readdirSync(dir)) {
        if (exts.some(e => file.endsWith(e)) && hints.some(h => file.includes(h))) {
          found.push({ path: `${dir}/${file}`, name: file });
        }
      }
    } catch { /* dir not found */ }
  }
  return found;
}

const cjkFonts = findCJKFonts();
if (cjkFonts.length) {
  for (const { path, name } of cjkFonts) {
    const lower = name.toLowerCase();
    // Determine weight from filename: 400 = Regular, 700 = Bold
    const weight = lower.includes("bold") ? 700 : lower.includes("regular") ? 400 : 400;
    try {
      GlobalFonts.registerFromPath(path, "PrintFont", weight);
      console.log(`Font registered: ${name} (weight=${weight}) → PrintFont`);
    } catch (e) {
      console.warn(`Font register failed: ${name}: ${e.message}`);
    }
  }
} else {
  console.warn("No CJK font found – Chinese text may not render correctly");
}

// ── DB / Redis ────────────────────────────────────────────────────────────────
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

// ── Layout constants (TM-T20II: 80mm, 203dpi → 576 dots printable width) ─────
const PAPER_W = 576;
const PAD     = 8;
const FS_N    = 24;
const FS_L    = 36;
const LH_N    = 34;
const LH_L    = 50;
const FONT    = "PrintFont";

// ── Document model helpers ────────────────────────────────────────────────────
const T = (text, opts = {}) => ({ type: "text", text: String(text ?? ""), align: opts.align || "left", bold: !!opts.bold, large: !!opts.large, fontSize: opts.fontSize });
const C = (text, opts = {}) => T(text, { ...opts, align: "center" });
const R = () => ({ type: "rule" });
const F = () => ({ type: "feed" });
const KITEM = (qty, name, opts = {}) => ({
  type: "kitchen_item",
  qty: String(qty ?? ""),
  name: String(name ?? ""),
  fontSize: opts.fontSize,
  nameBold: !!opts.nameBold,
});

// Pixel-anchored column row: each column is drawn at an exact X using ctx.textAlign.
// Avoids the visual misalignment caused by mixing CJK (full-width) and ASCII glyphs
// with space-padding.
const COL_X = {
  name: PAD,                     // left edge
  qty:  Math.round(PAPER_W * 0.66),
  unit: Math.round(PAPER_W * 0.83),
  amt:  PAPER_W - PAD,           // right edge
};
const ROW = (name, qty, unit, amt, opts = {}) => ({
  type: "row",
  bold: !!opts.bold,
  large: !!opts.large,
  cols: [
    { text: String(name ?? ""), x: COL_X.name, align: "left"  },
    { text: String(qty  ?? ""), x: COL_X.qty,  align: "right" },
    { text: String(unit ?? ""), x: COL_X.unit, align: "right" },
    { text: String(amt  ?? ""), x: COL_X.amt,  align: "right" },
  ],
});
const KV = (label, value, opts = {}) => ({
  type: "row",
  bold: !!opts.bold,
  large: !!opts.large,
  cols: [
    { text: String(label ?? ""), x: COL_X.name, align: "left"  },
    { text: String(value ?? ""), x: COL_X.amt,  align: "right" },
  ],
});

// ── Text helpers ──────────────────────────────────────────────────────────────
function textOf(value, locale = "zh-CN") {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value["zh-CN"] ?? value["en-GB"] ?? Object.values(value)[0] ?? "";
}
function bilingualName(value) {
  if (!value) return { zh: "", en: "" };
  if (typeof value === "string") return { zh: value, en: "" };
  const zh = value["zh-CN"] ?? value["zh"] ?? "";
  const en = value["en-GB"] ?? value["en"] ?? "";
  return { zh: zh || en, en: en && en !== zh ? en : "" };
}
function itemNameBilingual(item) {
  const base = bilingualName(item.name_i18n);
  const variant = bilingualName(item.variant_name_i18n);
  const zh = variant.zh ? `${base.zh} (${variant.zh})` : base.zh;
  const en = variant.en ? `${base.en} (${variant.en})` : base.en;
  return { zh, en };
}
function itemName(item, locale) {
  const base = textOf(item.name_i18n, locale);
  const variant = textOf(item.variant_name_i18n, locale);
  return variant ? `${base} (${variant})` : base;
}

function kitchenFontPx(settings) {
  const size = Math.min(8, Math.max(1, Number(settings?.kitchen_item_font_size ?? 5)));
  return 18 + size * 4;
}

function lineHeightFor(fontSize) {
  return Math.ceil(fontSize * 1.35);
}

// ── Document builders ─────────────────────────────────────────────────────────
function buildKitchenDoc({ order, items, table, settings }) {
  const locale = settings.locale ?? "zh-CN";
  const itemFontSize = kitchenFontPx(settings);
  const itemBold = settings.kitchen_item_bold !== false;
  const titleZh = order.service_type === "dine_in" ? `桌号: ${table?.label ?? ""}` : `外带: ${order.pickup_no ?? ""}`;
  const titleEn = order.service_type === "dine_in" ? `Table: ${table?.label ?? ""}` : `Takeaway: ${order.pickup_no ?? ""}`;
  const doc = [
    C("后 厨 单 / KITCHEN", { bold: true, large: true }),
    R(),
    T(`${titleZh}  |  ${titleEn}`, { bold: true }),
    T(`单号 Order: ${order.order_no}`),
    T(`时间 Time : ${new Date(order.created_at).toLocaleString(locale)}`),
    R(),
  ];
  for (const item of items) {
    const name = itemNameBilingual(item);
    doc.push(KITEM(`${item.quantity}X`, name.zh, { fontSize: itemFontSize, nameBold: itemBold }));
    if (name.en) doc.push(T(`    ${name.en}`, { fontSize: itemFontSize, bold: itemBold }));
    for (const mod of item.modifiers ?? []) {
      const m = bilingualName(mod.name_i18n);
      doc.push(T(`  + ${m.zh}${m.en ? ` / ${m.en}` : ""}`, { fontSize: itemFontSize, bold: itemBold }));
    }
    if (item.notes) doc.push(T(`  ※ ${item.notes}`, { fontSize: itemFontSize, bold: itemBold }));
  }
  if (order.notes) { doc.push(R()); doc.push(T(`备注 Notes: ${order.notes}`)); }
  doc.push(R()); doc.push(F());
  return doc;
}

// 80mm 576px raster; columns are anchored by pixel via ROW(), not space-padding.
function moneyShort(value, currency) {
  // Compact: "£9.50" instead of "£9.50 GBP". Locale "en-GB" keeps it predictable for the receipt column.
  return formatMoney(value, currency, "en-GB");
}

function buildReceiptDoc({ order, items, payments, settings, table }) {
  const locale   = settings.locale   ?? "zh-CN";
  const currency = settings.currency ?? "GBP";
  const taxRate  = Number(settings.tax_rate ?? 0);
  const svcRate  = Number(order.service_charge_rate ?? settings.service_charge_rate ?? 0);
  const pricesIncludeTax = !!settings.prices_include_tax;
  const headerEn = settings.receipt_header || "Granny Noodles";
  const headerZh = settings.receipt_header_zh || "";
  const phone   = settings.receipt_phone || "";
  const address = settings.receipt_address || "";

  const doc = [
    C(headerEn, { bold: true, large: true }),
  ];
  if (headerZh) doc.push(C(headerZh, { bold: true }));
  if (phone)    doc.push(C(`Tel 电话: ${phone}`));
  if (address)  doc.push(C(address));
  doc.push(R());
  doc.push(T(`单号 Order : ${order.order_no}`));
  if (order.service_type === "dine_in") doc.push(T(`桌号 Table : ${table?.label ?? ""}`));
  else doc.push(T(`取餐号 Pickup: ${order.pickup_no ?? ""}`));
  doc.push(T(`时间 Time  : ${new Date(order.created_at).toLocaleString(locale)}`));
  doc.push(R());
  // Header row
  doc.push(ROW("Item 菜品", "Qty", "Unit", "Amt", { bold: true }));
  for (const item of items) {
    const name = itemNameBilingual(item);
    const mods = (item.modifiers ?? []).reduce((s, m) => s + Number(m.price_delta), 0);
    const unit = Number(item.unit_price) + mods;
    const amount = unit * Number(item.quantity);
    doc.push(ROW(name.zh, item.quantity, moneyShort(unit, currency), moneyShort(amount, currency)));
    if (name.en) doc.push(T(`  ${name.en}`));
    for (const mod of item.modifiers ?? []) {
      const m = bilingualName(mod.name_i18n);
      const sfx = Number(mod.price_delta) ? ` ${moneyShort(mod.price_delta, currency)}` : "";
      doc.push(T(`  + ${m.zh}${m.en ? ` / ${m.en}` : ""}${sfx}`));
    }
  }
  doc.push(R());
  const subtotal = Number(order.subtotal ?? 0);
  doc.push(KV("小计 Subtotal", moneyShort(subtotal, currency)));
  if (settings.show_tax_on_receipt) {
    const taxPct = (taxRate * 100).toFixed(taxRate * 100 % 1 ? 1 : 0);
    const taxLabel = pricesIncludeTax
      ? `VAT (含 incl. ${taxPct}%)`
      : `VAT (${taxPct}%)`;
    doc.push(KV(taxLabel, moneyShort(order.tax ?? 0, currency)));
  }
  if (Number(order.service_charge) > 0 || svcRate > 0) {
    const svcPct = (svcRate * 100).toFixed(svcRate * 100 % 1 ? 1 : 0);
    doc.push(KV(`服务费 Service (${svcPct}%)`, moneyShort(order.service_charge ?? 0, currency)));
  }
  if (Number(order.discount) > 0) {
    doc.push(KV("折扣 Discount", `-${moneyShort(order.discount, currency)}`));
  }
  doc.push(KV("合计 TOTAL", moneyShort(order.total, currency), { bold: true, large: true }));

  if (payments?.length) {
    doc.push(R()); doc.push(T("付款明细 / Payments"));
    for (const p of payments) {
      doc.push(T(`${p.method}: ${moneyShort(p.amount, currency)}`));
      if (Number(p.change_due)) doc.push(T(`找零 Change: ${moneyShort(p.change_due, currency)}`));
    }
  }
  if (order.notes) { doc.push(R()); doc.push(T(`备注 Notes: ${order.notes}`)); }
  doc.push(R());
  doc.push(C(settings.receipt_footer || "Thank you / 感谢光临"));
  doc.push(F());
  return doc;
}

function buildTestDoc({ settings, printer, created_at }) {
  const locale = settings.locale ?? "zh-CN";
  const addr   = printer?.connection_type === "usb"
    ? `设备: ${printer.device_path ?? "/dev/usb/lp0"}`
    : printer?.connection_type === "bluetooth"
      ? `蓝牙: ${printer.device_path ?? "/dev/rfcomm0"}${printer.mac ? ` (${printer.mac})` : ""}`
      : `地址: ${printer?.host ?? settings.printer_host}:${printer?.port ?? settings.printer_port}`;
  return [
    C("QYPOS 打印测试", { bold: true }),
    R(),
    C(settings.receipt_header || "QY Restaurant"),
    T(`时间: ${new Date(created_at ?? Date.now()).toLocaleString(locale)}`),
    T(`打印机: ${printer?.name ?? "默认"}`),
    T(addr),
    R(),
    C("打印正常 / Print OK"),
    T(settings.receipt_footer || "谢谢"),
    F(),
  ];
}

// ── Raster renderer: document model → ESC/POS GS v 0 Buffer ──────────────────
function docToBuffer(doc) {
  let totalH = PAD * 2;
  for (const item of doc) {
    if (item.type === "feed") { totalH += LH_N * 3; continue; }
    if (item.type === "rule") { totalH += LH_N;     continue; }
    const fs = item.fontSize || (item.large ? FS_L : FS_N);
    totalH += item.fontSize ? lineHeightFor(fs) : (item.large ? LH_L : LH_N);
  }

  const canvas = createCanvas(PAPER_W, totalH);
  const ctx    = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAPER_W, totalH);
  ctx.fillStyle = "#000000";

  let y = PAD;
  for (const item of doc) {
    if (item.type === "feed") { y += LH_N * 3; continue; }
    if (item.type === "rule") {
      ctx.fillRect(PAD, y + Math.floor(LH_N / 2), PAPER_W - PAD * 2, 1);
      y += LH_N;
      continue;
    }
    const fs = item.fontSize || (item.large ? FS_L : FS_N);
    const lh = item.fontSize ? lineHeightFor(fs) : (item.large ? LH_L : LH_N);
    ctx.textBaseline = "middle";
    if (item.type === "kitchen_item") {
      ctx.textAlign = "left";
      ctx.font = `${item.nameBold ? "bold " : ""}${fs}px '${FONT}'`;
      ctx.fillText(item.qty, PAD, y + lh / 2);
      const qtyWidth = ctx.measureText(item.qty).width;
      ctx.font = `${item.nameBold ? "bold " : ""}${fs}px '${FONT}'`;
      ctx.fillText(item.name, PAD + qtyWidth + 14, y + lh / 2);
    } else if (item.type === "row") {
      ctx.font = `${item.bold ? "bold " : ""}${fs}px '${FONT}'`;
      for (const col of item.cols) {
        ctx.textAlign = col.align || "left";
        ctx.fillText(col.text, col.x, y + lh / 2);
      }
    } else if (item.align === "center") {
      ctx.font = `${item.bold ? "bold " : ""}${fs}px '${FONT}'`;
      ctx.textAlign = "center";
      ctx.fillText(item.text, PAPER_W / 2, y + lh / 2);
    } else {
      ctx.font = `${item.bold ? "bold " : ""}${fs}px '${FONT}'`;
      ctx.textAlign = "left";
      ctx.fillText(item.text, PAD, y + lh / 2);
    }
    y += lh;
  }

  // RGBA → 1-bit bitmap
  const imgData = ctx.getImageData(0, 0, PAPER_W, totalH);
  const wBytes  = Math.ceil(PAPER_W / 8);
  const bitmap  = Buffer.alloc(wBytes * totalH, 0);
  for (let row = 0; row < totalH; row++) {
    for (let col = 0; col < PAPER_W; col++) {
      const base = (row * PAPER_W + col) * 4;
      const gray = 0.299 * imgData.data[base] + 0.587 * imgData.data[base + 1] + 0.114 * imgData.data[base + 2];
      if (gray < 128) bitmap[row * wBytes + (col >> 3)] |= 0x80 >> (col & 7);
    }
  }

  const xL = wBytes & 0xFF, xH = (wBytes >> 8) & 0xFF;
  const yL = totalH & 0xFF, yH = (totalH >> 8) & 0xFF;
  return Buffer.concat([
    Buffer.from([0x1B, 0x40]),                              // ESC @ init
    Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]), // GS v 0 raster
    bitmap,
    Buffer.from([0x1D, 0x56, 0x00]),                        // GS V 0 full cut
  ]);
}

function render(job) {
  let doc;
  if      (job.type === "kitchen")     doc = buildKitchenDoc(job.payload);
  else if (job.type === "test")        doc = buildTestDoc(job.payload);
  else if (job.type === "cash_drawer") return buildCashDrawerBuffer();
  else                                 doc = buildReceiptDoc(job.payload);
  return docToBuffer(doc);
}

// ── Cash drawer ESC/POS command ───────────────────────────────────────────────
// ESC p m t1 t2  →  pulse drawer pin m (0/1), t1=on-time, t2=off-time (×2ms)
function buildCashDrawerBuffer() {
  // 48 × 2ms = 96ms on, 96ms off — standard for most drawers
  return Buffer.from([0x1B, 0x70, 0x00, 48, 48]);
}

// ── Transport ─────────────────────────────────────────────────────────────────
async function sendToCharDevice(buffer, settings, kind) {
  const isBT = kind === "bluetooth";
  const defaultPath = isBT ? "/dev/rfcomm0" : "/dev/usb/lp0";
  const devPath = settings.device_path || defaultPath;
  try {
    await fs.access(devPath);
  } catch {
    if (isBT) {
      throw new Error(`Bluetooth device not found: ${devPath}. ` +
        `Pair the printer first and bind it on the host: ` +
        `sudo bluetoothctl (pair + trust), then sudo rfcomm bind ${devPath} <MAC> ${settings.channel || 1}. ` +
        `Ensure docker-compose has /dev mounted.`);
    }
    throw new Error(`USB device not found: ${devPath}. ` +
      `Make sure the printer is plugged in and the printer-service container has /dev mounted ` +
      `(privileged: true + volumes: ["/dev:/dev"]). On macOS Docker Desktop USB passthrough is unsupported — run on the Linux host.`);
  }
  try {
    await fs.writeFile(devPath, buffer);
  } catch (e) {
    if (e.code === "EACCES") {
      throw new Error(`Permission denied writing to ${devPath}. Container needs privileged mode. Quick test: sudo chmod a+rw ${devPath} on the host.`);
    }
    throw e;
  }
}

async function sendToNetworkPrinter(buffer, settings) {
  const host = settings.host || settings.printer_host;
  const port = Number(settings.port || settings.printer_port || 9100);
  if (!host) throw new Error("Printer host is not configured");
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.write(buffer, () => socket.end());
    });
    socket.on("close", (hadError) => { if (!hadError) resolve(); });
    socket.on("timeout", () => socket.destroy(new Error(`Printer timeout ${host}:${port}`)));
    socket.on("error", reject);
  });
}

async function sendToPrinter(buffer, settings) {
  if (settings.connection_type === "usb") await sendToCharDevice(buffer, settings, "usb");
  else if (settings.connection_type === "bluetooth") await sendToCharDevice(buffer, settings, "bluetooth");
  else await sendToNetworkPrinter(buffer, settings);
}

async function getJob(id) {
  const result = await pool.query("SELECT * FROM print_jobs WHERE id = $1", [id]);
  return result.rows[0];
}

async function updateJob(id, status, error = null) {
  await pool.query(
    "UPDATE print_jobs SET status = $2, attempts = attempts + 1, error = $3, updated_at = now() WHERE id = $1",
    [id, status, error]
  );
}

async function processJob(id) {
  const job = await getJob(id);
  if (!job) { console.warn(`[print] job ${id} not found in DB, skipping`); return; }
  console.log(`[print] job ${id} type=${job.type} printer=${job.payload?.printer?.host ?? "unknown"}`);
  try {
    await pool.query("UPDATE print_jobs SET status = 'printing', updated_at = now() WHERE id = $1", [id]);
    const buffer = render(job);
    await sendToPrinter(buffer, job.payload.printer ?? job.payload.settings);
    await updateJob(id, "succeeded");
    await redis.publish("print_events", JSON.stringify({ event: "print.succeeded", data: { id } }));
    console.log(`[print] job ${id} succeeded`);
  } catch (error) {
    console.error(`[print] job ${id} failed: ${error.message}`);
    await updateJob(id, "failed", error.message);
    await redis.publish("print_events", JSON.stringify({ event: "print.failed", data: { id, error: error.message } }));
  }
}

console.log("printer-service ready");
while (true) {
  try {
    const result = await redis.brpop("print_jobs", 0);
    if (result?.[1]) await processJob(result[1]);
  } catch (err) {
    console.error("[print] worker error:", err.message);
    await new Promise(r => setTimeout(r, 2000));
  }
}
