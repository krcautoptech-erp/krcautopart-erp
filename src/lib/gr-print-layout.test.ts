import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import puppeteer from "puppeteer-core";
import ts from "typescript";
import { findBrowserExecutable, inlineLocalAssets } from "./server-pdf.ts";
import { getGoodsReceiptPrintRowLimit } from "./goods-receipts.ts";

test("GR A5 paginates seventeen items into eight, eight and one without losing items", () => {
  const source = readFileSync("src/app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx", "utf8");
  const pagination = source.slice(source.indexOf("function paginateItems"), source.indexOf("function formatQuantity"));
  const capacity = source.match(/const itemsPerPage = [^;]+;/)![0];
  const result = runInNewContext(ts.transpileModule(`${pagination}\nconst pageSize = "A5", rowsPerPage = 8; ${capacity}\nJSON.stringify(paginateItems(Array.from({length:17}, (_,i)=>i), itemsPerPage));`, {}).outputText);
  const pages = JSON.parse(result);
  assert.deepEqual(pages.map((page: number[]) => page.length), [8, 8, 1]);
  assert.deepEqual(pages.flat(), Array.from({ length: 17 }, (_, i) => i));
});

test("GR A4 paginates forty-nine items without losing lines", () => {
  const source = readFileSync("src/app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx", "utf8");
  const pagination = source.slice(source.indexOf("function paginateItems"), source.indexOf("function formatQuantity"));
  const capacity = source.match(/const itemsPerPage = [^;]+;/)![0];
  const code = `${pagination}\nconst rowsPerPage = 24; ${capacity}\nJSON.stringify(paginateItems(Array.from({length:49}, (_,i)=>i), itemsPerPage));`;
  const pages = JSON.parse(runInNewContext(ts.transpileModule(code, {}).outputText));
  assert.deepEqual(pages.map((page: number[]) => page.length), [24, 24, 1]);
  assert.deepEqual(pages.flat(), Array.from({ length: 49 }, (_, i) => i));
});

test("A4 keeps a full-height grid with one item or no items without counting blank rows", () => {
  const source = readFileSync("src/app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx", "utf8");
  const start = source.indexOf("const filledRows =");
  const expression = source.slice(start, source.indexOf(";", start) + 1);
  for (const pageItems of [[], [{ id: 1 }]]) {
    const rows = runInNewContext(ts.transpileModule(`${expression}\nfilledRows;`, {}).outputText, { pageSize: "A4", pageItems, itemsPerPage: 24 });
    assert.equal(rows.length, 24);
    assert.equal(rows.filter(Boolean).length, pageItems.length);
  }
});

for (const pageSize of ["A5", "A4"] as const) test(`GR ${pageSize} fits its rows, totals and unboxed signatures in screen and print`, { timeout: 15000 }, async (t) => {
  const rowCount = pageSize === "A4" ? 24 : 8;
  const executablePath = findBrowserExecutable();
  if (!executablePath) return t.skip("No local Chromium available");
  const source = readFileSync("src/app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx", "utf8");
  const start = source.indexOf('<article className={`gr-print-page');
  const article = source.slice(start, source.indexOf("</article>", start) + 10);
  const css = source.slice(source.indexOf("<style jsx global>{`") + "<style jsx global>{`".length, source.lastIndexOf("`}</style>"))
    .replace(/\$\{pageSize === "A4"[^}]+\}/g, pageSize === "A4" ? "210mm 297mm" : "210mm 148mm");
  const moduleCss = (name: string) => readFileSync(`src/components/company-document-${name}.module.css`, "utf8")
    .replace(/\.([a-zA-Z]+)/g, `.company-document-${name}-module__test__$1`);
  const h = "company-document-header-module__test__";
  const f = "company-document-footer-module__test__";
  const header = `<header class="${h}header"><div class="${h}brand"><img class="${h}logo" src="/logo/origin-clean.png"></div><div class="${h}identity"><strong>บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด (สำนักงานใหญ่)</strong><span>96/55 หมู่ที่ 1 ตำบลสามโคก อำเภอสามโคก จังหวัดปทุมธานี 12160</span><span>เลขประจำตัวผู้เสียภาษี: 0105554050661</span><span>โทรศัพท์: 021-473478</span></div><div class="${h}summary"><div class="${h}title"><b>GOODS RECEIPT</b><span>ใบรับสินค้า (GR)</span></div><dl class="${h}meta"><div><dt>เลขที่ GR</dt><dd>GR26100001</dd></div><div><dt>วันที่</dt><dd>09/10/2026</dd></div></dl></div></header>`;
  const footer = `<footer class="gr-document-footer ${f}footer ${f}placementPage ${f}variantStandard"><div class="${f}left"><span>เอกสารสร้างโดยระบบอัตโนมัติ (KRC ERP)</span><span>พิมพ์เมื่อ: 13/10/69 08:31</span></div><span>หน้า 1 / 1</span></footer>`;
  const require = createRequire(import.meta.url);
  const React = require("react");
  const compiledModule = { exports: {} };
  const sampleItems = [
    ["RM017", "2.0×57×1220 SPHC-P/O (16278-851YN-08)", 11],
    ["RM002", "1.2×76×1220 SPCC (16025-851YL-3)", 20],
    ["RM003", "2.0×108×1220 SAPH440 (14053-01)", 15],
    ["RM018", "1.6×90×1220 SPCC (16025-852YL-3)", 8],
    ["RM021", "2.3×120×1220 SPHC-P/O", 12],
    ["RM025", "3.2×150×1220 SAPH440", 10],
    ["RM031", "1.0×80×1220 SPCC", 6],
    ["RM048", "2.0×86×1220 SPHC-P/O (16268-964YL-02)", 18],
    ["RM052", "1.6×100×1220 SPCC", 14],
    ["RM057", "2.3×125×1220 SAPH440", 9],
    ["RM061", "2.0×200×1220 SPCC", 7],
    ["RM065", "1.2×150×1220 SPHC-P/O", 13],
    ["RM070", "3.0×100×1220 SAPH440 (14053-02)", 11],
    ["RM074", "1.6×120×1220 SPCC", 16],
    ["RM078", "2.0×75×1220 SPHC-P/O", 12],
    ["RM082", "2.5×150×1220 SAPH440", 8],
    ["RM086", "1.6×180×1220 SPCC", 10],
    ["RM090", "2.0×160×1220 SPHC-P/O", 9],
    ["RM094", "3.0×120×1220 SAPH440", 6],
    ["RM098", "1.2×200×1220 SPCC (16025-851YL-1)", 15],
    ["RM102", "2.3×90×1220 SPHC-P/O", 7],
    ["RM106", "1.6×140×1220 SPCC", 11],
    ["RM110", "3.2×100×1220 SAPH440", 5],
    ["RM114", "2.0×180×1220 SPCC", 4],
  ];
  const items = Array.from({ length: rowCount }, (_, index) => {
    const [code, name, quantity] = sampleItems[index];
    return { id: index, item_code: code, item_name: name, tracking_method: index === 0 ? "lot" : "none", vendor_lot_no: index === 0 ? "LOT261009" : null, quantity_ordered: quantity, quantity_received: quantity, unit_name: "แผ่น" };
  });
  const compiled = ts.transpileModule(`module.exports = ${article}`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports, require,
    pageSize, pageIndex: 0, itemsPerPage: rowCount, isLastPage: true, pages: [[]], printedAt: new Date(), documentContext: {},
    detail: { vendor_name: "ห้างหุ้นส่วนจำกัด เพ็ชรดี เอ็นจิเนียริ่ง", vendor_address: "49/138-139 หมู่ที่ 14 หนองแขม กรุงเทพมหานคร 10160", po_number: "PO26100015", delivery_note_no: "DN26100001", supplier_document_date: "09/10/2026", remarks: "ตรวจรับครบตามใบส่งของ" },
    pageItems: items,
    quantityTotals: [{ unit: "แผ่น", quantity: pageSize === "A4" ? 272 : 100 }],
    filledRows: items,
    formatDisplayDate: (value: string) => value, formatPrintedAt: () => "13/10/69", formatQuantity: String, supplierDocumentTypeLabel: () => "ใบส่งของ",
    CompanyDocumentHeader: () => React.createElement("div", { dangerouslySetInnerHTML: { __html: header } }),
    CompanyDocumentFooter: () => React.createElement("div", { dangerouslySetInnerHTML: { __html: footer } }),
  });
  const markup = require("react-dom/server").renderToStaticMarkup(compiledModule.exports)
    .replace(`<div>${header}</div>`, header).replace(`<div>${footer}</div>`, footer);
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: pageSize === "A4" ? 1123 : 560, deviceScaleFactor: 2 });
    const widths = [4, 5, 11, 12, 13, 15, 49, 50, 6, 9, 10].map((width) => `[class~="w-[${width}%]"]{width:${width}%}`).join("");
    const fontCss = readFileSync("src/app/globals.css", "utf8").match(/@font-face\s*\{[^}]+\}/g)!.join("\n");
    const html = `<style>${fontCss}*{box-sizing:border-box}:root{--font-inter:"Sarabun"}body{margin:0}table td,table th{line-height:1.5}${widths} ${moduleCss("header")} ${moduleCss("footer")} ${css}</style><div class="gr-print-root">${markup}</div>`;
    if (process.env.GR_LAYOUT_HTML) console.log(`GR_LAYOUT_HTML:${JSON.stringify(html)}`);
    await page.setContent(inlineLocalAssets(html));
    await page.evaluate(() => document.fonts.ready);
    for (const media of ["screen", "print"] as const) {
      await page.emulateMediaType(media);
      await page.evaluate(() => document.body.className = "printing-goods-receipt");
      const bounds = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
        const signature = document.querySelector(".gr-signature-box")!;
        return { header: rect("header"), refs: rect(".gr-ref-table"), box: rect(".gr-ref-info"), table: rect(".gr-table"), signatures: rect(".gr-signatures"), footer: rect("footer"), paper: rect("article"), rows: document.querySelectorAll(".gr-table tbody tr").length, total: document.querySelector(".gr-table tfoot")?.textContent, border: getComputedStyle(signature).borderTopWidth, quantityColor: getComputedStyle(document.querySelector(".gr-cell-number.text-primary-dark")!).color };
      });
      if (process.env.GR_LAYOUT_SCREENSHOT) await page.screenshot({ path: process.env.GR_LAYOUT_SCREENSHOT.replace(".png", `-${pageSize}.png`) });
      assert.equal(bounds.rows, rowCount);
      assert.match(bounds.total ?? "", pageSize === "A4" ? /272/ : /100/);
      assert.equal(bounds.border, "0px");
      assert.equal(bounds.quantityColor, "rgb(0, 0, 0)");
      assert.ok(bounds.refs.bottom <= bounds.box.bottom, `${media}: references overflow their box`);
      assert.ok(bounds.refs.bottom <= bounds.table.top, `${media}: references overlap item rows`);
      assert.ok(bounds.signatures.bottom <= bounds.footer.top, `${media}: signatures overlap footer: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.footer.bottom <= bounds.paper.bottom, `${media}: footer exceeds paper`);
    }

    // Exercise the production font-ready measurement on genuinely expanded table rows.
    await page.emulateMediaType("screen");
    await page.evaluate(() => document.querySelectorAll(".gr-name-clamp").forEach((node) => { node.textContent = "รายละเอียดสินค้าและข้อมูลติดตามยาวมาก ".repeat(12); }));
    const effectSource = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[(?:a5RowsPerPage|rowsPerPage), detail, pageSize\]\);/)![0];
    const effectCode = ts.transpileModule(effectSource, {}).outputText;
    const nextCapacity = await page.evaluate(({ code, helper, size, capacity }) => new Promise<number>((resolve) => {
      const run = new Function("useEffect", "pageSize", "printRootRef", "rowsPerPage", "detail", "getGoodsReceiptPrintRowLimit", "setRowsPerPage", "setLayoutOverflow", "setLayoutReady", code);
      run((callback: () => void) => callback(), size, { current: document.querySelector(".gr-print-root") }, capacity, {}, new Function(`return (${helper})`)(), resolve, () => {}, () => {});
    }), { code: effectCode, helper: getGoodsReceiptPrintRowLimit.toString(), size: pageSize, capacity: rowCount });
    assert.equal(nextCapacity, rowCount - 1, "long content must trigger repagination instead of clipping");
  } finally { await browser.close(); }
});
