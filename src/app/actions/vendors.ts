"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { composeVendorAddressLine } from "@/lib/vendors/thai-address";

export type VendorStatus = "ใช้งาน" | "ระงับการใช้งาน";

export type VendorLookup = {
  code: string;
  credit_days?: number | null;
  id: number;
  name: string;
  status: VendorStatus;
  tax_rate?: number | null;
};

export type VendorAddressRecord = {
  address_line: string;
  address_name: string;
  building: string | null;
  contact_name: string | null;
  country: string | null;
  district: string | null;
  floor: string | null;
  house_no: string | null;
  id: number;
  is_default: boolean;
  postal_code: string | null;
  phone: string | null;
  province: string | null;
  road: string | null;
  status: VendorStatus;
  subdistrict: string | null;
};

export type VendorRecord = {
  branch: string | null;
  contact_name: string | null;
  created_at: string;
  credit_term: VendorLookup | null;
  credit_term_id: number;
  email: string | null;
  id: number;
  payment_method: VendorLookup | null;
  payment_method_id: number;
  phone: string | null;
  remark: string | null;
  status: VendorStatus;
  tax_no: string;
  tax_type: VendorLookup | null;
  tax_type_id: number;
  updated_at: string;
  vendor_addresses: VendorAddressRecord[];
  vendor_code: string;
  vendor_group: VendorLookup | null;
  vendor_group_id: number;
  vendor_name: string;
};

export type VendorAddressInput = {
  address_line: string;
  address_name: string;
  building: string;
  contact_name: string;
  country: string;
  district: string;
  floor: string;
  house_no: string;
  is_default: boolean;
  postal_code: string;
  phone: string;
  province: string;
  road: string;
  status: VendorStatus;
  subdistrict: string;
};

export type VendorInput = {
  branch: string;
  contact_name: string;
  credit_term_id: number;
  email: string;
  payment_method_id: number;
  phone: string;
  remark: string;
  status: VendorStatus;
  tax_no: string;
  tax_type_id: number;
  vendor_addresses: VendorAddressInput[];
  vendor_code: string;
  vendor_group_id: number;
  vendor_name: string;
};

type ActionResult<T> = { success: true; data: T } | { error: string };

const VENDORS_PATH = "/vendors";
const STATUS_ACTIVE: VendorStatus = "ใช้งาน";
const STATUS_INACTIVE: VendorStatus = "ระงับการใช้งาน";

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function cleanOptional(value: string | null | undefined) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeStatus(value: string | null | undefined): VendorStatus {
  return value === STATUS_INACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;
}

function normalizeVendorInput(input: VendorInput) {
  const addresses = input.vendor_addresses
    .map((address) => ({
      address_line: cleanText(
        composeVendorAddressLine({
          building: address.building,
          country: address.country,
          district: address.district,
          floor: address.floor,
          house_no: address.house_no,
          postal_code: address.postal_code,
          province: address.province,
          road: address.road,
          subdistrict: address.subdistrict,
        }),
      ),
      address_name: cleanText(address.address_name),
      building: cleanOptional(address.building),
      contact_name: cleanOptional(address.contact_name),
      country: cleanOptional(address.country),
      district: cleanOptional(address.district),
      floor: cleanOptional(address.floor),
      house_no: cleanOptional(address.house_no),
      is_default: Boolean(address.is_default),
      postal_code: cleanOptional(address.postal_code),
      phone: cleanOptional(address.phone),
      province: cleanOptional(address.province),
      road: cleanOptional(address.road),
      status: normalizeStatus(address.status),
      subdistrict: cleanOptional(address.subdistrict),
    }))
    .filter((address) => address.address_name || address.address_line);

  const defaultIndex = Math.max(
    0,
    addresses.findIndex((address) => address.is_default),
  );

  return {
    addresses: addresses.map((address, index) => ({
      ...address,
      is_default: index === defaultIndex,
    })),
    vendor: {
      branch: cleanOptional(input.branch),
      contact_name: cleanOptional(input.contact_name),
      credit_term_id: Number(input.credit_term_id),
      email: cleanOptional(input.email),
      payment_method_id: Number(input.payment_method_id),
      phone: cleanOptional(input.phone),
      remark: cleanOptional(input.remark),
      status: normalizeStatus(input.status),
      tax_no: cleanText(input.tax_no),
      tax_type_id: Number(input.tax_type_id),
      vendor_code: cleanText(input.vendor_code).toUpperCase(),
      vendor_group_id: Number(input.vendor_group_id),
      vendor_name: cleanText(input.vendor_name),
    },
  };
}

function validateInput(input: ReturnType<typeof normalizeVendorInput>) {
  if (!input.vendor.vendor_name) return "กรุณากรอกชื่อผู้ขาย";
  if (!input.vendor.vendor_group_id) return "กรุณาเลือกกลุ่มผู้ขาย";
  if (!input.vendor.tax_no) return "กรุณากรอกเลขผู้เสียภาษี";
  if (!input.vendor.credit_term_id) return "กรุณาเลือกเครดิตเทอม";
  if (!input.vendor.payment_method_id) return "กรุณาเลือกวิธีชำระเงิน";
  if (!input.vendor.tax_type_id) return "กรุณาเลือกประเภทภาษี";
  if (input.addresses.length === 0) return "กรุณาเพิ่มที่อยู่อย่างน้อย 1 รายการ";

  const invalidAddress = input.addresses.find(
    (address) =>
      !address.address_name ||
      !address.house_no ||
      !address.province ||
      !address.district ||
      !address.subdistrict ||
      !address.postal_code,
  );
  if (invalidAddress) {
    return "กรุณากรอกข้อมูลที่อยู่ให้ครบทั้งชื่อที่อยู่ บ้านเลขที่ จังหวัด อำเภอ ตำบล และไปรษณีย์";
  }

  return null;
}

function mapDuplicateError(message: string) {
  return message.includes("vendors_vendor_code_unique")
    ? "รหัสผู้ขายนี้มีอยู่ในระบบแล้ว"
    : message;
}

export async function createVendorAction(
  input: VendorInput,
): Promise<ActionResult<VendorRecord>> {
  const payload = normalizeVendorInput(input);
  const validationError = validateInput(payload);
  if (validationError) return { error: validationError };

  try {
    const supabase = await createClient();
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .insert(payload.vendor)
      .select()
      .single();

    if (vendorError) return { error: mapDuplicateError(vendorError.message) };

    const addressRows = payload.addresses.map((address) => ({
      ...address,
      vendor_id: vendor.id,
    }));
    const { error: addressError } = await supabase
      .from("vendor_addresses")
      .insert(addressRows);

    if (addressError) {
      await supabase.from("vendors").delete().eq("id", vendor.id);
      return { error: addressError.message };
    }

    revalidatePath(VENDORS_PATH);
    return { success: true, data: vendor as VendorRecord };
  } catch (error) {
    console.error("Vendor create exception:", error);
    return { error: "เกิดข้อผิดพลาดในการเพิ่มผู้ขาย" };
  }
}

export async function updateVendorAction(
  id: number,
  input: VendorInput,
): Promise<ActionResult<VendorRecord>> {
  const payload = normalizeVendorInput(input);
  const validationError = validateInput(payload);
  if (validationError) return { error: validationError };

  try {
    const { vendor_code: _vendorCode, ...vendorUpdate } = payload.vendor;
    const supabase = await createClient();
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .update(vendorUpdate)
      .eq("id", id)
      .select()
      .single();

    if (vendorError) return { error: mapDuplicateError(vendorError.message) };

    const { error: deleteError } = await supabase
      .from("vendor_addresses")
      .delete()
      .eq("vendor_id", id);

    if (deleteError) return { error: deleteError.message };

    const addressRows = payload.addresses.map((address) => ({
      ...address,
      vendor_id: id,
    }));
    const { error: addressError } = await supabase
      .from("vendor_addresses")
      .insert(addressRows);

    if (addressError) return { error: addressError.message };

    revalidatePath(VENDORS_PATH);
    return { success: true, data: vendor as VendorRecord };
  } catch (error) {
    console.error("Vendor update exception:", error);
    return { error: "เกิดข้อผิดพลาดในการแก้ไขผู้ขาย" };
  }
}

export async function deleteVendorAction(id: number): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("vendors").delete().eq("id", id);

    if (error) return { error: error.message };

    revalidatePath(VENDORS_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("Vendor delete exception:", error);
    return { error: "เกิดข้อผิดพลาดในการลบผู้ขาย" };
  }
}

export async function toggleVendorStatusAction(
  id: number,
  currentStatus: VendorStatus,
): Promise<ActionResult<VendorRecord>> {
  const nextStatus = currentStatus === STATUS_ACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("vendors")
      .update({ status: nextStatus })
      .eq("id", id)
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath(VENDORS_PATH);
    return { success: true, data: data as VendorRecord };
  } catch (error) {
    console.error("Vendor toggle exception:", error);
    return { error: "เกิดข้อผิดพลาดในการเปลี่ยนสถานะผู้ขาย" };
  }
}
