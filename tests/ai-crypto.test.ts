import { test } from "node:test";
import assert from "node:assert/strict";

// lib/crypto derives keys lazily (per call), so setting AUTH_SECRET after the
// static import is still safe.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-crypto-suite";

import { encryptSecret, decryptSecret, maskSecret, safeEqual } from "../lib/crypto";

test("encrypt/decrypt round-trips arbitrary secrets", () => {
  const samples = [
    "sk-simple",
    "AIzaSyC-long-gemini-key-with-symbols_+/=",
    "unicode-🔐-secret-ï",
    "x".repeat(500),
  ];
  for (const s of samples) {
    assert.equal(decryptSecret(encryptSecret(s)), s);
  }
});

test("ciphertext never contains the plaintext and is versioned", () => {
  const encoded = encryptSecret("super-secret-gemini-key");
  assert.equal(encoded.startsWith("v1."), true);
  assert.equal(encoded.includes("super-secret"), false);
  // Random IV → two encryptions of the same plaintext differ.
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("tampered ciphertext fails authentication", () => {
  const [v, iv, tag, ct] = encryptSecret("attack-at-dawn").split(".");
  const flipped = Buffer.from(ct, "base64");
  flipped[0] = flipped[0]! ^ 0xff;
  assert.throws(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(".")));
});

test("malformed encodings are rejected with a clear error", () => {
  assert.throws(() => decryptSecret("garbage"), /Unrecognized/);
  assert.throws(() => decryptSecret("v2.a.b.c"), /Unrecognized/);
  assert.throws(() => decryptSecret("v1.only.two."), /Unrecognized/);
});

test("maskSecret shows only the last four characters", () => {
  assert.equal(maskSecret("AIza1234567890abcd"), "••••abcd");
  assert.equal(maskSecret("tiny"), "••••");
  assert.equal(maskSecret(""), "••••");
});

test("safeEqual compares constant-time style", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
