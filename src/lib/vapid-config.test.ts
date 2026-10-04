import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVapidPublicKey,
  resolveVapidConfiguration,
} from "./vapid-config.ts";

const privateKey = "hhvL_xbM22Cq0txl7PScDSppzVW-LrxqnWQHffSVmtE";
const publicKey = "BIsd6lCTvko3djjesYGZwOh7Tg3LjkcYkCOKU5sQbJJcWQ3FjDfupiHiuFNKYBgtpBewBgZZ3kXzVLsqtghhm_E";

test("derives the browser VAPID public key from the server-only private key", () => {
  assert.equal(deriveVapidPublicKey(privateKey), publicKey);
});

test("uses one VAPID identity even when a stale build-time public key is present", () => {
  const config = resolveVapidConfiguration({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "stale-build-key",
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: "mailto:erp@example.com",
  });
  assert.equal(config.publicKey, publicKey);
  assert.equal(config.subject, "mailto:erp@example.com");
  assert.equal(config.publicKeyMatchesEnvironment, false);
});

test("rejects missing keys and unsafe VAPID subjects", () => {
  assert.throws(() => resolveVapidConfiguration({}), /VAPID_PRIVATE_KEY/);
  assert.throws(
    () => resolveVapidConfiguration({
      VAPID_PRIVATE_KEY: privateKey,
      VAPID_SUBJECT: "https://localhost",
    }),
    /VAPID_SUBJECT/,
  );
});
