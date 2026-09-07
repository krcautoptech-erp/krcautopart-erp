import Link from "next/link";
import type { Metadata } from "next";
import type {
  CustomerAddressRecord,
  CustomerLookup,
  CustomerRecord,
  CustomerStatus,
} from "@/app/actions/customers";
import type {
  VendorAddressRecord,
  VendorLookup,
  VendorRecord,
  VendorStatus,
} from "@/app/actions/vendors";
import { CustomerManagement } from "@/app/(dashboard)/partners/_components/customer-management";
import { VendorManagement } from "@/app/(dashboard)/vendors/_components/vendor-management";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "คู่ค้า | KRC ERP",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type VendorRow = Omit<
  VendorRecord,
  "credit_term" | "payment_method" | "tax_type" | "vendor_addresses" | "vendor_group"
>;

type CustomerRow = Omit<
  CustomerRecord,
  "credit_term" | "tax_type" | "customer_type" | "customer_addresses"
>;

function normalizeVendorLookup(row: Record<string, unknown>): VendorLookup {
  return {
    code: String(row.code ?? ""),
    credit_days: typeof row.credit_days === "number" ? row.credit_days : null,
    id: Number(row.id),
    name: String(row.name ?? ""),
    status: String(row.status ?? "ใช้งาน") as VendorStatus,
    tax_rate: typeof row.tax_rate === "number" ? row.tax_rate : null,
  };
}

function normalizeCustomerLookup(row: Record<string, unknown>): CustomerLookup {
  return {
    code: String(row.code ?? ""),
    credit_days: typeof row.credit_days === "number" ? row.credit_days : null,
    id: Number(row.id),
    name: String(row.name ?? ""),
    status: String(row.status ?? "ใช้งาน") as CustomerStatus,
    tax_rate: typeof row.tax_rate === "number" ? row.tax_rate : null,
  };
}

async function loadVendorData() {
  const supabase = await createClient();
  const [
    vendorsResult,
    addressesResult,
    groupsResult,
    creditTermsResult,
    paymentMethodsResult,
    taxTypesResult,
  ] = await Promise.all([
    supabase.from("vendors").select("*").order("vendor_code", { ascending: true }),
    supabase
      .from("vendor_addresses")
      .select("*")
      .order("is_default", { ascending: false })
      .order("id", { ascending: true }),
    supabase.from("vendor_groups").select("*").order("code", { ascending: true }),
    supabase.from("vendor_credit_terms").select("*").order("code", { ascending: true }),
    supabase.from("vendor_payment_methods").select("*").order("code", { ascending: true }),
    supabase.from("vendor_tax_types").select("*").order("code", { ascending: true }),
  ]);

  const initialError =
    vendorsResult.error?.message ??
    addressesResult.error?.message ??
    groupsResult.error?.message ??
    creditTermsResult.error?.message ??
    paymentMethodsResult.error?.message ??
    taxTypesResult.error?.message ??
    null;

  const groups = (groupsResult.data ?? []).map((row) => normalizeVendorLookup(row));
  const creditTerms = (creditTermsResult.data ?? []).map((row) =>
    normalizeVendorLookup(row),
  );
  const paymentMethods = (paymentMethodsResult.data ?? []).map((row) =>
    normalizeVendorLookup(row),
  );
  const taxTypes = (taxTypesResult.data ?? []).map((row) => normalizeVendorLookup(row));

  const groupMap = new Map(groups.map((item) => [item.id, item]));
  const creditTermMap = new Map(creditTerms.map((item) => [item.id, item]));
  const paymentMethodMap = new Map(paymentMethods.map((item) => [item.id, item]));
  const taxTypeMap = new Map(taxTypes.map((item) => [item.id, item]));
  const addressMap = new Map<number, VendorAddressRecord[]>();

  for (const address of addressesResult.data ?? []) {
    const vendorId = Number(address.vendor_id);
    const nextAddress: VendorAddressRecord = {
      address_line: String(address.address_line ?? ""),
      address_name: String(address.address_name ?? ""),
      building: address.building,
      contact_name: address.contact_name,
      country: address.country,
      district: address.district,
      floor: address.floor,
      house_no: address.house_no,
      id: Number(address.id),
      is_default: Boolean(address.is_default),
      phone: address.phone,
      postal_code: address.postal_code,
      province: address.province,
      road: address.road,
      status: String(address.status ?? "ใช้งาน") as VendorStatus,
      subdistrict: address.subdistrict,
    };

    addressMap.set(vendorId, [...(addressMap.get(vendorId) ?? []), nextAddress]);
  }

  const vendors = ((vendorsResult.data ?? []) as VendorRow[]).map((vendor) => ({
    ...vendor,
    credit_term: creditTermMap.get(vendor.credit_term_id) ?? null,
    payment_method: paymentMethodMap.get(vendor.payment_method_id) ?? null,
    tax_type: taxTypeMap.get(vendor.tax_type_id) ?? null,
    vendor_addresses: addressMap.get(vendor.id) ?? [],
    vendor_group: groupMap.get(vendor.vendor_group_id) ?? null,
  })) satisfies VendorRecord[];

  return {
    initialError,
    lookups: {
      creditTerms,
      groups,
      paymentMethods,
      taxTypes,
    },
    vendors,
  };
}

async function loadCustomerData() {
  const supabase = await createClient();
  const [
    customersResult,
    addressesResult,
    customerTypesResult,
    creditTermsResult,
    taxTypesResult,
  ] = await Promise.all([
    supabase.from("customers").select("*").order("customer_code", { ascending: true }),
    supabase
      .from("customer_addresses")
      .select("*")
      .order("is_default", { ascending: false })
      .order("id", { ascending: true }),
    supabase
      .from("partner_customer_types")
      .select("*")
      .order("code", { ascending: true }),
    supabase.from("vendor_credit_terms").select("*").order("code", { ascending: true }),
    supabase.from("vendor_tax_types").select("*").order("code", { ascending: true }),
  ]);

  const initialError =
    customersResult.error?.message ??
    addressesResult.error?.message ??
    customerTypesResult.error?.message ??
    creditTermsResult.error?.message ??
    taxTypesResult.error?.message ??
    null;

  const customerTypes = (customerTypesResult.data ?? []).map((row) =>
    normalizeCustomerLookup(row),
  );
  const creditTerms = (creditTermsResult.data ?? []).map((row) =>
    normalizeCustomerLookup(row),
  );
  const taxTypes = (taxTypesResult.data ?? []).map((row) =>
    normalizeCustomerLookup(row),
  );

  const customerTypeMap = new Map(customerTypes.map((item) => [item.id, item]));
  const creditTermMap = new Map(creditTerms.map((item) => [item.id, item]));
  const taxTypeMap = new Map(taxTypes.map((item) => [item.id, item]));
  const addressMap = new Map<number, CustomerAddressRecord[]>();

  for (const address of addressesResult.data ?? []) {
    const customerId = Number(address.customer_id);
    const nextAddress: CustomerAddressRecord = {
      address_line: String(address.address_line ?? ""),
      address_name: String(address.address_name ?? ""),
      building: address.building,
      contact_name: address.contact_name,
      country: address.country,
      district: address.district,
      floor: address.floor,
      house_no: address.house_no,
      id: Number(address.id),
      is_default: Boolean(address.is_default),
      phone: address.phone,
      postal_code: address.postal_code,
      province: address.province,
      road: address.road,
      status: String(address.status ?? "ใช้งาน") as CustomerStatus,
      subdistrict: address.subdistrict,
    };

    addressMap.set(customerId, [...(addressMap.get(customerId) ?? []), nextAddress]);
  }

  const customers = ((customersResult.data ?? []) as CustomerRow[]).map((customer) => ({
    ...customer,
    credit_term: creditTermMap.get(customer.credit_term_id) ?? null,
    customer_addresses: addressMap.get(customer.id) ?? [],
    customer_type: customerTypeMap.get(customer.customer_type_id) ?? null,
    tax_type: taxTypeMap.get(customer.tax_type_id) ?? null,
  })) satisfies CustomerRecord[];

  return {
    customers,
    initialError,
    lookups: {
      creditTerms,
      customerTypes,
      taxTypes,
    },
  };
}

function PageTabs({ activeTab }: { activeTab: "vendors" | "customers" }) {
  const tabs = [
    { href: "/partners?tab=vendors", key: "vendors", label: "เจ้าหนี้ / ผู้ขาย" },
    { href: "/partners?tab=customers", key: "customers", label: "ลูกหนี้ / ลูกค้า" },
  ] as const;

  return (
    <div className="overflow-x-auto rounded-[10px] border border-outline-variant bg-surface-container-lowest px-6 pt-4 shadow-sm">
      <div className="flex min-w-max items-end gap-8 border-b border-outline-variant">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Link
              key={tab.key}
              className={`relative inline-flex items-center pb-3 text-[15px] font-bold transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-on-surface hover:text-primary/85"
              }`}
              href={tab.href}
            >
              {tab.label}
              <span
                className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-primary transition-all ${
                  isActive ? "w-full opacity-100" : "w-0 opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tabValue = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab;
  const activeTab = tabValue === "customers" ? "customers" : "vendors";

  if (activeTab === "customers") {
    const customerData = await loadCustomerData();

    return (
      <section className="space-y-lg">
        <PageTabs activeTab={activeTab} />
        <CustomerManagement
          initialCustomers={customerData.customers}
          initialError={customerData.initialError}
          lookups={customerData.lookups}
        />
      </section>
    );
  }

  const vendorData = await loadVendorData();

  return (
    <section className="space-y-lg">
      <PageTabs activeTab={activeTab} />
      <VendorManagement
        initialError={vendorData.initialError}
        initialVendors={vendorData.vendors}
        lookups={vendorData.lookups}
      />
    </section>
  );
}
