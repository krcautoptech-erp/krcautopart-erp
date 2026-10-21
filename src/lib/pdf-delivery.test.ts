import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverPdfBlob,
  createBrowserPdfDeliveryAdapter,
  retryPendingPdfShare,
  isMobilePdfShareDevice,
  type PdfDeliveryAdapter,
} from "./pdf-delivery.ts";

test("mobile file delivery preserves Excel MIME, cancellation and delayed-share retry", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const seen: ShareData[] = [];
  let failure: string | null = null;
  let readyEvents = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5,
    canShare: () => true,
    share: async (data: ShareData) => {
      seen.push(data);
      if (failure) throw new DOMException("share", failure);
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => { readyEvents += 1; } } });
  try {
    const blob = new Blob(["spreadsheet"], { type: "application/vnd.ms-excel;charset=utf-8" });
    for (const [filename, mime] of [["PR.xls", "application/vnd.ms-excel"], ["report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ["items.csv", "text/csv"]]) {
      assert.equal(await deliverPdfBlob(new Blob(["sheet"], { type: mime }), filename, createBrowserPdfDeliveryAdapter()), "shared");
      assert.equal(seen.at(-1)!.files![0].type, mime);
      assert.equal(seen.at(-1)!.files![0].name, filename);
    }
    failure = "AbortError";
    assert.equal(await deliverPdfBlob(blob, "PR.xls", createBrowserPdfDeliveryAdapter()), "cancelled");
    failure = "NotAllowedError";
    assert.equal(await deliverPdfBlob(blob, "PR.xls", createBrowserPdfDeliveryAdapter()), "share-ready");
    assert.equal(readyEvents, 1);
    failure = null;
    assert.equal(await retryPendingPdfShare(), "shared");
    assert.equal(seen.at(-1)!.files![0].type, "application/vnd.ms-excel");
    assert.equal(await retryPendingPdfShare(), "cancelled");
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("browser adapter downloads on desktop and unsupported mobile without opening a page", async () => {
  const originals = ["navigator", "window", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const downloads: string[] = [];
  let shareCalls = 0;
  let removed = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: (callback: () => void) => callback() } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    body: { appendChild() {} },
    createElement: () => ({ href: "", download: "", click() { downloads.push(this.download); }, remove() { removed += 1; } }),
  } });
  try {
    for (const mobile of [false, true]) {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
        platform: mobile ? "iPhone" : "Win32", userAgent: mobile ? "iPhone" : "Windows NT", maxTouchPoints: mobile ? 5 : 0,
        canShare: () => false, share: async () => { shareCalls += 1; },
      } });
      assert.equal(await deliverPdfBlob(new Blob(["sheet"]), "export.xls", createBrowserPdfDeliveryAdapter()), "downloaded");
    }
    assert.deepEqual(downloads, ["export.xls", "export.xls"]);
    assert.equal(shareCalls, 0);
    assert.equal(removed, 2);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

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
