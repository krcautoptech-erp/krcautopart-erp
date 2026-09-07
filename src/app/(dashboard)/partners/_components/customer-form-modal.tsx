"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/toggle-switch";
import type {
  CustomerAddressInput,
  CustomerInput,
  CustomerLookup,
  CustomerRecord,
  CustomerStatus,
} from "@/app/actions/customers";
import {
  composeVendorAddressLine,
  getThaiDistricts,
  getThaiPostalCode,
  getThaiProvinces,
  getThaiSubdistricts,
} from "@/lib/vendors/thai-address";

type Lookups = {
  creditTerms: CustomerLookup[];
  customerTypes: CustomerLookup[];
  taxTypes: CustomerLookup[];
};

type CustomerFormModalProps = {
  customer?: CustomerRecord | null;
  lookups: Lookups;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (input: CustomerInput) => Promise<void>;
};

type AddressDraft = Omit<CustomerAddressInput, "address_line">;

const STATUS_ACTIVE: CustomerStatus = "ใช้งาน";
const STATUS_INACTIVE: CustomerStatus = "ระงับการใช้งาน";

const emptyAddress: AddressDraft = {
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

function buildNewAddress(index: number): AddressDraft {
  return {
    ...emptyAddress,
    address_name: `ที่อยู่ ${index}`,
    is_default: index === 1,
  };
}

function normalizeAddressDraft(address: AddressDraft): CustomerAddressInput {
  return {
    ...address,
    address_line: composeVendorAddressLine(address),
  };
}

function buildEmptyDraft(lookups: Lookups): CustomerInput {
  return {
    branch: "",
    contact_name: "",
    credit_term_id: lookups.creditTerms[0]?.id ?? 0,
    customer_addresses: [],
    customer_code: "",
    customer_name: "",
    customer_type_id: lookups.customerTypes[0]?.id ?? 0,
    email: "",
    phone: "",
    remark: "",
    status: STATUS_ACTIVE,
    tax_no: "",
    tax_type_id: lookups.taxTypes[0]?.id ?? 0,
  };
}

function buildAddressDraft(
  address: Omit<CustomerAddressInput, "address_line"> & { address_line?: string },
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

function buildDraftFromCustomer(customer: CustomerRecord): CustomerInput {
  return {
    branch: customer.branch ?? "",
    contact_name: customer.contact_name ?? "",
    credit_term_id: customer.credit_term_id,
    customer_addresses:
      customer.customer_addresses.length > 0
        ? customer.customer_addresses.map((address) => ({
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
          }))
        : [],
    customer_code: customer.customer_code,
    customer_name: customer.customer_name,
    customer_type_id: customer.customer_type_id,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    remark: customer.remark ?? "",
    status: customer.status,
    tax_no: customer.tax_no,
    tax_type_id: customer.tax_type_id,
  };
}

export function CustomerFormModal({
  customer,
  lookups,
  mode,
  onClose,
  onSubmit,
}: CustomerFormModalProps) {
  const [draft, setDraft] = useState<CustomerInput>(() =>
    customer ? buildDraftFromCustomer(customer) : buildEmptyDraft(lookups),
  );
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(buildNewAddress(1));
  const [addressModalIndex, setAddressModalIndex] = useState<number | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [prevCustomer, setPrevCustomer] = useState(customer);
  const [prevLookups, setPrevLookups] = useState(lookups);
  if (customer !== prevCustomer || lookups !== prevLookups) {
    setPrevCustomer(customer);
    setPrevLookups(lookups);
    setDraft(customer ? buildDraftFromCustomer(customer) : buildEmptyDraft(lookups));
  }

  const displayCode = customer?.customer_code ?? "CUS...";

  const updateField = <Key extends keyof CustomerInput>(
    key: Key,
    value: CustomerInput[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const openAddAddressModal = () => {
    setAddressDraft(buildNewAddress(draft.customer_addresses.length + 1));
    setAddressModalIndex(null);
    setIsAddressModalOpen(true);
  };

  const openEditAddressModal = (index: number) => {
    setAddressDraft(buildAddressDraft(draft.customer_addresses[index], index));
    setAddressModalIndex(index);
    setIsAddressModalOpen(true);
  };

  const closeAddressModal = () => {
    setIsAddressModalOpen(false);
    setAddressModalIndex(null);
    setAddressDraft(buildNewAddress(draft.customer_addresses.length + 1));
  };

  const saveAddress = () => {
    const normalizedDraft = normalizeAddressDraft(addressDraft);

    setDraft((current) => {
      const nextAddresses =
        addressModalIndex === null
          ? [...current.customer_addresses, normalizedDraft]
          : current.customer_addresses.map((address, index) =>
              index === addressModalIndex ? normalizedDraft : address,
            );

      const targetIndex = addressModalIndex ?? nextAddresses.length - 1;

      return {
        ...current,
        customer_addresses: nextAddresses.map((address, index) => ({
          ...address,
          is_default: normalizedDraft.is_default
            ? index === targetIndex
            : nextAddresses.some((item) => item.is_default)
              ? address.is_default
              : index === 0,
        })),
      };
    });

    closeAddressModal();
  };

  const removeAddress = (index: number) => {
    setDraft((current) => {
      const next = current.customer_addresses.filter(
        (_, addressIndex) => addressIndex !== index,
      );

      return {
        ...current,
        customer_addresses: next.map((address, addressIndex) => ({
          ...address,
          is_default: next.some((item) => item.is_default)
            ? address.is_default
            : addressIndex === 0,
        })),
      };
    });
  };

  const setDefaultAddress = (index: number) => {
    setDraft((current) => ({
      ...current,
      customer_addresses: current.customer_addresses.map((address, addressIndex) => ({
        ...address,
        is_default: addressIndex === index,
      })),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await onSubmit(draft);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <form
        className="max-h-[92vh] w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-red-200 bg-surface-container-lowest shadow-2xl dark:border-red-500/30"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b border-red-200 px-6 py-4 dark:border-red-500/25">
          <div className="flex items-center gap-3">
            <span className="rounded-[4px] bg-primary px-3 py-1 text-[12px] font-bold tracking-[0.12em] text-white">
              KRC ERP
            </span>
            <div>
              <h2 className="text-[22px] font-bold text-on-surface">
                {mode === "create" ? "เพิ่มลูกหนี้ / ลูกค้า" : "แก้ไขลูกหนี้ / ลูกค้า"}
              </h2>
              <p className="text-[12px] font-medium text-secondary">
                Customer master สำหรับใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี
              </p>
            </div>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-[6px] text-on-surface hover:bg-surface-container"
            onClick={onClose}
            type="button"
          >
            <X size={24} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-146px)] overflow-y-auto">
          <div className="space-y-6 p-6">
            <div className="grid gap-0 lg:grid-cols-3">
              <section className="flex h-full flex-col gap-5 border-b border-red-100 pb-6 dark:border-red-500/20 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
                <SectionTitle number="01" title="ข้อมูลหลักลูกค้า" />
                <div className="grid gap-4">
                  <ReadOnlyField
                    description="ระบบจะสร้างรหัสให้อัตโนมัติ"
                    label="รหัสลูกค้า"
                    value={displayCode}
                  />
                  <TextField
                    label="ชื่อลูกค้า *"
                    onChange={(value) => updateField("customer_name", value)}
                    value={draft.customer_name}
                  />
                  <SelectField
                    label="ประเภทลูกค้า *"
                    onChange={(value) => updateField("customer_type_id", value)}
                    options={lookups.customerTypes}
                    value={draft.customer_type_id}
                  />
                </div>
                <div className="mt-auto pt-2">
                  <StatusToggle
                    onChange={(value) => updateField("status", value)}
                    value={draft.status}
                  />
                </div>
              </section>

              <section className="flex h-full flex-col gap-5 border-b border-red-100 py-6 dark:border-red-500/20 lg:border-b-0 lg:border-r lg:px-6 lg:py-0">
                <SectionTitle number="02" title="ข้อมูลภาษีและการวางบิล" />
                <div className="grid gap-4">
                  <TextField
                    label="เลขผู้เสียภาษี *"
                    onChange={(value) => updateField("tax_no", value)}
                    value={draft.tax_no}
                  />
                  <TextField
                    label="สาขา *"
                    onChange={(value) => updateField("branch", value)}
                    value={draft.branch}
                  />
                  <SelectField
                    label="เครดิตเทอม *"
                    onChange={(value) => updateField("credit_term_id", value)}
                    options={lookups.creditTerms}
                    value={draft.credit_term_id}
                  />
                  <SelectField
                    label="ประเภทภาษี *"
                    onChange={(value) => updateField("tax_type_id", value)}
                    options={lookups.taxTypes}
                    value={draft.tax_type_id}
                  />
                </div>
              </section>

              <section className="flex h-full flex-col gap-5 pt-6 lg:pl-6 lg:pt-0">
                <SectionTitle number="03" title="ข้อมูลติดต่อ" />
                <div className="grid gap-4">
                  <TextField
                    label="ชื่อผู้ติดต่อ"
                    onChange={(value) => updateField("contact_name", value)}
                    value={draft.contact_name}
                  />
                  <TextField
                    label="เบอร์โทร"
                    onChange={(value) => updateField("phone", value)}
                    value={draft.phone}
                  />
                  <TextField
                    label="อีเมล"
                    onChange={(value) => updateField("email", value)}
                    type="email"
                    value={draft.email}
                  />
                  <TextAreaField
                    label="หมายเหตุ"
                    onChange={(value) => updateField("remark", value)}
                    value={draft.remark}
                  />
                </div>
              </section>
            </div>

            <section className="space-y-4 border-t border-red-100 pt-6 dark:border-red-500/20">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle number="04" title="ที่อยู่ลูกค้า" />
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
                <div className="grid grid-cols-[0.28fr_1fr_0.2fr_0.22fr] bg-surface-container-low px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-secondary">
                  <span>ประเภทที่อยู่</span>
                  <span>รายละเอียดที่อยู่</span>
                  <span>สถานะ</span>
                  <span className="text-right">จัดการ</span>
                </div>

                {draft.customer_addresses.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[14px] font-medium text-secondary">
                    ยังไม่มีที่อยู่ลูกค้า กดเพิ่มที่อยู่เพื่อเริ่มต้น
                  </div>
                ) : (
                  draft.customer_addresses.map((address, index) => (
                    <div
                      key={`${address.address_name}-${index}`}
                      className="grid grid-cols-[0.28fr_1fr_0.2fr_0.22fr] items-center border-t border-red-100 bg-surface-container-lowest px-4 py-3 text-[14px] dark:border-red-500/15"
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
                          disabled={draft.customer_addresses.length === 1}
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
            onClick={onClose}
            type="button"
          >
            ยกเลิก
          </button>
          <button
            className="h-10 rounded-[6px] bg-primary px-8 text-[14px] font-bold text-white shadow-sm hover:bg-primary/95 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "กำลังบันทึก..."
              : mode === "create"
                ? "บันทึกลูกหนี้"
                : "บันทึกการแก้ไข"}
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
    () =>
      draft.province && draft.district
        ? getThaiSubdistricts(draft.province, draft.district)
        : [],
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
      province,
      district: "",
      subdistrict: "",
      postal_code: "",
    });
  };

  const updateDistrict = (district: string) => {
    onChange({
      ...draft,
      district,
      subdistrict: "",
      postal_code: "",
    });
  };

  const updateSubdistrict = (subdistrict: string) => {
    onChange({
      ...draft,
      subdistrict,
      postal_code: getThaiPostalCode(draft.province, draft.district, subdistrict),
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[860px] rounded-[10px] border border-red-200 bg-surface-container-lowest shadow-2xl dark:border-red-500/30">
        <div className="flex items-center justify-between border-b border-red-200 px-5 py-4 dark:border-red-500/20">
          <div>
            <h3 className="text-[20px] font-bold text-on-surface">
              เพิ่ม / แก้ไขที่อยู่ลูกค้า
            </h3>
            <p className="text-[12px] font-medium text-secondary">
              กรอกข้อมูลที่อยู่สำหรับใช้ในใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี
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
              onChange={(value) => updateField("address_name", value)}
              value={draft.address_name}
            />
            <TextField
              label="ประเทศ"
              onChange={(value) => updateField("country", value)}
              value={draft.country}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <TextField
              label="เลขที่ *"
              onChange={(value) => updateField("house_no", value)}
              value={draft.house_no}
            />
            <TextField
              label="ชั้น"
              onChange={(value) => updateField("floor", value)}
              value={draft.floor}
            />
            <TextField
              label="อาคาร"
              onChange={(value) => updateField("building", value)}
              value={draft.building}
            />
            <TextField
              label="ถนน"
              onChange={(value) => updateField("road", value)}
              value={draft.road}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <PlainSelectField
              label="จังหวัด *"
              onChange={updateProvince}
              options={provinces}
              value={draft.province}
            />
            <PlainSelectField
              disabled={!draft.province}
              label="อำเภอ *"
              onChange={updateDistrict}
              options={districts}
              value={draft.district}
            />
            <PlainSelectField
              disabled={!draft.district}
              label="ตำบล *"
              onChange={updateSubdistrict}
              options={subdistricts}
              value={draft.subdistrict}
            />
            <ReadOnlyField label="ไปรษณีย์" value={draft.postal_code || "-"} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="ผู้ติดต่อของที่อยู่นี้"
              onChange={(value) => updateField("contact_name", value)}
              value={draft.contact_name}
            />
            <TextField
              label="เบอร์โทรที่อยู่นี้"
              onChange={(value) => updateField("phone", value)}
              value={draft.phone}
            />
            <SelectField
              label="สถานะ"
              onChange={(value) =>
                updateField("status", value === 1 ? STATUS_ACTIVE : STATUS_INACTIVE)
              }
              options={[
                { code: "ACTIVE", id: 1, name: STATUS_ACTIVE, status: STATUS_ACTIVE },
                { code: "INACTIVE", id: 0, name: STATUS_INACTIVE, status: STATUS_ACTIVE },
              ]}
              value={draft.status === STATUS_ACTIVE ? 1 : 0}
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
        className="h-10 w-full rounded-[6px] border border-red-200 bg-transparent px-3 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30"
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
      <div className="flex min-h-10 items-center rounded-[6px] border border-red-200 px-3 text-[15px] font-semibold text-secondary dark:border-red-500/30">
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
        className="min-h-[106px] w-full resize-none rounded-[6px] border border-red-200 bg-transparent px-3 py-2 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30"
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
  options: CustomerLookup[];
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-on-surface">{label}</span>
      <select
        className="h-10 w-full rounded-[6px] border border-red-200 bg-transparent px-3 text-[15px] font-medium text-on-surface outline-none focus:border-primary dark:border-red-500/30 dark:bg-[#1f1a1a] dark:[color-scheme:dark]"
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
        className="h-10 w-full rounded-[6px] border border-red-200 bg-transparent px-3 text-[15px] font-medium text-on-surface outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-[#1f1a1a] dark:[color-scheme:dark]"
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
  onChange: (value: CustomerStatus) => void;
  value: CustomerStatus;
}) {
  const active = value === STATUS_ACTIVE;

  return <ToggleSwitch checked={active} label="สถานะใช้งาน" onChange={(checked) => onChange(checked ? STATUS_ACTIVE : STATUS_INACTIVE)} />;
}
