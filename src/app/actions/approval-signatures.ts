"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  SIGNATURE_BUCKET,
  validateNormalizedSignature,
} from "@/lib/approval-signatures";
import {
  getMfaErrorMessage,
  isTotpCodeComplete,
  normalizeTotpCode,
  selectVerifiedTotpFactor,
} from "@/lib/mfa";
import { createClient } from "@/utils/supabase/server";

const SETTINGS_PATH = "/settings/signature-approval";

export type ApprovalSignatureSettings = {
  authenticatorFactors: Array<{ id: string; label: string }>;
  createdAt: string | null;
  displayName: string;
  hasVerifiedAuthenticator: boolean;
  history: Array<{
    createdAt: string;
    revokedAt: string | null;
    version: number;
  }>;
  positionName: string;
  signatureUrl: string | null;
  username: string;
  version: number;
};

export type ApprovalPolicy = {
  actionLabel: string;
  documentLabel: string;
  isActive: boolean;
  permissionCode: string;
  policyCode: string;
  thresholdAmount: number | null;
  verificationMethod: "single" | "mfa" | "conditional";
};

export async function getApprovalPolicies(): Promise<
  { canManage: boolean; data: ApprovalPolicy[] } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

  const [canView, canManage] = await Promise.all([
    supabase.rpc("authorize", { requested_permission: "approval_policy.view" }),
    supabase.rpc("authorize", { requested_permission: "approval_policy.manage" }),
  ]);
  if ((!canView.data && !canManage.data) || canView.error || canManage.error) {
    return { error: "คุณไม่มีสิทธิ์ดูนโยบายการอนุมัติ" };
  }

  const result = await supabase
    .from("approval_policies")
    .select("policy_code, document_label, action_label, permission_code, verification_method, threshold_amount, is_active")
    .in("policy_code", ["po.approve", "pr.review"])
    .order("policy_code");
  if (result.error) return { error: "ไม่สามารถโหลดนโยบายการอนุมัติได้" };

  return {
    canManage: Boolean(canManage.data),
    data: (result.data ?? []).map((item) => ({
      actionLabel: item.action_label,
      documentLabel: item.document_label,
      isActive: item.is_active,
      permissionCode: item.permission_code,
      policyCode: item.policy_code,
      thresholdAmount: item.threshold_amount === null ? null : Number(item.threshold_amount),
      verificationMethod: item.verification_method as ApprovalPolicy["verificationMethod"],
    })),
  };
}

export async function saveApprovalPoliciesAction(policies: ApprovalPolicy[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

  const permission = await supabase.rpc("authorize", {
    requested_permission: "approval_policy.manage",
  });
  if (permission.error || !permission.data) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขนโยบายการอนุมัติ" };
  }

  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    return { error: "กรุณายืนยัน Authenticator ก่อนบันทึกนโยบาย" };
  }

  const result = await supabase.rpc("save_approval_policies", {
    p_policies: policies.map((policy) => ({
      isActive: policy.isActive,
      policyCode: policy.policyCode,
      thresholdAmount: policy.thresholdAmount,
      verificationMethod: policy.verificationMethod,
    })),
  });
  if (result.error) return { error: "ไม่สามารถบันทึกนโยบายได้ กรุณาลองใหม่" };

  revalidatePath(SETTINGS_PATH);
  return { success: true as const };
}

export async function getApprovalSignatureSettings(): Promise<
  { data: ApprovalSignatureSettings } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

  const permission = await supabase.rpc("authorize", {
    requested_permission: "approval_signature.manage",
  });
  if (permission.error || !permission.data) {
    return { error: "คุณไม่มีสิทธิ์เข้าถึงการตั้งค่าลายเซ็นและการอนุมัติ" };
  }

  const [profileResult, signatureResult, factorsResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("username, first_name, last_name, position_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_approval_signatures")
      .select("version, storage_path, created_at, revoked_at")
      .eq("user_id", user.id)
      .order("version", { ascending: false }),
    supabase.auth.mfa.listFactors(),
  ]);

  if (profileResult.error) {
    return { error: "ไม่สามารถโหลดข้อมูลผู้ใช้งานได้ กรุณาลองใหม่" };
  }
  if (
    signatureResult.error &&
    !["42P01", "PGRST205"].includes(signatureResult.error.code)
  ) {
    return { error: "ไม่สามารถโหลดลายเซ็นได้ กรุณาลองใหม่" };
  }

  const profile = profileResult.data;
  const signatures = signatureResult.data ?? [];
  const signature = signatures.find((item) => item.revoked_at === null);
  let signatureUrl: string | null = null;
  if (signature?.storage_path) {
    const signedUrl = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrl(signature.storage_path, 300);
    signatureUrl = signedUrl.data?.signedUrl ?? null;
  }

  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");
  const verifiedFactors = factorsResult.data?.totp?.filter(
    (factor) => factor.status === "verified",
  );

  return {
    data: {
      authenticatorFactors: (verifiedFactors ?? []).map((factor, index) => ({
        id: factor.id,
        label: factor.friendly_name || `Authenticator ${index + 1}`,
      })),
      createdAt: signature?.created_at ?? null,
      displayName: displayName || profile?.username || user.email || "ผู้ใช้งาน",
      hasVerifiedAuthenticator: Boolean(verifiedFactors?.length),
      history: signatures.map((item) => ({
        createdAt: item.created_at,
        revokedAt: item.revoked_at,
        version: item.version,
      })),
      positionName: profile?.position_name || "ยังไม่ได้ระบุตำแหน่ง",
      signatureUrl,
      username: profile?.username || user.email?.split("@")[0] || "ผู้ใช้งาน",
      version: signature?.version ?? 0,
    },
  };
}

export async function saveApprovalSignatureAction(formData: FormData) {
  const entry = formData.get("signature");
  if (!(entry instanceof File) || entry.size === 0) {
    return { error: "กรุณาวาดหรืออัปโหลดลายเซ็นก่อนบันทึก" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };

  const permission = await supabase.rpc("authorize", {
    requested_permission: "approval_signature.manage",
  });
  if (permission.error || !permission.data) {
    return { error: "คุณไม่มีสิทธิ์แก้ไขลายเซ็นและการอนุมัติ" };
  }

  const activeSignature = await supabase
    .from("user_approval_signatures")
    .select("id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (activeSignature.error) {
    return { error: "ไม่สามารถตรวจสอบลายเซ็นปัจจุบันได้ กรุณาลองใหม่" };
  }
  if (activeSignature.data) {
    const totpCode = normalizeTotpCode(String(formData.get("totpCode") ?? ""));
    if (!isTotpCodeComplete(totpCode)) {
      return { error: "กรุณากรอกรหัส Authenticator 6 หลักเพื่อเปลี่ยนลายเซ็น" };
    }

    const factors = await supabase.auth.mfa.listFactors();
    const verifiedFactors = factors.data?.totp.filter(
      (item) => item.status === "verified",
    ) ?? [];
    const requestedFactorId = String(formData.get("factorId") ?? "");
    const factor = selectVerifiedTotpFactor(
      verifiedFactors,
      requestedFactorId || (verifiedFactors.length === 1 ? verifiedFactors[0].id : ""),
    );
    if (factors.error || !factor) {
      return { error: "กรุณาเชื่อมต่อ Authenticator ก่อนเปลี่ยนลายเซ็น" };
    }

    const verification = await supabase.auth.mfa.challengeAndVerify({
      code: totpCode,
      factorId: factor.id,
    });
    if (verification.error) {
      return { error: getMfaErrorMessage(verification.error) };
    }
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  const validationError = validateNormalizedSignature(bytes, entry.size);
  if (validationError) return { error: validationError };

  const path = `${user.id}/${randomUUID()}.png`;
  const upload = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, bytes, {
    cacheControl: "31536000",
    contentType: "image/png",
    upsert: false,
  });
  if (upload.error) {
    return { error: "ไม่สามารถอัปโหลดลายเซ็นได้ กรุณาลองใหม่" };
  }

  const saved = await supabase.rpc("save_current_user_approval_signature", {
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_storage_path: path,
  });
  if (saved.error) {
    await supabase.storage.from(SIGNATURE_BUCKET).remove([path]);
    if (saved.error.message.includes("fresh_mfa_required")) {
      return { error: "กรุณายืนยันรหัส Authenticator ใหม่ก่อนเปลี่ยนลายเซ็น" };
    }
    return { error: "ไม่สามารถบันทึกลายเซ็นได้ กรุณาลองใหม่" };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true as const };
}
