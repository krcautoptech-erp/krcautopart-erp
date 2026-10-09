import assert from "node:assert/strict";
import test from "node:test";
import {
  canOpenSignatureSetupStep,
  getAuthenticatorSetupHref,
  getTotpFriendlyName,
  getUnverifiedTotpFactorIds,
  getTotpQrCodeSrc,
  getMfaErrorMessage,
  getSignatureSetupStep,
  getStepAfterAuthenticatorSetup,
  isTotpCodeComplete,
  normalizeTotpCode,
  selectVerifiedTotpFactor,
} from "./mfa.ts";

test("allows only TOTP authenticator setup links", () => {
  assert.equal(
    getAuthenticatorSetupHref("otpauth://totp/KRC%20ERP:user?secret=ABC123"),
    "otpauth://totp/KRC%20ERP:user?secret=ABC123",
  );
  assert.equal(getAuthenticatorSetupHref("https://example.com"), null);
  assert.equal(getAuthenticatorSetupHref("javascript:alert(1)"), null);
});

test("builds a unique internal TOTP factor name without changing the issuer", () => {
  assert.equal(getTotpFriendlyName("setup-123"), "KRC ERP setup-123");
});

test("selects only unfinished TOTP factors for cleanup", () => {
  assert.deepEqual(
    getUnverifiedTotpFactorIds([
      { id: "unfinished", status: "unverified" },
      { id: "ready", status: "verified" },
    ]),
    ["unfinished"],
  );
});

test("encodes only the SVG payload in a Supabase TOTP QR data URI", () => {
  const svg = "<?xml version='1.0'?>\n<svg xmlns='http://www.w3.org/2000/svg'>\n</svg>\n";
  const qrCode = `data:image/svg+xml;utf-8,${svg}`;

  assert.equal(
    getTotpQrCodeSrc(qrCode),
    `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`,
  );
});

test("normalizes an authenticator code to six ASCII digits", () => {
  assert.equal(normalizeTotpCode("12 3a4567"), "123456");
  assert.equal(normalizeTotpCode("๑๒๓456"), "456");
  assert.equal(isTotpCodeComplete("123456"), true);
  assert.equal(isTotpCodeComplete("12345"), false);
});

test("selects the next signature setup step", () => {
  assert.equal(
    getSignatureSetupStep({ hasSignature: false, hasVerifiedAuthenticator: true }),
    1,
  );
  assert.equal(
    getSignatureSetupStep({ hasSignature: true, hasVerifiedAuthenticator: false }),
    2,
  );
  assert.equal(
    getSignatureSetupStep({ hasSignature: true, hasVerifiedAuthenticator: true }),
    3,
  );
});

test("lets users set up their own authenticator before saving a signature", () => {
  assert.equal(canOpenSignatureSetupStep(1, false), true);
  assert.equal(canOpenSignatureSetupStep(2, false), true);
  assert.equal(canOpenSignatureSetupStep(3, false), false);
  assert.equal(canOpenSignatureSetupStep(3, true), true);
  assert.equal(getStepAfterAuthenticatorSetup(false), 1);
  assert.equal(getStepAfterAuthenticatorSetup(true), 3);
});

test("returns safe Thai MFA errors without exposing upstream details", () => {
  assert.equal(
    getMfaErrorMessage({ code: "mfa_verification_failed" }),
    "รหัสยืนยันไม่ถูกต้อง กรุณาตรวจสอบรหัสล่าสุดแล้วลองอีกครั้ง",
  );
  assert.equal(
    getMfaErrorMessage({ code: "mfa_challenge_expired" }),
    "รหัสยืนยันหมดเวลา กรุณาเริ่มการเชื่อมต่อใหม่",
  );
  assert.equal(
    getMfaErrorMessage({ code: "unknown", message: "secret-internal-detail" }),
    "ไม่สามารถตั้งค่า Authenticator ได้ กรุณาลองอีกครั้ง",
  );
});

test("selects only the verified TOTP factor requested for a sensitive action", () => {
  const factors = [
    { id: "phone-a", status: "verified" },
    { id: "phone-b", status: "verified" },
    { id: "unfinished", status: "unverified" },
  ];
  assert.deepEqual(selectVerifiedTotpFactor(factors, "phone-b"), factors[1]);
  assert.equal(selectVerifiedTotpFactor(factors, "unfinished"), null);
  assert.equal(selectVerifiedTotpFactor(factors, "unknown"), null);
});
