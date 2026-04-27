export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function api(path, options = {}) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("qypos_token") : null;
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
