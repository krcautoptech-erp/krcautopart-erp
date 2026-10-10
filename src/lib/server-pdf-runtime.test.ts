import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isServerlessPdfRuntime } from "./server-pdf-runtime.ts";
import { inlineLocalAssets } from "./server-pdf.ts";

test("embeds the static Inter font actually referenced by the document stylesheet", () => {
  const html = inlineLocalAssets('<style>src:url("/fonts/static/Inter_18pt-Regular.ttf")</style>');
  assert.ok(html.includes("data:font/truetype;charset=utf-8;base64,"));
  assert.ok(!html.includes("/fonts/static/Inter_18pt-Regular.ttf"));
});

test("uses the serverless Chromium runtime on Vercel", () => {
  assert.equal(isServerlessPdfRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isServerlessPdfRuntime({}), false);
});

test("does not inline files outside public through image paths", () => {
  const html = '<img src="/../package.json"><img src="/%2e%2e/package.json">';
  assert.equal(inlineLocalAssets(html), html);
});

test("serverless PDF uses the packaged Chromium binary without self-fetching a deployment asset", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/server-pdf.ts"), "utf8");
  assert.match(source, /import\("@sparticuz\/chromium"\)/);
  assert.doesNotMatch(source, /chromium-min|resolveChromiumPackUrl/);
});
