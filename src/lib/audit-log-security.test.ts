import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260930150101_create_system_audit_log.sql", import.meta.url),
  "utf8",
);

test("audit log is permission-gated, append-only, and redacts secrets", () => {
  assert.match(migration, /public\.authorize\('audit_logs\.view'\)/);
  assert.match(migration, /revoke insert, update, delete, truncate on public\.system_audit_logs/);
  assert.match(migration, /password_hash/);
  assert.match(migration, /access_token/);
  assert.match(migration, /record_audit_log_access/);
});
