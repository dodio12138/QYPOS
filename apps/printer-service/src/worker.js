import net from "node:net";
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import Redis from "ioredis";
import pg from "pg";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { formatMoney } from "@qypos/shared";

// ── Font registration ─────────────────────────────────────────────────────────
function findCJKFont() {
  const dirs = ["/usr/share/fonts/noto", "/usr/share/fonts", "/usr/local/share/fonts"];
  const exts = [".otf", ".ttf", ".ttc"];
  const hints = ["CJK", "SC", "CN", "noto", "Noto"];
  for (const dir of dirs) {
    try {
      for (const file of readdirSync(dir)) {
        if (exts.some(e => file.endsWith(e)) && hints.some(h => file.includes(h))) {
          return `${dir}/${file}`;
        }
      }
    } catch { /* dir not found */ }
  }
  return null;
}

const fontPath = findCJKFont();
if (fontPath) {
  try { GlobalFonts.registerFromPath(fontPath, "PrintFont"); console.log(`Font loaded: ${fontPath}`); }
  catch (e) { console.warn(`Font load failed: ${e.message}`); }
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
const T = (text, opts = {}) => ({ type: "text", text: String(text ?? ""), align: opts.align || "left", bold: !!opts.bold, large: !!opts.large });
const C = (text, opts = {}) => T(text, { ...opts, align: "center" });
const R = () => ({ type: "rule" });
const F = () => ({ type: "feed" });

// ── Text helpers ──────────────────────────────────────────────────────────────
function textOf(value, locale = "zh-CN") {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value["zh-CN"] ?? value["en-GB"] ?? Object.values(value)[0] ?? "";
}
function itemName(item, locale) {
  const base = textOf(item.name_i18n, locale);
  const variant = textOf(item.variant_name_i18n, locale);
  return variant ? `${base} (${variant})` : base;
}

// ── Document builders ─────────────────────────────────────────────────────────
function buildKitchenDoc({ order, items, table, settings }) {
  const locale = settings.locale ?? "zh-CN";
  const title  = order.service_type === "dine_in" ? `桌号: ${table?.label ?? ""}` : `外带: ${order.pickup_no ?? ""}`;
  const doc = [
    C("后 厨 单", { bold: true, large: true }),
    R(),
    T(title, { bold: true }),
    T(`单号: ${order.order_no}`),
    T(`时间: ${new Date(order.created_at).toLocaleString(locale)}`),
    R(),
  ];
  for (const item of items) {
    doc.push(T(`${item.quantity} × ${itemName(item, locale)}`, { bold: true }));
    for (const mod of item.modifiers ?? []) doc.push(T(`  + ${textOf(mod.name_i18n, locale)}`));
    if (item.notes) doc.push(T(`  ※ ${item.notes}`));
  }
  if (order.notes) { doc.push(R()); doc.push(T(`备注: ${order.notes}`)); }
  doc.push(R()); doc.push(F());
  return doc;
}

function buildReceiptDoc({ order, items, payments, settings, table }) {
  const locale   = settings.locale   ?? "zh-CN";
  const currency = settings.currency ?? "CNY";
  const doc = [
    C(settings.receipt_header || "QY Restaurant", { bold: true }),
    R(),
    T(`单号: ${order.order_no}`),
    order.service_type === "dine_in" ? T(`桌号: ${table?.label ?? ""}`) : T(`取餐号: ${order.pickup_no ?? ""}`),
    T(`时间: ${new Date(order.created_at).toLocaleString(locale)}`),
    R(),
  ];
  for (const item of items) {
    const mods  = (item.modifiers ?? []).reduce((s, m) => s + Number(m.price_delta), 0);
    const total = (Number(item.unit_price) + mods) * Number(item.quantity);
    doc.push(T(`${item.quantity} × ${itemName(item, locale)}`));
    for (const mod of item.modifiers ?? []) {
      const sfx = Number(mod.price_delta) ? ` ${formatMoney(mod.price_delta, currency, locale)}` : "";
      doc.push(T(`  + ${textOf(mod.name_i18n, locale)}${sfx}`));
    }
    doc.push(T(`  ${formatMoney(total, currency, locale)}`));
  }
  doc.push(R());
  doc.push(T(`小计: ${formatMoney(order.subtotal, currency, locale)}`));
  if (settings.show_tax_on_receipt) doc.push(T(`税额: ${formatMoney(order.tax, currency, locale)}`));
  doc.push(T(`服务费: ${formatMoney(order.service_charge, currency, locale)}`));
  doc.push(T(`合计: ${formatMoney(order.total, currency, locale)}`, { bold: true }));
  if (payments?.length) {
    doc.push(R()); doc.push(T("付款明细"));
    for (const p of payments) {
      doc.push(T(`${p.method}: ${formatMoney(p.amount, currency, locale)}`));
      if (Number(p.change_due)) doc.push(T(`找零: ${formatMoney(p.change_due, currency, locale)}`));
    }
  }
  if (order.notes) { doc.push(R()); doc.push(T(`备注: ${order.notes}`)); }
  doc.push(R());
  doc.push(C(settings.receipt_footer || "谢谢惠顾"));
  doc.push(F());
  return doc;
}

function buildTestDoc({ settings, printer, created_at }) {
  const locale = settings.locale ?? "zh-CN";
  const addr   = printer?.connection_type === "usb"
    ? `设备: ${printer.device_path ?? "/dev/usb/lp0"}`
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
    totalH += item.large ? LH_L : LH_N;
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
    const fs = item.large ? FS_L : FS_N;
    const lh = item.large ? LH_L : LH_N;
    ctx.font = `${item.bold ? "bold " : ""}${fs}px '${FONT}'`;
    ctx.textBaseline = "middle";
    if (item.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(item.text, PAPER_W / 2, y + lh / 2);
    } else {
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
  if      (job.type === "kitchen") doc = buildKitchenDoc(job.payload);
  else if (job.type === "test")    doc = buildTestDoc(job.payload);
  else                             doc = buildReceiptDoc(job.payload);
  return docToBuffer(doc);
}

// ── Transport ─────────────────────────────────────────────────────────────────
async function sendToUsbPrinter(buffer, settings) {
  await fs.writeFile(settings.device_path || "/dev/usb/lp0", buffer);
}

async function sendToNetworkPrinter(buffer, settings) {
  const host = settings.host || settings.printer_host || process.env.PRINTER_DEFAULT_HOST;
  const port = Number(settings.port || settings.printer_port || process.env.PRINTER_DEFAULT_PORT || 9100);
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.write(buffer, () => socket.end());
    });
    socket.on("close", resolve);
    socket.on("timeout", () => socket.destroy(new Error(`Printer timeout ${host}:${port}`)));
    socket.on("error", reject);
  });
}

async function sendToPrinter(buffer, settings) {
  if (settings.connection_type === "usb") await sendToUsbPrinter(buffer, settings);
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
  if (!job) return;
  try {
    await pool.query("UPDATE print_jobs SET status = 'printing', updated_at = now() WHERE id = $1", [id]);
    const buffer = render(job);
    await sendToPrinter(buffer, job.payload.printer ?? job.payload.settings);
    await updateJob(id, "succeeded");
    await redis.publish("print_events", JSON.stringify({ event: "print.succeeded", data: { id } }));
  } catch (error) {
    await updateJob(id, "failed", error.message);
    await redis.publish("print_events", JSON.stringify({ event: "print.failed", data: { id, error: error.message } }));
  }
}

console.log("printer-service ready");
while (true) {
  const result = await redis.brpop("print_jobs", 0);
  if (result?.[1]) await processJob(result[1]);
}
