"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BadgeCheck, Copy, Download, ScanQrCode, ShieldCheck, Smartphone } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  saveApprovalSignatureAction,
  saveApprovalPoliciesAction,
  type ApprovalPolicy,
  type ApprovalSignatureSettings,
} from "@/app/actions/approval-signatures";
import { CompanyLogo } from "@/components/company-logo";
import { DataTable, DataTableFrame } from "@/components/data-table";
import { ActiveStatusBadge } from "@/components/status-badge";
import { ToggleSwitch } from "@/components/toggle-switch";
import { toast } from "@/components/toast";
import type { CompanyBranding } from "@/lib/company-settings";
import {
  MAX_SIGNATURE_FILE_SIZE,
  removeLightSignatureBackground,
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
} from "@/lib/approval-signatures";
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
  type SignatureSetupStep,
} from "@/lib/mfa";
import { createClient } from "@/utils/supabase/client";

type Props = {
  branding: CompanyBranding;
  canManagePolicies: boolean;
  companyAddress: string;
  initialData: ApprovalSignatureSettings;
  initialPolicies: ApprovalPolicy[];
};

const verificationLabels = {
  single: "ใช้สิทธิ์ตามบทบาท",
  mfa: "สิทธิ์ + Authenticator",
  conditional: "Authenticator เมื่อถึงวงเงิน",
} as const;

function ApprovalPolicySettings({ canManage, initialPolicies }: { canManage: boolean; initialPolicies: ApprovalPolicy[] }) {
  const order = ["po.approve", "pr.review"];
  const sortedPolicies = [...initialPolicies].sort((a, b) => order.indexOf(a.policyCode) - order.indexOf(b.policyCode));
  const [policies, setPolicies] = useState(sortedPolicies);
  const [pending, startTransition] = useTransition();

  function updatePolicy(policyCode: string, patch: Partial<ApprovalPolicy>) {
    setPolicies((current) => current.map((policy) => policy.policyCode === policyCode ? { ...policy, ...patch } : policy));
  }

  function save() {
    startTransition(async () => {
      const result = await saveApprovalPoliciesAction(policies);
      if ("error" in result) toast.error(result.error ?? "ไม่สามารถบันทึกนโยบายได้", { title: "บันทึกไม่สำเร็จ" });
      else toast.success("บันทึกนโยบายการอนุมัติเรียบร้อยแล้ว", { title: "บันทึกสำเร็จ" });
    });
  }

  const policyFields = (policy: ApprovalPolicy) => <>
    <label className="grid grid-cols-[105px_minmax(0,1fr)] items-center gap-2 text-[11px] text-on-surface-variant md:hidden"><span>สิทธิ์ที่ใช้</span><input className="h-9 min-w-0 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-2 text-[12px] font-semibold text-on-surface" disabled value={policy.permissionCode} /></label>
    <label className="grid grid-cols-[105px_minmax(0,1fr)] items-center gap-2 text-[11px] text-on-surface-variant md:hidden"><span>วิธีการยืนยัน</span><select className="h-9 min-w-0 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-2 text-[12px] font-semibold text-on-surface" disabled={!canManage || policy.policyCode === "pr.review"} onChange={(event) => updatePolicy(policy.policyCode, { thresholdAmount: event.target.value === "conditional" ? policy.thresholdAmount ?? 100000 : null, verificationMethod: event.target.value as ApprovalPolicy["verificationMethod"] })} value={policy.verificationMethod}>{Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {policy.verificationMethod === "conditional" ? <label className="grid grid-cols-[105px_minmax(0,1fr)] items-center gap-2 text-[11px] text-on-surface-variant md:hidden"><span>เงื่อนไข (บาท)</span><input className="h-9 min-w-0 rounded-[4px] border border-outline-variant bg-surface-container-lowest px-2 text-right text-[12px] font-semibold text-on-surface" disabled={!canManage} min="0" onChange={(event) => updatePolicy(policy.policyCode, { thresholdAmount: Number(event.target.value) })} type="number" value={policy.thresholdAmount ?? 0} /></label> : null}
  </>;

  return <div className="mt-5">
    <div className="flex items-start gap-3 border-l-4 border-[#fbbf24] bg-[#7f1d1d] px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm"><span className="material-symbols-outlined text-[20px] text-[#fde68a]">verified_user</span><p className="flex-1">นโยบายหน้านี้มีผลกับการทำงานจริง: PO ใช้การอนุมัติเอกสาร ส่วน PR เป็นการตรวจสอบความพร้อมก่อนออก PO</p></div>
    <div className="mt-4 hidden md:block">
      <DataTableFrame><DataTable className="min-w-[920px] table-fixed"><colgroup><col className="w-[24%]" /><col className="w-[22%]" /><col className="w-[25%]" /><col className="w-[17%]" /><col className="w-[12%]" /></colgroup><thead><tr><th>เอกสาร / การดำเนินการ</th><th>สิทธิ์ที่ใช้</th><th>วิธีการยืนยัน</th><th>เงื่อนไข</th><th className="text-center">บังคับใช้</th></tr></thead><tbody>{policies.map((policy) => <tr key={policy.policyCode}><td><strong className="block text-[13px]">{policy.documentLabel}</strong><small className="block text-on-surface-variant">{policy.actionLabel}</small></td><td><span className="font-semibold">{policy.permissionCode}</span></td><td><select className="h-10 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px] font-semibold" disabled={!canManage || policy.policyCode === "pr.review"} onChange={(event) => updatePolicy(policy.policyCode, { thresholdAmount: event.target.value === "conditional" ? policy.thresholdAmount ?? 100000 : null, verificationMethod: event.target.value as ApprovalPolicy["verificationMethod"] })} value={policy.verificationMethod}>{Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td>{policy.verificationMethod === "conditional" ? <div className="flex items-center gap-2"><input className="h-10 min-w-0 flex-1 rounded-[4px] border border-outline-variant px-2 text-right text-[12px] font-semibold" disabled={!canManage} min="0" onChange={(event) => updatePolicy(policy.policyCode, { thresholdAmount: Number(event.target.value) })} type="number" value={policy.thresholdAmount ?? 0} /><span className="text-[11px]">บาท</span></div> : <span className="text-on-surface-variant">ไม่มีเงื่อนไข</span>}</td><td><div className="flex justify-center"><ToggleSwitch checked={policy.isActive} disabled={!canManage} onChange={(isActive) => updatePolicy(policy.policyCode, { isActive })} /></div></td></tr>)}</tbody></DataTable></DataTableFrame>
    </div>
    <div className="mt-3 space-y-2 md:hidden">{policies.map((policy) => <article className="rounded-[5px] border border-outline-variant bg-surface-container-lowest p-3" key={policy.policyCode}><header className="mb-2 flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="text-[15px] font-bold">{policy.documentLabel}</h2><p className="text-[11px] text-on-surface-variant">{policy.actionLabel} · {policy.permissionCode}</p></div><ToggleSwitch checked={policy.isActive} disabled={!canManage} onChange={(isActive) => updatePolicy(policy.policyCode, { isActive })} /></header><div className="grid gap-2">{policyFields(policy)}</div></article>)}</div>
    <div className="mt-4 flex items-center justify-end gap-3 pb-20 sm:pb-0"><button className="hidden min-h-10 rounded-[4px] border border-outline-variant px-5 text-[13px] font-bold sm:block" onClick={() => setPolicies(sortedPolicies)} type="button">ยกเลิก</button><button className="fixed inset-x-3 bottom-3 z-30 min-h-12 rounded-[5px] bg-primary px-5 text-[14px] font-bold text-white shadow-lg disabled:opacity-50 sm:static sm:min-h-10 sm:min-w-[180px] sm:shadow-none" disabled={!canManage || pending} onClick={save} type="button">{pending ? "กำลังบันทึก..." : "บันทึกนโยบาย"}</button></div>
  </div>;
}

function formatThaiDateTime(value: string | null) {
  if (!value) return "ยังไม่เคยบันทึก";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  const padding = 50;
  const scale = Math.min(
    (SIGNATURE_WIDTH - padding * 2) / width,
    (SIGNATURE_HEIGHT - padding * 2) / height,
  );
  const renderWidth = width * scale;
  const renderHeight = height * scale;
  context.clearRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
  context.drawImage(
    image,
    (SIGNATURE_WIDTH - renderWidth) / 2,
    (SIGNATURE_HEIGHT - renderHeight) / 2,
    renderWidth,
    renderHeight,
  );
}

export function SignatureApprovalSettings({
  branding,
  canManagePolicies,
  companyAddress,
  initialData,
  initialPolicies,
}: Props) {
  useListScroll();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const [step, setStep] = useState<SignatureSetupStep>(() =>
    getSignatureSetupStep({
      hasSignature: initialData.version > 0,
      hasVerifiedAuthenticator: initialData.hasVerifiedAuthenticator,
    }),
  );
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [hasInk, setHasInk] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(initialData.version > 0);
  const [previewUrl, setPreviewUrl] = useState(initialData.signatureUrl);
  const [authenticatorVerified, setAuthenticatorVerified] = useState(
    initialData.hasVerifiedAuthenticator,
  );
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [replacementBlob, setReplacementBlob] = useState<Blob | null>(null);
  const [replacementCode, setReplacementCode] = useState("");
  const [replacementFactorId, setReplacementFactorId] = useState(
    initialData.authenticatorFactors[0]?.id ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [isMfaPending, startMfaTransition] = useTransition();
  const [activeTab, setActiveTab] = useListState<"signature" | "authenticator" | "policy">("activeTab", "signature");
  const hasSavedSignature = initialData.version > 0 || signatureSaved;

  useEffect(() => {
    if (!initialData.signatureUrl || !canvasRef.current) return;
    let cancelled = false;
    fetch(initialData.signatureUrl)
      .then((response) => response.blob())
      .then(createImageBitmap)
      .then((bitmap) => {
        if (cancelled || !canvasRef.current) return;
        const context = canvasRef.current.getContext("2d");
        if (context) {
          drawContained(context, bitmap, bitmap.width, bitmap.height);
          setHasInk(true);
        }
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialData.signatureUrl, step]);

  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * SIGNATURE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * SIGNATURE_HEIGHT,
    };
  }

  function beginDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 7;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111111";
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || mode !== "draw") return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasInk(true);
    setPreviewUrl(event.currentTarget.toDataURL("image/png"));
  }

  function endDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.getContext("2d")?.closePath();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    setHasInk(false);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(["image/png", "image/jpeg"] as string[]).includes(file.type)) {
      toast.error("รองรับเฉพาะไฟล์ PNG หรือ JPG", { title: "ไฟล์ไม่ถูกต้อง" });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_SIGNATURE_FILE_SIZE) {
      toast.error("ไฟล์ต้องมีขนาดไม่เกิน 2 MB", { title: "ไฟล์มีขนาดใหญ่เกินไป" });
      event.target.value = "";
      return;
    }

    const bitmap = await createImageBitmap(file);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      drawContained(context, bitmap, bitmap.width, bitmap.height);
      const imageData = context.getImageData(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
      removeLightSignatureBackground(imageData.data);
      context.putImageData(imageData, 0, 0);
      setHasInk(true);
      setPreviewUrl(canvas.toDataURL("image/png"));
    }
    bitmap.close();
  }

  function submitSignature(blob: Blob, totpCode?: string) {
    const formData = new FormData();
    formData.set("signature", blob, "signature.png");
    if (totpCode) {
      formData.set("totpCode", totpCode);
      formData.set("factorId", replacementFactorId);
    }
    startTransition(async () => {
      const result = await saveApprovalSignatureAction(formData);
      if ("error" in result) {
        toast.error(result.error ?? "ไม่สามารถบันทึกลายเซ็นได้", { title: "บันทึกไม่สำเร็จ" });
        setReplacementCode("");
        return;
      }
      toast.success("บันทึกลายเซ็นเรียบร้อยแล้ว", { title: "บันทึกสำเร็จ" });
      setReplacementBlob(null);
      setReplacementCode("");
      setSignatureSaved(true);
      setStep(authenticatorVerified ? 3 : 2);
      router.refresh();
    });
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) {
      toast.warning("กรุณาวาดหรืออัปโหลดลายเซ็นก่อนบันทึก");
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("ไม่สามารถเตรียมไฟล์ลายเซ็นได้");
        return;
      }
      if (hasSavedSignature) {
        setReplacementBlob(blob);
        setReplacementCode("");
        return;
      }
      submitSignature(blob);
    }, "image/png");
  }

  function clearEnrollmentState() {
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setTotpUri(null);
    setShowSecret(false);
    setSecretCopied(false);
    setTotpCode("");
  }

  function handleStartAuthenticator(additionalFactor = false) {
    startMfaTransition(async () => {
      const supabase = createClient();
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        toast.error(getMfaErrorMessage(factors.error));
        return;
      }
      if (!additionalFactor && factors.data.totp.some((factor) => factor.status === "verified")) {
        setAuthenticatorVerified(true);
        setStep(getStepAfterAuthenticatorSetup(hasSavedSignature));
        toast.info("Authenticator เชื่อมต่ออยู่แล้ว");
        return;
      }
      const staleFactorIds = getUnverifiedTotpFactorIds(factors.data.totp);
      const cleanup = await Promise.all(
        staleFactorIds.map((factorId) => supabase.auth.mfa.unenroll({ factorId })),
      );
      const cleanupError = cleanup.find((result) => result.error)?.error;
      if (cleanupError) {
        toast.error(getMfaErrorMessage(cleanupError));
        return;
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: getTotpFriendlyName(crypto.randomUUID()),
        issuer: "KRC ERP",
      });
      if (error) {
        toast.error(getMfaErrorMessage(error));
        return;
      }
      setFactorId(data.id);
      setQrCode(getTotpQrCodeSrc(data.totp.qr_code));
      setSecret(data.totp.secret);
      setTotpUri(getAuthenticatorSetupHref(data.totp.uri));
    });
  }

  async function handleCopySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
    } catch {
      toast.error("ไม่สามารถคัดลอกรหัสได้ กรุณาเลือกและคัดลอกด้วยตนเอง");
    }
  }

  function handleVerifyAuthenticator() {
    if (!factorId || !isTotpCodeComplete(totpCode)) {
      toast.warning("กรุณากรอกรหัสยืนยัน 6 หลักจากแอป Authenticator");
      return;
    }
    startMfaTransition(async () => {
      const { error } = await createClient().auth.mfa.challengeAndVerify({
        factorId,
        code: totpCode,
      });
      if (error) {
        toast.error(getMfaErrorMessage(error));
        return;
      }
      clearEnrollmentState();
      setAuthenticatorVerified(true);
      setStep(getStepAfterAuthenticatorSetup(hasSavedSignature));
      toast.success("เชื่อมต่อ Authenticator เรียบร้อยแล้ว", { title: "ยืนยันตัวตนสำเร็จ" });
      router.refresh();
    });
  }

  function handleCancelAuthenticator() {
    if (!factorId) {
      clearEnrollmentState();
      return;
    }
    startMfaTransition(async () => {
      const { error } = await createClient().auth.mfa.unenroll({ factorId });
      if (error) {
        toast.error(getMfaErrorMessage(error));
        return;
      }
      clearEnrollmentState();
    });
  }

  const updatedAt = formatThaiDateTime(initialData.createdAt);
  const primaryPending = isPending || isMfaPending;
  const primaryDisabled = step === 2 && Boolean(qrCode) && !isTotpCodeComplete(totpCode);
  const primaryLabel = step === 1
    ? isPending ? "กำลังบันทึก..." : "บันทึกและดำเนินการต่อ"
    : step === 2
      ? isMfaPending ? "กำลังดำเนินการ..." : qrCode ? "ยืนยันรหัสและดำเนินการต่อ" : "เริ่มเชื่อมต่อ Authenticator"
      : "กลับหน้าตั้งค่า";

  function handlePrimaryAction() {
    if (step === 1) return handleSave();
    if (step === 2) return qrCode ? handleVerifyAuthenticator() : handleStartAuthenticator();
    router.push("/settings");
  }

  function handleSecondaryAction() {
    if (step === 1) return router.back();
    if (step === 3) {
      setStep(1);
      return;
    }
    setStep((step - 1) as SignatureSetupStep);
  }

  return (
    <section className="mx-auto min-w-0 max-w-[1180px] pb-20 text-on-surface sm:pb-0">
      <header>
        <h1 className="text-[25px] font-bold leading-tight sm:text-[30px]">
          ลายเซ็นและการอนุมัติ
        </h1>
        <p className="mt-1 text-[13px] text-on-surface-variant sm:text-[15px]">
          ตั้งค่าลายเซ็นดิจิทัลสำหรับการอนุมัติเอกสารในระบบ KRC ERP
        </p>
      </header>

      <nav aria-label="ส่วนการตั้งค่าลายเซ็นและการอนุมัติ" className="mt-4 flex overflow-x-auto border-b border-outline-variant sm:mt-5">
        <button className={`min-h-11 shrink-0 border-b-[3px] px-4 text-[13px] font-bold sm:px-6 sm:text-[14px] ${activeTab === "signature" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`} onClick={() => setActiveTab("signature")} type="button">ลายเซ็นของฉัน</button>
        <button className={`min-h-11 shrink-0 border-b-[3px] px-4 text-[13px] font-bold sm:px-6 sm:text-[14px] ${activeTab === "authenticator" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`} onClick={() => setActiveTab("authenticator")} type="button">Authenticator / QR Code</button>
        <button className={`min-h-11 shrink-0 border-b-[3px] px-4 text-[13px] font-bold sm:px-6 sm:text-[14px] ${activeTab === "policy" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`} onClick={() => setActiveTab("policy")} type="button">นโยบายการอนุมัติ</button>
        <button className="min-h-11 shrink-0 cursor-not-allowed border-b-[3px] border-transparent px-4 text-[13px] font-bold text-on-surface-variant opacity-50 sm:px-6 sm:text-[14px]" disabled type="button">ประวัติการเปลี่ยนแปลง</button>
      </nav>

      {activeTab === "policy" ? (
        <ApprovalPolicySettings canManage={canManagePolicies} initialPolicies={initialPolicies} />
      ) : activeTab === "authenticator" ? (
        <section className="mt-5 rounded-[6px] border border-[#d8e1ed] bg-surface-container-lowest p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-primary">
              <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-[20px] font-bold">Authenticator ของฉัน</h2>
              <p className="mt-0.5 text-[13px] text-on-surface-variant">
                QR Code นี้ใช้เชื่อมต่อแอป Authenticator กับบัญชีของคุณเท่านั้น
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-[5px] border-2 border-red-600 bg-red-50 p-3 text-[13px] font-bold leading-5 text-red-800" role="alert">
            <span aria-hidden="true" className="material-symbols-outlined mt-0.5 shrink-0 text-[20px]">warning</span>
            <p>คำเตือน: ห้ามเผยแพร่ ส่งต่อ หรือให้ผู้อื่นสแกน QR Code นี้เด็ดขาด ผู้ที่ได้ QR ไปสามารถสร้างรหัส Authenticator ในนามบัญชีของคุณและใช้ยืนยันตัวตนแทนคุณได้</p>
          </div>

          {qrCode ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-start">
              <div className="grid justify-items-center rounded-[6px] border border-[#d8e1ed] bg-white p-3">
                <Image alt="QR Code ลับสำหรับ Authenticator ของบัญชีนี้" className="size-[210px] max-w-full" height={210} src={qrCode} unoptimized width={210} />
                <p className="mt-2 text-center text-[11px] font-bold text-red-700">QR ลับ — สแกนด้วยอุปกรณ์ของคุณเท่านั้น</p>
                <a className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-[4px] border border-outline-variant px-3 text-[12px] font-bold text-on-surface-variant hover:border-primary hover:text-primary" download="krc-erp-authenticator-qr.svg" href={qrCode}>
                  <Download aria-hidden="true" size={16} />
                  บันทึกรูป QR (SVG)
                </a>
              </div>
              <div className="min-w-0 rounded-[6px] border border-[#d8e1ed] bg-[#f8fafc] p-4">
                <h3 className="text-[15px] font-bold">{authenticatorVerified ? "เชื่อมต่อ Authenticator ใหม่" : "สแกน QR ด้วยแอป Authenticator"}</h3>
                <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">
                  {authenticatorVerified
                    ? "สแกนด้วยแอปหรืออุปกรณ์ใหม่ แล้วกรอกรหัส 6 หลักเพื่อยืนยัน ตัว Authenticator เดิมยังใช้งานได้จนกว่าจะยืนยันตัวใหม่สำเร็จ"
                    : "หลังสแกนแล้ว กรอกรหัส 6 หลักล่าสุดจากแอปเพื่อยืนยันการเชื่อมต่อ"}
                </p>
                {totpUri ? (
                  <a className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 sm:hidden" href={totpUri}>
                    <Smartphone aria-hidden="true" size={18} />
                    เปิดในแอป Authenticator
                  </a>
                ) : null}
                <label className="mt-4 block text-[12px] font-bold" htmlFor="authenticator-tab-totp-code">รหัส Authenticator 6 หลัก</label>
                <input
                  autoComplete="one-time-code"
                  className="mt-1 min-h-12 w-full max-w-[280px] rounded-[5px] border border-[#cbd5e1] bg-white px-4 text-center font-mono text-[22px] font-bold tracking-[0.35em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  id="authenticator-tab-totp-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setTotpCode(normalizeTotpCode(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && isTotpCodeComplete(totpCode) && !isMfaPending) {
                      handleVerifyAuthenticator();
                    }
                  }}
                  pattern="[0-9]*"
                  placeholder="000000"
                  value={totpCode}
                />
                {secret ? (
                  <div className="mt-3 text-[12px]">
                    <button className="font-bold text-primary hover:underline" onClick={() => setShowSecret((value) => !value)} type="button">{showSecret ? "ซ่อนรหัสตั้งค่า" : "กรอกรหัสตั้งค่าเอง"}</button>
                    {showSecret ? (
                      <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-[#d8e1ed] bg-white p-2">
                        <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-slate-800" translate="no">{secret}</code>
                        <button aria-label="คัดลอกรหัสตั้งค่า Authenticator" className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-[#cbd5e1] text-on-surface-variant hover:border-primary hover:text-primary" onClick={handleCopySecret} type="button">
                          {secretCopied ? <BadgeCheck aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="inline-flex min-h-10 items-center justify-center rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60" disabled={!isTotpCodeComplete(totpCode) || isMfaPending} onClick={handleVerifyAuthenticator} type="button">
                    {isMfaPending ? "กำลังยืนยัน..." : "ยืนยัน Authenticator"}
                  </button>
                  <button className="min-h-10 rounded-[4px] border border-outline-variant px-4 text-[13px] font-bold text-on-surface-variant hover:text-primary disabled:opacity-60" disabled={isMfaPending} onClick={handleCancelAuthenticator} type="button">
                    ยกเลิกการตั้งค่า
                  </button>
                </div>
              </div>
            </div>
          ) : authenticatorVerified ? (
            <div className="mt-4 rounded-[5px] border border-emerald-200 bg-emerald-50 p-4 text-[13px] leading-5 text-emerald-900">
              <p className="font-bold">Authenticator เชื่อมต่อแล้ว</p>
              <p className="mt-1">QR เดิมไม่สามารถเรียกกลับมาได้ หากต้องการตั้งค่าแอปหรืออุปกรณ์ใหม่ ให้สร้าง QR ใหม่ด้านล่างและยืนยันก่อนเปลี่ยนไปใช้แอปใหม่</p>
              <button className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60" disabled={isMfaPending} onClick={() => handleStartAuthenticator(true)} type="button">
                <ScanQrCode aria-hidden="true" size={18} />
                {isMfaPending ? "กำลังสร้าง QR Code..." : "สร้าง QR สำหรับอุปกรณ์ใหม่"}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-[5px] border border-[#d8e1ed] bg-[#f8fafc] p-4">
              <p className="text-[13px] leading-5 text-on-surface-variant">เริ่มตั้งค่าเพื่อสร้าง QR ส่วนตัวของคุณ แล้วสแกนด้วย Google Authenticator, Microsoft Authenticator หรือแอป TOTP ที่คุณเลือก</p>
              <button className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60 sm:w-auto" disabled={isMfaPending} onClick={() => handleStartAuthenticator()} type="button">
                <ScanQrCode aria-hidden="true" size={19} strokeWidth={2} />
                {isMfaPending ? "กำลังสร้าง QR Code..." : "แสดง QR Code ของฉัน"}
              </button>
            </div>
          )}
        </section>
      ) : <>

      <ol className="mt-5 grid grid-cols-3 sm:mt-6" aria-label="ขั้นตอนการตั้งค่าลายเซ็น">
        {[
          ["1", "เพิ่มลายเซ็น"],
          ["2", "ยืนยัน Authenticator"],
          ["3", "พร้อมอนุมัติ"],
        ].map(([number, label], index) => {
          const itemStep = (index + 1) as SignatureSetupStep;
          const canOpen = canOpenSignatureSetupStep(itemStep, hasSavedSignature);
          const active = itemStep === step;
          const complete = itemStep < step || (itemStep === 3 && authenticatorVerified);
          return (
            <li className="relative flex min-w-0 flex-col items-center text-center" key={number}>
              {index > 0 ? <span className={`absolute right-1/2 top-[16px] h-px w-full ${itemStep <= step ? "bg-primary" : "bg-[#cad1db]"}`} /> : null}
              <button
                aria-current={active ? "step" : undefined}
                className="relative z-10 flex flex-col items-center disabled:cursor-default"
                disabled={!canOpen}
                onClick={() => canOpen && setStep(itemStep)}
                type="button"
              >
                <span className={`grid size-8 place-items-center rounded-full border text-[14px] ${active ? "border-primary bg-primary font-bold text-white" : complete ? "border-emerald-600 bg-emerald-600 font-bold text-white" : "border-[#c4ccd7] bg-[#f8fafc] text-[#334155]"}`}>
                  {complete && !active ? <span className="material-symbols-outlined text-[18px]">check</span> : number}
                </span>
                <span className={`mt-1 max-w-[110px] bg-surface-container-lowest px-1 text-[12px] leading-4 sm:max-w-none sm:text-[14px] ${active ? "font-bold text-primary" : "text-on-surface-variant"}`}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.12fr_.88fr]">
        {step === 1 ? (
          <section className="rounded-[6px] border border-[#d8e1ed] bg-surface-container-lowest p-4 sm:p-5">
          <h2 className="text-[20px] font-bold">เพิ่มลายเซ็น</h2>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">
            กรุณาเพิ่มลายเซ็นของคุณเพื่อนำไปใช้ในการอนุมัติเอกสาร
          </p>

          {!authenticatorVerified ? (
            <div className="mt-4 flex flex-col gap-3 rounded-[5px] border border-primary/20 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-5 text-on-surface-variant">
                ตั้งค่า Authenticator ของบัญชีคุณได้เลย ไม่จำเป็นต้องบันทึกลายเซ็นก่อน ระบบจะแสดง QR Code เฉพาะระหว่างเชื่อมต่อ
              </p>
              <button
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[4px] border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary/5"
                onClick={() => setStep(2)}
                type="button"
              >
                <ScanQrCode aria-hidden="true" size={17} />
                ตั้งค่า Authenticator
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[5px] border border-[#cdd6e1]">
            <button className={`flex min-h-10 items-center justify-center gap-2 text-[13px] font-bold transition-colors sm:text-[14px] ${mode === "draw" ? "bg-primary text-white" : "bg-white text-on-surface hover:bg-slate-50"}`} onClick={() => setMode("draw")} type="button">
              <span className="material-symbols-outlined text-[19px]">draw</span>
              เซ็นบนหน้าจอ
            </button>
            <button className={`flex min-h-10 items-center justify-center gap-2 border-l border-[#cdd6e1] text-[13px] font-bold transition-colors sm:text-[14px] ${mode === "upload" ? "bg-primary text-white" : "bg-white text-on-surface hover:bg-slate-50"}`} onClick={() => { setMode("upload"); fileRef.current?.click(); }} type="button">
              <span className="material-symbols-outlined text-[19px]">upload</span>
              อัปโหลดไฟล์
            </button>
          </div>

          <input ref={fileRef} accept="image/png,image/jpeg" className="sr-only" onChange={handleUpload} type="file" />
          <div className="relative mt-3 overflow-hidden rounded-[5px] border border-[#cbd5e1] bg-white">
            <canvas
              aria-label="พื้นที่วาดลายเซ็น"
              className={`block aspect-[3/1] w-full touch-none bg-white ${mode === "draw" ? "cursor-crosshair" : "cursor-default"}`}
              height={SIGNATURE_HEIGHT}
              onPointerCancel={endDrawing}
              onPointerDown={beginDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={endDrawing}
              ref={canvasRef}
              width={SIGNATURE_WIDTH}
            />
            {!hasInk ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[12px] text-slate-400 sm:text-[13px]">
                {mode === "draw" ? "เซ็นชื่อภายในกรอบนี้" : "เลือกไฟล์ PNG หรือ JPG"}
              </div>
            ) : null}
            <div className="mx-4 border-t border-[#cbd5e1] py-2 sm:mx-5">
              <button className="inline-flex items-center gap-1.5 text-[12px] font-medium text-on-surface-variant hover:text-primary" onClick={clearSignature} type="button">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                ล้างลายเซ็น
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-on-surface-variant">
            <span className="material-symbols-outlined mt-0.5 text-[17px]">info</span>
            <p>
              แนะนำรูปขนาด <strong className="text-on-surface">1200 × 400 พิกเซล</strong> พื้นหลังโปร่งใส ไฟล์ PNG หรือ JPG ไม่เกิน 2 MB<br />
              ลายเซ็นจะถูกใช้เมื่อคุณกดอนุมัติเท่านั้น
            </p>
          </div>
          </section>
        ) : step === 2 ? (
          <section className="rounded-[6px] border border-[#d8e1ed] bg-surface-container-lowest p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-primary"><ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} /></span>
              <div>
                <h2 className="text-[20px] font-bold">ยืนยัน Authenticator</h2>
                <p className="mt-0.5 text-[13px] text-on-surface-variant">
                  เชื่อมต่อแอปด้วยมาตรฐาน TOTP เพื่อยืนยันตัวตนด้วยรหัส 6 หลัก
                </p>
              </div>
            </div>

            {!qrCode ? (
              <div className="mt-5 rounded-[5px] border border-[#d8e1ed] bg-[#f8fafc] p-4">
                <h3 className="text-[14px] font-bold">เตรียมแอป Authenticator บนโทรศัพท์</h3>
                <ol className="mt-3 space-y-3 text-[13px] leading-5 text-on-surface-variant">
                  <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-bold text-primary ring-1 ring-[#d8e1ed]">1</span><span>ติดตั้ง Google Authenticator, Microsoft Authenticator หรือแอป TOTP มาตรฐาน</span></li>
                  <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-bold text-primary ring-1 ring-[#d8e1ed]">2</span><span>กดเริ่มเชื่อมต่อ แล้วสแกน QR Code ที่ระบบสร้างให้</span></li>
                  <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-bold text-primary ring-1 ring-[#d8e1ed]">3</span><span>กรอกรหัส 6 หลักจากแอปเพื่อยืนยันการเชื่อมต่อ</span></li>
                </ol>
                <button className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[4px] bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60 sm:w-auto" disabled={isMfaPending} onClick={() => handleStartAuthenticator()} type="button">
                  <ScanQrCode aria-hidden="true" size={19} strokeWidth={2} />
                  {isMfaPending ? "กำลังเตรียม QR Code..." : "เริ่มเชื่อมต่อ Authenticator"}
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
                <div className="grid place-items-center rounded-[6px] border border-[#d8e1ed] bg-white p-3 sm:place-items-start">
                  <Image alt="QR Code สำหรับเชื่อมต่อ Authenticator" className="size-[190px] max-w-full" height={190} src={qrCode} unoptimized width={190} />
                  <p className="mt-2 text-center text-[11px] text-on-surface-variant">สแกนด้วยโทรศัพท์ของคุณระหว่างตั้งค่า</p>
                  <a className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-[4px] border border-outline-variant px-3 text-[12px] font-bold text-on-surface-variant hover:border-primary hover:text-primary" download="krc-erp-authenticator-qr.svg" href={qrCode}>
                    <Download aria-hidden="true" size={16} />
                    บันทึกรูป QR (SVG)
                  </a>
                </div>
                <div className="min-w-0 rounded-[6px] border border-[#d8e1ed] bg-[#f8fafc] p-4">
                  <h3 className="text-[15px] font-bold">เชื่อมต่อแอป Authenticator</h3>
                  <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">บนมือถือเครื่องนี้ให้เปิดแอปโดยตรง หรือใช้ QR Code เมื่อสแกนจากอุปกรณ์อีกเครื่อง</p>
                  {totpUri ? (
                    <a className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary/90 sm:hidden" href={totpUri}>
                      <Smartphone aria-hidden="true" size={18} />
                      เปิดในแอป Authenticator
                    </a>
                  ) : null}
                  <label className="mt-4 block text-[12px] font-bold" htmlFor="totp-code">รหัส 6 หลักจากแอป</label>
                  <input
                    autoComplete="one-time-code"
                    autoFocus
                    className="mt-1 min-h-12 w-full max-w-[280px] rounded-[5px] border border-[#cbd5e1] bg-white px-4 text-center font-mono text-[22px] font-bold tracking-[0.35em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setTotpCode(normalizeTotpCode(event.target.value))}
                    pattern="[0-9]*"
                    placeholder="000000"
                    value={totpCode}
                  />
                  {secret ? (
                    <div className="mt-3 text-[12px]">
                      <button className="font-bold text-primary hover:underline" onClick={() => setShowSecret((value) => !value)} type="button">{showSecret ? "ซ่อนรหัสตั้งค่า" : "กรอกรหัสตั้งค่าเอง"}</button>
                      {showSecret ? (
                        <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-[#d8e1ed] bg-white p-2">
                          <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-slate-800" translate="no">{secret}</code>
                          <button aria-label="คัดลอกรหัสตั้งค่า" className="grid size-9 shrink-0 place-items-center rounded-[4px] border border-[#cbd5e1] text-on-surface-variant hover:border-primary hover:text-primary" onClick={handleCopySecret} type="button">
                            {secretCopied ? <BadgeCheck aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-3 text-[11px] leading-4 text-on-surface-variant">ไม่ต้องบันทึกรูป QR Code ระบบจะแสดงข้อมูลนี้เฉพาะระหว่างการเชื่อมต่อครั้งนี้</p>
                  <button className="mt-4 text-[12px] font-bold text-on-surface-variant hover:text-primary disabled:opacity-60" disabled={isMfaPending} onClick={handleCancelAuthenticator} type="button">ยกเลิกการตั้งค่าครั้งนี้</button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-[6px] border border-[#d8e1ed] bg-surface-container-lowest p-4 sm:p-5">
            <div className="flex items-start gap-3 border-b border-[#d8e1ed] pb-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-emerald-50 text-emerald-700"><BadgeCheck aria-hidden="true" size={23} strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[20px] font-bold">พร้อมอนุมัติเอกสาร</h2>
                <p className="mt-0.5 text-[13px] text-on-surface-variant">ลายเซ็นและ Authenticator ของคุณพร้อมใช้งานแล้ว</p>
              </div>
              <ActiveStatusBadge active activeLabel="พร้อมใช้งาน" />
            </div>
            <dl className="divide-y divide-[#d8e1ed] text-[13px]">
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3"><dt className="text-on-surface-variant">ลายเซ็นดิจิทัล</dt><dd className="font-bold">เวอร์ชัน {initialData.version}.0.0</dd></div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3"><dt className="text-on-surface-variant">การยืนยันตัวตน</dt><dd className="flex items-center gap-1.5 font-bold"><ShieldCheck aria-hidden="true" className="text-emerald-600" size={17} /> TOTP 6 หลัก</dd></div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-3"><dt className="text-on-surface-variant">อัปเดตล่าสุด</dt><dd className="text-right font-bold">{updatedAt}</dd></div>
            </dl>
            <div className="mt-3 flex items-start gap-2 rounded-[5px] bg-[#f8fafc] p-3 text-[12px] leading-5 text-on-surface-variant">
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-primary">info</span>
              <p>ระบบจะขอรหัส Authenticator เฉพาะเอกสารที่กำหนดนโยบายยืนยันสองชั้น</p>
            </div>
            <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[4px] border border-[#cbd5e1] bg-white px-4 text-[13px] font-bold text-on-surface hover:border-primary hover:text-primary sm:hidden" onClick={() => setStep(1)} type="button">
              <span className="material-symbols-outlined text-[18px]">draw</span>
              เปลี่ยนลายเซ็น
            </button>
            {initialData.history.length > 0 ? (
              <div className="mt-4 border-t border-[#d8e1ed] pt-4">
                <h3 className="text-[13px] font-bold">ประวัติลายเซ็น</h3>
                <div className="mt-2 divide-y divide-[#d8e1ed] rounded-[5px] border border-[#d8e1ed] text-[12px]">
                  {initialData.history.slice(0, 5).map((item) => (
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2" key={item.version}>
                      <strong>เวอร์ชัน {item.version}.0.0</strong>
                      <span className="text-on-surface-variant">{formatThaiDateTime(item.createdAt)}</span>
                      <span className={item.revokedAt ? "text-on-surface-variant" : "font-bold text-emerald-700"}>{item.revokedAt ? "แทนที่แล้ว" : "ใช้งานอยู่"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        )}

        <section className="hidden rounded-[6px] border border-[#d8e1ed] bg-surface-container-lowest p-5 lg:block">
          <h2 className="text-[20px] font-bold">ตรวจสอบก่อนบันทึก</h2>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">ตัวอย่างลายเซ็นของคุณบนเอกสารอนุมัติ (PO)</p>
          <div className="mt-4 rounded-[5px] border border-[#d8e1ed] bg-white p-4 text-black">
            <div className="flex items-start gap-3 border-b-2 border-primary pb-3">
              <CompanyLogo branding={branding} mode="light" size="compact" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[13px] font-bold leading-5">{branding.legalNameTh}</p>
                <p className="line-clamp-2 text-[10px] leading-4 text-slate-600">{companyAddress}</p>
              </div>
            </div>
            <div className="px-3 pb-2 pt-4 text-center">
              <p className="text-[12px] font-bold">ผู้มีอำนาจอนุมัติ</p>
              <div className="mx-auto mt-2 grid h-[76px] max-w-[260px] place-items-center">
                {previewUrl ? <Image alt="ตัวอย่างลายเซ็น" className="max-h-[72px] w-auto object-contain" height={120} src={previewUrl} unoptimized width={360} /> : <span className="text-[11px] text-slate-400">ตัวอย่างลายเซ็นจะแสดงที่นี่</span>}
              </div>
              <div className="mx-auto max-w-[260px] border-t border-dotted border-slate-700 pt-1 text-[11px] leading-4">
                <p>( {initialData.displayName} )</p>
                <p>{initialData.positionName}</p>
                <p>วันที่ {new Intl.DateTimeFormat("th-TH").format(new Date())}</p>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2 rounded-[5px] border border-[#d8e1ed] bg-[#f8fafc] p-3 text-[12px]">
            {[
              ["ชื่อผู้ลงนามถูกต้อง", initialData.displayName],
              ["ตำแหน่งถูกต้อง", initialData.positionName],
              ["Authenticator พร้อมใช้งาน", authenticatorVerified ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ"],
            ].map(([label, value], index) => (
              <div className="flex items-center gap-2" key={label}>
                <span className={`material-symbols-outlined text-[20px] ${index < 2 || authenticatorVerified ? "text-emerald-600" : "text-slate-400"}`}>check_circle</span>
                <span className="flex-1">{label}</span>
                <strong className={index === 2 && authenticatorVerified ? "text-emerald-600" : ""}>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 hidden grid-cols-[.55fr_.7fr_1.3fr] divide-x divide-[#d8e1ed] rounded-[6px] border border-[#d8e1ed] bg-[#f8fafc] px-4 py-3 text-[12px] sm:grid">
        <div className="flex items-center gap-3 pr-4"><span className="material-symbols-outlined">description</span><span><span className="block text-on-surface-variant">เวอร์ชัน</span><strong>{initialData.version ? `${initialData.version}.0.0` : "ยังไม่บันทึก"}</strong></span></div>
        <div className="flex items-center gap-3 px-4"><span className="material-symbols-outlined">schedule</span><span><span className="block text-on-surface-variant">อัปเดตล่าสุด</span><strong>{updatedAt}</strong><span className="block text-on-surface-variant">โดย {initialData.username}</span></span></div>
        <div className="flex items-center gap-3 pl-4"><span className="material-symbols-outlined">lock</span><span><strong className="block">ข้อมูลลายเซ็นของคุณจะถูกเก็บเป็นความลับ</strong><span className="text-on-surface-variant">ใช้เฉพาะในระบบ KRC ERP เท่านั้น</span></span></div>
      </section>

      <div className="mt-3 hidden items-center justify-between sm:flex">
        <button className="min-h-10 rounded-[4px] border border-[#cbd5e1] px-5 text-[13px] font-bold hover:bg-slate-50" onClick={handleSecondaryAction} type="button">{step === 1 ? "ยกเลิก" : step === 3 ? "เปลี่ยนลายเซ็น" : "ย้อนกลับ"}</button>
        <button className="inline-flex min-h-10 min-w-[220px] items-center justify-center gap-2 rounded-[4px] bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary/90 disabled:opacity-60" disabled={primaryPending || primaryDisabled} onClick={handlePrimaryAction} type="button">
          {primaryLabel}<span className="material-symbols-outlined text-[19px]">{step === 3 ? "check" : "arrow_forward"}</span>
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#d8e1ed] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:hidden">
        <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[5px] bg-primary px-4 text-[15px] font-bold text-white disabled:opacity-60" disabled={primaryPending || primaryDisabled} onClick={handlePrimaryAction} type="button">
          {primaryLabel}<span className="material-symbols-outlined">{step === 3 ? "check" : "arrow_forward"}</span>
        </button>
      </div>
      {replacementBlob ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
          <section aria-labelledby="signature-mfa-title" aria-modal="true" className="w-full max-w-[440px] overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest shadow-2xl" role="dialog">
            <header className="flex items-start gap-3 border-b border-outline-variant px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-primary text-white"><ShieldCheck aria-hidden="true" size={22} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-[18px] font-bold" id="signature-mfa-title">ยืนยันการเปลี่ยนลายเซ็น</h2><p className="mt-0.5 text-[12px] leading-5 text-on-surface-variant">กรอกรหัสล่าสุดจากแอป Authenticator เพื่อป้องกันการเปลี่ยนลายเซ็นโดยไม่ได้รับอนุญาต</p></div>
            </header>
            <div className="px-5 py-5">
              {initialData.authenticatorFactors.length > 1 ? (
                <label className="mb-4 block text-[12px] font-bold" htmlFor="replacement-factor">Authenticator
                  <select className="mt-2 min-h-11 w-full rounded-[5px] border border-outline-variant bg-white px-3 text-[13px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" id="replacement-factor" onChange={(event) => setReplacementFactorId(event.target.value)} value={replacementFactorId}>
                    {initialData.authenticatorFactors.map((factor) => <option key={factor.id} value={factor.id}>{factor.label}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block text-[12px] font-bold" htmlFor="replacement-totp-code">รหัส Authenticator 6 หลัก</label>
              <input autoComplete="one-time-code" autoFocus className="mt-2 min-h-12 w-full rounded-[5px] border border-outline-variant bg-white px-4 text-center font-mono text-[22px] font-bold tracking-[0.35em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" id="replacement-totp-code" inputMode="numeric" maxLength={6} onChange={(event) => setReplacementCode(normalizeTotpCode(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter" && isTotpCodeComplete(replacementCode) && !isPending) submitSignature(replacementBlob, replacementCode); }} pattern="[0-9]*" placeholder="000000" value={replacementCode} />
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">ไม่ต้องสแกน QR Code ใหม่ ใช้รหัสที่กำลังแสดงในแอปเดิมได้เลย</p>
            </div>
            <footer className="flex justify-end gap-3 border-t border-outline-variant px-5 py-3">
              <button className="min-h-10 rounded-[4px] border border-outline-variant px-5 text-[13px] font-bold" disabled={isPending} onClick={() => { setReplacementBlob(null); setReplacementCode(""); }} type="button">ยกเลิก</button>
              <button className="min-h-10 rounded-[4px] bg-primary px-5 text-[13px] font-bold text-white disabled:opacity-50" disabled={isPending || !isTotpCodeComplete(replacementCode)} onClick={() => submitSignature(replacementBlob, replacementCode)} type="button">{isPending ? "กำลังยืนยัน..." : "ยืนยันและเปลี่ยนลายเซ็น"}</button>
            </footer>
          </section>
        </div>
      ) : null}
      </>}
    </section>
  );
}
