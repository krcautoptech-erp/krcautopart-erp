import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("PO printing reads only referenced approval signatures through the user session", () => {
  const action = readFileSync(
    path.join(process.cwd(), "src", "app", "actions", "purchase-orders.ts"),
    "utf8",
  );
  const migrationDir = path.join(process.cwd(), "supabase", "migrations");
  const filename = readdirSync(migrationDir).find((name) =>
    name.endsWith("_allow_po_signature_printing.sql"),
  );

  assert.doesNotMatch(action, /createAdminClient/);
  assert.match(action, /supabase\.storage\s*\.from\(SIGNATURE_BUCKET\)/);
  assert.ok(filename, "PO signature printing RLS migration is missing");

  const sql = readFileSync(path.join(migrationDir, filename), "utf8");
  assert.match(sql, /public\.authorize\('po\.view'\)/);
  assert.match(sql, /approval_signature_id\s*=\s*signature\.id/);
  assert.match(sql, /signature\.storage_path\s*=\s*storage\.objects\.name/);
});
