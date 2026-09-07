"use server";

import { createClient } from "@/utils/supabase/server";
import { resolveInventoryActorName } from "@/lib/central-stock";

export type InventoryLotPackage = {
  id: number;
  packageNumber: string;
  quantity: number;
  weightKg: number | null;
  status: string;
};

export type InventoryLotBalance = {
  id: number;
  materialCode: string;
  materialName: string;
  specification: string;
  gradeName: string;
  lotNumber: string;
  supplierCoilNo: string;
  warehouseId: number;
  warehouseName: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  receivedWeightKg: number | null;
  unitSymbol: string;
  receivedAt: string;
  grNumber: string;
  poNumber: string;
  packages: InventoryLotPackage[];
};

export type InventoryLotMovement = {
  id: number;
  transactionType: string;
  referenceDocType: string;
  referenceDocNumber: string;
  quantityChange: number;
  createdAt: string;
  actorName: string;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getInventoryLotBalancesAction() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

  const { data, error } = await supabase
    .from("inventory_lots")
    .select(`
      id, lot_number, warehouse_id, on_hand_qty, item_master_id,
      reserved_qty, available_qty, received_at,
      item_master (
        item_code, item_name, item_name_en, attributes,
        item_types (type_code, type_name),
        raw_material_units (symbol)
      ),
      raw_material_warehouses (warehouse_name),
      goods_receipts (gr_number),
      purchase_orders (po_number)
    `)
    .order("received_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Unable to load inventory lots:", error.message);
    return { error: "ไม่สามารถโหลดสต็อกตาม Lot ได้ กรุณารัน migration ล่าสุด", data: [] };
  }

  const formatted: InventoryLotBalance[] = (data ?? []).map((row) => {
    const itemMaster = relation(row.item_master);
    const warehouse = relation(row.raw_material_warehouses);
    const receipt = relation(row.goods_receipts);
    const purchaseOrder = relation(row.purchase_orders);
    const unit = relation(itemMaster?.raw_material_units);
    const attributes = itemMaster?.attributes && typeof itemMaster.attributes === "object" && !Array.isArray(itemMaster.attributes)
      ? itemMaster.attributes as Record<string, unknown>
      : {};
    const dimension = [
      attributes.thickness,
      attributes.width,
      attributes.length,
    ]
      .filter((value) => value != null)
      .map((value) => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 }))
      .join(" × ");
    const gradeName = String(attributes.gradeName ?? attributes.materialGrade ?? "-");

    return {
      id: Number(row.id),
      materialCode: String(itemMaster?.item_code ?? "-"),
      materialName: String(itemMaster?.item_name ?? "-"),
      specification: dimension ? `${gradeName} ${dimension} มม.` : gradeName,
      gradeName,
      lotNumber: String(row.lot_number),
      supplierCoilNo: "-",
      warehouseId: Number(row.warehouse_id),
      warehouseName: String(warehouse?.warehouse_name ?? "-"),
      onHandQty: Number(row.on_hand_qty),
      reservedQty: Number(row.reserved_qty),
      availableQty: Number(row.available_qty),
      receivedWeightKg: null,
      unitSymbol: String(unit?.symbol ?? "ชิ้น"),
      receivedAt: String(row.received_at),
      grNumber: String(receipt?.gr_number ?? "-"),
      poNumber: String(purchaseOrder?.po_number ?? "-"),
      packages: [],
    };
  });

  return { success: true as const, data: formatted };
}

export async function getInventoryLotHistoryAction(lotId: number) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

  const { data, error } = await supabase
    .from("inventory_transactions")
    .select(`
      id, transaction_type, reference_doc_type, reference_doc_number,
      quantity_change, created_by, created_at
    `)
    .eq("lot_id", lotId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("Unable to load lot movements:", error.message);
    return { error: "ไม่สามารถโหลดประวัติ Lot ได้", data: [] };
  }

  const formatted: InventoryLotMovement[] = (data ?? []).map((row) => {
    return {
      id: Number(row.id),
      transactionType: String(row.transaction_type),
      referenceDocType: String(row.reference_doc_type),
      referenceDocNumber: String(row.reference_doc_number),
      quantityChange: Number(row.quantity_change),
      createdAt: String(row.created_at),
      actorName: resolveInventoryActorName(
        row.created_by ? String(row.created_by) : null,
        authData.user.id,
        authData.user.email ?? "ผู้ใช้ปัจจุบัน",
      ),
    };
  });

  return { success: true as const, data: formatted };
}
