import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260927154837_add_goods_receipt_supplier_documents.sql", import.meta.url),
  "utf8",
).toLowerCase();
const action = readFileSync(new URL("../app/actions/inventory.ts", import.meta.url), "utf8");
const form = readFileSync(
  new URL("../app/(dashboard)/purchase/receipts/_components/receipt-create-modal.tsx", import.meta.url),
  "utf8",
);
const print = readFileSync(
  new URL("../app/(dashboard)/purchase/receipts/_components/gr-print-preview-modal.tsx", import.meta.url),
  "utf8",
);

test("GR supplier documents are validated, duplicate-aware, and saved atomically", () => {
  assert.match(migration, /add column if not exists supplier_document_type text/);
  assert.match(migration, /add column if not exists supplier_document_date date/);
  assert.match(migration, /delivery_note[\s\S]*tax_invoice[\s\S]*delivery_note_tax_invoice[\s\S]*other/);
  assert.match(migration, /p_supplier_document_type is null or p_supplier_document_type not in/);
  assert.match(migration, /duplicate_supplier_document/);
  assert.match(migration, /p_allow_duplicate boolean/);
  assert.match(migration, /request_key is distinct from p_request_key/);
  assert.match(migration, /revoke all on function public\.post_goods_receipt\(bigint, date, text, text, jsonb, uuid\)/);
});

test("GR form captures and prints supplier document metadata without attachments", () => {
  assert.match(action, /supplierDocumentType:/);
  assert.match(action, /supplierDocumentDate:/);
  assert.match(action, /p_supplier_document_type:/);
  assert.match(action, /p_supplier_document_date:/);
  assert.match(form, /ประเภทเอกสารผู้ขาย/);
  assert.match(form, /วันที่เอกสารผู้ขาย/);
  assert.match(form, /ConfirmModal/);
  assert.match(print, /supplier_document_type/);
  assert.match(print, /supplier_document_date/);
  assert.doesNotMatch(form, /type=["']file["']/);
});

