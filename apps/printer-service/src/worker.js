import net from "node:net";
import Redis from "ioredis";
import pg from "pg";
import { formatMoney } from "@qypos/shared";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

function textOf(value, locale = "zh-CN") {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value["zh-CN"] ?? value["en-GB"] ?? Object.values(value)[0] ?? "";
}

function line(char = "-", width = 32) {
  return char.repeat(width);
}

function itemName(item, locale) {
  const base = textOf(item.name_i18n, locale);
  const variant = textOf(item.variant_name_i18n, locale);
  return variant ? `${base} (${variant})` : base;
}

function renderKitchenTicket(payload) {
  const { order, items, table, settings } = payload;
  const locale = settings.locale ?? "zh-CN";
  const title = order.service_type === "dine_in" ? `Table ${table?.label ?? ""}` : `Takeaway ${order.pickup_no ?? ""}`;
  const rows = [
    "\x1b@",
    "\x1ba\x01",
    "KITCHEN / 后厨单",
    "\x1ba\x00",
    line(),
    title,
    `Order: ${order.order_no}`,
    `Time: ${new Date(order.created_at).toLocaleString(locale)}`,
    line()
  ];

  for (const item of items) {
    rows.push(`${item.quantity} x ${itemName(item, locale)}`);
    for (const modifier of item.modifiers ?? []) {
      rows.push(`  + ${textOf(modifier.name_i18n, locale)}`);
    }
    if (item.notes) rows.push(`  * ${item.notes}`);
  }

  if (order.notes) rows.push(line(), `Note: ${order.notes}`);
  rows.push(line(), "\n\n\n\x1dV\x00");
  return rows.join("\n");
}

function renderReceipt(payload) {
  const { order, items, payments, settings, table } = payload;
  const locale = settings.locale ?? "zh-CN";
  const currency = settings.currency ?? "CNY";
  const rows = [
    "\x1b@",
    "\x1ba\x01",
    settings.receipt_header || "QY Restaurant",
    "\x1ba\x00",
    line(),
    `Order: ${order.order_no}`,
    order.service_type === "dine_in" ? `Table: ${table?.label ?? ""}` : `Pickup: ${order.pickup_no ?? ""}`,
    `Time: ${new Date(order.created_at).toLocaleString(locale)}`,
    line()
  ];

  for (const item of items) {
    const modifiers = (item.modifiers ?? []).reduce((sum, modifier) => sum + Number(modifier.price_delta), 0);
    const itemTotal = (Number(item.unit_price) + modifiers) * Number(item.quantity);
    rows.push(`${item.quantity} x ${itemName(item, locale)}`);
    for (const modifier of item.modifiers ?? []) {
      const suffix = Number(modifier.price_delta) ? ` ${formatMoney(modifier.price_delta, currency, locale)}` : "";
      rows.push(`  + ${textOf(modifier.name_i18n, locale)}${suffix}`);
    }
    rows.push(`  ${formatMoney(itemTotal, currency, locale)}`);
  }

  rows.push(line());
  rows.push(`Subtotal: ${formatMoney(order.subtotal, currency, locale)}`);
  if (settings.show_tax_on_receipt) rows.push(`Tax: ${formatMoney(order.tax, currency, locale)}`);
  rows.push(`Service: ${formatMoney(order.service_charge, currency, locale)}`);
  rows.push(`Total: ${formatMoney(order.total, currency, locale)}`);
  if (payments?.length) {
    rows.push(line(), "Payments");
    for (const payment of payments) {
      rows.push(`${payment.method}: ${formatMoney(payment.amount, currency, locale)}`);
      if (Number(payment.change_due)) rows.push(`Change: ${formatMoney(payment.change_due, currency, locale)}`);
    }
  }
  if (order.notes) rows.push(line(), `Note: ${order.notes}`);
  rows.push(line(), settings.receipt_footer || "Thank you", "\n\n\n\x1dV\x00");
  return rows.join("\n");
}

function renderTestTicket(payload) {
  const { settings } = payload;
  const locale = settings.locale ?? "zh-CN";
  const rows = [
    "\x1b@",
    "\x1ba\x01",
    "QYPOS PRINT TEST",
    "\x1ba\x00",
    line(),
    settings.receipt_header || "QY Restaurant",
    `Time: ${new Date(payload.created_at ?? Date.now()).toLocaleString(locale)}`,
    `Printer: ${settings.printer_host}:${settings.printer_port}`,
    line(),
    "If you can read this, printing is online.",
    settings.receipt_footer || "Thank you",
    "\n\n\n\x1dV\x00"
  ];
  return rows.join("\n");
}

function render(job) {
  if (job.type === "kitchen") return renderKitchenTicket(job.payload);
  if (job.type === "test") return renderTestTicket(job.payload);
  return renderReceipt(job.payload);
}

async function sendToPrinter(content, settings) {
  const host = settings.printer_host || process.env.PRINTER_DEFAULT_HOST;
  const port = Number(settings.printer_port || process.env.PRINTER_DEFAULT_PORT || 9100);

  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.write(content, "binary", () => socket.end());
    });
    socket.on("close", resolve);
    socket.on("timeout", () => {
      socket.destroy(new Error(`Printer timeout ${host}:${port}`));
    });
    socket.on("error", reject);
  });
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
    const content = render(job);
    await sendToPrinter(content, job.payload.settings);
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
