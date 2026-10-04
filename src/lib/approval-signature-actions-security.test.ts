import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("signature reads and writes authorize the dedicated permission on the server", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "app", "actions", "approval-signatures.ts"),
    "utf8",
  );
  const checks = source.match(/requested_permission: "approval_signature\.manage"/g) ?? [];

  assert.equal(checks.length, 2);
  assert.ok(
    source.lastIndexOf('requested_permission: "approval_signature.manage"') <
      source.indexOf("entry.arrayBuffer()"),
    "write authorization must happen before reading the uploaded file",
  );
});

test("replacing an active signature requires a fresh server-side TOTP challenge", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "app", "actions", "approval-signatures.ts"),
    "utf8",
  );
  const replacementCheck = source.indexOf('.is("revoked_at", null)');
  const verification = source.indexOf("supabase.auth.mfa.challengeAndVerify");
  const fileRead = source.indexOf("entry.arrayBuffer()");

  assert.match(source, /formData\.get\("totpCode"\)/);
  assert.ok(replacementCheck > 0, "the server must detect an active signature");
  assert.ok(
    verification > replacementCheck && verification < fileRead,
    "fresh TOTP verification must run before reading or uploading the replacement",
  );
});

test("the signature screen treats the persisted version as an existing signature", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "(dashboard)",
      "settings",
      "signature-approval",
      "signature-approval-settings.tsx",
    ),
    "utf8",
  );

  assert.match(
    source,
    /const hasSavedSignature = initialData\.version > 0 \|\| signatureSaved/,
  );
  assert.match(source, /if \(hasSavedSignature\) \{[\s\S]*setReplacementBlob\(blob\)/);
});
