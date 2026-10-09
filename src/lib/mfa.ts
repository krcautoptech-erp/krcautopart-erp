export type SignatureSetupStep = 1 | 2 | 3;

export const getTotpFriendlyName = (nonce: string) => `KRC ERP ${nonce}`;

export function canOpenSignatureSetupStep(
  step: SignatureSetupStep,
  hasSignature: boolean,
) {
  return step !== 3 || hasSignature;
}

export function getStepAfterAuthenticatorSetup(hasSignature: boolean): SignatureSetupStep {
  return hasSignature ? 3 : 1;
}

export function getAuthenticatorSetupHref(uri: string | null) {
  return uri?.startsWith("otpauth://totp/") ? uri : null;
}

export function getTotpQrCodeSrc(qrCode: string) {
  const prefix = "data:image/svg+xml;utf-8,";
  return `${prefix}${encodeURIComponent(qrCode.slice(prefix.length))}`;
}

export function getUnverifiedTotpFactorIds(
  factors: Array<{ id: string; status: string }>,
) {
  return factors
    .filter((factor) => factor.status === "unverified")
    .map((factor) => factor.id);
}

export function selectVerifiedTotpFactor<T extends { id: string; status: string }>(
  factors: T[],
  requestedId: string,
) {
  return factors.find(
    (factor) => factor.id === requestedId && factor.status === "verified",
  ) ?? null;
}

export function normalizeTotpCode(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 6);
}

export function isTotpCodeComplete(value: string) {
  return /^[0-9]{6}$/.test(value);
}

export function getSignatureSetupStep({
  hasSignature,
  hasVerifiedAuthenticator,
}: {
  hasSignature: boolean;
  hasVerifiedAuthenticator: boolean;
}): SignatureSetupStep {
  if (!hasSignature) return 1;
  return hasVerifiedAuthenticator ? 3 : 2;
}

export function getMfaErrorMessage(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "mfa_verification_failed":
      return "รหัสยืนยันไม่ถูกต้อง กรุณาตรวจสอบรหัสล่าสุดแล้วลองอีกครั้ง";
    case "mfa_challenge_expired":
      return "รหัสยืนยันหมดเวลา กรุณาเริ่มการเชื่อมต่อใหม่";
    case "mfa_totp_enroll_not_enabled":
      return "โครงการ Supabase ยังไม่ได้เปิดใช้งาน TOTP กรุณาติดต่อผู้ดูแลระบบ";
    case "mfa_factor_name_conflict":
      return "มี Authenticator ชื่อนี้อยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ";
    default:
      return "ไม่สามารถตั้งค่า Authenticator ได้ กรุณาลองอีกครั้ง";
  }
}
