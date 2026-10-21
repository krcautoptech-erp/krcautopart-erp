import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createExcelBlob, type SpreadsheetCell, XLSX_MIME } from "./spreadsheet-export.ts";

function exporter(response: Response) {
  const delivered: { blob: Blob; filename: string }[] = [];
  const errors: string[] = [];
  const compiledModule = { exports: {} as {
    exportSpreadsheetUrl: (url: string) => Promise<void>;
    exportExcelFile: (rows: SpreadsheetCell[][], filename: string, sheetName: string) => Promise<void>;
  } };
  const code = ts.transpileModule(readFileSync("src/lib/spreadsheet-delivery.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    module: compiledModule, exports: compiledModule.exports,
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url, "/reports/export");
      assert.equal(options.credentials, "same-origin");
      return response;
    },
    console: { error() {} },
    require: (name: string) => name.includes("spreadsheet-export") ? { createExcelBlob } : name.includes("toast") ? { toast: { error: (message: string) => errors.push(message) } } : {
      createBrowserFileDeliveryAdapter: () => ({}),
      deliverFileBlob: async (blob: Blob, filename: string) => { delivered.push({ blob, filename }); },
    },
  });
  return { delivered, errors, run: () => compiledModule.exports.exportSpreadsheetUrl("/reports/export"), runExcel: compiledModule.exports.exportExcelFile };
}

test("central Excel export delivers genuine XLSX bytes and reports generation failures without delivery", async () => {
  const result = exporter(new Response());
  await result.runExcel([["รหัส", "จำนวน"], ["001", 12]], "รายการ.xlsx", "รายการ");
  assert.equal(result.errors.length, 0);
  assert.equal(result.delivered.length, 1);
  assert.equal(result.delivered[0].filename, "รายการ.xlsx");
  assert.equal(result.delivered[0].blob.type, XLSX_MIME);
  assert.deepEqual(Array.from(new Uint8Array(await result.delivered[0].blob.arrayBuffer()).slice(0, 4)), [80, 75, 3, 4]);
  await result.runExcel([[Number.NaN]], "invalid.xlsx", "ข้อมูล");
  assert.equal(result.errors.length, 1);
  assert.equal(result.delivered.length, 1);
});

test("report export fetches spreadsheet bytes and preserves the download filename without navigation", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4]);
  for (const disposition of ['attachment; filename="report.xlsx"', "attachment; filename*=UTF-8''%E0%B9%83%E0%B8%9A.xlsx"]) {
    const result = exporter(new Response(bytes, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": disposition } }));
    await result.run();
    assert.equal(result.errors.length, 0);
    assert.equal(result.delivered.length, 1);
    assert.equal(result.delivered[0].filename, disposition.includes("UTF-8") ? "ใบ.xlsx" : "report.xlsx");
    assert.deepEqual(new Uint8Array(await result.delivered[0].blob.arrayBuffer()), bytes);
  }
});

test("expired-session HTML and failed report responses are not shared as spreadsheets", async () => {
  for (const response of [new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), new Response("failure", { status: 500, headers: { "content-type": "application/vnd.ms-excel" } })]) {
    const result = exporter(response);
    await result.run();
    assert.equal(result.delivered.length, 0);
    assert.equal(result.errors.length, 1);
  }
});
