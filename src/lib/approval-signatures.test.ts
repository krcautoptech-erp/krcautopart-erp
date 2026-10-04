import assert from "node:assert/strict";
import test from "node:test";
import {
  getPngDimensions,
  removeLightSignatureBackground,
  validateNormalizedSignature,
} from "./approval-signatures.ts";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("reads dimensions from a PNG header", () => {
  assert.deepEqual(getPngDimensions(pngHeader(1200, 400)), {
    height: 400,
    width: 1200,
  });
});

test("accepts only the normalized 1200 by 400 signature canvas", () => {
  assert.equal(validateNormalizedSignature(pngHeader(1200, 400), 1024), null);
  assert.equal(
    validateNormalizedSignature(pngHeader(600, 200), 1024),
    "ไฟล์ลายเซ็นต้องมีขนาด 1200 × 400 พิกเซล",
  );
  assert.equal(
    validateNormalizedSignature(new Uint8Array([1, 2, 3]), 3),
    "ไฟล์ลายเซ็นต้องเป็น PNG",
  );
});

test("removes white upload backgrounds while preserving dark signature ink", () => {
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255,
    235, 235, 235, 255,
    20, 24, 30, 255,
  ]);

  removeLightSignatureBackground(pixels);

  assert.equal(pixels[3], 0);
  assert.ok(pixels[7] > 0 && pixels[7] < 255);
  assert.equal(pixels[11], 255);
});
