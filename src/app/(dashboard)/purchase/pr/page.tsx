import type { Metadata } from "next";
import {
  normalizePurchaseRequisitionStatus,
  type PurchaseRequisitionStatus,
  type PurchaseRequisitionSummary,
} from "@/lib/purchase-requisitions";
import type { PurchaseRequisitionItem } from "@/lib/purchase-requisition-form";
import { formatDatabaseError, isMissingPurchaseCatalogRpc } from "@/lib/purchase-requisition-catalog";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";
import { PrListPage } from "./_components/pr-list-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ใบขอซื้อ (PR) | KRC ERP",
};

type PurchaseRequisitionRow = Omit<PurchaseRequisitionSummary, "status"> & {
  status: string;
};

type CatalogRow = { source: "raw_material" | "item_master"; source_id: number; item_code: string; item_name: string; item_description: string; type_code: string; type_name: string; unit_id: number; unit_name: string; unit_symbol: string; allows_decimal: boolean };
type LegacyRawMaterialRow = { id: number; material_code: string; material_name: string; thickness_mm: number; width_mm: number; length_mm: number; grade: { grade_name: string } | { grade_name: string }[] | null; unit: { id: number; unit_name: string; symbol: string; allows_decimal: boolean; status: string } | { id: number; unit_name: string; symbol: string; allows_decimal: boolean; status: string }[] | null };

function normalizeCatalogItem(row: CatalogRow): PurchaseRequisitionItem {
  return { allowsDecimal: Boolean(row.allows_decimal), code: row.item_code, description: row.item_description || row.item_name, gradeName: "", id: Number(row.source_id), lengthMm: 0, name: row.item_name, source: row.source, thicknessMm: 0, typeCode: row.type_code, typeName: row.type_name, unitId: Number(row.unit_id), unitName: row.unit_name, unitSymbol: row.unit_symbol || row.unit_name, widthMm: 0 };
}

function normalizeLegacyRawMaterial(row: LegacyRawMaterialRow): PurchaseRequisitionItem | null {
  const grade = Array.isArray(row.grade) ? row.grade[0] : row.grade;
  const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
  if (!grade || !unit || unit.status !== "active") return null;
  const description = `${row.material_name} ${grade.grade_name} ${Number(row.thickness_mm).toFixed(2)} × ${Number(row.width_mm).toLocaleString("en-US")} × ${Number(row.length_mm).toLocaleString("en-US")} มม.`;
  return { allowsDecimal: Boolean(unit.allows_decimal), code: row.material_code, description, gradeName: grade.grade_name, id: Number(row.id), lengthMm: Number(row.length_mm), name: row.material_name, source: "raw_material", thicknessMm: Number(row.thickness_mm), typeCode: "RM", typeName: "วัตถุดิบ", unitId: Number(unit.id), unitName: unit.unit_name, unitSymbol: unit.symbol, widthMm: Number(row.width_mm) };
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildPreviewStatuses(): PurchaseRequisitionStatus[] {
  return [
    ...Array.from({ length: 28 }, () => "pending_approval" as const),
    ...Array.from({ length: 96 }, () => "approved" as const),
    ...Array.from({ length: 30 }, () => "rejected" as const),
    ...Array.from({ length: 2 }, () => "cancelled" as const),
  ];
}

function buildPreviewRequisitions(
  referenceDate: Date,
): PurchaseRequisitionSummary[] {
  const requesters = [
    "น.ส. ปิยาภรณ์ แซ่ลิ้ม",
    "นายวรพจน์ ใจดี",
    "น.ส. อรวรรณ คงศรี",
    "นายนัฐพล อินทร์แก้ว",
  ];
  const departments = ["จัดซื้อ", "คลังสินค้า", "ผลิต", "ซ่อมบำรุง"];
  const statuses = buildPreviewStatuses();

  return Array.from({ length: 156 }, (_, index) => {
    const documentDate = new Date(referenceDate);
    documentDate.setDate(referenceDate.getDate() - index);

    const neededByDate = new Date(documentDate);
    neededByDate.setDate(documentDate.getDate() + 9 + (index % 4));

    const itemCounts = [8, 5, 12, 3, 7, 6, 4, 2, 9, 11, 3, 5, 7, 4, 6];
    const totalQty = [25, 12, 44, 6, 18, 22, 8, 4, 30, 40, 9, 14, 21, 8, 16];

    return {
      department_name: departments[index % departments.length],
      document_date: toIsoDate(documentDate),
      id: index + 1,
      needed_by_date: toIsoDate(neededByDate),
      pr_number: `PR${String(documentDate.getFullYear()).slice(-2)}${String(
        documentDate.getMonth() + 1,
      ).padStart(2, "0")}${String(156 - index).padStart(4, "0")}`,
      remarks: index % 6 === 0 ? "เร่งใช้ในไลน์ผลิต" : null,
      requested_item_count: itemCounts[index % itemCounts.length],
      requested_total_qty: totalQty[index % totalQty.length],
      requester_name: requesters[index % requesters.length],
      status: statuses[index],
    };
  });
}

function getInitialPreviewWindow(requisitions: PurchaseRequisitionSummary[]) {
  const previewRows = requisitions.slice(0, 15);

  return {
    startDate:
      previewRows[previewRows.length - 1]?.document_date ??
      requisitions[requisitions.length - 1]?.document_date ??
      "",
    endDate: previewRows[0]?.document_date ?? requisitions[0]?.document_date ?? "",
  };
}

export default async function PurchaseRequisitionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const parameters = await searchParams;
  const requestedPrValue = Array.isArray(parameters.pr)
    ? parameters.pr[0]
    : parameters.pr;
  const requestedPrId = Number(requestedPrValue);
  const initialOpenRequisitionId =
    Number.isSafeInteger(requestedPrId) && requestedPrId > 0
      ? requestedPrId
      : null;
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [
    requisitionResult,
    catalogResult,
    authResult,
    ownerResult,
    documentContext,
  ] = await Promise.all([
    supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, document_date, requester_name, department_name, needed_by_date, status, requested_item_count, requested_total_qty, remarks",
      )
      .order("document_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(180),
    supabase.rpc("get_purchase_requisition_catalog"),
      supabase.auth.getUser(),
      supabase.rpc("is_current_user_owner"),
      getCompanyDocumentContext(),
    ]);

  if (requisitionResult.error) {
    console.error("Error loading purchase requisitions:", requisitionResult.error);
  }
  let materials: PurchaseRequisitionItem[] = [];
  if (!catalogResult.error) {
    materials = ((catalogResult.data ?? []) as unknown as CatalogRow[]).map(normalizeCatalogItem);
  } else if (isMissingPurchaseCatalogRpc(catalogResult.error)) {
    const fallback = await supabase
      .from("item_master")
      .select(`
        id,
        item_code,
        item_name,
        description,
        unit_id,
        item_types!inner(type_code, type_name, is_purchasable),
        unit:raw_material_units(id, unit_name, symbol, allows_decimal, status)
      `)
      .eq("status", "active")
      .eq("item_types.is_purchasable", true)
      .order("item_code");

    if (fallback.error) console.error("Error loading item_master PR catalog fallback:", formatDatabaseError(fallback.error));
    materials = (fallback.data ?? []).map((row) => {
      const unitObj = (Array.isArray(row.unit) ? row.unit[0] : row.unit) as Record<string, unknown> | null;
      const typeObj = (Array.isArray(row.item_types) ? row.item_types[0] : row.item_types) as Record<string, unknown> | null;
      return normalizeCatalogItem({
        allows_decimal: Boolean(unitObj?.allows_decimal),
        item_code: String(row.item_code ?? ""),
        item_description: String(row.description ?? row.item_name ?? ""),
        item_name: String(row.item_name ?? ""),
        source: "item_master",
        source_id: Number(row.id),
        type_code: String(typeObj?.type_code ?? "ITEM"),
        type_name: String(typeObj?.type_name ?? "รายการ"),
        unit_id: Number(row.unit_id ?? unitObj?.id ?? 0),
        unit_name: String(unitObj?.unit_name ?? unitObj?.symbol ?? "ชิ้น"),
        unit_symbol: String(unitObj?.symbol ?? unitObj?.unit_name ?? "ชิ้น"),
      });
    });
  } else {
    console.error("Error loading purchasable PR catalog:", formatDatabaseError(catalogResult.error));
  }

  const requisitions = ((requisitionResult.data ?? []) as PurchaseRequisitionRow[]).map(
    (row) => ({
      ...row,
      status: normalizePurchaseRequisitionStatus(row.status),
    }),
  );
  const user = authResult.data.user;
  const requester = {
    departmentName: String(user?.app_metadata.department_name ?? "ไม่ระบุแผนก"),
    name: String(
      user?.app_metadata.full_name ?? user?.email?.split("@")[0] ?? "ผู้ใช้งาน ERP",
    ),
  };
  const isPreviewData = requisitions.length === 0;
  const fallbackPreview = buildPreviewRequisitions(today);
  const resolvedRequisitions = isPreviewData ? fallbackPreview : requisitions;
  const departments = Array.from(
    new Set(resolvedRequisitions.map((item) => item.department_name)),
  ).sort((left, right) => left.localeCompare(right, "th"));

  const previewWindow = getInitialPreviewWindow(resolvedRequisitions);
  const initialStartDate = isPreviewData
    ? previewWindow.startDate
    : toIsoDate(currentMonthStart);
  const initialEndDate = isPreviewData
    ? previewWindow.endDate
    : toIsoDate(currentMonthEnd);

  return (
    <section className="space-y-4">
      <PrListPage
        canDecide={ownerResult.data === true && !isPreviewData}
        documentContext={documentContext}
        initialDepartments={departments}
        initialDocumentDate={toIsoDate(today)}
        initialEndDate={initialEndDate}
        initialMaterials={materials}
        initialOpenRequisitionId={initialOpenRequisitionId}
        initialRequisitions={resolvedRequisitions}
        initialRequester={requester}
        initialStartDate={initialStartDate}
      />
    </section>
  );
}
