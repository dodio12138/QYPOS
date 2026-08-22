export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api-proxy";

export function websocketUrl(path = "/ws") {
  if (typeof window === "undefined") return "";
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL || API_URL || "/api-proxy";
  const url = new URL(configuredUrl, window.location.origin);
  const websocketPath = path.startsWith("/") ? path : `/${path}`;
  const basePath = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith(websocketPath)) url.pathname = `${basePath}${websocketPath}`;
  url.protocol = url.protocol === "https:" || window.location.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function api(path, options = {}) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : null;
  const adminGrant = typeof window !== "undefined" ? window.sessionStorage.getItem("qypos_admin_grant") : null;
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(adminGrant ? { "X-QYPOS-Admin-Grant": adminGrant } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.error || message;
    } catch {
      // Keep the raw text when the server did not return JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function labelOf(value, locale = "zh-CN") {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] || value["zh-CN"] || value["en-GB"] || Object.values(value)[0] || "";
}
