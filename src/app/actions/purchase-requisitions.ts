"use server";

import { revalidatePath } from "next/cache";
import {
  type PurchaseRequisitionMaterial,
  type PurchaseRequisitionSubmission,
  validatePurchaseRequisitionSubmission,
} from "@/lib/purchase-requisition-form";
import {
  type PurchaseRequisitionPrintDetail,
  type PurchaseRequisitionPrintItem,
} from "@/lib/purchase-requisition-print";
import {
  type PurchaseRequisitionDecision,
  validatePurchaseRequisitionDecision,
} from "@/lib/purchase-requisition-approval";
import { normalizePurchaseRequisitionStatus } from "@/lib/purchase-requisitions";
import { isMissingPurchaseCatalogRpc } from "@/lib/purchase-requisition-catalog";
import { validateCancellationReason } from "@/lib/purchase-document-cancellation";
import { sendPurchaseRequisitionPush } from "@/lib/web-push.server";
import { createClient } from "@/utils/supabase/server";

type CatalogRow = { source: "raw_material" | "item_master"; source_id: number; item_code: string; item_name: string; item_description: string; type_code: string; type_name: string; unit_id: number; unit_name: string; unit_symbol: string; allows_decimal: boolean; is_stocked?: boolean; tracking_method?: string; form_template?: string; default_warehouse_id?: number | null };
type LegacyRawMaterialRow = { id: number; material_code: string; material_name: string; unit: { id: number; unit_name: string; symbol: string; allows_decimal: boolean; status: string } | { id: number; unit_name: string; symbol: string; allows_decimal: boolean; status: string }[] | null };
type FallbackCatalogRow = {
  attributes: { warehouseId?: number | string | null } | null;
  description: string | null;
  id: number;
  item_code: string;
  item_name: string;
  item_types: { form_template: string | null; is_purchasable: boolean; is_stocked: boolean; type_code: string; type_name: string } | { form_template: string | null; is_purchasable: boolean; is_stocked: boolean; type_code: string; type_name: string }[] | null;
  tracking_method: string | null;
  unit: { allows_decimal: boolean; id: number; status: string; symbol: string; unit_name: string } | { allows_decimal: boolean; id: number; status: string; symbol: string; unit_name: string }[] | null;
};

type PurchaseRequisitionPrintItemRow = {
  item_code: string | null;
  item_description: string | null;
  item_name: string;
  line_no: number;
  needed_by_date: string | null;
  quantity: number;
  raw_material:
    | {
        grade:
          | { grade_name: string }
          | { grade_name: string }[]
          | null;
        id: number;
        length_mm: number;
        material_code: string;
        material_name: string;
        thickness_mm: number;
        width_mm: number;
      }
    | {
        grade:
          | { grade_name: string }
          | { grade_name: string }[]
          | null;
        id: number;
        length_mm: number;
        material_code: string;
        material_name: string;
        thickness_mm: number;
        width_mm: number;
      }[]
    | null;
  remarks: string | null;
  unit_name: string;
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function normalizeCatalogItem(row: CatalogRow): PurchaseRequisitionMaterial {
  return {
    allowsDecimal: Boolean(row.allows_decimal),
    code: row.item_code,
    defaultWarehouseId: row.default_warehouse_id == null ? null : Number(row.default_warehouse_id),
    description: row.item_description || row.item_name,
    formTemplate: row.form_template || "general",
    gradeName: "",
    id: Number(row.source_id),
    isStocked: row.is_stocked !== false,
    lengthMm: 0,
    name: row.item_name,
    source: row.source,
    thicknessMm: 0,
    trackingMethod: row.tracking_method === "serial" || row.tracking_method === "lot" ? row.tracking_method : "none",
    typeCode: row.type_code,
    typeName: row.type_name,
    unitId: Number(row.unit_id),
    unitName: row.unit_name,
    unitSymbol: row.unit_symbol || row.unit_name,
    widthMm: 0,
  };
}

function getDecisionError(message: string) {
  if (
    message.includes("owner_approval_required") ||
    message.includes("permission_denied")
  ) {
    return "เฉพาะ OWNER ที่ได้รับสิทธิ์เท่านั้นจึงจะอนุมัติหรือปฏิเสธ PR ได้";
  }
  if (message.includes("purchase_requisition_not_found")) {
    return "ไม่พบใบขอซื้อที่ต้องการดำเนินการ";
  }
  if (message.includes("purchase_requisition_already_decided")) {
    return "ใบขอซื้อนี้ได้รับการตัดสินใจแล้ว กรุณาโหลดข้อมูลล่าสุด";
  }
  if (message.includes("rejection_note_required")) {
    return "กรุณาระบุเหตุผลที่ปฏิเสธใบขอซื้อ";
  }
  if (message.includes("decision_note_too_long")) {
    return "หมายเหตุต้องไม่เกิน 500 ตัวอักษร";
  }
  return "ไม่สามารถบันทึกผลการอนุมัติใบขอซื้อได้";
}

export async function decidePurchaseRequisitionAction(input: {
  decision: PurchaseRequisitionDecision;
  note: string;
  requisitionId: number;
}) {
  const validation = validatePurchaseRequisitionDecision(input);
  if (!validation.success) {
    return validation;
  }

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

    const { data, error } = await supabase.rpc(
      "decide_purchase_requisition",
      {
        p_decision: input.decision,
        p_note: input.note.trim() || null,
        p_requisition_id: input.requisitionId,
      },
    );

    if (error) {
      console.error("Unable to decide purchase requisition:", {
        code: error.code,
        message: error.message,
      });
      return {
        error: getDecisionError(error.message),
        success: false as const,
      };
    }

    const result = Array.isArray(data) ? data[0] : data;
    await sendPurchaseRequisitionPush(supabase, {
      entityId: input.requisitionId,
      eventKey: input.decision,
    });
    revalidatePath("/purchase/pr");

    return {
      prNumber: String(result?.requisition_number ?? ""),
      status: input.decision,
      success: true as const,
    };
  } catch (error) {
    console.error("decidePurchaseRequisitionAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างบันทึกผลการอนุมัติ",
      success: false as const,
    };
  }
}

type PurchaseRequisitionSaveInput = PurchaseRequisitionSubmission & {
  documentDate?: string;
};

function getSaveError(message: string, status: "draft" | "pending_approval") {
  if (message.includes("permission_denied")) {
    return "คุณไม่มีสิทธิ์สร้างหรือแก้ไขใบขอซื้อ";
  }
  if (message.includes("purchase_requisition_not_found")) {
    return "ไม่พบใบขอซื้อที่ต้องการแก้ไข";
  }
  if (message.includes("purchase_requisition_not_draft")) {
    return "แก้ไขหรือส่งอนุมัติได้เฉพาะใบขอซื้อสถานะร่าง";
  }
  if (message.includes("duplicate_raw_materials") || message.includes("duplicate_items")) {
    return "มีสินค้า/บริการซ้ำในใบขอซื้อ กรุณารวมเป็นรายการเดียว";
  }
  if (
    message.includes("invalid_purchase_requisition_item") ||
    message.includes("invalid_purchase_requisition_items")
  ) {
    return "ข้อมูลสินค้า/บริการไม่ถูกต้อง กรุณาตรวจสอบสถานะซื้อได้ จำนวน หน่วย และวันที่ต้องการใช้";
  }
  return status === "draft"
    ? "ไม่สามารถบันทึกร่างใบขอซื้อได้"
    : "ไม่สามารถส่งใบขอซื้อเพื่ออนุมัติได้";
}

async function savePurchaseRequisition(
  input: PurchaseRequisitionSaveInput,
  status: "draft" | "pending_approval",
  requisitionId?: number,
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false as const };
    }

    const selectedItems = input.items.filter((item) => ["raw_material", "item_master"].includes(item.source) && Number.isSafeInteger(Number(item.sourceId)) && Number(item.sourceId) > 0);
    const { data: catalogRows, error: catalogError } = await supabase.rpc("get_purchase_requisition_catalog");
    const legacyMode = isMissingPurchaseCatalogRpc(catalogError);
    let availableRows = (catalogRows ?? []) as unknown as CatalogRow[];
    if (legacyMode) {
      const fallback = await supabase
        .from("item_master")
        .select("id, item_code, item_name, description, tracking_method, attributes, unit:raw_material_units(id, unit_name, symbol, allows_decimal, status), item_types!inner(type_code, type_name, form_template, is_stocked, is_purchasable)")
        .eq("status", "active")
        .eq("item_types.is_purchasable", true);
      if (fallback.error) return { error: "ไม่สามารถตรวจสอบข้อมูลสินค้า/บริการได้", success: false as const };
      availableRows = ((fallback.data ?? []) as FallbackCatalogRow[]).flatMap((row) => {
        const unit = Array.isArray(row.unit) ? row.unit[0] : row.unit;
        const type = Array.isArray(row.item_types) ? row.item_types[0] : row.item_types;
        return unit && unit.status === "active" ? [{
          source: "item_master" as const,
          source_id: Number(row.id),
          item_code: row.item_code,
          item_name: row.item_name,
          item_description: row.description || row.item_name,
          type_code: type?.type_code || "ITEM",
          type_name: type?.type_name || "รายการ",
          unit_id: Number(unit.id),
          unit_name: unit.unit_name,
          unit_symbol: unit.symbol,
          allows_decimal: Boolean(unit.allows_decimal),
          is_stocked: type?.is_stocked !== false,
          tracking_method: row.tracking_method || "none",
          form_template: type?.form_template || "general",
          default_warehouse_id: row.attributes?.warehouseId ? Number(row.attributes.warehouseId) : null,
        }] : [];
      });
    } else if (catalogError) {
      return { error: "ไม่สามารถตรวจสอบข้อมูลสินค้า/บริการได้", success: false as const };
    }
    const selectedKeys = new Set(selectedItems.map((item) => `${item.source}:${item.sourceId}`));
    const materials = availableRows.map(normalizeCatalogItem).filter((item) => selectedKeys.has(`${item.source}:${item.id}`));

    const normalizedInput = { ...input, items: selectedItems };
    if (status === "pending_approval" || selectedItems.length > 0) {
      const validation = validatePurchaseRequisitionSubmission(
        normalizedInput,
        materials,
      );
      if (!validation.success) {
        return validation;
      }
    } else if (input.remarks.length > 300) {
      return {
        error: "วัตถุประสงค์ต้องไม่เกิน 300 ตัวอักษร",
        success: false as const,
      };
    }

    const requesterName = String(
      user.app_metadata.full_name ?? user.email?.split("@")[0] ?? "ผู้ใช้งาน ERP",
    ).trim();
    const departmentName = String(
      user.app_metadata.department_name ?? "ไม่ระบุแผนก",
    ).trim();

    const { data, error } = await supabase.rpc("save_purchase_requisition", {
      p_department_name: departmentName,
      p_document_date:
        input.documentDate || new Date().toISOString().slice(0, 10),
      p_items: selectedItems.map((item) => ({
        quantity: item.quantity,
        ...(legacyMode ? { raw_material_id: item.sourceId } : { source: item.source, source_id: item.sourceId }),
        remarks: item.remarks.trim() || null,
        needed_by_date: item.neededByDate,
        target_warehouse_id: materials.find((material) => `${material.source}:${material.id}` === `${item.source}:${item.sourceId}`)?.defaultWarehouseId ?? null,
      })),
      p_needed_by_date: input.neededByDate,
      p_remarks: input.remarks.trim() || null,
      p_requester_name: requesterName,
      p_requisition_id: requisitionId ?? null,
      p_status: status,
    });

    if (error) {
      console.error("Unable to save purchase requisition:", {
        code: error.code,
        message: error.message,
      });
      return {
        error: getSaveError(error.message, status),
        success: false as const,
      };
    }

    const result = Array.isArray(data) ? data[0] : data;
    const savedRequisitionId = Number(result?.requisition_id);
    if (
      status === "pending_approval" &&
      Number.isInteger(savedRequisitionId) &&
      savedRequisitionId > 0
    ) {
      await sendPurchaseRequisitionPush(supabase, {
        entityId: savedRequisitionId,
        eventKey: "submitted",
      });
    }
    revalidatePath("/purchase/pr");

    return {
      prNumber: result?.requisition_number ?? "",
      requisitionId: savedRequisitionId,
      status,
      success: true as const,
    };
  } catch (error) {
    console.error("savePurchaseRequisition error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างบันทึกใบขอซื้อ",
      success: false as const,
    };
  }
}

export async function savePurchaseRequisitionDraftAction(
  input: PurchaseRequisitionSaveInput,
  requisitionId?: number,
) {
  return savePurchaseRequisition(input, "draft", requisitionId);
}

export async function submitPurchaseRequisitionAction(
  input: PurchaseRequisitionSaveInput,
  requisitionId?: number,
) {
  return savePurchaseRequisition(input, "pending_approval", requisitionId);
}

export async function deletePurchaseRequisitionAction(id: number) {
  try {
    const supabase = await createClient();
    
    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false };
    }

    const { error } = await supabase.rpc(
      "delete_purchase_requisition_draft",
      { p_requisition_id: id },
    );

    if (error) {
      console.error("Unable to delete PR:", error);
      return {
        error: error.message.includes("not_draft")
          ? "ลบได้เฉพาะใบขอซื้อสถานะร่าง"
          : "ไม่สามารถลบใบขอซื้อได้",
        success: false,
      };
    }

    revalidatePath("/purchase/pr");
    return { success: true };
  } catch (error) {
    console.error("deletePurchaseRequisitionAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการลบใบขอซื้อ", success: false };
  }
}

export async function cancelPurchaseRequisitionAction(input: {
  reason: string;
  requisitionId: number;
}) {
  if (!Number.isSafeInteger(input.requisitionId) || input.requisitionId <= 0) {
    return { error: "เลขอ้างอิงใบขอซื้อไม่ถูกต้อง", success: false as const };
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

    const { error } = await supabase.rpc("cancel_purchase_requisition", {
      p_reason: validation.reason,
      p_requisition_id: input.requisitionId,
    });

    if (error) {
      const message = error.message;
      if (message.includes("permission_denied")) {
        return {
          error: "คุณไม่มีสิทธิ์ยกเลิกใบขอซื้อ",
          success: false as const,
        };
      }
      if (message.includes("purchase_requisition_has_active_purchase_order")) {
        return {
          error: "ใบขอซื้อนี้มีใบสั่งซื้อที่ยังใช้งานอยู่ กรุณายกเลิกใบสั่งซื้อก่อน",
          success: false as const,
        };
      }
      if (message.includes("purchase_requisition_cannot_be_cancelled")) {
        return {
          error: "สถานะปัจจุบันของใบขอซื้อไม่สามารถยกเลิกได้",
          success: false as const,
        };
      }
      return {
        error: "ไม่สามารถยกเลิกใบขอซื้อได้",
        success: false as const,
      };
    }

    revalidatePath("/purchase/pr");
    revalidatePath("/purchase/po");
    return { success: true as const };
  } catch (error) {
    console.error("cancelPurchaseRequisitionAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างยกเลิกใบขอซื้อ",
      success: false as const,
    };
  }
}

export async function getPurchaseRequisitionItemsAction(requisitionId: number) {
  try {
    const supabase = await createClient();
    
    // Fetch items
    const { data, error } = await supabase
      .from("purchase_requisition_items")
      .select("raw_material_id, item_master_id, quantity, remarks, needed_by_date")
      .eq("requisition_id", requisitionId)
      .order("line_no", { ascending: true });

    if (error) {
      console.error("Unable to fetch PR items:", error);
      return { error: "ไม่สามารถดึงข้อมูลรายการใบขอซื้อได้", success: false };
    }

    return {
      items: data.map((item) => ({
        itemKey: item.item_master_id ? `item_master:${Number(item.item_master_id)}` : `raw_material:${Number(item.raw_material_id)}`,
        quantity: String(item.quantity),
        note: item.remarks || "",
        neededByDate: item.needed_by_date ? item.needed_by_date.slice(0, 10) : "",
      })),
      success: true,
    };
  } catch (error) {
    console.error("getPurchaseRequisitionItemsAction error:", error);
    return { error: "เกิดข้อผิดพลาดในการดึงข้อมูลรายการใบขอซื้อ", success: false };
  }
}

export async function getPurchaseRequisitionPrintDetailAction(
  requisitionId: number,
) {
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

    const { data: requisition, error: requisitionError } = await supabase
      .from("purchase_requisitions")
      .select(
        "id, pr_number, document_date, requester_name, department_name, needed_by_date, status, remarks",
      )
      .eq("id", requisitionId)
      .maybeSingle();

    if (requisitionError || !requisition) {
      console.error(
        "Unable to fetch purchase requisition for print:",
        requisitionError,
      );
      return {
        error: "ไม่พบข้อมูลใบขอซื้อที่ต้องการ",
        success: false as const,
      };
    }

    const [itemsResult, approvalsResult] = await Promise.all([
      supabase
        .from("purchase_requisition_items")
        .select(
          `
            line_no,
            item_code,
            item_name,
            item_description,
            quantity,
            unit_name,
            needed_by_date,
            remarks
          `,
        )
        .eq("requisition_id", requisitionId)
        .order("line_no", { ascending: true }),
      supabase
        .from("purchase_requisition_approval_logs")
        .select("action, actor_name, created_at")
        .eq("requisition_id", requisitionId)
        .order("created_at", { ascending: true }),
    ]);

    if (itemsResult.error || approvalsResult.error) {
      console.error("Unable to fetch purchase requisition print detail:", {
        approvalsError: approvalsResult.error,
        itemsError: itemsResult.error,
      });
      return {
        error: "ไม่สามารถดึงรายละเอียดใบขอซื้อได้",
        success: false as const,
      };
    }

    const items: PurchaseRequisitionPrintItem[] = (
      (itemsResult.data ?? []) as PurchaseRequisitionPrintItemRow[]
    ).map((item) => {
      const currentName =
        item.item_name?.trim() ||
        item.item_description?.trim() ||
        "";
      const currentDescription =
        item.item_description?.trim() && item.item_description.trim() !== currentName
          ? item.item_description.trim()
          : "";

      return {
        code: String(item.item_code ?? ""),
        description: currentDescription,
        lineNo: Number(item.line_no),
        name: currentName,
        neededByDate: item.needed_by_date
          ? String(item.needed_by_date).slice(0, 10)
          : null,
        quantity: Number(item.quantity ?? 0),
        remarks: String(item.remarks ?? ""),
        unitName: String(item.unit_name ?? ""),
      };
    });

    // Fetch department manager name if possible
    let departmentManagerName: string | null = null;
    try {
      const { data: deptData } = await supabase
        .from("departments")
        .select("manager_user_id")
        .eq("department_name", requisition.department_name)
        .maybeSingle();

      if (deptData?.manager_user_id) {
        const { data: profileData } = await supabase
          .from("user_profiles")
          .select("first_name, last_name")
          .eq("user_id", deptData.manager_user_id)
          .maybeSingle();
        if (profileData) {
          departmentManagerName = [profileData.first_name, profileData.last_name]
            .filter(Boolean)
            .join(" ");
        }
      }
    } catch (e) {
      console.error("Error fetching department manager:", e);
    }

    const detail: PurchaseRequisitionPrintDetail = {
      approvals: (approvalsResult.data ?? []).map((approval) => ({
        action: String(approval.action),
        actorName: String(approval.actor_name ?? ""),
        createdAt: String(approval.created_at),
      })),
      departmentName: String(requisition.department_name),
      departmentManagerName,
      documentDate: String(requisition.document_date),
      id: Number(requisition.id),
      items,
      neededByDate: requisition.needed_by_date
        ? String(requisition.needed_by_date).slice(0, 10)
        : null,
      prNumber: String(requisition.pr_number),
      remarks: String(requisition.remarks ?? ""),
      requesterName: String(requisition.requester_name),
      status: normalizePurchaseRequisitionStatus(
        String(requisition.status ?? ""),
      ),
    };

    return { detail, success: true as const };
  } catch (error) {
    console.error("getPurchaseRequisitionPrintDetailAction error:", error);
    return {
      error: "เกิดข้อผิดพลาดระหว่างเตรียมเอกสารใบขอซื้อ",
      success: false as const,
    };
  }
}

export async function updatePurchaseRequisitionAction(
  prId: number,
  input: PurchaseRequisitionSubmission,
) {
  return savePurchaseRequisition(input, "draft", prId);
}
