"use client";

import {
  Building2,
  ChevronDown,
  ChevronUp,
  Check,
  ImageUp,
  MapPin,
  Moon,
  Sun,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCompanySettingsAction } from "@/app/actions/company-settings";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import {
  normalizeCompanyHeaderFieldOrder,
  formatCompanyAddress,
  type CompanyDocumentContext,
  type CompanyDocumentSettings,
  type CompanyHeaderField,
  type CompanyProfile,
  type CompanySettingsData,
} from "@/lib/company-settings";
import {
  getThaiDistricts,
  getThaiPostalCode,
  getThaiProvinces,
  getThaiSubdistricts,
} from "@/lib/vendors/thai-address";

type SettingsTab = "branches" | "company" | "documents";

const inputClass =
  "h-9 w-full rounded-[4px] border border-red-200 bg-surface-container-lowest px-3 text-[13px] text-on-surface outline-none transition-colors placeholder:text-secondary/60 focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-surface-container-low";

const HEADER_FIELD_CONFIG: Record<
  CompanyHeaderField,
  {
    label: string;
    visibilityKey:
      | "showAddress"
      | "showEmail"
      | "showPhone"
      | "showTaxId"
      | "showWebsite";
  }
> = {
  address: { label: "ที่อยู่บริษัท", visibilityKey: "showAddress" },
  email: { label: "อีเมล", visibilityKey: "showEmail" },
  phone: { label: "เบอร์โทรศัพท์", visibilityKey: "showPhone" },
  taxId: {
    label: "เลขประจำตัวผู้เสียภาษี",
    visibilityKey: "showTaxId",
  },
  website: { label: "เว็บไซต์", visibilityKey: "showWebsite" },
};

function Field({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-[12px] font-semibold text-on-surface">
      <span>
        {label}
        {required ? <b className="ml-1 text-primary">*</b> : null}
      </span>
      {children}
    </label>
  );
}

function SectionHeading({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-red-200 pb-2 dark:border-white/15">
      <span className="text-[14px] font-extrabold text-primary">{number}</span>
      <h2 className="text-[15px] font-bold text-on-surface">{title}</h2>
    </div>
  );
}

export function CompanySettingsForm({
  initialData,
  initialTab = "company",
}: {
  initialData: CompanySettingsData;
  initialTab?: SettingsTab;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [profile, setProfile] = useState<CompanyProfile>(initialData.profile);
  const [documentSettings, setDocumentSettings] =
    useState<CompanyDocumentSettings>(initialData.documentSettings);
  const [lightPreview, setLightPreview] = useState<string | null>(null);
  const [darkPreview, setDarkPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canManage = initialData.canManage;
  const draftValue = { profile, documentSettings };
  const [initialDraftValue, setInitialDraftValue] = useState(() => draftValue);
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: `company-settings:${profile.id}`, value: draftValue, initialValue: initialDraftValue,
    enabled: canManage, revision: JSON.stringify([initialData.profile, initialData.documentSettings]),
    onRestore: (value) => {
      if (!["branch", "head_office"].includes(value.profile.branchType) ||
          !["auto", "custom"].includes(value.profile.darkLogoMode) ||
          !["compact", "standard"].includes(value.documentSettings.headerStyle)) throw new Error("ตัวเลือกในฉบับร่างไม่สมบูรณ์");
      setProfile({ ...value.profile, id: initialData.profile.id,
        logoDarkPath: initialData.profile.logoDarkPath, logoDarkUrl: initialData.profile.logoDarkUrl,
        logoLightPath: initialData.profile.logoLightPath, logoLightUrl: initialData.profile.logoLightUrl,
        updatedAt: initialData.profile.updatedAt });
      setDocumentSettings({ ...value.documentSettings, headerFieldOrder: normalizeCompanyHeaderFieldOrder(value.documentSettings.headerFieldOrder) });
    },
  });
  useUnsavedChanges(`company-settings:${profile.id}`, hasChanges || (canManage && !success && !!(lightPreview || darkPreview)));
  const provinces = useMemo(() => getThaiProvinces(), []);
  const districts = useMemo(
    () => (profile.province ? getThaiDistricts(profile.province) : []),
    [profile.province],
  );
  const subdistricts = useMemo(
    () =>
      profile.province && profile.district
        ? getThaiSubdistricts(profile.province, profile.district)
        : [],
    [profile.district, profile.province],
  );

  useEffect(() => {
    return () => {
      if (lightPreview) URL.revokeObjectURL(lightPreview);
      if (darkPreview) URL.revokeObjectURL(darkPreview);
    };
  }, [darkPreview, lightPreview]);

  const updateProfile = <K extends keyof CompanyProfile>(
    key: K,
    value: CompanyProfile[K],
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const updateProvince = (province: string) => {
    setProfile((current) => ({
      ...current,
      district: "",
      postalCode: "",
      province,
      subdistrict: "",
    }));
  };

  const updateDistrict = (district: string) => {
    setProfile((current) => ({
      ...current,
      district,
      postalCode: "",
      subdistrict: "",
    }));
  };

  const updateSubdistrict = (subdistrict: string) => {
    setProfile((current) => ({
      ...current,
      postalCode: getThaiPostalCode(
        current.province,
        current.district,
        subdistrict,
      ),
      subdistrict,
    }));
  };

  const updateDocument = <K extends keyof CompanyDocumentSettings>(
    key: K,
    value: CompanyDocumentSettings[K],
  ) =>
    setDocumentSettings((current) => ({ ...current, [key]: value }));

  const moveHeaderField = (
    field: CompanyHeaderField,
    direction: -1 | 1,
  ) => {
    setDocumentSettings((current) => {
      const order = [...current.headerFieldOrder];
      const currentIndex = order.indexOf(field);
      const nextIndex = currentIndex + direction;
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= order.length
      ) {
        return current;
      }

      [order[currentIndex], order[nextIndex]] = [
        order[nextIndex],
        order[currentIndex],
      ];
      return { ...current, headerFieldOrder: order };
    });
  };

  const chooseLogo = (
    file: File | undefined,
    variant: "dark" | "light",
  ) => {
    if (!file) return;
    setSuccess(null);
    const previewUrl = URL.createObjectURL(file);
    if (variant === "light") {
      if (lightPreview) URL.revokeObjectURL(lightPreview);
      setLightPreview(previewUrl);
      return;
    }
    if (darkPreview) URL.revokeObjectURL(darkPreview);
    setDarkPreview(previewUrl);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || isPending) return;

    setError(null);
    setSuccess(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveCompanySettingsAction(formData);
      if ("error" in result) {
        setError(result.error ?? "ไม่สามารถบันทึกข้อมูลบริษัทได้");
        return;
      }

      setInitialDraftValue(draftValue);
      clearDraft();
      setSuccess("บันทึกข้อมูลบริษัทเรียบร้อยแล้ว");
      router.refresh();
    });
  };

  const previewLogo = lightPreview ?? profile.logoLightUrl;
  const darkLogo =
    profile.darkLogoMode === "custom"
      ? (darkPreview ?? profile.logoDarkUrl ?? previewLogo)
      : previewLogo;
  const address = formatCompanyAddress(profile);
  const previewDocumentContext: CompanyDocumentContext = {
    branding: {
      ...initialData.branding,
      companyId: profile.id,
      darkLogoMode: profile.darkLogoMode,
      legalNameEn: profile.legalNameEn,
      legalNameTh: profile.legalNameTh,
      logoDarkUrl: darkLogo,
      logoLightUrl: previewLogo,
      logoVersion: profile.updatedAt,
    },
    company: {
      address,
      branchCode: profile.branchCode,
      branchType: profile.branchType,
      email: profile.email,
      phone: profile.phone,
      taxId: profile.taxId,
      website: profile.website,
    },
    documentSettings,
  };

  return (
    <form
      className="min-h-[calc(100vh-124px)] bg-surface-container-lowest"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {draftPrompt}
      {hasChanges ? <p className="px-6 py-2 text-xs text-secondary">ฉบับร่างเก็บข้อมูลที่กรอกไว้ รูปโลโก้ที่อัปโหลดต้องเลือกใหม่เมื่อกลับมา</p> : null}
      <input name="companyId" type="hidden" value={profile.id} />
      <input
        name="darkLogoMode"
        type="hidden"
        value={profile.darkLogoMode}
      />
      {(
        [
          "showAddress",
          "showEmail",
          "showPhone",
          "showTaxId",
          "showWebsite",
        ] as const
      ).map((key) => (
        <input
          key={key}
          name={key}
          type="hidden"
          value={String(documentSettings[key])}
        />
      ))}

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-6 py-4">
        <div>
          <h1 className="text-[25px] font-bold leading-tight text-on-surface">
            ตั้งค่าข้อมูลบริษัท
          </h1>
          <p className="mt-1 text-[12px] text-secondary">
            ข้อมูลสำหรับหัวเอกสารและเอกสารทางธุรกิจของระบบ
          </p>
        </div>
        <button
          className="h-9 rounded-[3px] bg-primary px-6 text-[13px] font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canManage || isPending}
          type="submit"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </header>

      <nav className="flex min-w-0 items-end gap-2 overflow-x-auto border-b border-outline-variant px-3 sm:gap-8 sm:px-6">
        {[
          { id: "company" as const, label: "ข้อมูลบริษัท" },
          { id: "branches" as const, label: "สาขาและที่อยู่" },
          { id: "documents" as const, label: "รูปแบบเอกสาร" },
        ].map((tab) => (
          <button
            className={`h-11 shrink-0 whitespace-nowrap border-b-2 px-2 text-[13px] font-bold transition-colors sm:px-4 ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-secondary hover:text-on-surface"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error || success ? (
        <div
          className={`mx-6 mt-4 flex items-center gap-2 border px-4 py-2 text-[13px] font-semibold ${
            error
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {success ? <Check size={16} /> : null}
          {error ?? success}
        </div>
      ) : null}

      <div
        className={`grid-cols-1 divide-y divide-outline-variant xl:min-h-[660px] xl:grid-cols-[58%_42%] xl:divide-x xl:divide-y-0 ${
          activeTab === "company" ? "grid" : "hidden"
        }`}
      >
          <div className="min-w-0 space-y-5 px-3 py-5 sm:px-6">
            <section className="space-y-3">
              <SectionHeading number="01" title="ข้อมูลนิติบุคคล" />
              <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <span className="text-[12px] font-semibold">
                  ชื่อบริษัทภาษาไทย <b className="text-primary">*</b>
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={200}
                  name="legalNameTh"
                  onChange={(event) =>
                    updateProfile("legalNameTh", event.target.value)
                  }
                  required
                  value={profile.legalNameTh}
                />
                <span className="text-[12px] font-semibold">
                  ชื่อบริษัทภาษาอังกฤษ
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={200}
                  name="legalNameEn"
                  onChange={(event) =>
                    updateProfile("legalNameEn", event.target.value)
                  }
                  value={profile.legalNameEn}
                />
                <span className="text-[12px] font-semibold">
                  เลขประจำตัวผู้เสียภาษี
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  inputMode="numeric"
                  maxLength={13}
                  name="taxId"
                  onChange={(event) =>
                    updateProfile(
                      "taxId",
                      event.target.value.replace(/\D/g, "").slice(0, 13),
                    )
                  }
                  value={profile.taxId}
                />
                <span className="text-[12px] font-semibold">
                  ประเภทสาขา <b className="text-primary">*</b>
                </span>
                <select
                  className={inputClass}
                  disabled={!canManage}
                  name="branchType"
                  onChange={(event) => {
                    const value =
                      event.target.value === "branch"
                        ? "branch"
                        : "head_office";
                    updateProfile("branchType", value);
                    if (value === "head_office") {
                      updateProfile("branchCode", "00000");
                    }
                  }}
                  value={profile.branchType}
                >
                  <option value="head_office">สำนักงานใหญ่</option>
                  <option value="branch">สาขา</option>
                </select>
                <span className="text-[12px] font-semibold">
                  รหัสสาขา <b className="text-primary">*</b>
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage || profile.branchType === "head_office"}
                  inputMode="numeric"
                  maxLength={5}
                  name="branchCode"
                  onChange={(event) =>
                    updateProfile(
                      "branchCode",
                      event.target.value.replace(/\D/g, "").slice(0, 5),
                    )
                  }
                  value={profile.branchCode}
                />
              </div>
            </section>

            <section className="space-y-3">
              <SectionHeading number="02" title="ที่อยู่จดทะเบียน" />
              <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <span className="text-[12px] font-semibold">
                  เลขที่/อาคาร/ถนน
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={500}
                  name="addressLine"
                  onChange={(event) =>
                    updateProfile("addressLine", event.target.value)
                  }
                  value={profile.addressLine}
                />
                <span className="text-[12px] font-semibold">จังหวัด</span>
                <select
                  className={inputClass}
                  disabled={!canManage}
                  name="province"
                  onChange={(event) => updateProvince(event.target.value)}
                  value={profile.province}
                >
                  <option value="">เลือกจังหวัด</option>
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] font-semibold">อำเภอ/เขต</span>
                <select
                  className={inputClass}
                  disabled={!canManage || !profile.province}
                  name="district"
                  onChange={(event) => updateDistrict(event.target.value)}
                  value={profile.district}
                >
                  <option value="">
                    {profile.province ? "เลือกอำเภอ/เขต" : "เลือกจังหวัดก่อน"}
                  </option>
                  {districts.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] font-semibold">ตำบล/แขวง</span>
                <select
                  className={inputClass}
                  disabled={!canManage || !profile.district}
                  name="subdistrict"
                  onChange={(event) => updateSubdistrict(event.target.value)}
                  value={profile.subdistrict}
                >
                  <option value="">
                    {profile.district
                      ? "เลือกตำบล/แขวง"
                      : "เลือกอำเภอ/เขตก่อน"}
                  </option>
                  {subdistricts.map((subdistrict) => (
                    <option key={subdistrict} value={subdistrict}>
                      {subdistrict}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] font-semibold">
                  รหัสไปรษณีย์
                </span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  inputMode="numeric"
                  name="postalCode"
                  placeholder="ระบบกำหนดให้อัตโนมัติ"
                  readOnly
                  value={profile.postalCode}
                />
              </div>
            </section>

            <section className="space-y-3">
              <SectionHeading number="03" title="ข้อมูลติดต่อ" />
              <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <span className="text-[12px] font-semibold">เบอร์โทรศัพท์</span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={30}
                  name="phone"
                  onChange={(event) =>
                    updateProfile("phone", event.target.value)
                  }
                  value={profile.phone}
                />
                <span className="text-[12px] font-semibold">อีเมล</span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={254}
                  name="email"
                  onChange={(event) =>
                    updateProfile("email", event.target.value)
                  }
                  type="email"
                  value={profile.email}
                />
                <span className="text-[12px] font-semibold">เว็บไซต์</span>
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={255}
                  name="website"
                  onChange={(event) =>
                    updateProfile("website", event.target.value)
                  }
                  value={profile.website}
                />
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-5 px-3 py-5 sm:px-6">
            <input
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={!canManage}
              name="logoLight"
              onChange={(event) =>
                chooseLogo(event.target.files?.[0], "light")
              }
              ref={lightInputRef}
              type="file"
            />
            <input
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={!canManage}
              name="logoDark"
              onChange={(event) =>
                chooseLogo(event.target.files?.[0], "dark")
              }
              ref={darkInputRef}
              type="file"
            />

            <section>
              <h2 className="mb-3 text-[14px] font-bold text-on-surface">
                ตัวอย่างโลโก้
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-outline-variant">
                  <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2 text-[11px] font-bold text-on-surface">
                    <Sun aria-hidden="true" size={14} strokeWidth={1.8} />
                    โหมดสว่าง
                  </div>
                  <div className="flex h-40 items-center justify-center bg-white p-5">
                    { }
                    <img
                      alt="ตัวอย่างโลโก้โหมดสว่าง"
                      className="max-h-24 max-w-full object-contain"
                      src={previewLogo}
                    />
                  </div>
                </div>
                <div className="border border-outline-variant">
                  <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2 text-[11px] font-bold text-on-surface">
                    <Moon aria-hidden="true" size={14} strokeWidth={1.8} />
                    โหมดมืด
                  </div>
                  <div className="flex h-40 items-center justify-center bg-[#171717] p-5">
                    { }
                    <img
                      alt="ตัวอย่างโลโก้โหมดมืด"
                      className={`max-h-24 max-w-full object-contain ${
                        profile.darkLogoMode === "auto"
                          ? "invert mix-blend-screen"
                          : ""
                      }`}
                      src={darkLogo}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-outline-variant pt-5">
              <h2 className="text-[14px] font-bold text-on-surface">
                การตั้งค่าโลโก้
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="flex h-9 items-center gap-2 rounded-[3px] border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
                  disabled={!canManage}
                  onClick={() => lightInputRef.current?.click()}
                  type="button"
                >
                  <Upload size={15} />
                  เปลี่ยนโลโก้หลัก
                </button>
                <span className="text-[10px] text-secondary">
                  PNG, JPG หรือ WebP ไม่เกิน 2 MB
                </span>
              </div>

              <div>
                <h3 className="mb-2 text-[12px] font-bold text-on-surface">
                  โลโก้สำหรับโหมดมืด
                </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    {
                      description: "ระบบแปลงโลโก้หลักเป็นสีขาว",
                      label: "ปรับอัตโนมัติ",
                      value: "auto" as const,
                    },
                    {
                      description: "ใช้ไฟล์โลโก้สำหรับพื้นหลังมืด",
                      label: "ใช้โลโก้แยก",
                      value: "custom" as const,
                    },
                  ].map((option) => (
                    <button
                      className={`border px-4 py-3 text-left ${
                        profile.darkLogoMode === option.value
                          ? "border-primary bg-primary/5"
                          : "border-outline-variant"
                      }`}
                      disabled={!canManage}
                      key={option.value}
                      onClick={() =>
                        updateProfile("darkLogoMode", option.value)
                      }
                      type="button"
                    >
                      <strong className="block text-[12px] text-on-surface">
                        {option.label}
                      </strong>
                      <span className="mt-1 block text-[10px] text-secondary">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {profile.darkLogoMode === "custom" ? (
                <button
                  className="flex h-9 items-center gap-2 rounded-[3px] border border-primary px-4 text-[12px] font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
                  disabled={!canManage}
                  onClick={() => darkInputRef.current?.click()}
                  type="button"
                >
                  <ImageUp size={15} />
                  เลือกโลโก้โหมดมืด
                </button>
              ) : null}
            </section>
          </aside>
      </div>

      {activeTab === "branches" ? (
        <div className="min-w-0 space-y-5 px-3 py-5 sm:px-6">
          <div className="flex items-center justify-between border-b border-outline-variant pb-3">
            <div>
              <h2 className="text-[16px] font-bold text-on-surface">
                สาขาและที่อยู่
              </h2>
              <p className="mt-1 text-[11px] text-secondary">
                ที่อยู่สำนักงานใหญ่จะอัปเดตจากแท็บข้อมูลบริษัทโดยอัตโนมัติ
              </p>
            </div>
            <span className="border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {initialData.branches.length || 1} สาขา
            </span>
          </div>
          <div className="max-w-full overflow-x-auto border border-outline-variant">
            <table className="w-full min-w-[680px] border-collapse text-[12px]">
              <thead className="bg-surface-container-low text-left">
                <tr>
                  <th className="border-b border-r border-outline-variant px-4 py-2.5">
                    รหัสสาขา
                  </th>
                  <th className="border-b border-r border-outline-variant px-4 py-2.5">
                    ชื่อสาขา
                  </th>
                  <th className="border-b border-r border-outline-variant px-4 py-2.5">
                    ที่อยู่
                  </th>
                  <th className="border-b border-outline-variant px-4 py-2.5 text-center">
                    สถานะ
                  </th>
                </tr>
              </thead>
              <tbody>
                {(initialData.branches.length
                  ? initialData.branches
                  : [
                      {
                        addressLine: address || "-",
                        branchCode: profile.branchCode,
                        branchName:
                          profile.branchType === "head_office"
                            ? "สำนักงานใหญ่"
                            : `สาขา ${profile.branchCode}`,
                        district: profile.district,
                        email: profile.email,
                        id: "preview",
                        isHeadOffice: profile.branchType === "head_office",
                        isRegisteredAddress: true,
                        phone: profile.phone,
                        postalCode: profile.postalCode,
                        province: profile.province,
                        status: "active" as const,
                        subdistrict: profile.subdistrict,
                      },
                    ]
                ).map((branch) => (
                  <tr key={branch.id}>
                    <td className="border-r border-outline-variant px-4 py-3 font-bold">
                      {branch.branchCode}
                    </td>
                    <td className="border-r border-outline-variant px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Building2 className="text-primary" size={16} />
                        {branch.branchName}
                      </span>
                    </td>
                    <td className="border-r border-outline-variant px-4 py-3">
                      <span className="flex items-start gap-2">
                        <MapPin className="mt-0.5 shrink-0 text-secondary" size={14} />
                        {branch.addressLine}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        ใช้งาน
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div
        className={`grid-cols-1 divide-y divide-outline-variant xl:min-h-[590px] xl:grid-cols-[44%_56%] xl:divide-x xl:divide-y-0 ${
          activeTab === "documents" ? "grid" : "hidden"
        }`}
      >
          <div className="min-w-0 space-y-6 px-3 py-5 sm:px-6">
            <section className="space-y-3">
              <SectionHeading number="01" title="รูปแบบหัวเอกสาร" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="รูปแบบหัวเอกสาร">
                  <select
                    className={inputClass}
                    disabled={!canManage}
                    name="headerStyle"
                    onChange={(event) =>
                      updateDocument(
                        "headerStyle",
                        event.target.value === "standard"
                          ? "standard"
                          : "compact",
                      )
                    }
                    value={documentSettings.headerStyle}
                  >
                    <option value="compact">กระชับ</option>
                    <option value="standard">มาตรฐาน</option>
                  </select>
                </Field>
                <Field label="ความกว้างโลโก้ในเอกสาร (มม.)">
                  <input
                    className={inputClass}
                    disabled={!canManage}
                    max={60}
                    min={15}
                    name="logoWidthMm"
                    onChange={(event) =>
                      updateDocument(
                        "logoWidthMm",
                        Number(event.target.value || 34),
                      )
                    }
                    type="number"
                    value={documentSettings.logoWidthMm}
                  />
                </Field>
              </div>
              <div className="border border-outline-variant px-4">
                <input
                  name="headerFieldOrder"
                  type="hidden"
                  value={documentSettings.headerFieldOrder.join(",")}
                />
                <div className="border-b border-outline-variant py-2">
                  <strong className="block text-[12px] text-on-surface">
                    ลำดับข้อมูลในหัวเอกสาร
                  </strong>
                  <span className="text-[11px] text-secondary">
                    แต่ละรายการจะแสดงคนละบรรทัด ใช้ลูกศรเพื่อเปลี่ยนตำแหน่ง
                  </span>
                </div>
                {documentSettings.headerFieldOrder.map((field, index) => {
                  const config = HEADER_FIELD_CONFIG[field];
                  const checked = documentSettings[config.visibilityKey];

                  return (
                    <div
                      className="grid min-h-11 grid-cols-[28px_1fr_auto_auto] items-center gap-2 border-b border-outline-variant py-1.5 last:border-b-0"
                      key={field}
                    >
                      <span className="text-[11px] font-bold tabular-nums text-secondary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[13px] font-medium text-on-surface">
                        {config.label}
                      </span>
                      <ToggleSwitch checked={checked} disabled={!canManage} onChange={(value) => updateDocument(config.visibilityKey, value)} />
                      <span className="flex">
                        <button
                          aria-label={`เลื่อน${config.label}ขึ้น`}
                          className="grid h-7 w-7 place-items-center border border-outline-variant text-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                          disabled={!canManage || index === 0}
                          onClick={() => moveHeaderField(field, -1)}
                          type="button"
                        >
                          <ChevronUp aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`เลื่อน${config.label}ลง`}
                          className="grid h-7 w-7 place-items-center border-y border-r border-outline-variant text-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                          disabled={
                            !canManage ||
                            index === documentSettings.headerFieldOrder.length - 1
                          }
                          onClick={() => moveHeaderField(field, 1)}
                          type="button"
                        >
                          <ChevronDown aria-hidden="true" size={15} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <SectionHeading number="02" title="ข้อความท้ายเอกสาร" />
              <Field label="ข้อความภาษาไทย">
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={200}
                  name="footerTextTh"
                  onChange={(event) =>
                    updateDocument("footerTextTh", event.target.value)
                  }
                  value={documentSettings.footerTextTh}
                />
              </Field>
              <Field label="ข้อความภาษาอังกฤษ">
                <input
                  className={inputClass}
                  disabled={!canManage}
                  maxLength={200}
                  name="footerTextEn"
                  onChange={(event) =>
                    updateDocument("footerTextEn", event.target.value)
                  }
                  value={documentSettings.footerTextEn}
                />
              </Field>
            </section>
          </div>

          <aside className="min-w-0 space-y-5 px-3 py-5 sm:px-6">
            <DocumentPreview
              context={previewDocumentContext}
            />
          </aside>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-3">
        <button
          className="h-9 rounded-[3px] border border-outline-variant px-6 text-[13px] font-bold text-on-surface hover:bg-surface-container-low"
          onClick={() => router.refresh()}
          type="button"
        >
          ยกเลิก
        </button>
        <button
          className="h-9 rounded-[3px] bg-primary px-7 text-[13px] font-bold text-on-primary hover:opacity-90 disabled:opacity-50"
          disabled={!canManage || isPending}
          type="submit"
        >
          {isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </footer>
    </form>
  );
}

function DocumentPreview({
  context,
}: {
  context: CompanyDocumentContext;
}) {
  return (
    <section>
      <h2 className="mb-3 text-[14px] font-bold text-on-surface">
        ตัวอย่างหัวเอกสาร
      </h2>
      <div className="overflow-x-auto border border-outline-variant bg-white p-5">
        <div className="w-[195mm] max-w-full">
          <CompanyDocumentHeader
            context={context}
            priority
          />
        </div>
      </div>
    </section>
  );
}
