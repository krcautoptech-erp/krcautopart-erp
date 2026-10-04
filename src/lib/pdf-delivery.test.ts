import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverPdfBlob,
  isMobilePdfShareDevice,
  type PdfDeliveryAdapter,
} from "./pdf-delivery.ts";

function adapter(overrides: Partial<PdfDeliveryAdapter> = {}): PdfDeliveryAdapter {
  return {
    download: async () => "downloaded",
    isMobileShareDevice: false,
    ...overrides,
  };
}

test("downloads PDF directly on desktop even when a share API exists", async () => {
  let shared = false;
  const result = await deliverPdfBlob(
    new Blob(["pdf"], { type: "application/pdf" }),
    "PO-001.pdf",
    adapter({
      isMobileShareDevice: false,
      share: async () => {
        shared = true;
        return "shared";
      },
    }),
  );

  assert.equal(result, "downloaded");
  assert.equal(shared, false);
});

test("uses the native share sheet for a PDF on a supported mobile device", async () => {
  let downloaded = false;
  const result = await deliverPdfBlob(
    new Blob(["pdf"], { type: "application/pdf" }),
    "PR-001.pdf",
    adapter({
      download: async () => {
        downloaded = true;
        return "downloaded";
      },
      isMobileShareDevice: true,
      share: async (_blob, filename) => {
        assert.equal(filename, "PR-001.pdf");
        return "shared";
      },
    }),
  );

  assert.equal(result, "shared");
  assert.equal(downloaded, false);
});

test("falls back to a download when mobile file sharing is unavailable", async () => {
  const result = await deliverPdfBlob(
    new Blob(["pdf"], { type: "application/pdf" }),
    "GR-001.pdf",
    adapter({ isMobileShareDevice: true }),
  );

  assert.equal(result, "downloaded");
});

test("does not download again when the user cancels the share sheet", async () => {
  let downloaded = false;
  const result = await deliverPdfBlob(
    new Blob(["pdf"], { type: "application/pdf" }),
    "ISS-001.pdf",
    adapter({
      download: async () => {
        downloaded = true;
        return "downloaded";
      },
      isMobileShareDevice: true,
      share: async () => "cancelled",
    }),
  );

  assert.equal(result, "cancelled");
  assert.equal(downloaded, false);
});

test("keeps a prepared mobile PDF for a second user gesture when sharing needs activation", async () => {
  let downloaded = false;
  const result = await deliverPdfBlob(
    new Blob(["pdf"], { type: "application/pdf" }),
    "PO-READY.pdf",
    adapter({
      download: async () => {
        downloaded = true;
        return "downloaded";
      },
      isMobileShareDevice: true,
      share: async () => "share-ready",
    }),
  );

  assert.equal(result, "share-ready");
  assert.equal(downloaded, false);
});

test("recognizes iPhone, Android and iPadOS without treating Windows touch PCs as mobile", () => {
  assert.equal(isMobilePdfShareDevice({ maxTouchPoints: 5, platform: "iPhone", userAgent: "iPhone" }), true);
  assert.equal(isMobilePdfShareDevice({ maxTouchPoints: 5, platform: "Linux armv8", userAgent: "Android" }), true);
  assert.equal(isMobilePdfShareDevice({ maxTouchPoints: 5, platform: "MacIntel", userAgent: "Macintosh" }), true);
  assert.equal(isMobilePdfShareDevice({ maxTouchPoints: 10, platform: "Win32", userAgent: "Windows NT 10.0" }), false);
});
