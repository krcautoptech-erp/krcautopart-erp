import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("signature history is permission-gated and immutable through the Data API", () => {
  const migrationDir = path.join(process.cwd(), "supabase", "migrations");
  const filename = readdirSync(migrationDir).find((name) =>
    name.endsWith("_secure_approval_signature_management.sql"),
  );

  assert.ok(filename, "security migration is missing");
  const sql = readFileSync(path.join(migrationDir, filename), "utf8");

  assert.match(sql, /approval_signature\.manage/);
  assert.match(sql, /drop policy if exists "Users create their own approval signatures"/);
  assert.match(sql, /drop policy if exists "Users revoke their own approval signatures"/);
  assert.match(sql, /if not public\.authorize\('approval_signature\.manage'\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /not exists\s*\(\s*select 1\s*from public\.user_approval_signatures/);
});

test("the signature RPC rejects replacements without a recent TOTP claim", () => {
  const migrationDir = path.join(process.cwd(), "supabase", "migrations");
  const filename = readdirSync(migrationDir).find((name) =>
    name.endsWith("_enforce_fresh_mfa_signature_replacement.sql"),
  );

  assert.ok(filename, "fresh-MFA migration is missing");
  const sql = readFileSync(path.join(migrationDir, filename), "utf8");

  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /jsonb_path_query_first[\s\S]*\$\.amr\[0\]/);
  assert.match(sql, /method'[\s\S]*totp/);
  assert.match(sql, /timestamp'[\s\S]*300/);
  assert.match(sql, /add column if not exists mfa_verified_at/);
  assert.match(sql, /last_used_mfa_at[\s\S]*latest_mfa_at/);
  assert.match(sql, /fresh_mfa_required/);
});
