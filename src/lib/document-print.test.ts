import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DOCUMENT_DIMENSIONS,
  buildBatchDocumentHtml,
  buildDocumentPrintCss,
  buildStandardFontFaceCss,
} from "./document-print.ts";

test("provides ISO physical dimensions for A4, A5, letter", () => {
  assert.equal(DOCUMENT_DIMENSIONS.A4.portrait.widthMm, 210);
  assert.equal(DOCUMENT_DIMENSIONS.A4.portrait.heightMm, 297);
  assert.equal(Math.round(DOCUMENT_DIMENSIONS.A4.portrait.widthPt), 595);
  assert.equal(Math.round(DOCUMENT_DIMENSIONS.A4.portrait.heightPt), 842);

  assert.equal(DOCUMENT_DIMENSIONS.A5.landscape.widthMm, 210);
  assert.equal(DOCUMENT_DIMENSIONS.A5.landscape.heightMm, 148);
});

test("builds standard font face CSS with Sarabun, Noto Sans Thai and Inter", () => {
  const fontCss = buildStandardFontFaceCss();
  assert.ok(fontCss.includes("Sarabun"));
  assert.ok(fontCss.includes("Sarabun-Regular.ttf"));
  assert.ok(fontCss.includes("Noto Sans Thai"));
  assert.ok(fontCss.includes("NotoSansThai-Regular.ttf"));
  assert.ok(fontCss.includes("Inter"));
  assert.ok(fontCss.includes("font-display: swap"));
  assert.ok(!fontCss.includes("font-display: block"));
});

test("builds document print CSS with exact physical page rules", () => {
  const a4Css = buildDocumentPrintCss("A4", "portrait");
  assert.ok(a4Css.includes("@page"));
  assert.ok(a4Css.includes("size: A4 portrait"));
  assert.ok(a4Css.includes("margin: 0"));
  assert.ok(a4Css.includes("print-color-adjust: exact"));

  const a5Css = buildDocumentPrintCss("A5", "landscape");
  assert.ok(a5Css.includes("size: A5 landscape"));
});

test("loads every bundled Sarabun weight before opening the print dialog", () => {
  const source = readFileSync(new URL("./document-print.ts", import.meta.url), "utf8");
  assert.match(source, /\[400, 500, 600, 700\]\.map/);
  assert.match(source, /frameDocument\.fonts\.load/);
  assert.match(source, /รายงานสรุปยอดซื้อ KRC 0123456789/);
});

test("enforces Printlogic.md typography and fragmentation standards", () => {
  const css = buildDocumentPrintCss("A4", "portrait");
  // Check font-synthesis: none (prevents blurry synthetic bold)
  assert.ok(css.includes("font-synthesis: none !important"));
  // Check repeating table headers
  assert.ok(css.includes("thead"));
  assert.ok(css.includes("display: table-header-group !important"));
  // Check table row break avoidance
  assert.ok(css.includes("break-inside: avoid !important"));
  // Check signature and keep-together rules
  assert.ok(css.includes(".signature-block"));
  assert.ok(css.includes(".keep-together"));
});

test("uses one footer placement contract for printable documents and reports", () => {
  const footerCss = readFileSync(new URL("../components/company-document-footer.module.css", import.meta.url), "utf8");
  const footerSource = readFileSync(new URL("../components/company-document-footer.tsx", import.meta.url), "utf8");
  assert.match(footerCss, /\.placementPage[\s\S]*position:\s*absolute/);
  assert.match(footerCss, /\.placementReport[\s\S]*position:\s*fixed/);
  assert.match(footerCss, /bottom:\s*var\(--document-footer-bottom, 3mm\)/);
  assert.match(footerCss, /left:\s*var\(--document-page-padding-inline, 6mm\)/);
  assert.doesNotMatch(footerCss, /\.footer\s*\{[^}]*width:\s*100%/);
  assert.match(footerSource, /className=\{styles\.printMeta\} suppressHydrationWarning/);

  const sources = [
    "../app/(dashboard)/purchase/pr/_components/pr-print-preview-modal.tsx",
    "../app/(dashboard)/purchase/po/_components/po-print-preview-modal.tsx",
    "../app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx",
    "../app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx",
    "../app/(dashboard)/reports/purchase/pending-receipts/pending-receipts-report.tsx",
    "../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-report.tsx",
    "../app/(dashboard)/reports/inventory/stock-movements/stock-movement-report.tsx",
    "../app/(dashboard)/reports/inventory/stock-issues/stock-issue-report.tsx",
  ].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));

  assert.equal(sources.filter((source) => source.includes('placement="page"')).length, 4);
  assert.equal(sources.filter((source) => source.includes('placement="report"')).length, 4);
});

test("routes every document preview through the responsive shared shell", () => {
  const previewSources = [
    "../app/(dashboard)/purchase/pr/_components/pr-print-preview-modal.tsx",
    "../app/(dashboard)/purchase/po/_components/po-print-preview-modal.tsx",
    "../app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx",
    "../app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx",
  ].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));
  const shellSource = readFileSync(new URL("../components/document-preview-shell.tsx", import.meta.url), "utf8");
  const shellCss = readFileSync(new URL("../components/document-preview-shell.module.css", import.meta.url), "utf8");

  assert.ok(previewSources.every((source) => source.includes("DocumentPreviewShell")));
  assert.ok(previewSources.every((source) => !/zoom:\s*0\./.test(source)));
  assert.match(shellSource, /pointerType !== "touch"/);
  assert.match(shellSource, /window\.addEventListener\("resize", fitToPage\)/);
  assert.match(shellSource, /<PdfExportIcon size=\{27\}/);
  assert.match(shellSource, /<PdfExportIcon size=\{25\}/);
  assert.doesNotMatch(shellSource, /FileText/);
  assert.match(shellCss, /touch-action:\s*none/);
  assert.match(shellCss, /@media \(max-width:\s*760px\)/);
});

test("stock count print uses the shared print pipeline and fixed A4 footer layout", () => {
  const source = readFileSync(
    new URL("../app/(dashboard)/inventory/stock-counts/_components/stock-count-workspace.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../app/(dashboard)/inventory/stock-counts/_components/stock-count-visual.css", import.meta.url),
    "utf8",
  );

  assert.match(source, /printElement\(root/);
  assert.match(source, /blindPrintRootRef/);
  assert.match(source, /resultPrintRootRef/);
  assert.match(source, /<CompanyDocumentHeader[\s\S]*context=\{documentContext\}/);
  assert.match(source, /<CompanyDocumentFooter[\s\S]*placement="page"/);
  assert.match(source, /BlindCountSheet/);
  assert.match(source, /StockCountResultSheet/);
  assert.match(source, /พิมพ์ใบเดินนับ/);
  assert.match(source, /พิมพ์รายงานผล/);
  assert.doesNotMatch(source, /Cut-off Snapshot/);
  assert.match(css, /\.stock-count-sheet-signatures\s*\{[\s\S]*position:\s*absolute/);
  assert.doesNotMatch(css, /\.stock-count-sheet-table-wrap table\s*\{[\s\S]*height:\s*100%/);
});

test("builds batch document HTML with proper page break boundaries", () => {
  const docs = [
    { title: "PO-001", html: "<article>Doc 1</article>" },
    { title: "PO-002", html: "<article>Doc 2</article>" },
  ];

  const batchHtml = buildBatchDocumentHtml(docs);
  assert.ok(batchHtml.includes("Doc 1"));
  assert.ok(batchHtml.includes("Doc 2"));
  // First item has page-break-after: always
  assert.ok(batchHtml.includes("page-break-after: always !important"));
  // Last item has page-break-after: auto
  assert.ok(batchHtml.includes("page-break-after: auto !important"));
});

test("exports vector PDF functions handle filenames properly", async () => {
  const { exportHtmlPdf, exportElementPdf } = await import("./document-print.ts");
  assert.equal(typeof exportHtmlPdf, "function");
  assert.equal(typeof exportElementPdf, "function");

  // In Node environment without window/DOM, should resolve cleanly without crashing
  await assert.doesNotReject(async () => {
    await exportHtmlPdf("<p>test</p>", { filename: "PO-2026-001" });
  });
});

test("resolves paper configuration automatically for wide and portrait reports", async () => {
  const { resolveReportPaperConfig } = await import("./document-print.ts");
  // Wide reports default to landscape
  const stockMovement = resolveReportPaperConfig("stock-movement");
  assert.equal(stockMovement.paperSize, "A4");
  assert.equal(stockMovement.orientation, "landscape");

  const purchaseAnalysis = resolveReportPaperConfig("purchase-by-vendor");
  assert.equal(purchaseAnalysis.orientation, "portrait");

  // Normal reports default to portrait
  const pendingReceipts = resolveReportPaperConfig("pending-receipts");
  assert.equal(pendingReceipts.orientation, "portrait");

  // Unknown reports fallback to portrait
  const unknownReport = resolveReportPaperConfig("unknown-report-xyz");
  assert.equal(unknownReport.orientation, "portrait");
});

test("buildFullHtmlDocument produces standalone valid HTML with fonts and page rules", async () => {
  const { buildFullHtmlDocument } = await import("./document-print.ts");
  const html = buildFullHtmlDocument("<p>Test Body</p>", {
    title: "Test Doc",
    paperSize: "A4",
    orientation: "portrait",
  });
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("<title>Test Doc</title>"));
  assert.ok(html.includes("Sarabun"));
  assert.ok(html.includes("size: A4 portrait"));
  assert.ok(html.includes("<p>Test Body</p>"));
});

test("server-pdf renders true PDF buffer using available headless browser", async () => {
  const { findBrowserExecutable, renderHtmlToPdfBuffer } = await import("./server-pdf.ts");
  const browserPath = findBrowserExecutable();
  assert.ok(browserPath, "Headless browser executable must be found");

  const pdfBuffer = await renderHtmlToPdfBuffer("<html><body><h1>Test PDF</h1></body></html>", {
    paperSize: "A4",
    orientation: "portrait",
  });
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 1000);
  // PDF magic number header: %PDF-
  assert.equal(pdfBuffer.subarray(0, 4).toString(), "%PDF");
});
