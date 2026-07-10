/**
 * Shared test helpers for QYPOS integration & unit tests.
 */
import assert from "node:assert/strict";

// ── API helpers (integration tests only) ────────────────────────────────────

/**
 * Create an authenticated request helper bound to an API base & token.
 * Usage: const req = authed(API_BASE, token); await req("/users");
 */
export function authed(apiBase, token) {
  return (path, options = {}) =>
    request(apiBase, path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
}

/**
 * Low-level fetch wrapper. Automatically parses JSON.
 */
export async function request(apiBase, path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${path} -> ${response.status}: ${text}`
    );
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Login helper — returns { token, user }.
 */
export async function loginAs(apiBase, name, pin) {
  const result = await request(apiBase, "/auth/login", {
    method: "POST",
    body: JSON.stringify({ name, pin }),
  });
  assert.ok(result.token, "login should return a token");
  return result;
}

/**
 * Login with environment-configured admin credentials.
 */
export async function loginAdmin(apiBase) {
  return loginAs(
    apiBase,
    process.env.TEST_ADMIN_NAME || "Owner",
    process.env.TEST_ADMIN_PIN || "0000"
  );
}

// ── Environment helpers ─────────────────────────────────────────────────────

/**
 * Temporarily set env vars, restore them after the callback.
 */
export function withEnv(overrides, run) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// ── Integration test lifecycle ──────────────────────────────────────────────

/**
 * Run a setup → test → cleanup integration flow.
 * Cleanup always runs even if the test throws.
 */
export async function integrationFlow(setup, testFn, cleanup) {
  let ctx;
  try {
    ctx = await setup();
    await testFn(ctx);
  } finally {
    if (ctx && cleanup) {
      await cleanup(ctx).catch(() => {});
    }
  }
}

// ── Cleanup helpers ─────────────────────────────────────────────────────────

/**
 * Destroy menu items and categories created during integration tests.
 */
export async function destroyMenuResources(req, { itemId, categoryId }) {
  if (itemId) {
    await req(`/menu/items/${itemId}/destroy`, { method: "DELETE" }).catch(() => {});
  }
  if (categoryId) {
    await req(`/menu/categories/${categoryId}/destroy`, { method: "DELETE" }).catch(() => {});
  }
}

/**
 * Destroy option presets by id.
 */
export async function destroyPresets(req, presetIds) {
  for (const id of presetIds) {
    await req(`/menu/option-presets/${id}`, { method: "DELETE" }).catch(() => {});
  }
}
