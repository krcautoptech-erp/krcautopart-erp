import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import puppeteer from "puppeteer-core";
import ts from "typescript";
import { findBrowserExecutable } from "./server-pdf.ts";

test("fit preview uses the available screen while keeping the whole paper visible", () => {
  const source = readFileSync("src/components/document-preview-shell.tsx", "utf8");
  const start = source.indexOf("const fitToPage = useCallback");
  const code = source.slice(start, source.indexOf("useLayoutEffect", start));
  for (const [width, height, mobile, expected, actionsHeight = 0] of [
    [1100, 900, false, 1],
    [850, 620, false, 556 / (148 * 96 / 25.4)],
    [390, 600, true, 366 / (210 * 96 / 25.4)],
    [320, 250, true, 198 / (148 * 96 / 25.4)],
    [200, 180, true, 176 / (210 * 96 / 25.4)],
    [850, 620, false, 456 / (148 * 96 / 25.4), 100],
  ] as const) {
    let actual = 0;
    runInNewContext(ts.transpileModule(`${code}\nfitToPage();`, {}).outputText, {
      useCallback: (fn: () => void) => fn,
      canvasRef: { current: { clientWidth: width, clientHeight: height, scrollTo() {} } },
      window: { getComputedStyle: () => ({ paddingLeft: mobile ? "12" : "28", paddingRight: mobile ? "12" : "28", paddingTop: mobile ? "20" : "26", paddingBottom: mobile ? "32" : "38", marginTop: "0", marginBottom: "0" }) },
      extraActionsRef: { current: actionsHeight ? { offsetHeight: actionsHeight } : null },
      paperWidthMm: 210, paperHeightMm: 148, PX_PER_MM: 96 / 25.4,
      clampScale: (value: number) => Math.min(2, Math.max(0.25, value)),
      fitScaleRef: {}, scaleRef: {}, setScale: (value: number) => { actual = value; },
    });
    assert.ok(Math.abs(actual - expected) < 0.0001, `${width}x${height}: ${actual} instead of ${expected}`);
    assert.ok(210 * 96 / 25.4 * actual <= width - (mobile ? 24 : 56) + 0.1);
    assert.ok(148 * 96 / 25.4 * actual <= height - (mobile ? 52 : 64) - actionsHeight + 0.1);
  }
});

test("preview shell preserves borderless reference cells and print dimensions", async (t) => {
  const executablePath = findBrowserExecutable();
  if (!executablePath) return t.skip("No local Chromium available");
  const css = readFileSync("src/components/document-preview-shell.module.css", "utf8")
    .replace(/:global\(([^)]+)\)/g, "$1");
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}.reference td{border:0!important}.paper{width:210mm;height:148mm}.items td{border:3px solid #777}</style><div class="documentContent" style="zoom:.82"><article class="paper"><table class="reference"><tr><td>PO number</td></tr></table><table class="items"><tr><td>Item</td></tr></table></article></div>`);
    assert.equal(await page.$eval(".reference td", (cell) => getComputedStyle(cell).borderTopWidth), "0px");
    assert.ok(await page.$eval(".items td", (cell) => parseFloat(getComputedStyle(cell).borderTopWidth)) > 2);
    await page.emulateMediaType("print");
    assert.ok(Math.abs(await page.$eval(".paper", (paper) => paper.getBoundingClientRect().width) - 210 * 96 / 25.4) < 1);
  } finally { await browser.close(); }
});
