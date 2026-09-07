"use client";

import {
  Ban,
  CalendarDays,
  Pencil,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import {
  cancelPurchaseOrderAction,
  decidePurchaseOrderAction,
  getPurchaseOrderEditDataAction,
  getPurchaseOrderPrintDetailAction,
} from "@/app/actions/purchase-orders";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import type { PurchaseOrderPrintDetail } from "@/lib/purchase-order-print";
import type { PurchaseOrderEditData } from "@/lib/purchase-orders";
import {
  formatPurchaseOrderAmount,
  PURCHASE_ORDER_STATUS_META,
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderSummary,
  type PurchaseOrderVendor,
} from "@/lib/purchase-orders";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { PoCreateModal } from "./po-create-modal";
import { PoPrintPreviewModal } from "./po-print-preview-modal";
import { DocumentCancelModal } from "../../_components/document-cancel-modal";
import { toast } from "@/components/toast";

type PoListPageProps = {
  buyerName: string;
  canDecide: boolean;
  documentContext: CompanyDocumentContext;
  documentDate: string;
  filters: {
    endDate: string;
    query: string;
    startDate: string;
    status: string;
    vendorId: string;
  };
  page: number;
  pageSize: number;
  rows: PurchaseOrderSummary[];
  total: number;
  vendors: PurchaseOrderVendor[];
};

const HEADERS = [
  ["ลำดับ", "4%"],
  ["เลขที่ PO", "10%"],
  ["วันที่", "7%"],
  ["ผู้ขาย", "25%"],
  ["อ้างอิง PR", "13%"],
  ["วันที่ส่งมอบ", "10%"],
  ["ยอดรวม", "10%"],
  ["สถานะ", "9%"],
  ["จัดการ", "12%"],
] as const;

export function PoListPage({
  buyerName,
  canDecide,
  documentContext,
  documentDate,
  filters,
  page,
  pageSize,
  rows,
  total,
  vendors,
}: PoListPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cancelOrder, setCancelOrder] =
    useState<PurchaseOrderSummary | null>(null);
  const [editOrder, setEditOrder] = useState<PurchaseOrderEditData | null>(
    null,
  );
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  const [loadingPrintId, setLoadingPrintId] = useState<number | null>(null);
  const [printDetail, setPrintDetail] =
    useState<PurchaseOrderPrintDetail | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const defaultDeliveryAddress = [
    documentContext.branding.legalNameTh,
    documentContext.company.address,
  ]
    .filter(Boolean)
    .join(" ");

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams({
      end: filters.endDate,
      page: String(nextPage),
      pageSize: String(pageSize),
      q: filters.query,
      start: filters.startDate,
      status: filters.status,
      vendor: filters.vendorId,
    });
    startTransition(() => router.push(`/purchase/po?${params.toString()}`));
  };

  const exportExcel = () => {
    const header = [
      "เลขที่ PO",
      "วันที่",
      "ผู้ขาย",
      "อ้างอิง PR",
      "วันที่ส่งมอบ",
      "จำนวนรายการ",
      "ยอดรวม",
      "สถานะ",
    ];
    const body = rows.map((row) => [
      row.po_number,
      row.document_date,
      row.vendor_name,
      row.pr_references.join(", "),
      row.delivery_date,
      row.item_count,
      row.grand_total,
      PURCHASE_ORDER_STATUS_META[row.status].label,
    ]);
    const content = [header, ...body]
      .map((line) =>
        line.map((cell) => String(cell).replaceAll("\t", " ")).join("\t"),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${content}`], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `purchase-orders-${documentDate}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openPrintPreview = async (purchaseOrderId: number) => {
    if (loadingPrintId !== null) return;

    setLoadingPrintId(purchaseOrderId);
    const result = await getPurchaseOrderPrintDetailAction(purchaseOrderId);
    setLoadingPrintId(null);

    if (!result.success) {
      toast.error(result.error ?? "ไม่สามารถดึงข้อมูลพิมพ์ได้");
      return;
    }

    setPrintDetail(result.detail);
  };

  const openEditModal = async (purchaseOrderId: number) => {
    if (loadingEditId !== null) return;

    setLoadingEditId(purchaseOrderId);
    const result = await getPurchaseOrderEditDataAction(purchaseOrderId);
    setLoadingEditId(null);
    if (!result.success) {
      toast.error(result.error ?? "ไม่สามารถดึงข้อมูลแก้ไขได้");
      return;
    }
    setEditOrder(result.detail);
  };

  const handleDecision = async (
    decision: "approved" | "rejected",
    note: string,
  ) => {
    if (!printDetail) {
      return { error: "ไม่พบใบสั่งซื้อที่ต้องการดำเนินการ", success: false };
    }

    const result = await decidePurchaseOrderAction({
      decision,
      note,
      purchaseOrderId: printDetail.id,
    });

    if (!result.success) {
      return result;
    }

    setPrintDetail(null);
    if (decision === "approved") {
      toast.success(`อนุมัติใบสั่งซื้อ ${printDetail.poNumber} เรียบร้อยแล้ว`);
    } else {
      toast.info(`ปฏิเสธใบสั่งซื้อ ${printDetail.poNumber} เรียบร้อยแล้ว`);
    }
    startTransition(() => router.refresh());
    return result;
  };

  return (
    <section className="flex min-h-[calc(100dvh-128px)] min-w-0 flex-col gap-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold leading-[1.25] text-on-surface">
            ใบสั่งซื้อ (PO)
          </h1>
          <p className="text-[13px] font-medium leading-5 text-secondary">
            รายการใบสั่งซื้อทั้งหมด
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <ExcelExportButton className="flex-1 sm:flex-none" onClick={exportExcel} />
          <button
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[3px] border border-primary bg-primary px-4 text-[13px] font-bold text-white shadow-sm hover:bg-primary/95 sm:flex-none sm:px-5"
            onClick={() => setIsCreateOpen(true)}
            type="button"
          >
            <Plus size={17} strokeWidth={2} />
            สร้าง PO ใหม่
          </button>
        </div>
      </div>

      <form
        className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[1.22fr_0.88fr_0.88fr_1.18fr_auto]"
        method="get"
      >
        <label className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary"
            size={18}
          />
          <input
            className="h-[38px] w-full rounded-[5px] border border-outline-variant bg-background px-11 text-[14px] font-medium text-on-surface outline-none focus:border-primary"
            defaultValue={filters.query}
            name="q"
            placeholder="ค้นหาเลขที่ PO, ผู้ขาย, เลขที่ PR..."
          />
        </label>
        <select
          className="h-[38px] rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface outline-none focus:border-primary cursor-pointer"
          defaultValue={filters.status}
          name="status"
          onChange={(e) => e.target.form?.submit()}
        >
          <option value="">สถานะ: ทั้งหมด</option>
          {PURCHASE_ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              สถานะ: {PURCHASE_ORDER_STATUS_META[status].label}
            </option>
          ))}
        </select>
        <select
          className="h-[38px] rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface outline-none focus:border-primary cursor-pointer"
          defaultValue={filters.vendorId}
          name="vendor"
          onChange={(e) => e.target.form?.submit()}
        >
          <option value="">ผู้ขาย: ทั้งหมด</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.vendorName}
            </option>
          ))}
        </select>
        <div className="flex h-[38px] min-w-0 overflow-hidden items-center gap-2 rounded-[5px] border border-outline-variant bg-background px-3 sm:px-4">
          <CalendarDays className="shrink-0 text-secondary" size={18} />
          <input
            aria-label="วันที่เริ่มต้น"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-on-surface outline-none"
            defaultValue={filters.startDate}
            name="start"
            type="date"
            onChange={(e) => e.target.form?.submit()}
          />
          <span className="shrink-0 text-secondary">-</span>
          <input
            aria-label="วันที่สิ้นสุด"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-on-surface outline-none"
            defaultValue={filters.endDate}
            name="end"
            type="date"
            onChange={(e) => e.target.form?.submit()}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-1">
          <button
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[5px] bg-primary px-4 text-[14px] font-bold text-white shadow-sm hover:bg-primary/95 transition-colors cursor-pointer xl:flex-none"
            type="submit"
          >
            <Search size={17} />
            ค้นหา
          </button>
          <button
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low cursor-pointer xl:flex-none"
            onClick={() => router.push("/purchase/po")}
            type="button"
          >
            <SlidersHorizontal size={17} />
            ล้างตัวกรอง
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="erp-data-table min-w-[1000px]">
            <thead className="bg-gray-50 text-[11px] font-bold text-black dark:bg-white/5 dark:text-white">
              <tr className="h-[34px]">
                {HEADERS.map(([label, width], index) => (
                  <th
                    className={`border-b border-outline-variant px-[14px] align-middle whitespace-nowrap ${
                      index === 6 ? "text-right" : "text-left"
                    }`}
                    key={label}
                    style={{ width }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-[13px] font-semibold text-black dark:text-white">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-secondary" colSpan={9}>
                    ยังไม่มีใบสั่งซื้อที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr
                    className="h-[36px] bg-surface-container-lowest transition-colors hover:bg-surface-container-low/50"
                    key={row.id}
                  >
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {firstRow + index}
                    </td>
                    <td className="truncate px-[14px] align-middle font-bold text-primary">
                      {row.po_number}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {formatDisplayDate(row.document_date)}
                    </td>
                    <td
                      className="truncate px-[14px] align-middle"
                      title={row.vendor_name}
                    >
                      {row.vendor_name}
                    </td>
                    <td
                      className="truncate px-[14px] align-middle"
                      title={row.pr_references.join(", ")}
                    >
                      {row.pr_references.join(", ") || "-"}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      {formatDisplayDate(row.delivery_date)}
                    </td>
                    <td className="px-[14px] text-right align-middle tabular-nums whitespace-nowrap">
                      {formatPurchaseOrderAmount(row.grand_total)}
                    </td>
                    <td className="px-[14px] align-middle whitespace-nowrap">
                      <StatusBadge tone={statusTone(row.status)}>
                        {PURCHASE_ORDER_STATUS_META[row.status].label}
                      </StatusBadge>
                    </td>
                    <td className="px-[14px] align-middle">
                      <div className="flex items-center justify-start gap-[10px] pr-[6px]">
                        <TableAction
                          disabled={loadingEditId !== null}
                          label={row.status === "draft" ? "แก้ไข" : "ดูรายละเอียด"}
                          onClick={() => openEditModal(row.id)}
                        >
                          <Pencil size={17} strokeWidth={2.1} />
                        </TableAction>
                        <TableAction
                          disabled={loadingPrintId !== null}
                          label="พิมพ์ใบสั่งซื้อ"
                          onClick={() => openPrintPreview(row.id)}
                        >
                          <Printer size={17} strokeWidth={2.1} />
                        </TableAction>
                        <TableAction
                          disabled={
                            !["pending_approval", "approved", "sent"].includes(
                              row.status,
                            )
                          }
                          label="ยกเลิกใบสั่งซื้อ"
                          onClick={() => setCancelOrder(row)}
                          tone="danger"
                        >
                          <Ban size={17} strokeWidth={2.1} />
                        </TableAction>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination currentPage={page} disabled={isPending} onPageChange={goToPage} pageSize={pageSize} totalItems={total} totalPages={totalPages} />
      </div>

      {isCreateOpen ? (
        <PoCreateModal
          buyerName={buyerName}
          defaultDeliveryAddress={defaultDeliveryAddress}
          documentDate={documentDate}
          onClose={() => setIsCreateOpen(false)}
          onSaved={(message) => {
            setIsCreateOpen(false);
            toast.success(message);
            startTransition(() => router.refresh());
          }}
          vendors={vendors}
        />
      ) : null}

      {editOrder ? (
        <PoCreateModal
          buyerName={buyerName}
          defaultDeliveryAddress={defaultDeliveryAddress}
          documentDate={editOrder.documentDate}
          initialData={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(message) => {
            setEditOrder(null);
            toast.success(message);
            startTransition(() => router.refresh());
          }}
          vendors={vendors}
          readOnly={editOrder.status !== "draft"}
        />
      ) : null}

      {printDetail ? (
        <PoPrintPreviewModal
          detail={printDetail}
          documentContext={documentContext}
          onClose={() => setPrintDetail(null)}
          canDecide={canDecide}
          onDecision={handleDecision}
        />
      ) : null}

      {cancelOrder ? (
        <DocumentCancelModal
          documentNumber={cancelOrder.po_number}
          documentType="ใบสั่งซื้อ"
          isPending={isPending}
          onClose={() => setCancelOrder(null)}
          onConfirm={async (reason) => {
            const result = await cancelPurchaseOrderAction({
              purchaseOrderId: cancelOrder.id,
              reason,
            });
            if (!result.success) {
              toast.error(result.error ?? "ไม่สามารถยกเลิกใบสั่งซื้อได้");
              return;
            }

            const number = cancelOrder.po_number;
            setCancelOrder(null);
            toast.success(`ยกเลิก ${number} เรียบร้อยแล้ว`);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </section>
  );
}

function TableAction({
  children,
  disabled = false,
  label,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  tone?: "approve" | "danger" | "default";
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-[22px] w-[22px] place-items-center bg-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        tone === "danger"
          ? "text-primary hover:text-primary/80"
          : tone === "approve"
            ? "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            : "text-on-surface hover:text-primary"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
