import assert from "node:assert/strict";
import test from "node:test";
import {
  isServerlessPdfRuntime,
  resolveChromiumPackUrl,
} from "./server-pdf-runtime.ts";

test("uses the serverless Chromium runtime on Vercel", () => {
  assert.equal(isServerlessPdfRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isServerlessPdfRuntime({}), false);
});

test("resolves the Chromium pack from the current Vercel deployment", () => {
  assert.equal(
    resolveChromiumPackUrl({ VERCEL_URL: "krc-erp-git-main.example.vercel.app" }),
    "https://krc-erp-git-main.example.vercel.app/chromium-pack.tar",
  );
});

test("allows an explicit HTTPS Chromium pack URL for another production host", () => {
  assert.equal(
    resolveChromiumPackUrl({ CHROMIUM_PACK_URL: "https://assets.example.com/chromium-pack.tar" }),
    "https://assets.example.com/chromium-pack.tar",
  );
});

test("rejects an unsafe or missing Chromium pack URL", () => {
  assert.throws(
    () => resolveChromiumPackUrl({ CHROMIUM_PACK_URL: "http://assets.example.com/chromium-pack.tar" }),
    /HTTPS/,
  );
  assert.throws(() => resolveChromiumPackUrl({}), /Chromium pack URL/);
});
