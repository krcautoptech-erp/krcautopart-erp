"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { resolveInventoryActorName, type CentralStockRow, type StockStateCode } from "@/lib/central-stock";
import type { SupplierDocumentType } from "@/lib/goods-receipts";

type DbRow = Record<string, unknown>;
type MaybeArray<T> = T | T[] | null | undefined;

function firstRelation<T>(value: MaybeArray<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function objectValue(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

export type GoodsReceiptSummary = {
  id: number;
  gr_number: string;
  document_date: string;
  purchase_order_id: number;
  po_number: string;
  vendor_id: number;
  vendor_code: string;
  vendor_name: string;
  delivery_note_no: string | null;
  supplier_document_type: SupplierDocumentType | null;
  supplier_document_date: string | null;
  status: "draft" | "posted" | "cancelled";
  remarks: string | null;
  created_at: string;
  item_count?: number;
};

export type GoodsReceiptLineItem = {
  purchase_order_item_id: number;
  raw_material_id: number | null;
  item_master_id?: number | null;
  item_code: string;
  item_name: string;
  is_stocked?: boolean;
  tracking_method?: "none" | "lot" | "serial";
  quantity_ordered: number;
  quantity_received: number;
  unit_name: string;
  warehouse_id: number | null;
  remarks?: string;
  line_no?: number;
  lot_number?: string;
  vendor_lot_no?: string | null;
  mfg_date?: string | null;
  expiry_date?: string | null;
  serial_numbers?: string[];
  supplier_coil_no?: string;
  weight_kg?: number | null;
  warehouse_name?: string;
};

export type GoodsReceiptSubmission = {
  requestKey: string;
  purchaseOrderId: number;
  documentDate: string;
  deliveryNoteNo: string;
  supplierDocumentType: SupplierDocumentType;
  supplierDocumentDate: string;
  allowDuplicateSupplierDocument?: boolean;
  remarks: string;
  items: Array<{
    purchaseOrderItemId: number;
    quantityReceived: number;
    warehouseId: number | null;
    remarks: string;
    vendorLotNo?: string;
    mfgDate?: string;
    expiryDate?: string;
    serialNumbers?: string[];
  }>;
};

function getErrorMessage(message: string) {
  if (message.includes("authentication_required")) {
    return "กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
  }
  if (message.includes("permission_denied")) {
    return "คุณไม่มีสิทธิ์ในการบันทึกใบรับสินค้า";
  }
  if (message.includes("purchase_order_not_found")) {
    return "ไม่พบใบสั่งซื้อที่ระบุ";
  }
  if (message.includes("invalid_purchase_order_status_for_receipt")) {
    return "ใบสั่งซื้อนี้ไม่สามารถรับสินค้าได้ (ต้องอยู่ในสถานะ อนุมัติแล้ว หรือ ส่งให้คู่ค้าแล้ว)";
  }
  if (message.includes("received_qty_exceeded_ordered")) {
    const itemName = message.split(":")[1] || "";
    return `จำนวนที่รับเกินจำนวนที่สั่งซื้อสำหรับรายการ: ${itemName}`;
  }
  if (message.includes("invalid_quantity_received")) {
    return "จำนวนที่รับต้องไม่ติดลบ";
  }
  if (message.includes("warehouse_required")) {
    return "สินค้าที่เก็บสต็อกต้องระบุคลังรับเข้า";
  }
  if (message.includes("serial_quantity_must_be_integer")) {
    return "สินค้าคุม Serial ต้องรับเป็นจำนวนเต็มเท่านั้น";
  }
  if (message.includes("serial_numbers_count_mismatch")) {
    const itemName = message.split(":")[1] || "";
    return `จำนวน Serial Number ต้องเท่ากับจำนวนรับ: ${itemName}`;
  }
  if (message.includes("inventory_serials_item_serial_unique")) {
    return "พบ Serial Number ซ้ำในระบบ";
  }
  if (message.includes("request_key_conflict")) {
    return "คำขอบันทึกนี้ถูกใช้กับเอกสารอื่นแล้ว กรุณาเปิดรายการใหม่";
  }
  if (message.includes("invalid_supplier_document")) {
    return "กรุณาระบุประเภท เลขที่ และวันที่เอกสารผู้ขายให้ครบถ้วน";
  }
  return "เกิดข้อผิดพลาดในการบันทึกใบรับสินค้า";
}

// 1. Fetch posted Goods Receipts for list view
export async function getGoodsReceiptsAction(options?: {
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };
    }

    let query = supabase
      .from("goods_receipts")
      .select(`
        id,
        gr_number,
        document_date,
        purchase_order_id,
        delivery_note_no,
        supplier_document_type,
        supplier_document_date,
        status,
        remarks,
        created_at,
        purchase_orders (po_number),
        vendor_id,
        vendor_code,
        vendor_name,
        goods_receipt_items(count)
      `);

    if (options?.startDate) {
      query = query.gte("document_date", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("document_date", options.endDate);
    }
    if (options?.search) {
      const keyword = options.search.trim();
      query = query.or(`gr_number.ilike.%${keyword}%,vendor_name.ilike.%${keyword}%,delivery_note_no.ilike.%${keyword}%`);
    }

    const { data, error } = await query
      .order("document_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      console.error("getGoodsReceiptsAction error:", error);
      return { error: "ไม่สามารถดึงข้อมูลใบตรวจรับสินค้าได้", data: [] };
    }

    const formatted = ((data ?? []) as DbRow[]).map((row) => ({
      id: Number(row.id),
      gr_number: String(row.gr_number),
      document_date: String(row.document_date),
      purchase_order_id: Number(row.purchase_order_id),
      po_number: String(firstRelation(row.purchase_orders as MaybeArray<DbRow>)?.po_number ?? "-"),
      vendor_id: Number(row.vendor_id),
      vendor_code: String(row.vendor_code),
      vendor_name: String(row.vendor_name),
      delivery_note_no: row.delivery_note_no === null ? null : String(row.delivery_note_no),
      supplier_document_type: row.supplier_document_type as SupplierDocumentType | null,
      supplier_document_date: row.supplier_document_date === null ? null : String(row.supplier_document_date),
      status: row.status as GoodsReceiptSummary["status"],
      remarks: row.remarks === null ? null : String(row.remarks),
      created_at: String(row.created_at),
      item_count: Number(firstRelation(row.goods_receipt_items as MaybeArray<DbRow>)?.count ?? 0),
    }));

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getGoodsReceiptsAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการโหลดรายการ", data: [] };
  }
}

// 2. Fetch details of a single Goods Receipt
export async function getGoodsReceiptDetailAction(grId: number) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };

    const [headerRes, itemsRes] = await Promise.all([
      supabase
        .from("goods_receipts")
        .select(`
          id,
          gr_number,
          document_date,
          purchase_order_id,
          delivery_note_no,
          supplier_document_type,
          supplier_document_date,
          status,
          remarks,
          created_at,
          purchase_orders (po_number),
          vendor_id,
          vendor_code,
          vendor_name
        `)
        .eq("id", grId)
        .maybeSingle(),
      supabase
        .from("goods_receipt_items")
        .select(`
          *,
          purchase_order_items (
            item_name,
            item_description
          )
        `)
        .eq("goods_receipt_id", grId)
        .order("line_no", { ascending: true })
    ]);

    if (headerRes.error) {
      return { error: "ไม่สามารถดึงข้อมูลเอกสารรับสินค้าได้" };
    }
    if (!headerRes.data) {
      return { error: "ไม่พบเอกสารตรวจรับสินค้า" };
    }

    let vendorAddress = "";
    if (headerRes.data.vendor_id) {
      const addrRes = await supabase
        .from("vendor_addresses")
        .select("address_line")
        .eq("vendor_id", Number(headerRes.data.vendor_id))
        .eq("is_default", true)
        .maybeSingle();
      if (addrRes.data) {
        vendorAddress = String(addrRes.data.address_line);
      }
    }

    const receiptItemIds = ((itemsRes.data ?? []) as DbRow[]).map((row) => Number(row.id));
    const serialRes = receiptItemIds.length > 0
      ? await supabase
          .from("inventory_serials")
          .select("goods_receipt_item_id, serial_number")
          .in("goods_receipt_item_id", receiptItemIds)
          .order("serial_number", { ascending: true })
      : { data: [], error: null };
    if (serialRes.error) {
      console.error("Unable to load inventory serials:", serialRes.error);
    }
    const serialsByReceiptItem = new Map<number, string[]>();
    for (const serial of serialRes.data ?? []) {
      const key = Number(serial.goods_receipt_item_id);
      const current = serialsByReceiptItem.get(key) ?? [];
      current.push(String(serial.serial_number));
      serialsByReceiptItem.set(key, current);
    }

    const header = {
      id: Number(headerRes.data.id),
      gr_number: String(headerRes.data.gr_number),
      document_date: String(headerRes.data.document_date),
      purchase_order_id: Number(headerRes.data.purchase_order_id),
      po_number: String(firstRelation((headerRes.data as DbRow).purchase_orders as MaybeArray<DbRow>)?.po_number ?? "-"),
      vendor_id: Number(headerRes.data.vendor_id),
      vendor_code: String(headerRes.data.vendor_code),
      vendor_name: String(headerRes.data.vendor_name),
      vendor_address: vendorAddress,
      delivery_note_no: headerRes.data.delivery_note_no,
      supplier_document_type: headerRes.data.supplier_document_type as SupplierDocumentType | null,
      supplier_document_date: headerRes.data.supplier_document_date,
      status: headerRes.data.status as GoodsReceiptSummary["status"],
      remarks: headerRes.data.remarks,
      created_at: String(headerRes.data.created_at),
    };

    const items = ((itemsRes.data ?? []) as DbRow[]).map((row) => {
      const poItem = firstRelation(row.purchase_order_items as MaybeArray<DbRow>);
      const trackingMethod: GoodsReceiptLineItem["tracking_method"] = row.tracking_method === "serial" || row.tracking_method === "lot" ? row.tracking_method : "none";
      return {
        id: Number(row.id),
        line_no: Number(row.line_no),
        purchase_order_item_id: Number(row.purchase_order_item_id),
        raw_material_id: row.raw_material_id === null ? null : Number(row.raw_material_id),
        item_master_id: row.item_master_id === null ? null : Number(row.item_master_id),
        item_code: String(row.item_code),
        item_name: String(poItem?.item_name || row.item_name),
        quantity_ordered: Number(row.quantity_ordered),
        quantity_received: Number(row.quantity_received),
        unit_name: String(row.unit_name),
        warehouse_id: row.warehouse_id === null ? null : Number(row.warehouse_id),
        is_stocked: row.is_stocked !== false,
        tracking_method: trackingMethod,
        vendor_lot_no: row.vendor_lot_no == null ? null : String(row.vendor_lot_no),
        mfg_date: row.mfg_date == null ? null : String(row.mfg_date),
        expiry_date: row.expiry_date == null ? null : String(row.expiry_date),
        serial_numbers: serialsByReceiptItem.get(Number(row.id)) ?? [],
        remarks: row.remarks == null ? undefined : String(row.remarks),
      };
    });

    return { success: true, data: { header, items } };
  } catch (error) {
    console.error("getGoodsReceiptDetailAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการดึงข้อมูลใบตรวจรับ" };
  }
}

// 3. Post a Goods Receipt (Triggering atomic RPC)
export async function postGoodsReceiptAction(input: GoodsReceiptSubmission) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false as const };
    }

    // Call Postgres security definer RPC
    const { data, error } = await supabase.rpc("post_goods_receipt", {
      p_purchase_order_id: input.purchaseOrderId,
      p_document_date: input.documentDate,
      p_delivery_note_no: input.deliveryNoteNo.trim() || null,
      p_remarks: input.remarks.trim() || null,
      p_request_key: input.requestKey,
      p_supplier_document_type: input.supplierDocumentType,
      p_supplier_document_date: input.supplierDocumentDate,
      p_allow_duplicate: input.allowDuplicateSupplierDocument ?? false,
      p_items: input.items.map((item, idx) => ({
        line_no: idx + 1,
        purchase_order_item_id: item.purchaseOrderItemId,
        quantity_received: item.quantityReceived,
        warehouse_id: item.warehouseId,
        remarks: item.remarks.trim() || null,
        vendor_lot_no: item.vendorLotNo?.trim() || null,
        mfg_date: item.mfgDate || null,
        expiry_date: item.expiryDate || null,
        serial_numbers: item.serialNumbers ?? [],
      })),
    });

    if (error) {
      const duplicate = error.message.match(/duplicate_supplier_document:([^\s]+)/);
      if (duplicate) {
        return {
          duplicate: true as const,
          error: `เลขที่เอกสารผู้ขายนี้ถูกใช้กับ ${duplicate[1]} แล้ว`,
          success: false as const,
        };
      }
      console.error("postGoodsReceiptAction database error:", error);
      return { error: getErrorMessage(error.message), success: false as const };
    }

    // Revalidate paths
    revalidatePath("/purchase/receipts");
    revalidatePath("/purchase/po");
    revalidatePath("/inventory/stock");

    return { success: true as const, data };
  } catch (error) {
    console.error("postGoodsReceiptAction error:", error);
    return { error: "เกิดข้อผิดพลาดระหว่างบันทึกรับสินค้า", success: false as const };
  }
}

export async function cancelGoodsReceiptAction(receiptId: number, reason: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };

    const { error } = await supabase.rpc("cancel_goods_receipt", {
      p_goods_receipt_id: receiptId,
      p_reason: reason.trim().replace(/\s+/g, " "),
    });
    if (error) {
      if (error.message.includes("permission_denied")) return { error: "คุณไม่มีสิทธิ์ยกเลิกใบรับสินค้า" };
      if (error.message.includes("invalid_cancellation_reason")) return { error: "กรุณาระบุเหตุผล 10–500 ตัวอักษร" };
      if (error.message.includes("goods_receipt_stock_already_consumed")) return { error: "ยกเลิกไม่ได้ เนื่องจากสินค้าจากใบรับนี้ถูกนำไปใช้แล้ว" };
      console.error("cancelGoodsReceiptAction database error:", error);
      return { error: "ไม่สามารถยกเลิกใบรับสินค้าได้" };
    }

    revalidatePath("/purchase/receipts");
    revalidatePath("/purchase/po");
    revalidatePath("/inventory/stock");
    return { success: true as const };
  } catch (error) {
    console.error("cancelGoodsReceiptAction error:", error);
    return { error: "เกิดข้อผิดพลาดระหว่างยกเลิกใบรับสินค้า" };
  }
}

// 4. Fetch list of POs that are approved, sent, or partially received (for dropdown select)
export async function getPendingPurchaseOrdersForReceiptAction() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

    // Select POs that can receive items
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(`
        id,
        po_number,
        document_date,
        delivery_date,
        delivery_address,
        vendor_name,
        status,
        purchase_order_items (
          quantity,
          received_qty,
          unit_name
        )
      `)
      .in("status", ["approved", "sent", "partially_received"])
      .order("po_number", { ascending: false });

    if (error) {
      console.error("getPendingPurchaseOrdersForReceiptAction error:", error);
      return { error: "ไม่สามารถดึงข้อมูลใบสั่งซื้อค้างส่งได้", data: [] };
    }

    const formatted = (data ?? []).map((row) => {
      const remainingItems = (row.purchase_order_items ?? []).filter(
        (item) => Number(item.quantity) - Number(item.received_qty) > 0,
      );
      const units = [...new Set(remainingItems.map((item) => String(item.unit_name)))];
      const remainingQuantity = remainingItems.reduce(
        (sum, item) => sum + Number(item.quantity) - Number(item.received_qty),
        0,
      );

      return {
        id: Number(row.id),
        po_number: String(row.po_number),
        document_date: String(row.document_date),
        delivery_date: String(row.delivery_date),
        delivery_address: String(row.delivery_address ?? ""),
        vendor_name: String(row.vendor_name),
        status: String(row.status),
        item_count: remainingItems.length,
        outstanding_label:
          units.length === 1
            ? `${remainingQuantity.toLocaleString("th-TH", { maximumFractionDigits: 3 })} ${units[0]}`
            : `${remainingItems.length.toLocaleString("th-TH")} รายการ`,
      };
    });

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getPendingPurchaseOrdersForReceiptAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการโหลดรายการ", data: [] };
  }
}

// 5. Fetch PO details and items including received_qty
export async function getPurchaseOrderItemsForReceiptAction(poId: number) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };

    const [poRes, itemsRes, costPermissionRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_id, vendor_code, vendor_name, delivery_address")
        .eq("id", poId)
        .maybeSingle(),
      supabase
        .from("purchase_order_items")
        .select(`
          id,
          line_no,
          item_master_id,
          item_code,
          item_name,
          item_description,
          quantity,
          received_qty,
          unit_price,
          discount_amount,
          unit_name,
          is_stocked,
          tracking_method,
          warehouse_id,
          item_master (
            attributes,
            tracking_method,
            item_types (
              is_stocked,
              form_template,
              serial_controlled,
              lot_controlled
            )
          )
        `)
        .eq("purchase_order_id", poId)
        .order("line_no", { ascending: true }),
      supabase.rpc("authorize", {
        requested_permission: "inventory_cost.view",
      }),
    ]);

    if (poRes.error) {
      return { error: "ไม่สามารถโหลดรายละเอียดใบสั่งซื้อได้" };
    }
    if (!poRes.data) {
      return { error: "ไม่พบใบสั่งซื้อ" };
    }

    if (itemsRes.error) {
      return { error: "ไม่สามารถโหลดรายการใบสั่งซื้อได้" };
    }

    const canViewCost = Boolean(costPermissionRes.data);
    const items = ((itemsRes.data ?? []) as DbRow[]).map((row) => {
      const master = firstRelation(row.item_master as MaybeArray<DbRow>);
      const attrs = objectValue(master?.attributes);
      const thickness = attrs.thickness != null ? Number(attrs.thickness) : null;
      const gradeName = attrs.gradeName || attrs.materialGrade || "";
      const specification = [
        gradeName,
        thickness != null && Number.isFinite(thickness)
          ? `${thickness.toLocaleString("th-TH", { maximumFractionDigits: 2 })} มม.`
          : null,
      ].filter(Boolean).join(" ");
      const defaultWarehouseId = attrs.warehouseId != null ? Number(attrs.warehouseId) : null;
      const type = firstRelation(master?.item_types as MaybeArray<DbRow>);
      const orderedQty = Number(row.quantity);
      const unitCost = orderedQty > 0
        ? Math.max((orderedQty * Number(row.unit_price) - Number(row.discount_amount ?? 0)) / orderedQty, 0)
        : 0;
      const isStocked = type?.is_stocked != null ? Boolean(type.is_stocked) : (row.is_stocked ?? true);
      let trackingMethod: "none" | "lot" | "serial" = "none";
      if (row.tracking_method === "serial" || master?.tracking_method === "serial" || type?.serial_controlled) {
        trackingMethod = "serial";
      } else if (row.tracking_method === "lot" || master?.tracking_method === "lot" || type?.lot_controlled) {
        trackingMethod = "lot";
      }

      return {
        purchaseOrderItemId: Number(row.id),
        line_no: Number(row.line_no),
        raw_material_id: row.item_master_id === null ? null : Number(row.item_master_id),
        item_master_id: row.item_master_id === null ? null : Number(row.item_master_id),
        item_code: String(row.item_code),
        item_name: String(row.item_name),
        item_description: String(row.item_description ?? ""),
        specification: specification || "-",
        quantity_ordered: Number(row.quantity),
        quantity_received: Number(row.received_qty),
        quantity_remaining: Number(row.quantity) - Number(row.received_qty),
        unit_cost: canViewCost ? unitCost : null,
        unit_name: String(row.unit_name),
        is_stocked: Boolean(isStocked),
        tracking_method: trackingMethod,
        warehouse_id: isStocked && (row.warehouse_id || defaultWarehouseId)
          ? Number(row.warehouse_id || defaultWarehouseId)
          : null,
      };
    });

    return {
      success: true,
      data: {
        po: {
          id: Number(poRes.data.id),
          po_number: String(poRes.data.po_number),
          vendor_id: Number(poRes.data.vendor_id),
          vendor_code: String(poRes.data.vendor_code),
          vendor_name: String(poRes.data.vendor_name),
          delivery_address: poRes.data.delivery_address,
        },
        canViewCost,
        items,
      }
    };
  } catch (error) {
    console.error("getPurchaseOrderItemsForReceiptAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการโหลดรายการใบสั่งซื้อ" };
  }
}

// 6. Fetch raw material stock balances for inventory report
export async function getRawMaterialInventoryBalancesAction() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

    const { data, error } = await supabase
      .from("item_inventory_balances")
      .select(`
        item_master_id,
        warehouse_id,
        on_hand_qty,
        allocated_qty,
        available_qty,
        updated_at,
        item_master!inner (
          id,
          item_code,
          item_name,
          reorder_point,
          attributes,
          item_types!inner (
            type_code
          ),
          unit:raw_material_units (
            symbol
          )
        ),
        raw_material_warehouses (
          warehouse_name
        )
      `)
      .eq("item_master.item_types.type_code", "RM")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("getRawMaterialInventoryBalancesAction error:", error);
      return { error: "ไม่สามารถดึงข้อมูลรายงานคลังสินค้าวัตถุดิบได้", data: [] };
    }

    const formatted = ((data ?? []) as DbRow[]).map((row) => {
      const mat = row.item_master;
      const matRow = objectValue(mat);
      const attrs = objectValue(matRow.attributes);
      const wh = row.raw_material_warehouses;
      const whRow = objectValue(wh);
      const unitObj = firstRelation(matRow.unit as MaybeArray<DbRow>);
      return {
        rawMaterialId: Number(matRow.id ?? row.item_master_id),
        warehouseId: Number(row.warehouse_id),
        materialCode: String(matRow.item_code ?? "-"),
        materialName: String(matRow.item_name ?? "-"),
        gradeName: String(attrs.gradeName ?? "-"),
        unitSymbol: String(unitObj?.symbol ?? "แผ่น"),
        specification: `${Number(attrs.thickness || 0).toFixed(2)} x ${Number(attrs.width || 0).toFixed(0)} x ${Number(attrs.length || 0).toFixed(0)}`,
        warehouseName: String(whRow.warehouse_name ?? "-"),
        onHandQty: Number(row.on_hand_qty),
        allocatedQty: Number(row.allocated_qty),
        availableQty: Number(row.available_qty),
        reorderPoint: matRow.reorder_point ? Number(matRow.reorder_point) : null,
        updatedAt: String(row.updated_at),
      };
    });

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getRawMaterialInventoryBalancesAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการดึงรายงานคลัง", data: [] };
  }
}

// 7. Fetch finished goods (FG) product stock balances for inventory report
export async function getProductInventoryBalancesAction() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

    const { data, error } = await supabase
      .from("item_inventory_balances")
      .select(`
        item_master_id,
        warehouse_id,
        on_hand_qty,
        allocated_qty,
        available_qty,
        updated_at,
        item_master!inner (
          id,
          item_code,
          item_name,
          attributes,
          item_types!inner (
            type_code
          ),
          unit:raw_material_units (
            symbol,
            unit_name
          )
        ),
        raw_material_warehouses (
          warehouse_name
        )
      `)
      .eq("item_master.item_types.type_code", "FG")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("getProductInventoryBalancesAction error:", error);
      return { error: "ไม่สามารถดึงข้อมูลรายงานคลังสินค้าสำเร็จรูปได้", data: [] };
    }

    const formatted = ((data ?? []) as DbRow[]).map((row) => {
      const prod = row.item_master;
      const prodRow = objectValue(prod);
      const attrs = objectValue(prodRow.attributes);
      const wh = row.raw_material_warehouses;
      const whRow = objectValue(wh);
      const unitObj = firstRelation(prodRow.unit as MaybeArray<DbRow>);
      return {
        productId: String(prodRow.id ?? row.item_master_id),
        warehouseId: Number(row.warehouse_id),
        partNumber: String(attrs.partNumber ?? prodRow.item_code ?? "-"),
        partName: String(prodRow.item_name ?? "-"),
        materialGrade: String(attrs.material ?? attrs.gradeName ?? "-"),
        unitName: String(unitObj?.symbol || unitObj?.unit_name || "ชิ้น"),
        warehouseName: String(whRow.warehouse_name ?? "-"),
        onHandQty: Number(row.on_hand_qty),
        allocatedQty: Number(row.allocated_qty),
        availableQty: Number(row.available_qty),
        updatedAt: String(row.updated_at),
      };
    });

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getProductInventoryBalancesAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการดึงรายงานคลัง FG", data: [] };
  }
}

export type CentralInventoryFilters = {
  search?: string;
  itemTypeId?: number | null;
  warehouseId?: number | null;
  trackingMethod?: CentralStockRow["trackingMethod"] | null;
  state?: StockStateCode | null;
  page?: number;
  pageSize?: number;
};

export type CentralInventorySummary = {
  total: number;
  available: number;
  reserved: number;
  lowStock: number;
  stale: number;
  inventoryValue: number | null;
  rawMaterialValue: number | null;
  canViewCost: boolean;
  canExportCost: boolean;
};

export type CentralInventoryOption = { id: number; code: string; name: string };

export type CentralInventoryMovement = {
  id: string;
  transactionType: string;
  referenceDocType: string;
  referenceDocNumber: string;
  quantityChange: number;
  createdAt: string;
  actorName: string;
};

export type CentralInventoryLot = {
  id: number;
  lotNumber: string;
  vendorLotNumber: string;
  grNumber: string;
  receivedAt: string;
  expiryDate: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  unitCost: number | null;
  inventoryValue: number | null;
};

export type CentralInventorySerial = {
  id: number;
  serialNumber: string;
  status: string;
  createdAt: string;
};

type CentralStockRpcRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  item_name_en: string;
  description: string;
  type_code: string;
  type_name: string;
  warehouse_id: number;
  warehouse_name: string;
  on_hand_qty: number;
  allocated_qty: number;
  available_qty: number;
  reorder_point: number | null;
  tracking_method: CentralStockRow["trackingMethod"];
  expiry_controlled: boolean;
  is_purchasable: boolean;
  unit_name: string;
  unit_symbol: string;
  attributes: Record<string, unknown>;
  form_field_config: CentralStockRow["formFieldConfig"];
  updated_at: string;
  inventory_value: number | null;
};

function mapCentralStockRow(row: CentralStockRpcRow, totalCount: number): CentralStockRow {
  return {
    itemId: Number(row.item_id),
    itemCode: String(row.item_code),
    itemName: String(row.item_name),
    itemNameEn: String(row.item_name_en ?? ""),
    description: String(row.description ?? ""),
    typeCode: String(row.type_code),
    typeName: String(row.type_name),
    warehouseId: Number(row.warehouse_id),
    warehouseName: String(row.warehouse_name),
    onHandQty: Number(row.on_hand_qty),
    reservedQty: Number(row.allocated_qty),
    availableQty: Number(row.available_qty),
    reorderPoint: Number(row.reorder_point ?? 0),
    trackingMethod: row.tracking_method ?? "none",
    expiryControlled: Boolean(row.expiry_controlled),
    purchasable: Boolean(row.is_purchasable),
    unitName: String(row.unit_name ?? ""),
    unitSymbol: String(row.unit_symbol ?? ""),
    attributes: objectValue(row.attributes),
    formFieldConfig: objectValue(row.form_field_config) as CentralStockRow["formFieldConfig"],
    updatedAt: String(row.updated_at),
    totalCount,
    inventoryValue: row.inventory_value == null ? null : Number(row.inventory_value),
  };
}

export async function getCentralInventoryStockAction(filters: CentralInventoryFilters = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [], total: 0 };

  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 25), 10), 100);
  const page = Math.max(Math.trunc(filters.page ?? 1), 1);
  let { data, error } = await supabase.rpc("get_central_inventory_stock", {
    p_search: filters.search?.trim() || null,
    p_item_type_id: filters.itemTypeId || null,
    p_warehouse_id: filters.warehouseId || null,
    p_tracking_method: filters.trackingMethod || null,
    p_state: filters.state || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  // Keep the stock page usable while the new cost migration is waiting to be applied.
  if (error?.code === "PGRST202" || error?.code === "PGRST203") {
    const fallback = await supabase.rpc("get_central_inventory_stock", {
      p_search: filters.search?.trim() || null,
      p_item_type_id: filters.itemTypeId || null,
      p_warehouse_id: filters.warehouseId || null,
      p_state: filters.state || null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("getCentralInventoryStockAction error:", error);
    return { error: "ไม่สามารถโหลดสต็อกกลางได้ กรุณารัน migration ล่าสุด", data: [], total: 0 };
  }

  const payload = objectValue(data);
  const total = Number(payload.total ?? 0);
  const summaryRow = objectValue(payload.summary);
  const summary: CentralInventorySummary = {
    total: Number(summaryRow.total ?? 0),
    available: Number(summaryRow.available ?? 0),
    reserved: Number(summaryRow.reserved ?? 0),
    lowStock: Number(summaryRow.lowStock ?? 0),
    stale: Number(summaryRow.stale ?? 0),
    inventoryValue: summaryRow.inventoryValue === null || summaryRow.inventoryValue === undefined ? null : Number(summaryRow.inventoryValue),
    rawMaterialValue: summaryRow.rawMaterialValue === null || summaryRow.rawMaterialValue === undefined ? null : Number(summaryRow.rawMaterialValue),
    canViewCost: Boolean(payload.canViewCost),
    canExportCost: Boolean(payload.canExportCost),
  };
  const rows = Array.isArray(payload.rows) ? payload.rows as CentralStockRpcRow[] : [];
  return { success: true as const, data: rows.map((row) => mapCentralStockRow(row, total)), total, summary };
}

export async function getCentralInventoryOptionsAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", itemTypes: [], warehouses: [] };

  const [typesResult, warehousesResult] = await Promise.all([
    supabase.from("item_types").select("id,type_code,type_name").eq("status", "active").eq("is_stocked", true).order("sort_order"),
    supabase.from("raw_material_warehouses").select("id,warehouse_code,warehouse_name").eq("status", "active").order("sort_order"),
  ]);
  if (typesResult.error || warehousesResult.error) {
    console.error("getCentralInventoryOptionsAction error:", typesResult.error ?? warehousesResult.error);
    return { error: "ไม่สามารถโหลดตัวกรองสต็อกได้", itemTypes: [], warehouses: [] };
  }
  return {
    success: true as const,
    itemTypes: (typesResult.data ?? []).map((row) => ({ id: Number(row.id), code: String(row.type_code), name: String(row.type_name) })),
    warehouses: (warehousesResult.data ?? []).map((row) => ({ id: Number(row.id), code: String(row.warehouse_code), name: String(row.warehouse_name) })),
  };
}

export async function getCentralInventoryDetailsAction(itemId: number, warehouseId: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };
  if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
    return { error: "ข้อมูลรายการสต็อกไม่ถูกต้อง" };
  }

  const [lotsResult, serialsResult, movementsResult, productMovementsResult, costsResult] = await Promise.all([
    supabase.from("inventory_lots")
      .select("id,lot_number,vendor_lot_no,received_at,expiry_date,on_hand_qty,reserved_qty,available_qty,goods_receipts(gr_number)")
      .eq("item_master_id", itemId).eq("warehouse_id", warehouseId)
      .order("received_at", { ascending: true }).order("id", { ascending: true }).limit(100),
    supabase.from("inventory_serials")
      .select("id,serial_number,status,created_at")
      .eq("item_master_id", itemId).eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_transactions")
      .select("id,transaction_type,reference_doc_type,reference_doc_number,quantity_change,created_by,created_at")
      .eq("item_master_id", itemId).eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("product_transactions")
      .select("id,transaction_type,reference_doc_type,reference_doc_number,quantity_change,created_by,created_at")
      .eq("item_master_id", itemId).eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_receipt_costs")
      .select("inventory_lot_id,remaining_qty,unit_cost")
      .eq("item_master_id", itemId).eq("warehouse_id", warehouseId),
  ]);
  const costsError = costsResult.error && !["PGRST205", "42P01"].includes(costsResult.error.code) ? costsResult.error : null;
  const firstError = lotsResult.error ?? serialsResult.error ?? movementsResult.error ?? productMovementsResult.error ?? costsError;
  if (firstError) {
    console.error("getCentralInventoryDetailsAction error:", firstError);
    return { error: "ไม่สามารถโหลดรายละเอียดและ Stock Card ได้" };
  }

  const mapMovement = (row: DbRow, source: string): CentralInventoryMovement => {
    return {
      id: `${source}-${String(row.id)}`,
      transactionType: String(row.transaction_type),
      referenceDocType: String(row.reference_doc_type),
      referenceDocNumber: String(row.reference_doc_number),
      quantityChange: Number(row.quantity_change),
      createdAt: String(row.created_at),
      actorName: resolveInventoryActorName(
        row.created_by ? String(row.created_by) : null,
        user.id,
        user.email ?? "ผู้ใช้ปัจจุบัน",
      ),
    };
  };
  const movements = [
    ...((movementsResult.data ?? []) as DbRow[]).map((row) => mapMovement(row, "inventory")),
    ...((productMovementsResult.data ?? []) as DbRow[]).map((row) => mapMovement(row, "product")),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100);
  const costsByLot = new Map<number, { unitCost: number; inventoryValue: number }>();
  for (const cost of (costsResult.data ?? []) as DbRow[]) {
    if (cost.inventory_lot_id !== null) {
      const unitCost = Number(cost.unit_cost);
      costsByLot.set(Number(cost.inventory_lot_id), {
        unitCost,
        inventoryValue: Number(cost.remaining_qty) * unitCost,
      });
    }
  }

  return {
    success: true as const,
    lots: ((lotsResult.data ?? []) as DbRow[]).map((row): CentralInventoryLot => {
      const receipt = Array.isArray(row.goods_receipts) ? row.goods_receipts[0] : row.goods_receipts;
      return {
        id: Number(row.id), lotNumber: String(row.lot_number), vendorLotNumber: String(row.vendor_lot_no ?? "-"),
        grNumber: String((receipt as DbRow | null)?.gr_number ?? "-"),
        receivedAt: String(row.received_at), expiryDate: String(row.expiry_date ?? ""), onHandQty: Number(row.on_hand_qty),
        reservedQty: Number(row.reserved_qty), availableQty: Number(row.available_qty),
        unitCost: costsByLot.get(Number(row.id))?.unitCost ?? null,
        inventoryValue: costsByLot.get(Number(row.id))?.inventoryValue ?? null,
      };
    }),
    serials: ((serialsResult.data ?? []) as DbRow[]).map((row): CentralInventorySerial => ({
      id: Number(row.id), serialNumber: String(row.serial_number), status: String(row.status), createdAt: String(row.created_at),
    })),
    movements,
  };
}

// 8. Fetch Stock Card History for RM
export async function getRawMaterialStockCardAction(materialId: number, warehouseId: number) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

    const { data, error } = await supabase
      .from("inventory_transactions")
      .select(`
        id,
        transaction_type,
        reference_doc_type,
        reference_doc_number,
        quantity_change,
        created_at,
        created_by
      `)
      .or(`item_master_id.eq.${materialId},raw_material_id.eq.${materialId}`)
      .eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("getRawMaterialStockCardAction error:", error);
      return { error: "ไม่สามารถดึงประวัติการเคลื่อนไหวสต็อกได้", data: [] };
    }

    const formatted = ((data ?? []) as DbRow[]).map((row) => {
      return {
        id: Number(row.id),
        transactionType: String(row.transaction_type),
        referenceDocType: String(row.reference_doc_type),
        referenceDocNumber: String(row.reference_doc_number),
        quantityChange: Number(row.quantity_change),
        createdAt: String(row.created_at),
        actorName: resolveInventoryActorName(row.created_by ? String(row.created_by) : null, user.id, user.email ?? "ผู้ใช้ปัจจุบัน"),
      };
    });

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getRawMaterialStockCardAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการโหลดประวัติ", data: [] };
  }
}

// 9. Fetch Stock Card History for FG
export async function getProductStockCardAction(productId: string, warehouseId: number) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", data: [] };

    const isNumeric = /^\d+$/.test(productId.trim());
    let query = supabase
      .from("product_transactions")
      .select(`
        id,
        transaction_type,
        reference_doc_type,
        reference_doc_number,
        quantity_change,
        created_at,
        created_by
      `);

    if (isNumeric) {
      query = query.or(`item_master_id.eq.${Number(productId)},product_id.eq.${productId}`);
    } else {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query
      .eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("getProductStockCardAction error:", error);
      return { error: "ไม่สามารถดึงประวัติสินค้าสำเร็จรูปได้", data: [] };
    }

    const formatted = ((data ?? []) as DbRow[]).map((row) => {
      return {
        id: Number(row.id),
        transactionType: String(row.transaction_type),
        referenceDocType: String(row.reference_doc_type),
        referenceDocNumber: String(row.reference_doc_number),
        quantityChange: Number(row.quantity_change),
        createdAt: String(row.created_at),
        actorName: resolveInventoryActorName(row.created_by ? String(row.created_by) : null, user.id, user.email ?? "ผู้ใช้ปัจจุบัน"),
      };
    });

    return { success: true, data: formatted };
  } catch (error) {
    console.error("getProductStockCardAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการโหลดประวัติ FG", data: [] };
  }
}
