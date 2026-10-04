"use server";

import { revalidatePath } from "next/cache";
import {
  normalizePurchaseOrderStatus,
  normalizePurchaseOrderItemType,
  type PurchaseOrderDecision,
  type PurchaseOrderEditData,
  type PurchasePriceReference,
  type PurchaseOrderSourceItem,
  type PurchaseOrderSubmission,
  validatePurchaseOrderDecision,
  validatePurchaseOrderSubmission,
} from "@/lib/purchase-orders";
import type { PurchaseOrderPrintDetail } from "@/lib/purchase-order-print";
import { validateCancellationReason } from "@/lib/purchase-document-cancellation";
import { sendPurchaseOrderPush } from "@/lib/web-push.server";
import { SIGNATURE_BUCKET } from "@/lib/approval-signatures";
import { createClient } from "@/utils/supabase/server";

type SourceItemRow = {
  available_quantity: number;
  item_code: string | null;
  item_description: string | null;
  item_name: string;
  item_type_code: string;
  is_stocked?: boolean;
  needed_by_date: string | null;
  pr_number: string;
  requested_quantity: number;
  tracking_method?: string;
  requisition_id: number;
  requisition_item_id: number;
  unit_name: string;
  warehouse_id?: number | null;
};

type LatestPurchasePriceRow = {
  document_date: string;
  po_number: string;
  requisition_item_id: number;
  unit_price: number;
};

type PurchaseOrderPrintRow = {
  approved_at: string | null;
  buyer_name: string;
  credit_term_name: string | null;
  delivery_address: string | null;
  delivery_date: string;
  discount_amount: number;
  document_date: string;
  grand_total: number;
  id: number;
  payment_method_name: string | null;
  po_number: string;
  pr_references: string[];
  status: string;
  subtotal: number;
  supplier_note: string | null;
  tax_amount: number;
  tax_type_name: string | null;
  terms_and_conditions: string | null;
  vendor_code: string;
  vendor_id: number;
  vendor_name: string;
};

type PurchaseOrderPrintItemRow = {
  delivery_date: string | null;
  discount_amount: number;
  item_code: string | null;
  item_description: string | null;
  item_name: string;
  line_no: number;
  line_total: number;
  quantity: number;
  tax_rate: number;
  unit_name: string;
  unit_price: number;
};

type PurchaseOrderVendorPrintRow = {
  branch: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_no: string;
};

type PurchaseOrderVendorAddressRow = {
  address_line: string;
};

type PurchaseOrderApprovalRow = {
  approval_signature_id: string | null;
  actor_name: string | null;
  created_at: string;
};

type PurchaseOrderEditRow = {
  delivery_address: string | null;
  delivery_date: string;
  document_date: string;
  id: number;
  po_number: string;
  status: string;
  supplier_note: string | null;
  terms_and_conditions: string | null;
  vendor_id: number;
};

type PurchaseOrderEditItemRow = {
  delivery_date: string | null;
  discount_amount: number;
  item_code: string | null;
  item_description: string | null;
  item_name: string;
  pr_item: { item_type: string | null } | { item_type: string | null }[] | null;
  pr_number: string;
  quantity: number;
  remarks: string | null;
  requisition_id: number;
  requisition_item_id: number;
  tax_rate: number;
  unit_name: string;
  unit_price: number;
};

type PurchaseOrderEditCapacityRow = {
  max_quantity: number;
  requisition_item_id: number;
};

function getCreateError(message: string) {
  if (message.includes("permission_denied")) {
    return "คุณไม่มีสิทธิ์สร้างใบสั่งซื้อ";
  }
  if (message.includes("vendor_not_found")) {
    return "ไม่พบผู้ขายที่เลือก กรุณาโหลดข้อมูลใหม่";
  }
  if (message.includes("approved_pr_item_not_found")) {
    return "มีรายการ PR ที่ไม่ได้อยู่ในสถานะอนุมัติแล้ว";
  }
  if (message.includes("pr_quantity_exceeded")) {
    return "จำนวนสั่งซื้อเกินยอดคงเหลือของรายการ PR กรุณาเลือกรายการใหม่อีกครั้ง";
  }
  if (message.includes("delivery_date_before_document_date")) {
    return "วันที่ส่งมอบต้องไม่อยู่ก่อนวันที่เอกสาร";
  }
  if (message.includes("purchase_order_cannot_be_edited")) {
    return "แก้ไขได้เฉพาะใบสั่งซื้อสถานะร่างหรือรออนุมัติ";
  }
  if (message.includes("invalid_order_quantity")) {
    return "จำนวนสั่งซื้อต้องมากกว่า 0";
  }
  if (
    message.includes('column reference "purchase_order_id" is ambiguous') ||
    message.includes("get_purchase_order_edit_capacities")
  ) {
    return "ฐานข้อมูลส่วนแก้ไขใบสั่งซื้อยังไม่เป็นเวอร์ชันล่าสุด";
  }
  if (message.includes("purchase_order_items_stocked_warehouse_check")) {
    return "เกิดจากเงื่อนไขตรวจสอบคลังสินค้าในตาราง PO กรุณารัน SQL Migration ล่าสุด";
  }
  return message ? `ไม่สามารถบันทึกใบสั่งซื้อได้ (${message})` : "ไม่สามารถบันทึกใบสั่งซื้อได้";
}

export async function searchPurchaseOrderSourceItemsAction(search = "") {
  try {
    const normalizedSearch = search.trim().slice(0, 100);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        items: [] as PurchaseOrderSourceItem[],
        success: false as const,
      };
    }

    const { data, error } = await supabase.rpc(
      "search_purchase_order_source_items",
      {
        p_limit: 120,
        p_search: normalizedSearch || null,
      },
    );

    if (error) {
      console.error("Unable to search PO source items:", {
        code: error.code,
        message: error.message,
      });
      return {
        error: "ไม่สามารถโหลดรายการ PR ที่อนุมัติแล้วได้",
        items: [] as PurchaseOrderSourceItem[],
        success: false as const,
      };
    }

    const items: PurchaseOrderSourceItem[] = ((data ?? []) as SourceItemRow[]).map((row) => {
      const trackingMethod: PurchaseOrderSourceItem["trackingMethod"] =
        row.tracking_method === "serial" || row.tracking_method === "lot"
          ? row.tracking_method
          : "none";
      return {
      availableQuantity: Number(row.available_quantity),
      description: String(row.item_description ?? row.item_name),
      itemCode: String(row.item_code ?? ""),
      itemName: String(row.item_name),
      itemTypeCode: normalizePurchaseOrderItemType(
        row.item_type_code,
        String(row.item_code ?? ""),
      ),
      isStocked: row.is_stocked !== false,
      neededByDate: String(row.needed_by_date ?? ""),
      prNumber: String(row.pr_number),
      requestedQuantity: Number(row.requested_quantity),
      trackingMethod,
      requisitionId: Number(row.requisition_id),
      requisitionItemId: Number(row.requisition_item_id),
      unitName: String(row.unit_name),
      warehouseId: row.warehouse_id == null ? null : Number(row.warehouse_id),
      };
    });

    return { items, success: true as const };
  } catch (error) {
    console.error("searchPurchaseOrderSourceItemsAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างโหลดรายการ PR",
      items: [] as PurchaseOrderSourceItem[],
      success: false as const,
    };
  }
}

export async function getLatestPurchasePricesAction(
  vendorId: number,
  requisitionItemIds: number[],
) {
  const ids = [...new Set(requisitionItemIds)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0 || ids.length === 0) {
    return { prices: [] as PurchasePriceReference[], success: true as const };
  }
  if (ids.length > 200) {
    return { error: "เลือกรายการได้ไม่เกิน 200 รายการ", success: false as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false as const };
  }

  const { data, error } = await supabase.rpc("get_latest_purchase_prices", {
    p_requisition_item_ids: ids,
    p_vendor_id: vendorId,
  });
  if (error) {
    console.error("Unable to load latest purchase prices:", {
      code: error.code,
      message: error.message,
    });
    return { error: "ไม่สามารถโหลดราคาซื้อล่าสุดได้", success: false as const };
  }

  const prices = ((data ?? []) as LatestPurchasePriceRow[]).map((row) => ({
    documentDate: String(row.document_date),
    poNumber: String(row.po_number),
    requisitionItemId: Number(row.requisition_item_id),
    unitPrice: Number(row.unit_price),
  }));
  return { prices, success: true as const };
}

export async function createPurchaseOrderAction(
  input: PurchaseOrderSubmission,
) {
  const validation = validatePurchaseOrderSubmission(input);
  if (!validation.success) {
    return validation;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        success: false as const,
      };
    }

    const { data: defaultTemplate } = await supabase
      .from("document_term_templates")
      .select("id")
      .eq("document_type", "po")
      .eq("status", "active")
      .eq("is_default", true)
      .maybeSingle();
    let termsSnapshot = "";
    if (defaultTemplate) {
      const { data: termItems, error: termError } = await supabase
        .from("document_term_items")
        .select("term_text")
        .eq("template_id", defaultTemplate.id)
        .eq("is_active", true)
        .order("sort_order");
      if (termError) {
        return { error: "ไม่สามารถโหลดเงื่อนไขเริ่มต้นของใบสั่งซื้อได้", success: false as const };
      }
      termsSnapshot = (termItems ?? [])
        .map((item, index) => `${index + 1}. ${item.term_text}`)
        .join("\n");
    }

    const { data, error } = await supabase.rpc("create_purchase_order", {
      p_delivery_address: input.deliveryAddress.trim() || null,
      p_delivery_date: input.deliveryDate,
      p_document_date: input.documentDate,
      p_items: input.items.map((item) => ({
        delivery_date: item.deliveryDate,
        discount_amount: item.discountAmount,
        quantity: item.quantity,
        remarks: item.remarks.trim() || null,
        requisition_item_id: item.requisitionItemId,
        tax_rate: item.taxRate,
        unit_price: item.unitPrice,
      })),
      p_status: input.status,
      p_supplier_note: input.supplierNote.trim() || null,
      p_terms_and_conditions: termsSnapshot || null,
      p_vendor_id: input.vendorId,
    });

    if (error) {
      console.error(
        "Unable to create purchase order:",
        JSON.stringify({
          code: error.code,
          details: error.details,
          hint: error.hint,
          message: error.message,
        }),
      );
      return { error: getCreateError(error.message), success: false as const };
    }

    const result = Array.isArray(data) ? data[0] : data;
    const savedOrderId = Number(result?.purchase_order_id);
    if (
      input.status === "pending_approval" &&
      Number.isSafeInteger(savedOrderId) &&
      savedOrderId > 0
    ) {
      await sendPurchaseOrderPush(supabase, {
        entityId: savedOrderId,
        eventKey: "submitted",
      });
    }
    revalidatePath("/purchase/po");
    revalidatePath("/purchase/pr");

    return {
      poId: savedOrderId,
      poNumber: String(result?.purchase_order_number ?? ""),
      success: true as const,
    };
  } catch (error) {
    console.error("createPurchaseOrderAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างบันทึกใบสั่งซื้อ",
      success: false as const,
    };
  }
}

function getPurchaseOrderDecisionError(message: string) {
  if (
    message.includes("owner_approval_required") ||
    message.includes("permission_denied")
  ) {
    return "คุณไม่มีสิทธิ์อนุมัติหรือปฏิเสธใบสั่งซื้อ";
  }
  if (message.includes("purchase_order_not_found")) {
    return "ไม่พบใบสั่งซื้อที่ต้องการอนุมัติ";
  }
  if (message.includes("purchase_order_already_decided")) {
    return "ใบสั่งซื้อนี้ได้รับการตัดสินใจแล้ว กรุณาโหลดข้อมูลล่าสุด";
  }
  if (message.includes("rejection_note_required")) {
    return "กรุณาระบุเหตุผลที่ปฏิเสธใบสั่งซื้อ";
  }
  if (message.includes("decision_note_too_long")) {
    return "หมายเหตุต้องไม่เกิน 500 ตัวอักษร";
  }
  if (message.includes("approval_mfa_required")) {
    return "กรุณากรอกรหัส Authenticator 6 หลักเพื่ออนุมัติเอกสาร";
  }
  if (message.includes("approval_signature_required")) {
    return "กรุณาตั้งค่าลายเซ็นของคุณก่อนอนุมัติใบสั่งซื้อ";
  }
  return "ไม่สามารถบันทึกผลการอนุมัติใบสั่งซื้อได้";
}

export async function decidePurchaseOrderAction(input: {
  decision: PurchaseOrderDecision;
  note: string;
  purchaseOrderId: number;
}) {
  const validation = validatePurchaseOrderDecision(input);
  if (!validation.success) return validation;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        success: false as const,
      };
    }

    const { data, error } = await supabase.rpc("decide_purchase_order", {
      p_decision: input.decision,
      p_note: input.note.trim() || undefined,
      p_purchase_order_id: input.purchaseOrderId,
    });

    if (error) {
      console.error("Unable to decide purchase order:", {
        code: error.code,
        message: error.message,
      });
      return {
        error: getPurchaseOrderDecisionError(error.message),
        requiresMfa: error.message.includes("approval_mfa_required"),
        success: false as const,
      };
    }

    const result = Array.isArray(data) ? data[0] : data;
    await sendPurchaseOrderPush(supabase, {
      entityId: input.purchaseOrderId,
      eventKey: input.decision,
    });
    revalidatePath("/purchase/po");

    return {
      poNumber: String(result?.purchase_order_number ?? ""),
      status: input.decision,
      success: true as const,
    };
  } catch (error) {
    console.error("decidePurchaseOrderAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างบันทึกผลการอนุมัติใบสั่งซื้อ",
      success: false as const,
    };
  }
}

export async function cancelPurchaseOrderAction(input: {
  purchaseOrderId: number;
  reason: string;
}) {
  if (
    !Number.isSafeInteger(input.purchaseOrderId) ||
    input.purchaseOrderId <= 0
  ) {
    return { error: "เลขอ้างอิงใบสั่งซื้อไม่ถูกต้อง", success: false as const };
  }

  const validation = validateCancellationReason(input.reason);
  if (!validation.success) return validation;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        success: false as const,
      };
    }

    const { error } = await supabase.rpc("cancel_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
      p_reason: validation.reason,
    });

    if (error) {
      const message = error.message;
      if (message.includes("permission_denied")) {
        return {
          error: "คุณไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ",
          success: false as const,
        };
      }
      if (message.includes("purchase_order_cannot_be_cancelled")) {
        return {
          error:
            "สถานะปัจจุบันของใบสั่งซื้อไม่สามารถยกเลิกได้ หรือมีการรับสินค้าแล้ว",
          success: false as const,
        };
      }
      return {
        error: "ไม่สามารถยกเลิกใบสั่งซื้อได้",
        success: false as const,
      };
    }

    revalidatePath("/purchase/po");
    revalidatePath("/purchase/pr");
    return { success: true as const };
  } catch (error) {
    console.error("cancelPurchaseOrderAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างยกเลิกใบสั่งซื้อ",
      success: false as const,
    };
  }
}

export async function getPurchaseOrderEditDataAction(
  purchaseOrderId: number,
) {
  if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return {
      error: "เลขอ้างอิงใบสั่งซื้อไม่ถูกต้อง",
      success: false as const,
    };
  }

  try {
    const supabase = await createClient();
    const [orderResult, itemsResult, capacityResult] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select(
          "id, po_number, document_date, vendor_id, delivery_date, delivery_address, supplier_note, terms_and_conditions, status",
        )
        .eq("id", purchaseOrderId)
        .maybeSingle(),
      supabase
        .from("purchase_order_items")
        .select(
          "requisition_item_id, requisition_id, pr_number, item_code, item_name, item_description, quantity, unit_name, unit_price, discount_amount, tax_rate, delivery_date, remarks, pr_item:purchase_requisition_items!purchase_order_items_requisition_item_id_fkey(item_type)",
        )
        .eq("purchase_order_id", purchaseOrderId)
        .order("line_no", { ascending: true }),
      supabase.rpc("get_purchase_order_edit_capacities", {
        p_purchase_order_id: purchaseOrderId,
      }),
    ]);

    if (
      orderResult.error ||
      !orderResult.data ||
      itemsResult.error ||
      (capacityResult.error && capacityResult.error.message !== "purchase_order_cannot_be_edited")
    ) {
      console.error("Unable to load purchase order edit data:", {
        capacity: capacityResult.error?.message,
        items: itemsResult.error?.message,
        order: orderResult.error?.message,
      });
      return {
        error: capacityResult.error
          ? getCreateError(capacityResult.error.message)
          : "ไม่สามารถโหลดข้อมูลใบสั่งซื้อเพื่อแก้ไขได้",
        success: false as const,
      };
    }

    const order = orderResult.data as PurchaseOrderEditRow;
    const capacityByItemId = new Map(
      ((capacityResult.data ?? []) as PurchaseOrderEditCapacityRow[]).map(
        (capacity) => [
          Number(capacity.requisition_item_id),
          Number(capacity.max_quantity),
        ],
      ),
    );
    const detail: PurchaseOrderEditData = {
      deliveryAddress: String(order.delivery_address ?? ""),
      deliveryDate: String(order.delivery_date),
      documentDate: String(order.document_date),
      id: Number(order.id),
      lines: ((itemsResult.data ?? []) as PurchaseOrderEditItemRow[]).map(
        (item) => ({
          deliveryDate: String(item.delivery_date ?? order.delivery_date),
          availableQuantity:
            capacityByItemId.get(Number(item.requisition_item_id)) ??
            Number(item.quantity),
          description: String(item.item_name),
          discountAmount: String(item.discount_amount),
          itemCode: String(item.item_code ?? ""),
          itemName: String(item.item_name),
          itemTypeCode: normalizePurchaseOrderItemType(Array.isArray(item.pr_item) ? item.pr_item[0]?.item_type : item.pr_item?.item_type, String(item.item_code ?? "")),
          neededByDate: String(item.delivery_date ?? ""),
          prNumber: String(item.pr_number),
          quantity: String(item.quantity),
          remarks: String(item.remarks ?? ""),
          requestedQuantity: Number(item.quantity),
          requisitionId: Number(item.requisition_id),
          requisitionItemId: Number(item.requisition_item_id),
          taxRate: String(item.tax_rate),
          unitName: String(item.unit_name),
          unitPrice: String(item.unit_price),
        }),
      ),
      poNumber: String(order.po_number),
      status: order.status,
      supplierNote: String(order.supplier_note ?? ""),
      termsAndConditions: String(order.terms_and_conditions ?? ""),
      vendorId: Number(order.vendor_id),
    };

    return { detail, success: true as const };
  } catch (error) {
    console.error("getPurchaseOrderEditDataAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างโหลดใบสั่งซื้อ",
      success: false as const,
    };
  }
}

export async function updatePurchaseOrderAction(
  purchaseOrderId: number,
  input: PurchaseOrderSubmission,
) {
  if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return {
      error: "เลขอ้างอิงใบสั่งซื้อไม่ถูกต้อง",
      success: false as const,
    };
  }

  const validation = validatePurchaseOrderSubmission(input);
  if (!validation.success) return validation;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_purchase_order", {
      p_delivery_address: input.deliveryAddress.trim() || null,
      p_delivery_date: input.deliveryDate,
      p_document_date: input.documentDate,
      p_items: input.items.map((item) => ({
        delivery_date: item.deliveryDate,
        discount_amount: item.discountAmount,
        quantity: item.quantity,
        remarks: item.remarks.trim() || null,
        requisition_item_id: item.requisitionItemId,
        tax_rate: item.taxRate,
        unit_price: item.unitPrice,
      })),
      p_purchase_order_id: purchaseOrderId,
      p_status: input.status,
      p_supplier_note: input.supplierNote.trim() || null,
      p_terms_and_conditions: input.termsAndConditions.trim() || null,
      p_vendor_id: input.vendorId,
    });

    if (error) {
      console.error("Unable to update purchase order:", {
        code: error.code,
        message: error.message,
      });
      return { error: getCreateError(error.message), success: false as const };
    }

    const result = Array.isArray(data) ? data[0] : data;
    const savedOrderId = Number(result?.purchase_order_id);
    if (
      input.status === "pending_approval" &&
      Number.isSafeInteger(savedOrderId) &&
      savedOrderId > 0
    ) {
      await sendPurchaseOrderPush(supabase, {
        entityId: savedOrderId,
        eventKey: "submitted",
      });
    }
    revalidatePath("/purchase/po");
    revalidatePath("/purchase/pr");
    return {
      poId: Number(result?.purchase_order_id),
      poNumber: String(result?.purchase_order_number ?? ""),
      success: true as const,
    };
  } catch (error) {
    console.error("updatePurchaseOrderAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างแก้ไขใบสั่งซื้อ",
      success: false as const,
    };
  }
}

export async function getPurchaseOrderPrintDetailAction(purchaseOrderId: number) {
  if (!Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return {
      error: "เลขอ้างอิงใบสั่งซื้อไม่ถูกต้อง",
      success: false as const,
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        success: false as const,
      };
    }

    const orderResult = await supabase
      .from("purchase_orders")
      .select(
        "id, po_number, document_date, vendor_id, vendor_code, vendor_name, buyer_name, credit_term_name, payment_method_name, tax_type_name, delivery_date, delivery_address, supplier_note, terms_and_conditions, status, pr_references, subtotal, discount_amount, tax_amount, grand_total, approved_at",
      )
      .eq("id", purchaseOrderId)
      .maybeSingle();

    if (orderResult.error || !orderResult.data) {
      console.error("Unable to load purchase order for print:", {
        code: orderResult.error?.code,
        message: orderResult.error?.message,
      });
      return {
        error: "ไม่พบข้อมูลใบสั่งซื้อที่ต้องการพิมพ์",
        success: false as const,
      };
    }

    const order = orderResult.data as PurchaseOrderPrintRow;
    const [itemsResult, vendorResult, addressResult, approvalResult] =
      await Promise.all([
        supabase
          .from("purchase_order_items")
          .select(
            "line_no, item_code, item_name, item_description, quantity, unit_name, unit_price, discount_amount, tax_rate, line_total, delivery_date",
          )
          .eq("purchase_order_id", purchaseOrderId)
          .order("line_no", { ascending: true }),
        supabase
          .from("vendors")
          .select("tax_no, branch, contact_name, phone, email")
          .eq("id", Number(order.vendor_id))
          .maybeSingle(),
        supabase
          .from("vendor_addresses")
          .select("address_line")
          .eq("vendor_id", Number(order.vendor_id))
          .eq("is_default", true)
          .maybeSingle(),
        supabase
          .from("purchase_order_status_logs")
          .select("actor_name, created_at, approval_signature_id")
          .eq("purchase_order_id", purchaseOrderId)
          .eq("to_status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (itemsResult.error) {
      console.error("Unable to load purchase order items for print:", {
        code: itemsResult.error.code,
        message: itemsResult.error.message,
      });
      return {
        error: "ไม่สามารถโหลดรายการสินค้าในใบสั่งซื้อได้",
        success: false as const,
      };
    }

    const vendor = (vendorResult.data ??
      null) as PurchaseOrderVendorPrintRow | null;
    const address = (addressResult.data ??
      null) as PurchaseOrderVendorAddressRow | null;
    const approval = (approvalResult.data ??
      null) as PurchaseOrderApprovalRow | null;
    let approverSignatureUrl: string | null = null;
    if (approval?.approval_signature_id) {
      const signatureResult = await supabase
        .from("user_approval_signatures")
        .select("storage_path")
        .eq("id", approval.approval_signature_id)
        .maybeSingle();
      if (signatureResult.data?.storage_path) {
        const signedUrl = await supabase.storage
          .from(SIGNATURE_BUCKET)
          .createSignedUrl(signatureResult.data.storage_path, 300);
        approverSignatureUrl = signedUrl.data?.signedUrl ?? null;
      }
    }
    const detail: PurchaseOrderPrintDetail = {
      approvedAt: String(order.approved_at ?? approval?.created_at ?? ""),
      approverName: String(approval?.actor_name ?? ""),
      approverSignatureUrl,
      buyerName: String(order.buyer_name),
      creditTermName: String(order.credit_term_name ?? "-"),
      deliveryAddress: String(order.delivery_address ?? ""),
      deliveryDate: String(order.delivery_date),
      discountAmount: Number(order.discount_amount),
      documentDate: String(order.document_date),
      grandTotal: Number(order.grand_total),
      id: Number(order.id),
      items: ((itemsResult.data ?? []) as PurchaseOrderPrintItemRow[]).map(
        (item) => ({
          deliveryDate: String(item.delivery_date ?? order.delivery_date),
          discountAmount: Number(item.discount_amount),
          itemCode: String(item.item_code ?? ""),
          itemDescription: String(item.item_name),
          lineNo: Number(item.line_no),
          lineTotal: Math.max(
            Number(item.quantity) * Number(item.unit_price) -
              Number(item.discount_amount),
            0,
          ),
          quantity: Number(item.quantity),
          taxRate: Number(item.tax_rate),
          unitName: String(item.unit_name),
          unitPrice: Number(item.unit_price),
        }),
      ),
      paymentMethodName: String(order.payment_method_name ?? "-"),
      poNumber: String(order.po_number),
      prReferences: Array.isArray(order.pr_references)
        ? order.pr_references.map(String)
        : [],
      status: normalizePurchaseOrderStatus(order.status),
      subtotal: Number(order.subtotal),
      supplierNote: String(order.supplier_note ?? ""),
      taxAmount: Number(order.tax_amount),
      taxTypeName: String(order.tax_type_name ?? "-"),
      termsAndConditions: String(order.terms_and_conditions ?? ""),
      vendor: {
        address: String(address?.address_line ?? ""),
        branch: String(vendor?.branch ?? ""),
        code: String(order.vendor_code),
        contactName: String(vendor?.contact_name ?? ""),
        email: String(vendor?.email ?? ""),
        name: String(order.vendor_name),
        phone: String(vendor?.phone ?? ""),
        taxId: String(vendor?.tax_no ?? ""),
      },
    };

    return { detail, success: true as const };
  } catch (error) {
    console.error("getPurchaseOrderPrintDetailAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างโหลดใบสั่งซื้อ",
      success: false as const,
    };
  }
}
