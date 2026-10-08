"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/toggle-switch";
import { CompanyFormLogo } from "@/components/company-logo";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges, useUnsavedChangesContext } from "@/components/unsaved-changes";
import { matchesMemoryShape } from "@/lib/session-memory";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import type {
  VendorAddressInput,
  VendorInput,
  VendorLookup,
  VendorRecord,
  VendorStatus,
} from "@/app/actions/vendors";
import {
  composeVendorAddressLine,
  getThaiDistricts,
  getThaiPostalCode,
  getThaiProvinces,
  getThaiSubdistricts,
} from "@/lib/vendors/thai-address";

type Lookups = {
  creditTerms: VendorLookup[];
  groups: VendorLookup[];
  paymentMethods: VendorLookup[];
  taxTypes: VendorLookup[];
};

type VendorFormModalProps = {
  lookups: Lookups;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (input: VendorInput) => Promise<boolean>;
  vendor?: VendorRecord | null;
};

const STATUS_ACTIVE: VendorStatus = "ใช้งาน";
const STATUS_INACTIVE: VendorStatus = "ระงับการใช้งาน";

const emptyAddress: VendorAddressInput = {
  address_line: "",
  address_name: "ที่อยู่ 1",
  building: "",
  contact_name: "",
  country: "ประเทศไทย",
  district: "",
  floor: "",
  house_no: "",
  is_default: true,
  phone: "",
  postal_code: "",
  province: "",
  road: "",
  status: STATUS_ACTIVE,
  subdistrict: "",
};

type AddressDraft = Omit<VendorAddressInput, "address_line">;

function buildNewAddress(index: number): AddressDraft {
  return {
    ...emptyAddress,
    address_name: `ที่อยู่ ${index}`,
    is_default: index === 1,
  };
}

function normalizeAddressDraft(address: AddressDraft): VendorAddressInput {
  return {
    ...address,
    address_line: composeVendorAddressLine(address),
  };
}

function buildEmptyDraft(lookups: Lookups): VendorInput {
  return {
    branch: "สำนักงานใหญ่",
    contact_name: "",
    credit_term_id: lookups.creditTerms[0]?.id ?? 0,
    email: "",
    payment_method_id: lookups.paymentMethods[0]?.id ?? 0,
    phone: "",
    remark: "",
    status: STATUS_ACTIVE,
    tax_no: "",
    tax_type_id: lookups.taxTypes[0]?.id ?? 0,
    vendor_addresses: [],
    vendor_code: "",
    vendor_group_id: lookups.groups[0]?.id ?? 0,
    vendor_name: "",
  };
}

function buildAddressDraft(
  address: Omit<VendorAddressInput, "address_line"> & { address_line?: string },
  index: number,
): AddressDraft {
  return {
    address_name: address.address_name || `ที่อยู่ ${index + 1}`,
    building: address.building ?? "",
    contact_name: address.contact_name ?? "",
    country: address.country ?? "ประเทศไทย",
    district: address.district ?? "",
    floor: address.floor ?? "",
    house_no: address.house_no ?? "",
    is_default: address.is_default,
    phone: address.phone ?? "",
    postal_code: address.postal_code ?? "",
    province: address.province ?? "",
    road: address.road ?? "",
    status: address.status,
    subdistrict: address.subdistrict ?? "",
  };
}

function buildDraftFromVendor(vendor: VendorRecord): VendorInput {
  return {
    branch: vendor.branch ?? "",
    contact_name: vendor.contact_name ?? "",
    credit_term_id: vendor.credit_term_id,
    email: vendor.email ?? "",
    payment_method_id: vendor.payment_method_id,
    phone: vendor.phone ?? "",
    remark: vendor.remark ?? "",
    status: vendor.status,
    tax_no: vendor.tax_no,
    tax_type_id: vendor.tax_type_id,
    vendor_addresses: vendor.vendor_addresses.length > 0 ? vendor.vendor_addresses.map((address) => ({
      address_line: address.address_line,
      address_name: address.address_name,
      building: address.building ?? "",
      contact_name: address.contact_name ?? "",
      country: address.country ?? "ประเทศไทย",
      district: address.district ?? "",
      floor: address.floor ?? "",
      house_no: address.house_no ?? "",
      is_default: address.is_default,
      phone: address.phone ?? "",
      postal_code: address.postal_code ?? "",
      province: address.province ?? "",
      road: address.road ?? "",
      status: address.status,
      subdistrict: address.subdistrict ?? "",
    })) : [],
    vendor_code: vendor.vendor_code,
    vendor_group_id: vendor.vendor_group_id,
    vendor_name: vendor.vendor_name,
  };
}

export function VendorFormModal(props: VendorFormModalProps) {
  return <VendorFormEditor key={`${props.mode}:${props.vendor?.id ?? "new"}`} {...props} />;
}

function VendorFormEditor({
  lookups,
  mode,
  onClose,
  onSubmit,
  vendor,
}: VendorFormModalProps) {
  const [draft, setDraft] = useState<VendorInput>(() =>
    vendor ? buildDraftFromVendor(vendor) : buildEmptyDraft(lookups),
  );
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(buildNewAddress(1));
  const [addressModalIndex, setAddressModalIndex] = useState<number | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const draftValue = { draft, addressDraft, addressModalIndex: addressModalIndex ?? -1, isAddressModalOpen };
  const [initialDraftValue] = useState(() => draftValue);
  const draftKey = `master-vendor:${vendor?.id ?? "new"}`;
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: draftKey, value: draftValue, initialValue: initialDraftValue,
    revision: JSON.stringify(vendor ?? null),
    onRestore: (value) => {
      const restored = value.draft;
      if (!lookups.groups.some((option) => option.id === restored.vendor_group_id) ||
        !lookups.creditTerms.some((option) => option.id === restored.credit_term_id) ||
        !lookups.paymentMethods.some((option) => option.id === restored.payment_method_id) ||
        !lookups.taxTypes.some((option) => option.id === restored.tax_type_id)) throw new Error("ข้อมูลตัวเลือกในฉบับร่างเปลี่ยนแล้ว กรุณาตรวจสอบก่อนกู้คืน");
      if (!restored.vendor_addresses.every((address) => matchesMemoryShape(address, normalizeAddressDraft(buildNewAddress(1))))) throw new Error("ข้อมูลที่อยู่ในฉบับร่างไม่สมบูรณ์");
      setDraft({ ...restored, vendor_code: vendor?.vendor_code ?? "", vendor_addresses: restored.vendor_addresses.map((address) => normalizeAddressDraft(address)) });
      setAddressDraft(value.addressDraft);
      setAddressModalIndex(value.addressModalIndex < 0 ? null : value.addressModalIndex);
      setIsAddressModalOpen(value.isAddressModalOpen);
    },
  });
  useUnsavedChanges(draftKey, hasChanges);
  const { requestNavigation } = useUnsavedChangesContext();
  const closeForm = () => { if (!isSubmitting) requestNavigation(onClose); };

  const updateField = <Key extends keyof VendorInput>(key: Key, value: VendorInput[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const openAddAddressModal = () => {
    setAddressDraft(buildNewAddress(draft.vendor_addresses.length + 1));
    setAddressModalIndex(null);
    setIsAddressModalOpen(true);
  };

  const openEditAddressModal = (index: number) => {
    setAddressDraft(buildAddressDraft(draft.vendor_addresses[index], index));
    setAddressModalIndex(index);
    setIsAddressModalOpen(true);
  };

  const closeAddressModal = () => {
    setIsAddressModalOpen(false);
    setAddressModalIndex(null);
    setAddressDraft(buildNewAddress(draft.vendor_addresses.length + 1));
  };

  const saveAddress = () => {
    const normalizedDraft = normalizeAddressDraft(addressDraft);

    setDraft((current) => {
      const nextAddresses =
        addressModalIndex === null
          ? [...current.vendor_addresses, normalizedDraft]
          : current.vendor_addresses.map((address, index) =>
              index === addressModalIndex ? normalizedDraft : address,
            );

      const hasDefault = nextAddresses.some((address) => address.is_default);

      return {
        ...current,
        vendor_addresses: nextAddresses.map((address, index) => ({
          ...address,
          is_default: normalizedDraft.is_default
            ? index === (addressModalIndex ?? nextAddresses.length - 1)
            : hasDefault
              ? address.is_default
              : index === 0,
        })),
      };
    });

    closeAddressModal();
  };

  const removeAddress = (index: number) => {
    setDraft((current) => {
      const next = current.vendor_addresses.filter((_, addressIndex) => addressIndex !== index);
      if (next.length > 0 && !next.some((address) => address.is_default)) {
        next[0] = { ...next[0], is_default: true };
      }
      return { ...current, vendor_addresses: next };
    });
  };

  const setDefaultAddress = (index: number) => {
    setDraft((current) => ({
      ...current,
      vendor_addresses: current.vendor_addresses.map((address, addressIndex) => ({
        ...address,
        is_default: addressIndex === index,
      })),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (await onSubmit(draft)) clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-0 sm:p-4 backdrop-blur-sm overscroll-contain animate-in fade-in duration-150">
      <form
        className="flex h-[100dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-none border border-red-200 bg-surface-container-lowest shadow-2xl dark:border-red-500/30 sm:h-auto sm:max-h-[92dvh] sm:rounded-[10px]"
        onSubmit={handleSubmit}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-red-200 px-6 py-4 dark:border-red-500/25">
          <div className="flex items-center gap-3">
            <CompanyFormLogo />
            <div>
              <h2 className="text-[22px] font-bold text-on-surface">
                {mode === "create" ? "เพิ่มผู้ขาย / เจ้าหนี้" : "แก้ไขผู้ขาย / เจ้าหนี้"}
              </h2>
              <p className="text-[12px] font-medium text-secondary">
                Vendor master สำหรับฝ่ายจัดซื้อและเอกสาร PR/PO
              </p>
            </div>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-[6px] text-on-surface hover:bg-surface-container"
            onClick={closeForm}
            type="button"
          >
            <X size={24} />
          </button>
        </div>

        {draftPrompt}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-6 p-6">
            <div className="grid items-stretch gap-0 lg:grid-cols-[0.42fr_0.58fr]">
              <section className="flex h-full flex-col gap-5 border-b border-red-100 pb-6 dark:border-red-500/20 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
                <SectionTitle number="01" title="ข้อมูลหลักผู้ขาย" />
                <div className="grid gap-4">
                  {mode === "edit" ? (
                    <ReadOnlyField
                      description="รหัสหลักของผู้ขาย ไม่สามารถแก้ไขได้"
                      label="รหัสผู้ขาย"
                      value={draft.vendor_code}
                    />
                  ) : null}
                  <TextField
                    label="ชื่อผู้ขาย *"
                    value={draft.vendor_name}
                    onChange={(value) => updateField("vendor_name", value)}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label="เลขผู้เสียภาษี *"
                      value={draft.tax_no}
                      onChange={(value) => updateField("tax_no", value)}
                    />
                    <TextField
                      label="สาขา"
                      value={draft.branch}
                      onChange={(value) => updateField("branch", value)}
                    />
                  </div>
                  <SelectField
                    label="กลุ่มผู้ขาย *"
                    value={draft.vendor_group_id}
                    options={lookups.groups}
                    onChange={(value) => updateField("vendor_group_id", value)}
                  />
                </div>
                <div className="mt-auto pt-2">
                  <StatusToggle
                    value={draft.status}
                    onChange={(value) => updateField("status", value)}
                  />
                </div>
              </section>

              <section className="flex h-full flex-col gap-6 pt-6 lg:pl-6 lg:pt-0">
                <div className="grid flex-1 gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <SectionTitle number="02" title="ข้อมูลจัดซื้อ" />
                    <SelectField
                      label="เครดิตเทอม *"
                      value={draft.credit_term_id}
                      options={lookups.creditTerms}
                      onChange={(value) => updateField("credit_term_id", value)}
                    />
                    <SelectField
                      label="วิธีชำระเงิน *"
                      value={draft.payment_method_id}
                      options={lookups.paymentMethods}
                      onChange={(value) => updateField("payment_method_id", value)}
                    />
                    <SelectField
                      label="ประเภทภาษี *"
                      value={draft.tax_type_id}
                      options={lookups.taxTypes}
                      onChange={(value) => updateField("tax_type_id", value)}
                    />
                  </div>

                  <div className="space-y-4">
                    <SectionTitle number="03" title="ข้อมูลติดต่อ" />
                    <TextField
                      label="ชื่อผู้ติดต่อ"
                      value={draft.contact_name}
                      onChange={(value) => updateField("contact_name", value)}
                    />
                    <TextField
                      label="เบอร์โทร"
                      value={draft.phone}
                      onChange={(value) => updateField("phone", value)}
                    />
                    <TextField
                      label="อีเมล"
                      type="email"
                      value={draft.email}
                      onChange={(value) => updateField("email", value)}
                    />
                  </div>
                </div>

                <TextAreaField
                  label="หมายเหตุ"
                  value={draft.remark}
                  onChange={(value) => updateField("remark", value)}
                />
              </section>
            </div>

            <section className="space-y-4 border-t border-red-100 pt-6 dark:border-red-500/20">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle number="04" title="ที่อยู่ผู้ขาย" />
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-red-200 px-3 text-[13px] font-bold text-primary hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  onClick={openAddAddressModal}
                  type="button"
                >
                  <Plus size={16} />
                  เพิ่มที่อยู่
                </button>
              </div>

              <div className="overflow-hidden rounded-[8px] border border-red-100 dark:border-red-500/20">
                <div className="grid grid-cols-[0.28fr_1fr_0.2fr_0.28fr] bg-surface-container-low px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-secondary">
                  <span>ประเภทที่อยู่</span>
                  <span>รายละเอียดที่อยู่</span>
                  <span>สถานะ</span>
                  <span className="text-right">จัดการ</span>
                </div>

                {draft.vendor_addresses.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[14px] font-medium text-secondary">
                    ยังไม่มีที่อยู่ผู้ขาย กดเพิ่มที่อยู่เพื่อเริ่มต้น
                  </div>
                ) : (
                  draft.vendor_addresses.map((address, index) => (
                    <div
                      key={`${address.address_name}-${index}`}
                      className="grid grid-cols-[0.28fr_1fr_0.2fr_0.28fr] items-center border-t border-red-100 bg-surface-container-lowest px-4 py-3 text-[14px] dark:border-red-500/15"
                    >
                      <div className="pr-3">
                        <p className="font-semibold text-on-surface">{address.address_name}</p>
                        {address.is_default ? (
                          <span className="mt-1 inline-flex rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                            ค่าเริ่มต้น
                          </span>
                        ) : null}
                      </div>
                      <div className="pr-3">
                        <p className="font-medium text-on-surface">
                          {composeVendorAddressLine(address)}
                        </p>
                        <p className="mt-1 text-[12px] text-secondary">
                          {address.contact_name || "ไม่ระบุผู้ติดต่อ"}
                          {address.phone ? ` • ${address.phone}` : ""}
                        </p>
                      </div>
                      <div>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${
                            address.status === STATUS_ACTIVE
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                          }`}
                        >
                          {address.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-3 text-[12px] font-bold">
                        {!address.is_default ? (
                          <button
                            className="text-primary transition-colors hover:text-primary/80"
                            onClick={() => setDefaultAddress(index)}
                            type="button"
                          >
                            ตั้งค่าเริ่มต้น
                          </button>
                        ) : (
                          <span className="text-secondary">ค่าเริ่มต้น</span>
                        )}
                        <button
                          aria-label="แก้ไขที่อยู่"
                          className="text-secondary transition-colors hover:text-on-surface"
                          onClick={() => openEditAddressModal(index)}
                          type="button"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          aria-label="ลบที่อยู่"
                          className="text-red-600 transition-colors hover:text-red-700"
                          disabled={draft.vendor_addresses.length === 1}
                          onClick={() => removeAddress(index)}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-red-200 px-6 py-4 dark:border-red-500/25">
          <button
            className="h-10 rounded-[6px] border border-red-200 px-8 text-[14px] font-bold text-on-surface hover:bg-surface-container dark:border-red-500/30"
            onClick={closeForm}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-10 rounded-[6px] bg-primary px-8 text-[14px] font-bold text-white shadow-sm hover:bg-primary/95 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "กำลังบันทึก..." : mode === "create" ? "บันทึกผู้ขาย" : "บันทึกการแก้ไข"}
          </button>
        </div>
      </form>

      {isAddressModalOpen ? (
        <AddressModal
          draft={addressDraft}
          onChange={setAddressDraft}
          onClose={closeAddressModal}
          onSave={saveAddress}
        />
      ) : null}
    </div>
  );
}

function AddressModal({
  draft,
  onChange,
  onClose,
  onSave,
}: {
  draft: AddressDraft;
  onChange: (value: AddressDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const provinces = useMemo(() => getThaiProvinces(), []);
  const districts = useMemo(
    () => (draft.province ? getThaiDistricts(draft.province) : []),
    [draft.province],
  );
  const subdistricts = useMemo(
    () => (draft.province && draft.district ? getThaiSubdistricts(draft.province, draft.district) : []),
    [draft.district, draft.province],
  );

  const isValid =
    draft.address_name.trim() &&
    draft.house_no.trim() &&
    draft.province.trim() &&
    draft.district.trim() &&
    draft.subdistrict.trim() &&
    draft.postal_code.trim();

  const updateField = <Key extends keyof AddressDraft>(key: Key, value: AddressDraft[Key]) => {
    onChange({ ...draft, [key]: value });
  };

  const updateProvince = (province: string) => {
    onChange({
      ...draft,
      district: "",
      postal_code: "",
      province,
      subdistrict: "",
    });
  };

  const updateDistrict = (district: string) => {
    onChange({
      ...draft,
      district,
      postal_code: "",
      subdistrict: "",
    });
  };

  const updateSubdistrict = (subdistrict: string) => {
    onChange({
      ...draft,
      postal_code: getThaiPostalCode(draft.province, draft.district, subdistrict),
      subdistrict,
    });
  };

  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-0 sm:p-4 backdrop-blur-sm overscroll-contain animate-in fade-in duration-150">
      <div className="h-[100dvh] sm:h-auto sm:max-h-[92dvh] w-full max-w-[860px] overflow-y-auto overscroll-contain rounded-none sm:rounded-[10px] border border-red-200 bg-surface-container-lowest shadow-2xl dark:border-red-500/30">
        <div className="flex items-center justify-between border-b border-red-200 px-5 py-4 dark:border-red-500/20">
          <div>
            <h3 className="text-[20px] font-bold text-on-surface">เพิ่ม / แก้ไขที่อยู่ผู้ขาย</h3>
            <p className="text-[12px] font-medium text-secondary">
              กรอกข้อมูลที่อยู่สำหรับใช้ในเอกสารจัดซื้อ
            </p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-[6px] text-on-surface hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="ชื่อที่อยู่ *"
              value={draft.address_name}
              onChange={(value) => updateField("address_name", value)}
            />
            <TextField
              label="ประเทศ"
              value={draft.country}
              onChange={(value) => updateField("country", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <TextField
              label="เลขที่ *"
              value={draft.house_no}
              onChange={(value) => updateField("house_no", value)}
            />
            <TextField
              label="ชั้น"
              value={draft.floor}
              onChange={(value) => updateField("floor", value)}
            />
            <TextField
              label="อาคาร"
              value={draft.building}
              onChange={(value) => updateField("building", value)}
            />
            <TextField
              label="ถนน"
              value={draft.road}
              onChange={(value) => updateField("road", value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <PlainSelectField
              label="จังหวัด *"
              options={provinces}
              value={draft.province}
              onChange={updateProvince}
            />
            <PlainSelectField
              label="อำเภอ *"
              options={districts}
              value={draft.district}
              onChange={updateDistrict}
              disabled={!draft.province}
            />
            <PlainSelectField
              label="ตำบล *"
              options={subdistricts}
              value={draft.subdistrict}
              onChange={updateSubdistrict}
              disabled={!draft.district}
            />
            <ReadOnlyField label="ไปรษณีย์" value={draft.postal_code || "-"} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="ผู้ติดต่อของที่อยู่นี้"
              value={draft.contact_name}
              onChange={(value) => updateField("contact_name", value)}
            />
            <TextField
              label="เบอร์โทรที่อยู่นี้"
              value={draft.phone}
              onChange={(value) => updateField("phone", value)}
            />
            <SelectField
              label="สถานะ"
              value={draft.status === STATUS_ACTIVE ? 1 : 0}
              options={[
                { code: "ACTIVE", id: 1, name: STATUS_ACTIVE, status: STATUS_ACTIVE },
                { code: "INACTIVE", id: 0, name: STATUS_INACTIVE, status: STATUS_ACTIVE },
              ]}
              onChange={(value) =>
                updateField("status", value === 1 ? STATUS_ACTIVE : STATUS_INACTIVE)
              }
            />
          </div>

          <label className="flex items-center gap-3 rounded-[6px] border border-outline-variant px-3 py-3 text-[13px] font-bold">
            <input
              checked={draft.is_default}
              className="h-4 w-4 accent-primary"
              onChange={(event) => updateField("is_default", event.target.checked)}
              type="checkbox"
            />
            ตั้งเป็นที่อยู่เริ่มต้น
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-red-200 px-5 py-4 dark:border-red-500/20">
          <button
            className="h-10 rounded-[6px] border border-red-200 px-6 text-[14px] font-bold text-on-surface hover:bg-surface-container dark:border-red-500/30"
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-10 rounded-[6px] bg-primary px-6 text-[14px] font-bold text-white shadow-sm hover:bg-primary/95 disabled:opacity-60"
            disabled={!isValid}
            onClick={onSave}
            type="button"
          >
            บันทึกที่อยู่
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] font-bold tracking-[0.18em] text-primary">{number}</span>
      <h3 className="text-[14px] font-bold uppercase tracking-[0.08em] text-on-surface">
        {title}
      </h3>
    </div>
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <input
        className="h-10 w-full border-0 border-b border-red-200 bg-transparent px-0 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function ReadOnlyField({
  description,
  label,
  value,
}: {
  description?: string;
  label: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <div className="flex min-h-10 items-center border-0 border-b border-red-200 px-0 text-[15px] font-semibold text-secondary dark:border-red-500/30">
        {value}
      </div>
      {description ? (
        <span className="mt-1 block text-[11px] font-medium text-secondary">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <textarea
        className="min-h-[78px] w-full resize-none rounded-[6px] border border-red-200 bg-transparent px-3 py-2 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  options: VendorLookup[];
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <select
        className="h-10 w-full border-0 border-b border-red-200 bg-transparent px-0 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30 dark:bg-[#1f1a1a] dark:[color-scheme:dark]"
        onChange={(event) => onChange(Number(event.target.value))}
        value={value}
      >
        <option className="bg-white text-slate-900 dark:bg-[#1f1a1a] dark:text-white" value={0}>
          เลือกข้อมูล
        </option>
        {options.map((option) => (
          <option
            key={option.id}
            className="bg-white text-slate-900 dark:bg-[#1f1a1a] dark:text-white"
            value={option.id}
          >
            {option.code} - {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlainSelectField({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <select
        className="h-10 w-full border-0 border-b border-red-200 bg-transparent px-0 text-[15px] font-medium text-on-surface outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-[#1f1a1a] dark:[color-scheme:dark]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option className="bg-white text-slate-900 dark:bg-[#1f1a1a] dark:text-white" value="">
          เลือกข้อมูล
        </option>
        {options.map((option) => (
          <option
            key={option}
            className="bg-white text-slate-900 dark:bg-[#1f1a1a] dark:text-white"
            value={option}
          >
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusToggle({
  onChange,
  value,
}: {
  onChange: (value: VendorStatus) => void;
  value: VendorStatus;
}) {
  const active = value === STATUS_ACTIVE;

  return <ToggleSwitch checked={active} label="สถานะใช้งาน" onChange={(checked) => onChange(checked ? STATUS_ACTIVE : STATUS_INACTIVE)} />;
}
