import test from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin } from "../apps/api/src/services/permissions.js";

test("hashPin produces a pbkdf2 formatted string", () => {
  const hash = hashPin("1234");
  assert.ok(hash.startsWith("pbkdf2:"));
  const parts = hash.split(":");
  assert.equal(parts.length, 4, "format: pbkdf2:iterations:salt:digest");
  assert.equal(parts[1], "100000");
  // salt must be 64 hex chars (32 bytes)
  assert.equal(parts[2].length, 64);
  // digest must be 128 hex chars (64 bytes for sha512)
  assert.equal(parts[3].length, 128);
});

test("hashPin produces unique hashes for the same PIN", () => {
  const a = hashPin("0000");
  const b = hashPin("0000");
  assert.notEqual(a, b, "different salt should yield different hash");
});

test("verifyPin returns valid for a freshly hashed PIN", () => {
  const plain = "9999";
  const hash = hashPin(plain);
  const { valid, upgraded } = verifyPin(plain, hash);
  assert.equal(valid, true);
  assert.equal(upgraded, null, "no upgrade needed for already-hashed PIN");
});

test("verifyPin rejects wrong PIN against a hash", () => {
  const hash = hashPin("1234");
  const { valid } = verifyPin("0000", hash);
  assert.equal(valid, false);
});

test("verifyPin rejects empty or falsy stored value", () => {
  assert.equal(verifyPin("1234", "").valid, false);
  assert.equal(verifyPin("1234", null).valid, false);
  assert.equal(verifyPin("1234", undefined).valid, false);
});

test("verifyPin auto-upgrades legacy plaintext PIN", () => {
  const { valid, upgraded } = verifyPin("1111", "1111");
  assert.equal(valid, true);
  assert.ok(upgraded, "should return an upgraded hash");
  assert.ok(upgraded.startsWith("pbkdf2:"));
  // The upgrade should itself verify
  assert.equal(verifyPin("1111", upgraded).valid, true);
});

test("verifyPin rejects wrong PIN against legacy plaintext", () => {
  const { valid, upgraded } = verifyPin("wrong", "1111");
  assert.equal(valid, false);
  assert.equal(upgraded, null);
});

test("verifyPin handles malformed hash string gracefully", () => {
  assert.equal(verifyPin("1234", "pbkdf2:bad").valid, false);
  assert.equal(verifyPin("1234", "pbkdf2:100000:shortsalt:shorthash").valid, false);
});

test("round-trip: hash → verify → upgrade cycle works end-to-end", () => {
  const pin = "5678";

  // Fresh hash
  const fresh = hashPin(pin);
  assert.equal(verifyPin(pin, fresh).valid, true);

  // Legacy upgrade
  const { upgraded } = verifyPin(pin, pin);
  assert.ok(upgraded.startsWith("pbkdf2:"));
  assert.equal(verifyPin(pin, upgraded).valid, true);

  // Wrong PIN against both
  assert.equal(verifyPin("wrong", fresh).valid, false);
  assert.equal(verifyPin("wrong", upgraded).valid, false);
});
