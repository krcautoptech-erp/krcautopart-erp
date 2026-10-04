import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260924103043_approval_policy_settings.sql", import.meta.url),
  "utf8",
);
const screen = readFileSync(
  new URL("../app/(dashboard)/settings/signature-approval/signature-approval-settings.tsx", import.meta.url),
  "utf8",
);
const enforcementMigration = readFileSync(
  new URL("../../supabase/migrations/20260924105747_enforce_approval_policy_workflows.sql", import.meta.url),
  "utf8",
);
const signatureCaptureMigration = readFileSync(
  new URL("../../supabase/migrations/20260924110841_capture_po_approval_signature.sql", import.meta.url),
  "utf8",
);
const purchaseOrderPrint = readFileSync(
  new URL("./purchase-order-print.ts", import.meta.url),
  "utf8",
);

test("approval policies are permission-gated, require aal2, and write audit history", () => {
  assert.match(migration, /approval_policy\.manage/);
  assert.match(migration, /auth\.jwt\(\)\s*->>\s*'aal'[\s\S]*'aal2'/);
  assert.match(migration, /insert into public\.approval_policy_audit_logs/);
  assert.match(migration, /revoke all on function public\.save_approval_policies\(jsonb\) from public, anon/);
});

test("policy screen reuses shared controls and names operational review clearly", () => {
  assert.match(screen, /DataTableFrame/);
  assert.match(screen, /ActiveStatusBadge/);
  assert.match(screen, /ToggleSwitch/);
  assert.match(screen, /ตรวจสอบความพร้อมก่อนออก PO/);
  assert.match(screen, /นโยบายการอนุมัติ/);
});

test("live PO and PR workflows enforce their configured policies in the database", () => {
  assert.match(enforcementMigration, /enforce_approval_policy/);
  assert.match(enforcementMigration, /approval_mfa_required/);
  assert.match(enforcementMigration, /decide_purchase_order_without_policy/);
  assert.match(enforcementMigration, /decide_purchase_requisition_without_policy/);
  assert.match(enforcementMigration, /set is_active = false/);
  assert.match(enforcementMigration, /policy_code not in \('po\.approve', 'pr\.review'\)/);
});

test("PO approval captures the exact signature version used by the printable document", () => {
  assert.match(signatureCaptureMigration, /approval_signature_id/);
  assert.match(signatureCaptureMigration, /approval_signature_sha256/);
  assert.match(signatureCaptureMigration, /approval_signature_required/);
  assert.match(purchaseOrderPrint, /approverSignatureUrl/);
});
