import type { Metadata } from "next";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import {
  normalizePurchaseOrderStatus,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type PurchaseOrderVendor,
} from "@/lib/purchase-orders";
import { createClient } from "@/utils/supabase/server";
import { PoListPage } from "./_components/po-list-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ใบสั่งซื้อ (PO) | KRC ERP",
};

type SearchParams = Record<string, string | string[] | undefined>;

type PurchaseOrderRow = Omit<PurchaseOrderSummary, "status"> & {
  status: string;
};

type VendorRow = {
  credit_term: { name: string } | { name: string }[] | null;
  id: number;
  payment_method: { name: string } | { name: string }[] | null;
  tax_type:
    | { name: string; tax_rate: number }
    | { name: string; tax_rate: number }[]
    | null;
  vendor_code: string;
  vendor_name: string;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function firstRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function PurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedOrderId = Number(firstValue(params.po));
  const initialOpenOrderId = Number.isSafeInteger(requestedOrderId) && requestedOrderId > 0
    ? requestedOrderId : null;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const query = firstValue(params.q).trim().slice(0, 100);
  const statusValue = firstValue(params.status);
  const status = PURCHASE_ORDER_STATUSES.includes(
    statusValue as PurchaseOrderStatus,
  )
    ? statusValue
    : "";
  const vendorValue = firstValue(params.vendor);
  const vendorId = Number(vendorValue);
  const startDate = firstValue(params.start) || toIsoDate(monthStart);
  const endDate = firstValue(params.end) || toIsoDate(today);
  const requestedPage = Number(firstValue(params.page));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 15;
  const offset = (page - 1) * pageSize;
  const supabase = await createClient();

  let ordersQuery = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, document_date, vendor_id, vendor_name, pr_references, delivery_date, item_count, grand_total, status",
      { count: "exact" },
    )
    .gte("document_date", startDate)
    .lte("document_date", endDate);

  if (status) {
    ordersQuery = ordersQuery.eq("status", status);
  }
  if (Number.isSafeInteger(vendorId) && vendorId > 0) {
    ordersQuery = ordersQuery.eq("vendor_id", vendorId);
  }
  if (query) {
    const safeQuery = query.replace(/[,%()]/g, " ").trim();
    if (safeQuery) {
      ordersQuery = ordersQuery.or(
        `po_number.ilike.%${safeQuery}%,vendor_name.ilike.%${safeQuery}%,pr_reference_text.ilike.%${safeQuery}%`,
      );
    }
  }

  const [
    ordersResult,
    vendorsResult,
    authResult,
    documentContext,
    approveResult,
    rejectResult,
  ] =
    await Promise.all([
    ordersQuery
      .order("document_date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1),
    supabase
      .from("vendors")
      .select(
        `
          id,
          vendor_code,
          vendor_name,
          credit_term:vendor_credit_terms!vendors_credit_term_id_fkey (name),
          payment_method:vendor_payment_methods!vendors_payment_method_id_fkey (name),
          tax_type:vendor_tax_types!vendors_tax_type_id_fkey (name, tax_rate)
        `,
      )
      .order("vendor_code", { ascending: true })
      .limit(1000),
      supabase.auth.getUser(),
      getCompanyDocumentContext(),
      supabase.rpc("authorize", { requested_permission: "po.approve" }),
      supabase.rpc("authorize", { requested_permission: "po.reject" }),
    ]);

  if (ordersResult.error) {
    console.error("Unable to load purchase orders:", {
      code: ordersResult.error.code,
      message: ordersResult.error.message,
    });
  }
  if (vendorsResult.error) {
    console.error("Unable to load PO vendors:", {
      code: vendorsResult.error.code,
      message: vendorsResult.error.message,
    });
  }

  const rows = ((ordersResult.data ?? []) as PurchaseOrderRow[]).map((row) => ({
    ...row,
    grand_total: Number(row.grand_total),
    id: Number(row.id),
    item_count: Number(row.item_count),
    pr_references: Array.isArray(row.pr_references) ? row.pr_references : [],
    status: normalizePurchaseOrderStatus(row.status),
    vendor_id: Number(row.vendor_id),
  }));
  const vendors = ((vendorsResult.data ?? []) as unknown as VendorRow[]).map<
    PurchaseOrderVendor
  >((row) => {
    const creditTerm = firstRelation(row.credit_term);
    const paymentMethod = firstRelation(row.payment_method);
    const taxType = firstRelation(row.tax_type);
    return {
      creditTermName: creditTerm?.name ?? "-",
      id: Number(row.id),
      paymentMethodName: paymentMethod?.name ?? "-",
      taxRate: Number(taxType?.tax_rate ?? 0),
      taxTypeName: taxType?.name ?? "-",
      vendorCode: row.vendor_code,
      vendorName: row.vendor_name,
    };
  });
  const user = authResult.data.user;
  const buyerName = String(
    user?.app_metadata.full_name ??
      user?.email?.split("@")[0] ??
      "ผู้ใช้งาน ERP",
  );

  return (
    <PoListPage
      buyerName={buyerName}
      canApprove={approveResult.data === true}
      canReject={rejectResult.data === true}
      documentContext={documentContext}
      documentDate={toIsoDate(today)}
      initialOpenOrderId={initialOpenOrderId}
      filters={{
        endDate,
        query,
        startDate,
        status,
        vendorId:
          Number.isSafeInteger(vendorId) && vendorId > 0
            ? String(vendorId)
            : "",
      }}
      page={page}
      pageSize={pageSize}
      rows={rows}
      total={ordersResult.count ?? 0}
      vendors={vendors}
    />
  );
}
