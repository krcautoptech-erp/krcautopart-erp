import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isServerlessPdfRuntime } from "./server-pdf-runtime.ts";

test("uses the serverless Chromium runtime on Vercel", () => {
  assert.equal(isServerlessPdfRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isServerlessPdfRuntime({}), false);
});

test("serverless PDF uses the packaged Chromium binary without self-fetching a deployment asset", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/server-pdf.ts"), "utf8");
  assert.match(source, /import\("@sparticuz\/chromium"\)/);
  assert.doesNotMatch(source, /chromium-min|resolveChromiumPackUrl/);
});
