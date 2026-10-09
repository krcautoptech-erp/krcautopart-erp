import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

test("service worker caches static assets and only an explicit offline navigation fallback", async () => {
  const source = await readFile("public/sw.js", "utf8");
  assert.match(source, /url\.pathname\.startsWith\("\/pwa\/"\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/fonts\/"\)/);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /event\.request\.mode\s*===\s*["']navigate["']/);
  assert.match(source, /fetch\(event\.request\)\.catch\(\(\) => caches\.match\("\/offline\.html"\)\)/);
  assert.doesNotMatch(source, /cache\.put\(event\.request[\s\S]*mode === "navigate"/);
});

test("service worker clones a static response before opening the cache", async () => {
  const source = await readFile("public/sw.js", "utf8");
  const fetchHandler = source.slice(source.indexOf('self.addEventListener("fetch"'));
  const cloneIndex = fetchHandler.indexOf("const responseForCache = response.clone()");
  const openCacheIndex = fetchHandler.indexOf("await caches.open(STATIC_CACHE)");

  assert.notEqual(cloneIndex, -1, "static responses must be cloned synchronously");
  assert.notEqual(openCacheIndex, -1, "the static cache must be opened before writing");
  assert.ok(
    cloneIndex < openCacheIndex,
    "clone the response before asynchronous cache access can let its body be consumed",
  );
  assert.doesNotMatch(
    fetchHandler,
    /cache\.put\([^)]*response\.clone\(\)/,
    "do not defer response.clone() until cache.put()",
  );
});

test("manifest exposes install and maskable icons with exact files", async () => {
  const manifest = await readFile("src/app/manifest.ts", "utf8");
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(manifest, /icon-192-maskable\.png/);
  assert.match(manifest, /icon-512-maskable\.png/);
  assert.match(manifest, /purpose: "maskable"/);

  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-192-maskable.png", 192],
    ["icon-512-maskable.png", 512],
    ["apple-touch-icon.png", 180],
    ["badge-96.png", 96],
  ] as const) {
    const metadata = await sharp(`public/pwa/${file}`).metadata();
    assert.equal(metadata.width, size, file);
    assert.equal(metadata.height, size, file);
  }

  const { data: icon192Data } = await sharp("public/pwa/icon-192.png").raw().toBuffer({ resolveWithObject: true });
  assert.equal(icon192Data[3], 0, "icon-192.png should have transparent background");

  const { data: appleTouchData } = await sharp("public/pwa/apple-touch-icon.png").raw().toBuffer({ resolveWithObject: true });
  assert.equal(appleTouchData[0], 190, "apple-touch-icon.png red channel");
  assert.equal(appleTouchData[1], 15, "apple-touch-icon.png green channel");
  assert.equal(appleTouchData[2], 26, "apple-touch-icon.png blue channel");
  assert.equal(appleTouchData[3], 255, "apple-touch-icon.png alpha channel (opaque red)");
});
