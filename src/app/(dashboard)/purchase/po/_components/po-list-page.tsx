"use client";

import {
  Ban,
  Eye,
  Pencil,
  Plus,
  Printer,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Pagination } from "@/components/pagination";
import { MobileDocumentList } from "@/components/mobile-document-list";
import { MobileDocumentDetail } from "@/components/mobile-document-detail";
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
import { useHasPermission } from "@/components/permission-context";
import { ListDateRangeFilter, ListFilterButton, ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { RowActionMenu } from "@/components/row-action-menu";

type PoListPageProps = {
  buyerName: string;
  canApprove: boolean;
  canReject: boolean;
  documentContext: CompanyDocumentContext;
  documentDate: string;
  initialOpenOrderId: number | null;
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
  ["ลำดับ", "60px"],
  ["เลขที่ PO", "130px"],
  ["วันที่", "110px"],
  ["ผู้ขาย", "260px"],
  ["อ้างอิง PR", "160px"],
  ["วันที่ส่งมอบ", "120px"],
  ["ยอดรวม", "120px"],
  ["สถานะ", "110px"],
  ["จัดการ", "64px"],
] as const;

export function PoListPage({
  buyerName,
  canApprove,
  canReject,
  documentContext,
  documentDate,
  initialOpenOrderId,
  filters,
  page,
  pageSize,
  rows,
  total,
  vendors,
}: PoListPageProps) {
  const router = useRouter();
  const canCreate = useHasPermission("po.create");
  const canEdit = useHasPermission("po.edit");
  const canCancel = useHasPermission("po.cancel");
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createVersion, setCreateVersion] = useState(0);
  const createNext = () => { setEditOrder(null); setCreateVersion(value => value + 1); setIsCreateOpen(true); };
  const [cancelOrder, setCancelOrder] =
    useState<PurchaseOrderSummary | null>(null);
  const [editOrder, setEditOrder] = useState<PurchaseOrderEditData | null>(
    null,
  );
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null);
  const [loadingPrintId, setLoadingPrintId] = useState<number | null>(null);
  const openedNotificationOrderRef = useRef<number | null>(null);
  const [printDetail, setPrintDetail] =
    useState<PurchaseOrderPrintDetail | null>(null);
  const [mobileDetail, setMobileDetail] = useState<PurchaseOrderPrintDetail | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const mobileRows = rows.map((row) => ({
    details: [
      { label: "ผู้ขาย", value: row.vendor_name },
      { label: "อ้างอิง PR", value: row.pr_references.join(", ") || "-" },
      { label: "วันที่เอกสาร", value: formatDisplayDate(row.document_date) },
      { label: "วันที่ส่งมอบ", value: formatDisplayDate(row.delivery_date) },
      { label: "จำนวน", value: `${row.item_count} รายการ` },
      { label: "มูลค่า", value: `${formatPurchaseOrderAmount(row.grand_total)} บาท` },
    ],
    id: row.id,
    meta: `${formatDisplayDate(row.document_date)} · ${formatPurchaseOrderAmount(row.grand_total)} บาท`,
    status: <StatusBadge tone={statusTone(row.status)}>{PURCHASE_ORDER_STATUS_META[row.status].label}</StatusBadge>,
    subtitle: row.vendor_name,
    title: row.po_number,
  }));
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

  const openMobileDetail = async (purchaseOrderId: number) => {
    if (loadingPrintId !== null) return;
    setLoadingPrintId(purchaseOrderId);
    const result = await getPurchaseOrderPrintDetailAction(purchaseOrderId);
    setLoadingPrintId(null);
    if (!result.success) { toast.error(result.error ?? "ไม่สามารถดึงรายละเอียดใบสั่งซื้อได้"); return; }
    setMobileDetail(result.detail);
  };

  useEffect(() => {
    if (!initialOpenOrderId || openedNotificationOrderRef.current === initialOpenOrderId) return;
    openedNotificationOrderRef.current = initialOpenOrderId;
    void getPurchaseOrderPrintDetailAction(initialOpenOrderId).then((result) => {
      if (result.success) setPrintDetail(result.detail);
      else toast.error(result.error ?? "ไม่สามารถเปิดรายละเอียดใบสั่งซื้อจากการแจ้งเตือนได้");
    });
  }, [initialOpenOrderId]);

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
          {canCreate ? <button
            className="inline-flex h-[38px] flex-1 items-center justify-center gap-2 rounded-[3px] border border-primary bg-primary px-4 text-[13px] font-bold text-white shadow-sm hover:bg-primary/95 sm:flex-none sm:px-5"
            onClick={() => setIsCreateOpen(true)}
            type="button"
          >
            <Plus size={17} strokeWidth={2} />
            สร้าง PO ใหม่
          </button> : null}
        </div>
      </div>

      <form className="md:hidden" id="po-mobile-filters" method="get">
        <MobileListFilters activeCount={[filters.status, filters.vendorId].filter(Boolean).length} formId="po-mobile-filters" onClear={() => router.push("/purchase/po")} resultLabel={`แสดง ${total.toLocaleString("th-TH")} รายการ`} search={<ListSearchField defaultValue={filters.query} name="q" placeholder="ค้นหาเลขที่ PO, ผู้ขาย, เลขที่ PR..." />}>
          <ListFilterSelect defaultValue={filters.status} label="สถานะ" name="status"><option value="">ทั้งหมด</option>{PURCHASE_ORDER_STATUSES.map((status) => <option key={status} value={status}>{PURCHASE_ORDER_STATUS_META[status].label}</option>)}</ListFilterSelect>
          <ListFilterSelect defaultValue={filters.vendorId} label="ผู้ขาย" name="vendor"><option value="">ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendorName}</option>)}</ListFilterSelect>
          <ListDateRangeFilter defaultEndValue={filters.endDate} defaultStartValue={filters.startDate} endName="end" minEnd={filters.startDate || undefined} startName="start" />
        </MobileListFilters>
      </form>

      <form
        className="hidden min-w-0 gap-2 md:grid md:grid-cols-2 xl:grid-cols-[1.22fr_0.88fr_0.88fr_1.18fr_auto]"
        method="get"
      >
        <ListSearchField
            defaultValue={filters.query}
            name="q"
            placeholder="ค้นหาเลขที่ PO, ผู้ขาย, เลขที่ PR..."
        />
        <ListFilterSelect
          defaultValue={filters.status}
          label="สถานะ"
          name="status"
          onNativeChange={(event) => event.target.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {PURCHASE_ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PURCHASE_ORDER_STATUS_META[status].label}
            </option>
          ))}
        </ListFilterSelect>
        <ListFilterSelect
          defaultValue={filters.vendorId}
          label="ผู้ขาย"
          name="vendor"
          onNativeChange={(event) => event.target.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.vendorName}
            </option>
          ))}
        </ListFilterSelect>
        <ListDateRangeFilter
          defaultEndValue={filters.endDate}
          defaultStartValue={filters.startDate}
          endName="end"
          minEnd={filters.startDate || undefined}
          onEndChange={(_, event) => event.target.form?.requestSubmit()}
          onStartChange={(_, event) => event.target.form?.requestSubmit()}
          startName="start"
        />
        <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-1">
          <ListFilterButton
            className="flex-1 xl:flex-none"
            icon={<Search size={17} />}
            type="submit"
            tone="primary"
          >
            ค้นหา
          </ListFilterButton>
          <ListFilterButton
            className="flex-1 xl:flex-none"
            icon={<SlidersHorizontal size={17} />}
            onClick={() => router.push("/purchase/po")}
          >
            ล้างตัวกรอง
          </ListFilterButton>
        </div>
      </form>

      {!mobileDetail ? <MobileDocumentList
        actions={(mobileRow, close) => {
          const row = rows.find((item) => item.id === mobileRow.id);
          if (!row) return null;
          return <>
            <button className="mobile-sheet-primary" onClick={() => { close(); void openMobileDetail(row.id); }} type="button"><Eye size={18} />เปิดเอกสาร</button>
            <button className="mobile-sheet-secondary" onClick={() => { close(); void openPrintPreview(row.id); }} type="button"><Printer size={18} />พิมพ์</button>
            {canEdit && row.status === "draft" ? <button className="mobile-sheet-quiet" onClick={() => { close(); void openEditModal(row.id); }} type="button"><Pencil size={18} />แก้ไข</button> : null}
          </>;
        }}
        emptyText="ยังไม่มีใบสั่งซื้อที่ตรงกับตัวกรอง"
        rows={mobileRows}
      /> : null}

      <div className="erp-desktop-table overflow-hidden rounded-[8px] border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="erp-data-table min-w-[1220px]">
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
                    data-row-actions={`po-${row.id}`}
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
                      <RowActionMenu
                        actions={[
                          { disabled: loadingPrintId !== null, icon: <Printer size={16} />, label: "ดูและพิมพ์เอกสาร", onSelect: () => void openPrintPreview(row.id) },
                          ...(canEdit && row.status === "draft" ? [{ disabled: loadingEditId !== null, icon: <Pencil size={16} />, label: "แก้ไข", onSelect: () => void openEditModal(row.id) }] : []),
                          ...(canCancel ? [{ danger: true, disabled: !["pending_approval", "approved", "sent"].includes(row.status), icon: <Ban size={16} />, label: "ยกเลิกเอกสาร", onSelect: () => setCancelOrder(row) }] : []),
                        ]}
                        contextId={`po-${row.id}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination currentPage={page} disabled={isPending} onPageChange={goToPage} pageSize={pageSize} totalItems={total} totalPages={totalPages} />
      </div>

      <div className="md:hidden">
        <Pagination currentPage={page} disabled={isPending} onPageChange={goToPage} pageSize={pageSize} totalItems={total} totalPages={totalPages} />
      </div>

      {isCreateOpen ? (
        <PoCreateModal
          key={createVersion}
          onPrint={openPrintPreview}
          onNext={createNext}
          buyerName={buyerName}
          defaultDeliveryAddress={defaultDeliveryAddress}
          documentDate={documentDate}
          onClose={() => setIsCreateOpen(false)}
          onSaved={(message) => {
            toast.success(message);
            startTransition(() => router.refresh());
          }}
          vendors={vendors}
        />
      ) : null}

      {editOrder ? (
        <PoCreateModal
          key={createVersion}
          onPrint={openPrintPreview}
          onNext={createNext}
          buyerName={buyerName}
          defaultDeliveryAddress={defaultDeliveryAddress}
          documentDate={editOrder.documentDate}
          initialData={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(message) => {
            toast.success(message);
            startTransition(() => router.refresh());
          }}
          vendors={vendors}
          readOnly={editOrder.status !== "draft"}
        />
      ) : null}

      {mobileDetail ? <MobileDocumentDetail
        actions={<>
          {canEdit && mobileDetail.status === "draft" ? <button className="mobile-sheet-secondary flex-1" onClick={() => { const id = mobileDetail.id; setMobileDetail(null); void openEditModal(id); }} type="button"><Pencil size={18} />แก้ไข</button> : null}
          <button className="mobile-sheet-primary flex-1" onClick={() => { setPrintDetail(mobileDetail); setMobileDetail(null); }} type="button"><Printer size={18} />พิมพ์</button>
        </>}
        fields={[
          { label: "วันที่เอกสาร", value: formatDisplayDate(mobileDetail.documentDate) },
          { label: "ผู้ขาย", value: mobileDetail.vendor.name },
          { label: "อ้างอิง PR", value: mobileDetail.prReferences.join(", ") || "-" },
          { label: "วันที่ส่งมอบ", value: formatDisplayDate(mobileDetail.deliveryDate) },
          { label: "การชำระเงิน", value: mobileDetail.paymentMethodName },
          { label: "ยอดรวม", value: `${formatPurchaseOrderAmount(mobileDetail.grandTotal)} บาท` },
        ]}
        items={mobileDetail.items.map((item) => ({
          code: item.itemCode,
          details: [
            { label: "จำนวน", value: `${item.quantity.toLocaleString("th-TH")} ${item.unitName}` },
            { label: "ราคา/หน่วย", value: `${formatPurchaseOrderAmount(item.unitPrice)} บาท` },
          ],
          id: item.lineNo,
          name: item.itemDescription,
          trailing: `${formatPurchaseOrderAmount(item.lineTotal)} บาท`,
        }))}
        onClose={() => setMobileDetail(null)}
        status={<StatusBadge tone={statusTone(mobileDetail.status)}>{PURCHASE_ORDER_STATUS_META[mobileDetail.status].label}</StatusBadge>}
        title={mobileDetail.poNumber}
      /> : null}

      {printDetail ? (
        <PoPrintPreviewModal
          detail={printDetail}
          documentContext={documentContext}
          onClose={() => setPrintDetail(null)}
          canApprove={canApprove}
          canReject={canReject}
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
