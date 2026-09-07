"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  getAssetStatusMeta,
  type AssetRecord,
  type AssetSummary,
  type AssetFilterParams,
  type AssetLookupData,
  type AssetStatus,
} from "@/lib/assets";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function hasAssetPermission(
  supabase: SupabaseClient,
  permission: "assets.view" | "assets.manage",
) {
  const { data } = await supabase.rpc("authorize", {
    requested_permission: permission,
  });
  return Boolean(data);
}

export async function getAssetLookupsAction(): Promise<{
  success: boolean;
  data?: AssetLookupData;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    if (!(await hasAssetPermission(supabase, "assets.view"))) {
      return { success: false, error: "คุณไม่มีสิทธิ์ดูข้อมูลสินทรัพย์" };
    }

    const { data, error } = await supabase
      .from("departments")
      .select("id, department_name, department_code")
      .eq("status", "active")
      .order("department_name", { ascending: true });

    if (error) {
      console.error("Error fetching asset lookups:", error);
      return { success: false, error: "ไม่สามารถโหลดข้อมูลแผนกได้" };
    }

    return {
      success: true,
      data: {
        departments: (data ?? []).map((d) => ({
          id: Number(d.id),
          name: String(d.department_name),
          code: d.department_code ? String(d.department_code) : null,
        })),
      },
    };
  } catch (err) {
    console.error("Unexpected error fetching asset lookups:", err);
    return { success: false, error: "เกิดข้อผิดพลาดในการโหลดข้อมูล" };
  }
}

export async function getAssetSummaryAction(): Promise<{
  success: boolean;
  data?: AssetSummary;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    if (!(await hasAssetPermission(supabase, "assets.view"))) {
      return {
        success: true,
        data: {
          totalCount: 0,
          inUseCount: 0,
          inStockCount: 0,
          repairCount: 0,
          disposedCount: 0,
        },
      };
    }

    const { data, error } = await supabase
      .from("inventory_serials")
      .select("status");

    if (error) {
      console.error("Error fetching asset summary:", error);
      return {
        success: true,
        data: {
          totalCount: 0,
          inUseCount: 0,
          inStockCount: 0,
          repairCount: 0,
          disposedCount: 0,
        },
      };
    }

    let inUse = 0;
    let inStock = 0;
    let repair = 0;
    let disposed = 0;

    (data ?? []).forEach((row) => {
      const st = String(row.status || "").toLowerCase();
      if (st === "in_use") inUse++;
      else if (st === "in_stock") inStock++;
      else if (st === "under_repair") repair++;
      else if (st === "scrapped" || st === "disposed") disposed++;
    });

    return {
      success: true,
      data: {
        totalCount: data?.length ?? 0,
        inUseCount: inUse,
        inStockCount: inStock,
        repairCount: repair,
        disposedCount: disposed,
      },
    };
  } catch (err) {
    console.error("Unexpected error in getAssetSummaryAction:", err);
    return {
      success: true,
      data: {
        totalCount: 0,
        inUseCount: 0,
        inStockCount: 0,
        repairCount: 0,
        disposedCount: 0,
      },
    };
  }
}

export async function getAssetCatalogAction(params: AssetFilterParams = {}) {
  try {
    const supabase = await createClient();
    if (!(await hasAssetPermission(supabase, "assets.view"))) {
      return { success: false, error: "คุณไม่มีสิทธิ์ดูข้อมูลสินทรัพย์" };
    }

    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 25));
    const offset = (page - 1) * pageSize;
    const search = (params.search || "").trim();
    const status = (params.status || "").trim();
    const departmentId = params.departmentId ? Number(params.departmentId) : null;

    let query = supabase
      .from("inventory_serials")
      .select(
        `
        id,
        serial_number,
        status,
        custodian_name,
        location_note,
        warranty_expiry_date,
        notes,
        created_at,
        updated_at,
        department_id,
        warehouse_id,
        raw_material_warehouses (
          id,
          warehouse_name
        ),
        item_master_id,
        item_master (
          id,
          item_code,
          item_name,
          attributes,
          item_types (
            type_code,
            type_name
          )
        ),
        goods_receipt_id,
        goods_receipts (
          id,
          gr_number,
          document_date,
          purchase_orders (
            id,
            po_number,
            vendor_id,
            vendor_name
          )
        ),
        purchase_order_item_id,
        purchase_order_items (
          unit_price
        )
      `,
        { count: "exact" },
      );

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    if (departmentId && Number.isFinite(departmentId) && departmentId > 0) {
      query = query.eq("department_id", departmentId);
    }

    if (search) {
      query = query.or(
        `serial_number.ilike.%${search}%,custodian_name.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }

    query = query
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);

    const [serialRes, deptRes] = await Promise.all([
      query,
      supabase.from("departments").select("id, department_name"),
    ]);

    if (serialRes.error) {
      console.error("Error fetching asset catalog:", serialRes.error);
      return { success: false, error: "ไม่สามารถดึงข้อมูลทะเบียนสินทรัพย์ได้" };
    }

    const deptMap = new Map<number, string>();
    (deptRes.data ?? []).forEach((d) => {
      deptMap.set(Number(d.id), String(d.department_name));
    });

    const items: AssetRecord[] = (serialRes.data ?? []).map((row) => {
      const itemMasterRaw = (Array.isArray(row.item_master) ? row.item_master[0] : row.item_master) as unknown as Record<string, unknown> | null;
      const itemMaster = itemMasterRaw;
      const itemType = (Array.isArray(itemMaster?.item_types) ? itemMaster.item_types[0] : itemMaster?.item_types) as unknown as Record<string, unknown> | null;
      const attrs = (itemMaster?.attributes && typeof itemMaster.attributes === "object" ? itemMaster.attributes : {}) as Record<string, unknown>;
      const gr = (Array.isArray(row.goods_receipts) ? row.goods_receipts[0] : row.goods_receipts) as unknown as Record<string, unknown> | null;
      const po = (Array.isArray(gr?.purchase_orders) ? gr.purchase_orders[0] : gr?.purchase_orders) as unknown as Record<string, unknown> | null;
      const poItem = (Array.isArray(row.purchase_order_items) ? row.purchase_order_items[0] : row.purchase_order_items) as unknown as Record<string, unknown> | null;
      const wh = (Array.isArray(row.raw_material_warehouses) ? row.raw_material_warehouses[0] : row.raw_material_warehouses) as unknown as Record<string, unknown> | null;
      const meta = getAssetStatusMeta(row.status);
      const dId = row.department_id ? Number(row.department_id) : null;
      const dName = dId ? deptMap.get(dId) ?? null : null;
      const unitName = attrs.unitName || attrs.unit || "หน่วย";

      return {
        id: Number(row.id),
        itemMasterId: Number(row.item_master_id),
        itemCode: String(itemMaster?.item_code ?? "-"),
        itemName: String(itemMaster?.item_name ?? "-"),
        itemTypeCode: String(itemType?.type_code ?? "-"),
        itemTypeName: String(itemType?.type_name ?? "-"),
        serialNumber: String(row.serial_number),
        status: row.status as AssetStatus,
        statusLabel: meta.label,
        statusColor: meta.color,
        departmentId: dId,
        departmentName: dName,
        custodianName: row.custodian_name ? String(row.custodian_name) : null,
        locationNote: row.location_note ? String(row.location_note) : null,
        warrantyExpiryDate: row.warranty_expiry_date ? String(row.warranty_expiry_date) : null,
        notes: row.notes ? String(row.notes) : null,
        receiptId: row.goods_receipt_id ? Number(row.goods_receipt_id) : null,
        grNumber: gr?.gr_number ? String(gr.gr_number) : null,
        receiptDate: gr?.document_date ? String(gr.document_date) : null,
        purchaseOrderId: po?.id ? Number(po.id) : null,
        poNumber: po?.po_number ? String(po.po_number) : null,
        vendorId: po?.vendor_id ? Number(po.vendor_id) : null,
        vendorName: po?.vendor_name ? String(po.vendor_name) : null,
        unitPrice: poItem?.unit_price != null ? Number(poItem.unit_price) : null,
        unitName: String(unitName),
        warehouseId: row.warehouse_id ? Number(row.warehouse_id) : null,
        warehouseName: wh?.warehouse_name ? String(wh.warehouse_name) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    });

    const totalCount = serialRes.count ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      success: true,
      data: {
        items,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages,
        },
      },
    };
  } catch (err) {
    console.error("Unexpected error in getAssetCatalogAction:", err);
    return { success: false, error: "เกิดข้อผิดพลาดในการโหลดรายการสินทรัพย์" };
  }
}

export async function updateAssetCustodianAction(input: {
  assetId: number;
  departmentId: number | null;
  custodianName: string | null;
  locationNote: string | null;
  warrantyExpiryDate?: string | null;
  notes?: string | null;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };
    }
    if (!(await hasAssetPermission(supabase, "assets.manage"))) {
      return { success: false, error: "คุณไม่มีสิทธิ์จัดการสินทรัพย์" };
    }

    const payload: Record<string, unknown> = {
      department_id: input.departmentId || null,
      custodian_name: input.custodianName?.trim() || null,
      location_note: input.locationNote?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (input.warrantyExpiryDate !== undefined) {
      payload.warranty_expiry_date = input.warrantyExpiryDate || null;
    }

    const { error } = await supabase
      .from("inventory_serials")
      .update(payload)
      .eq("id", input.assetId);

    if (error) {
      console.error("Error updating asset custodian:", error);
      return { success: false, error: "ไม่สามารถอัปเดตข้อมูลผู้ถือครองได้" };
    }

    revalidatePath("/assets");
    return { success: true };
  } catch (err) {
    console.error("Unexpected error in updateAssetCustodianAction:", err);
    return { success: false, error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" };
  }
}

export async function updateAssetStatusAction(input: {
  assetId: number;
  status: AssetStatus;
  notes?: string | null;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };
    }
    if (!(await hasAssetPermission(supabase, "assets.manage"))) {
      return { success: false, error: "คุณไม่มีสิทธิ์จัดการสินทรัพย์" };
    }

    const payload: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (input.notes !== undefined) {
      payload.notes = input.notes?.trim() || null;
    }

    const { error } = await supabase
      .from("inventory_serials")
      .update(payload)
      .eq("id", input.assetId);

    if (error) {
      console.error("Error updating asset status:", error);
      return { success: false, error: "ไม่สามารถเปลี่ยนสถานะสินทรัพย์ได้" };
    }

    revalidatePath("/assets");
    return { success: true };
  } catch (err) {
    console.error("Unexpected error in updateAssetStatusAction:", err);
    return { success: false, error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" };
  }
}
