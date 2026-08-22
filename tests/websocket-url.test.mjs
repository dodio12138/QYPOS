import test from "node:test";
import assert from "node:assert/strict";

const { websocketUrl } = await import("../apps/web/src/lib/api.js");

test("frontend WebSocket follows the configured API proxy path and browser protocol", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin: "https://pos.example.test",
      protocol: "https:"
    }
  };

  try {
    assert.equal(websocketUrl(), "wss://pos.example.test/api-proxy/ws");
    assert.equal(websocketUrl("ws"), "wss://pos.example.test/api-proxy/ws");
  } finally {
    globalThis.window = previousWindow;
  }
});
