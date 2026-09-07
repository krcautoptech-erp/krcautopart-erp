"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { composeVendorAddressLine } from "@/lib/vendors/thai-address";

export type CustomerStatus = "ใช้งาน" | "ระงับการใช้งาน";

export type CustomerLookup = {
  code: string;
  credit_days?: number | null;
  id: number;
  name: string;
  status: CustomerStatus;
  tax_rate?: number | null;
};

export type CustomerAddressRecord = {
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
  phone: string | null;
  postal_code: string | null;
  province: string | null;
  road: string | null;
  status: CustomerStatus;
  subdistrict: string | null;
};

export type CustomerRecord = {
  branch: string | null;
  contact_name: string | null;
  created_at: string;
  credit_term: CustomerLookup | null;
  credit_term_id: number;
  customer_addresses: CustomerAddressRecord[];
  customer_code: string;
  customer_name: string;
  customer_type: CustomerLookup | null;
  customer_type_id: number;
  email: string | null;
  id: number;
  phone: string | null;
  remark: string | null;
  status: CustomerStatus;
  tax_no: string;
  tax_type: CustomerLookup | null;
  tax_type_id: number;
  updated_at: string;
};

export type CustomerAddressInput = {
  address_line: string;
  address_name: string;
  building: string;
  contact_name: string;
  country: string;
  district: string;
  floor: string;
  house_no: string;
  is_default: boolean;
  phone: string;
  postal_code: string;
  province: string;
  road: string;
  status: CustomerStatus;
  subdistrict: string;
};

export type CustomerInput = {
  branch: string;
  contact_name: string;
  credit_term_id: number;
  customer_addresses: CustomerAddressInput[];
  customer_code: string;
  customer_name: string;
  customer_type_id: number;
  email: string;
  phone: string;
  remark: string;
  status: CustomerStatus;
  tax_no: string;
  tax_type_id: number;
};

type ActionResult<T> = { success: true; data: T } | { error: string };

const PARTNERS_PATH = "/partners";
const STATUS_ACTIVE: CustomerStatus = "ใช้งาน";
const STATUS_INACTIVE: CustomerStatus = "ระงับการใช้งาน";

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function cleanOptional(value: string | null | undefined) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeStatus(value: string | null | undefined): CustomerStatus {
  return value === STATUS_INACTIVE ? STATUS_INACTIVE : STATUS_ACTIVE;
}

function normalizeCustomerInput(input: CustomerInput) {
  const addresses = input.customer_addresses
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
      phone: cleanOptional(address.phone),
      postal_code: cleanOptional(address.postal_code),
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
    customer: {
      branch: cleanOptional(input.branch),
      contact_name: cleanOptional(input.contact_name),
      credit_term_id: Number(input.credit_term_id),
      customer_code: cleanText(input.customer_code).toUpperCase(),
      customer_name: cleanText(input.customer_name),
      customer_type_id: Number(input.customer_type_id),
      email: cleanOptional(input.email),
      phone: cleanOptional(input.phone),
      remark: cleanOptional(input.remark),
      status: normalizeStatus(input.status),
      tax_no: cleanText(input.tax_no),
      tax_type_id: Number(input.tax_type_id),
    },
  };
}

function validateInput(input: ReturnType<typeof normalizeCustomerInput>) {
  if (!input.customer.customer_name) return "กรุณากรอกชื่อลูกค้า";
  if (!input.customer.customer_type_id) return "กรุณาเลือกประเภทลูกค้า";
  if (!input.customer.tax_no) return "กรุณากรอกเลขผู้เสียภาษี";
  if (!input.customer.branch) return "กรุณากรอกสาขา";
  if (!input.customer.credit_term_id) return "กรุณาเลือกเครดิตเทอม";
  if (!input.customer.tax_type_id) return "กรุณาเลือกประเภทภาษี";
  if (input.addresses.length === 0) {
    return "กรุณาเพิ่มที่อยู่ลูกค้าอย่างน้อย 1 รายการ";
  }

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
  return message.includes("customers_customer_code_unique")
    ? "รหัสลูกค้านี้มีอยู่ในระบบแล้ว"
    : message;
}

export async function createCustomerAction(
  input: CustomerInput,
): Promise<ActionResult<CustomerRecord>> {
  const payload = normalizeCustomerInput(input);
  const validationError = validateInput(payload);

  if (validationError) {
    return { error: validationError };
  }

  try {
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert(payload.customer)
      .select()
      .single();

    if (customerError) {
      return { error: mapDuplicateError(customerError.message) };
    }

    const addressRows = payload.addresses.map((address) => ({
      ...address,
      customer_id: customer.id,
    }));
    const { error: addressError } = await supabase
      .from("customer_addresses")
      .insert(addressRows);

    if (addressError) {
      await supabase.from("customers").delete().eq("id", customer.id);
      return { error: addressError.message };
    }

    revalidatePath(PARTNERS_PATH);
    return { success: true, data: customer as CustomerRecord };
  } catch (error) {
    console.error("Customer create exception:", error);
    return { error: "เกิดข้อผิดพลาดในการเพิ่มลูกหนี้ / ลูกค้า" };
  }
}

export async function updateCustomerAction(
  id: number,
  input: CustomerInput,
): Promise<ActionResult<CustomerRecord>> {
  const payload = normalizeCustomerInput(input);
  const validationError = validateInput(payload);

  if (validationError) {
    return { error: validationError };
  }

  try {
    const { customer_code: _customerCode, ...customerUpdate } = payload.customer;
    const supabase = await createClient();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .update(customerUpdate)
      .eq("id", id)
      .select()
      .single();

    if (customerError) {
      return { error: mapDuplicateError(customerError.message) };
    }

    const { error: deleteError } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("customer_id", id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    const addressRows = payload.addresses.map((address) => ({
      ...address,
      customer_id: id,
    }));
    const { error: addressError } = await supabase
      .from("customer_addresses")
      .insert(addressRows);

    if (addressError) {
      return { error: addressError.message };
    }

    revalidatePath(PARTNERS_PATH);
    return { success: true, data: customer as CustomerRecord };
  } catch (error) {
    console.error("Customer update exception:", error);
    return { error: "เกิดข้อผิดพลาดในการแก้ไขลูกหนี้ / ลูกค้า" };
  }
}

export async function deleteCustomerAction(
  id: number,
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("customers").delete().eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath(PARTNERS_PATH);
    return { success: true, data: null };
  } catch (error) {
    console.error("Customer delete exception:", error);
    return { error: "เกิดข้อผิดพลาดในการลบลูกหนี้ / ลูกค้า" };
  }
}
