const FINAL_SESSION_STATUSES = new Set([
  "Authorized",
  "Captured",
  "Canceled",
  "Declined",
  "Expired",
  "SignatureVerificationAccepted",
  "SignatureVerificationRejected"
]);

export function dojoConfig(env = process.env) {
  return {
    apiKey: env.DOJO_API_KEY || "",
    baseUrl: (env.DOJO_API_BASE_URL || "https://api.dojo.tech").replace(/\/$/, ""),
    version: env.DOJO_API_VERSION || "2026-02-27",
    softwareHouseId: env.DOJO_SOFTWARE_HOUSE_ID || "",
    resellerId: env.DOJO_RESELLER_ID || ""
  };
}

export function isDojoConfigured(env = process.env) {
  const config = dojoConfig(env);
  return Boolean(config.apiKey && config.softwareHouseId && config.resellerId);
}

export class DojoApiError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.name = "DojoApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function dojoRequest(path, { method = "GET", body, terminal = false, idempotencyKey, fetchImpl = fetch } = {}) {
  const config = dojoConfig();
  if (!isDojoConfigured()) {
    throw new DojoApiError("Dojo terminal payments are not configured", 503);
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${config.apiKey}`,
    version: config.version
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (terminal) {
    headers["software-house-id"] = config.softwareHouseId;
    headers["reseller-id"] = config.resellerId;
  }
  if (idempotencyKey) headers.idempotencyKey = idempotencyKey;

  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new DojoApiError(`Unable to reach Dojo: ${error.message}`, 502);
  }

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.title || `Dojo request failed (${response.status})`;
    throw new DojoApiError(message, response.status >= 500 ? 502 : response.status, data);
  }
  return data;
}

export async function listDojoTerminals(options = {}) {
  const terminals = await dojoRequest("/terminals?statuses=Available", { ...options, terminal: true });
  return Array.isArray(terminals) ? terminals : terminals?.items || terminals?.terminals || [];
}

export async function createDojoTerminalPayment({ amountMinor, currency, reference, description, terminalId, idempotencyKey }, options = {}) {
  const paymentIntent = await dojoRequest("/payment-intents", {
    ...options,
    method: "POST",
    idempotencyKey,
    body: {
      amount: { value: amountMinor, currencyCode: currency },
      reference,
      description,
      captureMode: "Auto",
      metadata: { qyposPaymentAttemptId: idempotencyKey }
    }
  });
  try {
    const terminalSession = await dojoRequest("/terminal-sessions", {
      ...options,
      method: "POST",
      terminal: true,
      body: {
        terminalId,
        details: {
          sessionType: "Sale",
          sale: { paymentIntentId: paymentIntent.id }
        }
      }
    });
    return { paymentIntent, terminalSession };
  } catch (error) {
    error.paymentIntent = paymentIntent;
    throw error;
  }
}

export function getDojoTerminalSession(sessionId, options = {}) {
  return dojoRequest(`/terminal-sessions/${encodeURIComponent(sessionId)}`, { ...options, terminal: true });
}

export function getDojoPaymentIntent(paymentIntentId, options = {}) {
  return dojoRequest(`/payment-intents/${encodeURIComponent(paymentIntentId)}`, options);
}

export function cancelDojoTerminalSession(sessionId, options = {}) {
  return dojoRequest(`/terminal-sessions/${encodeURIComponent(sessionId)}/cancel`, {
    ...options,
    method: "PUT",
    terminal: true,
    body: {}
  });
}

export function respondToDojoSignature(sessionId, accepted, options = {}) {
  return dojoRequest(`/terminal-sessions/${encodeURIComponent(sessionId)}/signature`, {
    ...options,
    method: "PUT",
    terminal: true,
    body: { accepted: Boolean(accepted) }
  });
}

export function mapDojoSessionStatus(status) {
  if (status === "Captured") return "succeeded";
  if (status === "Declined" || status === "SignatureVerificationRejected") return "declined";
  if (status === "Canceled") return "cancelled";
  if (status === "Expired") return "unknown";
  return "pending";
}

export function isFinalDojoSessionStatus(status) {
  return FINAL_SESSION_STATUSES.has(status);
}
