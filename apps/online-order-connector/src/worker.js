import crypto from "node:crypto";

const DEFAULT_RECONNECT_MIN_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
const DEFAULT_MONITOR_OPEN_TIME = "11:00";
const DEFAULT_MONITOR_CLOSE_TIME = "22:05";
const DEFAULT_MONITOR_TIME_ZONE = "Europe/London";
const DEFAULT_CLOSED_CHECK_MS = 30000;
const REQUEST_TIMEOUT_MS = 20000;

function clockMinutes(value, field) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) throw new Error(`${field} must use HH:MM`);
  return hour * 60 + minute;
}

function localClockMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value) * 60
    + Number(parts.find((part) => part.type === "minute")?.value);
}

export function isWithinMonitoringHours(date = new Date(), { openTime = DEFAULT_MONITOR_OPEN_TIME, closeTime = DEFAULT_MONITOR_CLOSE_TIME, timeZone = DEFAULT_MONITOR_TIME_ZONE } = {}) {
  const open = clockMinutes(openTime, "ONLINE_ORDER_OPEN_TIME");
  const close = clockMinutes(closeTime, "ONLINE_ORDER_CLOSE_TIME");
  const current = localClockMinutes(date, timeZone);
  if (open === close) return true;
  return open < close ? current >= open && current < close : current >= open || current < close;
}

function canonicalPath(url, includeQuery = true) {
  const parsed = new URL(url);
  return includeQuery ? `${parsed.pathname}${parsed.search}` : parsed.pathname;
}

export function signedHeaders({ secret, method, url, body = "", timestamp = Math.floor(Date.now() / 1000), includeQuery = true }) {
  const signature = crypto.createHmac("sha256", secret)
    .update(`${timestamp}.${method} ${canonicalPath(url, includeQuery)}.${body}`)
    .digest("hex");
  return {
    "X-QYPOS-Sync-Timestamp": String(timestamp),
    "X-QYPOS-Sync-Signature": `sha256=${signature}`
  };
}

export class SseParser {
  constructor() {
    this.buffer = "";
    this.event = { data: [] };
  }

  feed(chunk) {
    this.buffer += chunk;
    const events = [];
    let lineEnd;
    while ((lineEnd = this.buffer.indexOf("\n")) >= 0) {
      let line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const parsed = this.consumeLine(line);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  finish() {
    const events = [];
    if (this.buffer) {
      const parsed = this.consumeLine(this.buffer);
      if (parsed) events.push(parsed);
      this.buffer = "";
    }
    const parsed = this.dispatch();
    if (parsed) events.push(parsed);
    return events;
  }

  consumeLine(line) {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") this.event.event = value;
    if (field === "id") this.event.id = value;
    if (field === "data") this.event.data.push(value);
    return null;
  }

  dispatch() {
    if (!this.event.event && !this.event.id && this.event.data.length === 0) return null;
    const result = {
      event: this.event.event || "message",
      id: this.event.id || null,
      data: this.event.data.join("\n")
    };
    this.event = { data: [] };
    return result;
  }
}

export function parseSseText(text) {
  const parser = new SseParser();
  return [...parser.feed(String(text)), ...parser.finish()];
}

async function* streamSse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SSE response has no readable body");
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.feed(decoder.decode(value, { stream: true }))) yield event;
    }
    for (const event of parser.feed(decoder.decode())) yield event;
    for (const event of parser.finish()) yield event;
  } finally {
    reader.releaseLock?.();
  }
}

function sleep(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    if (!signal) return;
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("connector stopped"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function assertRemoteUrl(value, allowInsecure) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new Error("ONLINE_ORDER_BASE_URL must use HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

export function connectorConfig(env = process.env) {
  const allowInsecure = env.ONLINE_ORDER_ALLOW_INSECURE === "true";
  return {
    baseUrl: env.ONLINE_ORDER_BASE_URL ? assertRemoteUrl(env.ONLINE_ORDER_BASE_URL, allowInsecure) : "",
    syncSecret: env.ONLINE_ORDER_SYNC_SECRET || "",
    importSecret: env.ONLINE_ORDER_IMPORT_SECRET || env.ONLINE_ORDER_SYNC_SECRET || "",
    connectorId: env.ONLINE_ORDER_CONNECTOR_ID || "restaurant-pos-1",
    cursor: env.ONLINE_ORDER_CURSOR || "0",
    localApiUrl: (env.QYPOS_API_URL || "http://127.0.0.1:4000").replace(/\/$/, ""),
    reconnectMinMs: Number(env.ONLINE_ORDER_RECONNECT_MIN_MS) || DEFAULT_RECONNECT_MIN_MS,
    reconnectMaxMs: Number(env.ONLINE_ORDER_RECONNECT_MAX_MS) || DEFAULT_RECONNECT_MAX_MS,
    openTime: env.ONLINE_ORDER_OPEN_TIME || DEFAULT_MONITOR_OPEN_TIME,
    closeTime: env.ONLINE_ORDER_CLOSE_TIME || DEFAULT_MONITOR_CLOSE_TIME,
    timeZone: env.ONLINE_ORDER_TIME_ZONE || DEFAULT_MONITOR_TIME_ZONE,
    closedCheckMs: Number(env.ONLINE_ORDER_CLOSED_CHECK_MS) || DEFAULT_CLOSED_CHECK_MS
  };
}

export class OnlineOrderConnector {
  constructor(config, { fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.cursor = config.cursor;
  }

  async requestJson(url, options = {}, { secret, includeQuery = true } = {}) {
    const body = options.body || "";
    const headers = {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      ...signedHeaders({ secret, method: options.method || "GET", url, body, includeQuery })
    };
    const response = await this.fetchWithTimeout(url, { ...options, headers });
    if (!response.ok) throw new Error(`online order request failed (${response.status})`);
    return response.json();
  }

  async fetchWithTimeout(url, options = {}, signal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async loadCursor() {
    if (!this.config.localApiUrl || !this.config.importSecret) return;
    const url = `${this.config.localApiUrl}/internal/online-orders/sync-state?connectorId=${encodeURIComponent(this.config.connectorId)}`;
    const data = await this.requestJson(url, { headers: { "X-QYPOS-Connector-Id": this.config.connectorId } }, { secret: this.config.importSecret, includeQuery: false });
    if (data.last_cursor !== null && data.last_cursor !== undefined && data.last_cursor !== "") this.cursor = String(data.last_cursor);
  }

  async importLocalOrder(order, cursor) {
    const body = JSON.stringify({ connectorId: this.config.connectorId, cursor: String(cursor), order });
    const url = `${this.config.localApiUrl}/internal/online-orders/import`;
    return this.requestJson(url, {
      method: "POST",
      body,
      headers: { "X-QYPOS-Connector-Id": this.config.connectorId }
    }, { secret: this.config.importSecret, includeQuery: false });
  }

  async handleEvent(event) {
    if (event.event !== "order.available") return;
    if (!event.id) throw new Error("order.available event has no cursor");
    let data;
    try { data = JSON.parse(event.data); } catch { throw new Error("order.available event is not valid JSON"); }
    const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
    if (!orderId) throw new Error("order.available event has no orderId");
    const cursor = String(event.id);
    const detailUrl = `${this.config.baseUrl}/api/pos/orders/${encodeURIComponent(orderId)}`;
    const detail = await this.requestJson(detailUrl, {
      headers: { Authorization: `Bearer ${this.config.syncSecret}` }
    }, { secret: this.config.syncSecret });
    if (detail.paymentStatus !== "Captured") throw new Error("online order is not Captured");
    await this.importLocalOrder(detail, cursor);
    const ackBody = JSON.stringify({ connectorId: this.config.connectorId, cursor });
    const ackUrl = `${this.config.baseUrl}/api/pos/orders/${encodeURIComponent(orderId)}/ack`;
    await this.requestJson(ackUrl, {
      method: "POST",
      body: ackBody,
      headers: { Authorization: `Bearer ${this.config.syncSecret}` }
    }, { secret: this.config.syncSecret });
    this.cursor = cursor;
    this.logger.info?.(`online order ${orderId} saved at cursor ${cursor}`);
  }

  async consumeOnce(signal) {
    const url = `${this.config.baseUrl}/api/pos/events?cursor=${encodeURIComponent(this.cursor)}`;
    const response = await this.fetchWithTimeout(url, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${this.config.syncSecret}`,
        "Last-Event-ID": String(this.cursor),
        "X-QYPOS-Connector-Id": this.config.connectorId,
        ...signedHeaders({ secret: this.config.syncSecret, method: "GET", url })
      }
    }, signal);
    if (!response.ok) throw new Error(`SSE connection failed (${response.status})`);
    for await (const event of streamSse(response)) {
      if (signal?.aborted) return;
      await this.handleEvent(event);
    }
    throw new Error("SSE connection closed");
  }

  async consumeDuringMonitoringHours(signal) {
    const windowController = new AbortController();
    const abortWindow = () => windowController.abort();
    const timer = setInterval(() => {
      if (!isWithinMonitoringHours(new Date(), this.config)) windowController.abort();
    }, 1000);
    signal.addEventListener("abort", abortWindow, { once: true });
    try {
      await this.consumeOnce(windowController.signal);
    } catch (error) {
      if (!signal.aborted && windowController.signal.aborted && !isWithinMonitoringHours(new Date(), this.config)) return;
      throw error;
    } finally {
      clearInterval(timer);
      signal.removeEventListener("abort", abortWindow);
    }
  }

  async run(signal = new AbortController().signal) {
    if (!this.config.baseUrl || !this.config.syncSecret || !this.config.localApiUrl || !this.config.importSecret) {
      this.logger.warn?.("online order connector disabled: required environment is missing");
      await sleep(60 * 60 * 1000, signal).catch(() => {});
      return;
    }
    let delay = this.config.reconnectMinMs;
    let cursorLoaded = false;
    while (!signal.aborted) {
      if (!isWithinMonitoringHours(new Date(), this.config)) {
        await sleep(this.config.closedCheckMs, signal).catch(() => {});
        delay = this.config.reconnectMinMs;
        continue;
      }
      try {
        if (!cursorLoaded) {
          await this.loadCursor();
          cursorLoaded = true;
        }
        await this.consumeDuringMonitoringHours(signal);
        delay = this.config.reconnectMinMs;
      } catch (error) {
        if (signal.aborted) break;
        this.logger.error?.(`online order connector: ${error.message}`);
        await sleep(delay, signal).catch(() => {});
        delay = Math.min(this.config.reconnectMaxMs, delay * 2);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  new OnlineOrderConnector(connectorConfig()).run(controller.signal);
}
