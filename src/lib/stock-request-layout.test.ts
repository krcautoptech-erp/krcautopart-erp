import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import puppeteer from "puppeteer-core";
import ts from "typescript";
import { findBrowserExecutable, inlineLocalAssets } from "./server-pdf.ts";
import { getStockRequestLineNumbers } from "./stock-issues.ts";

test("issue create button stays white regardless of its position in the toolbar", async (t) => {
  const executablePath = findBrowserExecutable();
  if (!executablePath) return t.skip("No local Chromium available");
  const source = readFileSync("src/app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx", "utf8");
  const toolbarCss = source.match(/\.issue-page-actions > button[^{}]+\{[^}]+\}/)?.[0];
  assert.ok(toolbarCss);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    for (const prefix of ["", "<button>แบบฟอร์ม A5</button>"]) {
      await page.setContent(`<style>:root{--color-on-surface:#111;--issue-border:#ddd}.text-white{color:white}${toolbarCss}</style><div class="issue-page-actions">${prefix}<button class="bg-primary text-white"><svg stroke="currentColor"></svg>สร้างใบเบิก</button><button>ส่งออก Excel</button></div>`);
      const colors = await page.evaluate(() => Array.from(document.querySelectorAll("button")).map((button) => ({ text: button.textContent, color: getComputedStyle(button).color })));
      assert.equal(colors.find((button) => button.text === "สร้างใบเบิก")?.color, "rgb(255, 255, 255)");
      assert.equal(colors.find((button) => button.text === "ส่งออก Excel")?.color, "rgb(17, 17, 17)");
    }
  } finally { await browser.close(); }
});

test("blank A5 request keeps header, eight rows and signature dates inside the page", async (t) => {
  const executablePath = findBrowserExecutable();
  if (!executablePath) return t.skip("No local Chromium available for layout verification");
  const source = readFileSync("src/app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx", "utf8");
  const article = source.slice(source.indexOf('<article className="issue-request-page">'), source.indexOf("</article></div>", source.indexOf('<article className="issue-request-page">')) + 10);
  const headerCss = readFileSync("src/components/company-document-header.module.css", "utf8").replace(/\.([a-zA-Z]+)/g, ".test__$1");
  const css = readFileSync("src/app/(dashboard)/inventory/issues/_components/stock-issue-theme.css", "utf8");
  // Render the production JSX, with a representative company header using its real stylesheet.
  const header = `<header class="test__header test__standard test__companyOnly"><div class="test__brand"><img class="test__logo" src="/logo/origin-clean.png"></div><div class="test__identity"><strong>บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด (สำนักงานใหญ่)</strong><span>96/55 หมู่ที่ 1 ตำบลสามโคก อำเภอสามโคก จังหวัดปทุมธานี 12160</span><span>เลขประจำตัวผู้เสียภาษี: 0105554050661</span><span>โทรศัพท์: 021-473478</span></div></header>`;
  const compiled = ts.transpileModule(`module.exports = ${article}`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  const require = createRequire(import.meta.url);
  const React = require("react");
  runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require, documentContext: {}, getStockRequestLineNumbers, CompanyDocumentHeader: () => React.createElement("div", { dangerouslySetInnerHTML: { __html: header } }) });
  const markup = require("react-dom/server").renderToStaticMarkup(compiledModule.exports).replace(`<div>${header}</div>`, header);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 840, height: 600 });
    await page.setContent(inlineLocalAssets(`<style>body{margin:0}*{box-sizing:border-box} ${headerCss} ${css}</style><div class="issue-request-print-root">${markup}</div>`));
    const bounds = await page.evaluate(() => {
      const page = document.querySelector(".issue-request-page")!;
      const header = page.querySelector("header")!;
      return { height: header.getBoundingClientRect().height, bottom: page.getBoundingClientRect().bottom,
        rows: page.querySelectorAll("tbody tr").length,
        contentBottom: Math.max(...Array.from(page.querySelectorAll(".issue-request-bottom, .issue-request-bottom *")).map((node) => node.getBoundingClientRect().bottom)) };
    });
    assert.equal(bounds.rows, 8);
    assert.ok(bounds.height <= 19 * 96 / 25.4, `A5 header is too tall: ${bounds.height}px`);
    assert.ok(bounds.contentBottom <= bounds.bottom, `Footer clipped by ${bounds.contentBottom - bounds.bottom}px`);
    if (process.env.STOCK_REQUEST_SCREENSHOT) await page.screenshot({ path: process.env.STOCK_REQUEST_SCREENSHOT });
  } finally {
    await browser.close();
  }
});
