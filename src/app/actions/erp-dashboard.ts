"use server";

import {
  classifyFulfillment,
  monthKeys,
  normalizeDateRange,
  normalizeReportedPercent,
  percent,
  type FulfillmentState,
} from "@/lib/erp-dashboard";
import { createClient } from "@/utils/supabase/server";

type Row = Record<string, unknown>;
type Permission =
  "purchase" | "inventory" | "count" | "issue" | "audit" | "approvePurchase";

export type DashboardData = {
  startDate: string;
  asOf: string;
  today: string;
  roleName: string;
  selectedWarehouseId: string;
  warehouses: Array<{
    id: number;
    code: string;
    name: string;
  }>;
  permissions: Record<Permission, boolean>;
  kpis: {
    poValue: number;
    receivedValue: number;
    pendingValue: number;
    receivedRate: number;
    onTimeRate: number;
    lowStock: number;
  };
  monthly: Array<{
    key: string;
    label: string;
    po: number;
    received: number;
    receipts: number;
    issues: number;
    adjustments: number;
  }>;
  fulfillment: Array<{
    id: number;
    number: string;
    vendor: string;
    deliveryDate: string;
    ordered: number;
    received: number;
    pending: number;
    rate: number;
    state: FulfillmentState;
  }>;
  fulfillmentCounts: Record<FulfillmentState, number>;
  lowStock: Array<{
    code: string;
    name: string;
    available: number;
    reorderPoint: number;
    unit: string;
  }>;
  variances: Array<{
    code: string;
    lot: string;
    difference: number;
    state: "short" | "over";
  }>;
  approvals: Array<{
    number: string;
    type: string;
    count: number;
    date: string;
    href: string;
  }>;
  work: Array<{
    type: string;
    number: string;
    task: string;
    due: string;
    owner: string;
    status: string;
    href: string;
    tab: string;
  }>;
  activity: Array<{
    at: string;
    actor: string;
    action: string;
    number: string;
    detail: string;
  }>;
};

const n = (value: unknown) => Number(value ?? 0);
const s = (value: unknown) => String(value ?? "");
const rows = (value: unknown) => (Array.isArray(value) ? (value as Row[]) : []);
const thaiMonths = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export async function getErpDashboardAction(
  asOfInput?: string,
  warehouseIdInput?: string,
  startDateInput?: string,
): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const { startDate, endDate: asOf } = normalizeDateRange(
    startDateInput,
    asOfInput,
    today,
  );
  const selectedWarehouseId =
    warehouseIdInput && warehouseIdInput !== "all" ? String(warehouseIdInput) : "";
  const keys = monthKeys(new Date(`${asOf}T00:00:00Z`));
  const chartStart = `${keys[0]}-01`;
  const queryStart = startDate < chartStart ? startDate : chartStart;
  const emptyPermissions = {
    purchase: false,
    inventory: false,
    count: false,
    issue: false,
    audit: false,
    approvePurchase: false,
  };
  if (!user) return emptyDashboard(startDate, asOf, today, keys, emptyPermissions);

  const [permissionResult, roleResult, warehouseResult] = await Promise.all([
    supabase.rpc("get_current_user_permission_codes"),
    supabase
      .from("user_roles")
      .select("app_roles(role_name,is_owner,status)")
      .eq("user_id", user.id)
      .limit(5),
    supabase
      .from("raw_material_warehouses")
      .select("id,warehouse_code,warehouse_name")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("warehouse_name", { ascending: true }),
  ]);
  const warehouses = rows(warehouseResult.data).map((w) => ({
    id: n(w.id),
    code: s(w.warehouse_code),
    name: s(w.warehouse_name),
  }));
  const codes = new Set((permissionResult.data ?? []) as string[]);
  const isOwner = rows(roleResult.data).some((item) => {
    const role = Array.isArray(item.app_roles)
      ? (item.app_roles[0] as Row | undefined)
      : (item.app_roles as Row | undefined);
    return Boolean(role?.is_owner);
  });
  const has = (code: string) => isOwner || codes.has(code);
  const permissions = {
    purchase: has("po.view") || has("pr.view"),
    inventory: has("inventory.view"),
    count: has("stock_count.view"),
    issue: has("inventory_issue.view"),
    audit: has("audit_logs.view"),
    approvePurchase: has("pr.approve") || has("po.approve"),
  };
  const firstRole = rows(roleResult.data)
    .map((item) =>
      Array.isArray(item.app_roles)
        ? (item.app_roles[0] as Row | undefined)
        : (item.app_roles as Row | undefined),
    )
    .find(Boolean);
  const roleName = s(firstRole?.role_name) || "ผู้ใช้งาน";

  const [
    poResult,
    grResult,
    inventoryResult,
    countResult,
    prResult,
    issueResult,
    auditResult,
    inventoryMoveResult,
    productMoveResult,
    purchaseAnalysisResult,
  ] = await Promise.all([
    permissions.purchase
      ? supabase
          .from("purchase_orders")
          .select(
            "id,po_number,document_date,delivery_date,vendor_name,buyer_name,item_count,status,grand_total,ordered_total_qty,purchase_order_items(quantity,received_qty,unit_price)",
          )
          .gte("document_date", queryStart)
          .lte("document_date", asOf)
          .neq("status", "cancelled")
          .order("delivery_date")
          .limit(500)
      : Promise.resolve({ data: [] }),
    permissions.inventory
      ? supabase
          .from("goods_receipts")
          .select(
            "id,document_date,status,goods_receipt_items(quantity_received,purchase_order_items(unit_price))",
          )
          .gte("document_date", queryStart)
          .lte("document_date", asOf)
          .eq("status", "posted")
          .limit(1000)
      : Promise.resolve({ data: [] }),
    permissions.inventory
      ? supabase.rpc("get_central_inventory_stock", {
          p_search: null,
          p_item_type_id: null,
          p_warehouse_id: selectedWarehouseId ? Number(selectedWarehouseId) : null,
          p_tracking_method: null,
          p_state: "low_stock",
          p_limit: 8,
          p_offset: 0,
        })
      : Promise.resolve({ data: {} }),
    permissions.count
      ? (() => {
          let countQuery = supabase
            .from("stock_counts")
            .select(
              "id,count_number,status,document_date,warehouse_id,assigned_to_name,stock_count_lines(item_code,stock_count_lots(lot_number,difference_qty))",
            )
            .lte("document_date", asOf)
            .neq("status", "cancelled");
          if (selectedWarehouseId) {
            countQuery = countQuery.eq("warehouse_id", Number(selectedWarehouseId));
          }
          return countQuery.order("document_date", { ascending: false }).limit(8);
        })()
      : Promise.resolve({ data: [] }),
    permissions.purchase
      ? supabase
          .from("purchase_requisitions")
          .select(
            "id,pr_number,status,needed_by_date,requester_name,requested_item_count",
          )
          .in("status", ["pending_approval", "approved"])
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    permissions.issue
      ? supabase
          .from("stock_issues")
          .select("id,issue_number,status,document_date,requester_name")
          .in("status", ["draft", "pending_approval"])
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    permissions.audit
      ? supabase
          .from("system_audit_logs")
          .select("occurred_at,actor_name,action_label,entity_number,summary")
          .lte("occurred_at", `${asOf}T23:59:59.999+07:00`)
          .order("occurred_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    permissions.inventory
      ? supabase
          .from("inventory_transactions")
          .select("created_at,transaction_type,quantity_change")
          .gte("created_at", `${queryStart}T00:00:00+07:00`)
          .lte("created_at", `${asOf}T23:59:59.999+07:00`)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    permissions.inventory
      ? supabase
          .from("product_transactions")
          .select("created_at,transaction_type,quantity_change")
          .gte("created_at", `${queryStart}T00:00:00+07:00`)
          .lte("created_at", `${asOf}T23:59:59.999+07:00`)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    permissions.purchase
      ? supabase.rpc("get_purchase_analysis_report", {
          p_view: "vendor",
          p_start_date: startDate,
          p_end_date: asOf,
          p_vendor_id: null,
          p_item_type_id: null,
          p_search: null,
          p_page: 1,
          p_page_size: 500,
        })
      : Promise.resolve({ data: {} }),
  ]);

  const monthly = keys.map((key) => ({
    key,
    label: `${thaiMonths[Number(key.slice(5)) - 1]} ${Number(key.slice(0, 4)) + 543}`,
    po: 0,
    received: 0,
    receipts: 0,
    issues: 0,
    adjustments: 0,
  }));
  const monthMap = new Map(monthly.map((item) => [item.key, item]));
  const purchaseOrders = rows(poResult.data);
  const fulfillment = purchaseOrders
    .filter(
      (po) =>
        s(po.document_date) >= startDate && s(po.document_date) <= asOf,
    )
    .map((po) => {
      const items = rows(po.purchase_order_items);
      const ordered =
        items.reduce((sum, item) => sum + n(item.quantity), 0) ||
        n(po.ordered_total_qty);
      const received = items.reduce(
        (sum, item) => sum + n(item.received_qty),
        0,
      );
      const state = classifyFulfillment(
        ordered,
        received,
        s(po.delivery_date),
        asOf,
      );
      return {
        id: n(po.id),
        number: s(po.po_number),
        vendor: s(po.vendor_name),
        deliveryDate: s(po.delivery_date),
        ordered,
        received,
        pending: Math.max(0, ordered - received),
        rate: percent(received, ordered),
        state,
      };
    })
    .slice(0, 5);
  for (const po of purchaseOrders) {
    const month = monthMap.get(s(po.document_date).slice(0, 7));
    if (month) month.po += n(po.grand_total);
  }
  for (const gr of rows(grResult.data)) {
    const month = monthMap.get(s(gr.document_date).slice(0, 7));
    if (!month) continue;
    month.received += rows(gr.goods_receipt_items).reduce((sum, item) => {
      const relation = Array.isArray(item.purchase_order_items)
        ? (item.purchase_order_items[0] as Row | undefined)
        : (item.purchase_order_items as Row | undefined);
      return sum + n(item.quantity_received) * n(relation?.unit_price);
    }, 0);
  }
  for (const movement of [
    ...rows(inventoryMoveResult.data),
    ...rows(productMoveResult.data),
  ]) {
    const month = monthMap.get(s(movement.created_at).slice(0, 7));
    if (!month) continue;
    const type = s(movement.transaction_type).toLowerCase();
    if (type.includes("adjust")) month.adjustments += 1;
    else if (n(movement.quantity_change) >= 0 || type.includes("receipt"))
      month.receipts += 1;
    else month.issues += 1;
  }

  const allCurrent = purchaseOrders.filter(
    (po) =>
      s(po.document_date) >= startDate && s(po.document_date) <= asOf,
  );
  const poValue = allCurrent.reduce((sum, po) => sum + n(po.grand_total), 0);
  const receivedValue = rows(grResult.data)
    .filter(
      (gr) =>
        s(gr.document_date) >= startDate && s(gr.document_date) <= asOf,
    )
    .reduce((total, gr) => {
      return (
        total +
        rows(gr.goods_receipt_items).reduce((sum, item) => {
          const relation = Array.isArray(item.purchase_order_items)
            ? (item.purchase_order_items[0] as Row | undefined)
            : (item.purchase_order_items as Row | undefined);
          return sum + n(item.quantity_received) * n(relation?.unit_price);
        }, 0)
      );
    }, 0);
  const orderedTotal = allCurrent.reduce(
    (sum, po) =>
      sum +
      rows(po.purchase_order_items).reduce(
        (total, item) => total + n(item.quantity),
        0,
      ),
    0,
  );
  const receivedTotal = allCurrent.reduce(
    (sum, po) =>
      sum +
      rows(po.purchase_order_items).reduce(
        (total, item) => total + n(item.received_qty),
        0,
      ),
    0,
  );
  const analysisPayload =
    purchaseAnalysisResult.data &&
    typeof purchaseAnalysisResult.data === "object"
      ? (purchaseAnalysisResult.data as Row)
      : {};
  const analysisSummary =
    analysisPayload.summary && typeof analysisPayload.summary === "object"
      ? (analysisPayload.summary as Row)
      : {};
  const inventoryPayload =
    inventoryResult.data && typeof inventoryResult.data === "object"
      ? (inventoryResult.data as Row)
      : {};
  const lowStockRows = rows(inventoryPayload.rows);
  const lowStock = lowStockRows.map((item) => ({
    code: s(item.item_code),
    name: s(item.item_name),
    available: n(item.available_qty),
    reorderPoint: n(item.reorder_point),
    unit: s(item.unit_symbol || item.unit_name),
  }));
  const inventorySummary =
    inventoryPayload.summary && typeof inventoryPayload.summary === "object"
      ? (inventoryPayload.summary as Row)
      : {};

  const counts = rows(countResult.data);
  const variances = counts
    .flatMap((count) =>
      rows(count.stock_count_lines).flatMap((line) =>
        rows(line.stock_count_lots)
          .filter((lot) => n(lot.difference_qty) !== 0)
          .map((lot) => ({
            code: s(line.item_code),
            lot: s(lot.lot_number) || "-",
            difference: n(lot.difference_qty),
            state:
              n(lot.difference_qty) < 0
                ? ("short" as const)
                : ("over" as const),
          })),
      ),
    )
    .slice(0, 5);
  const prs = rows(prResult.data);
  const approvals = permissions.approvePurchase
    ? [
        ...prs
          .filter((item) => s(item.status) === "pending_approval")
          .map((item) => ({
            number: s(item.pr_number),
            type: "ขอซื้อ (PR)",
            count: n(item.requested_item_count),
            date: s(item.needed_by_date),
            href: "/purchase/pr",
          })),
        ...allCurrent
          .filter((item) => s(item.status) === "pending_approval")
          .map((item) => ({
            number: s(item.po_number),
            type: "สั่งซื้อ (PO)",
            count: n(item.item_count),
            date: s(item.delivery_date),
            href: "/purchase/po",
          })),
      ].slice(0, 5)
    : [];
  const work = [
    ...prs.map((item) => ({
      type: "PR",
      number: s(item.pr_number),
      task:
        s(item.status) === "pending_approval"
          ? "รออนุมัติขอซื้อ"
          : "จัดทำใบสั่งซื้อ",
      due: s(item.needed_by_date),
      owner: s(item.requester_name),
      status: s(item.status),
      href: "/purchase/pr",
      tab: "pr",
    })),
    ...allCurrent
      .filter((item) =>
        ["pending_approval", "approved", "sent", "partially_received"].includes(
          s(item.status),
        ),
      )
      .map((item) => ({
        type: "PO",
        number: s(item.po_number),
        task:
          s(item.status) === "pending_approval"
            ? "รออนุมัติ PO"
            : "เร่งติดตามการส่งมอบ",
        due: s(item.delivery_date),
        owner: s(item.buyer_name),
        status: s(item.status),
        href: "/purchase/po",
        tab: "po",
      })),
    ...counts
      .filter((item) =>
        ["counting", "review", "recount"].includes(s(item.status)),
      )
      .map((item) => ({
        type: "IC",
        number: s(item.count_number),
        task: s(item.status) === "review" ? "ตรวจสอบผลต่าง" : "บันทึกผลตรวจนับ",
        due: s(item.document_date),
        owner: s(item.assigned_to_name),
        status: s(item.status),
        href: `/inventory/stock-counts/${n(item.id)}`,
        tab: "count",
      })),
    ...rows(issueResult.data).map((item) => ({
      type: "ISSUE",
      number: s(item.issue_number),
      task: "จัดเตรียมใบเบิกสินค้า",
      due: s(item.document_date),
      owner: s(item.requester_name),
      status: s(item.status),
      href: "/inventory/issues",
      tab: "issue",
    })),
  ].slice(0, 12);
  const fulfillmentCounts = {
    not_received: 0,
    partial: 0,
    received: 0,
    overdue: 0,
  };
  for (const item of fulfillment) fulfillmentCounts[item.state] += 1;

  return {
    startDate,
    asOf,
    today,
    roleName,
    selectedWarehouseId,
    warehouses,
    permissions,
    kpis: {
      poValue,
      receivedValue,
      pendingValue: Math.max(0, poValue - receivedValue),
      receivedRate:
        normalizeReportedPercent(n(analysisSummary.received_rate)) ||
        percent(receivedTotal, orderedTotal),
      onTimeRate: normalizeReportedPercent(n(analysisSummary.on_time_rate)),
      lowStock: n(inventorySummary.lowStock ?? inventoryPayload.total),
    },
    monthly,
    fulfillment,
    fulfillmentCounts,
    lowStock,
    variances,
    approvals,
    work,
    activity: rows(auditResult.data).map((item) => ({
      at: s(item.occurred_at),
      actor: s(item.actor_name),
      action: s(item.action_label),
      number: s(item.entity_number),
      detail: s(item.summary),
    })),
  };
}

function emptyDashboard(
  startDate: string,
  asOf: string,
  today: string,
  keys: string[],
  permissions: Record<Permission, boolean>,
): DashboardData {
  return {
    startDate,
    asOf,
    today,
    roleName: "ผู้ใช้งาน",
    selectedWarehouseId: "",
    warehouses: [],
    permissions,
    kpis: {
      poValue: 0,
      receivedValue: 0,
      pendingValue: 0,
      receivedRate: 0,
      onTimeRate: 0,
      lowStock: 0,
    },
    monthly: keys.map((key) => ({
      key,
      label: key,
      po: 0,
      received: 0,
      receipts: 0,
      issues: 0,
      adjustments: 0,
    })),
    fulfillment: [],
    fulfillmentCounts: { not_received: 0, partial: 0, received: 0, overdue: 0 },
    lowStock: [],
    variances: [],
    approvals: [],
    work: [],
    activity: [],
  };
}
