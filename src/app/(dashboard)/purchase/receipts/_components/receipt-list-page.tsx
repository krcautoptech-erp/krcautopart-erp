"use client";

import { useMemo, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Eye, Loader2, MoreVertical, Plus, Printer, Search } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { MobileDocumentList } from "@/components/mobile-document-list";
import { ExcelExportButton } from "@/components/excel-export-button";
import { cancelGoodsReceiptAction, getGoodsReceiptDetailAction } from "@/app/actions/inventory";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { GrPrintPreviewModal } from "./gr-print-preview-modal";
import { ReceiptCreateModal } from "./receipt-create-modal";
import { toast } from "@/components/toast";
import { useHasPermission } from "@/components/permission-context";
import { DocumentCancelModal } from "../../_components/document-cancel-modal";
import { supplierDocumentTypeLabel } from "@/lib/goods-receipts";
import { ListDateRangeFilter, ListFilterButton, ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { RowActionMenu } from "@/components/row-action-menu";

type GoodsReceipt = {
  id: number; gr_number: string; document_date: string; purchase_order_id: number;
  po_number: string; vendor_code: string; vendor_name: string; delivery_note_no: string | null;
  supplier_document_type: string | null; supplier_document_date: string | null;
  status: "draft" | "posted" | "cancelled"; remarks: string | null; created_at: string;
  item_count?: number;
};
type PendingPO = {
  id: number;
  po_number: string;
  vendor_name: string;
  document_date: string;
  delivery_date: string;
  delivery_address: string;
  status: string;
  item_count: number;
  outstanding_label: string;
};
type Warehouse = { id: number; code: string; name: string; status: string };

type Props = {
  initialGoodsReceipts: GoodsReceipt[];
  pendingPOs: PendingPO[];
  warehouses: Warehouse[];
  documentContext: CompanyDocumentContext;
  filters: { query: string; startDate: string; endDate: string };
};

const pageSize = 15;

const GR_STATUS_META: Record<
  "draft" | "posted" | "cancelled",
  { className: string; label: string }
> = {
  draft: {
    className: "border-slate-500 bg-slate-500 text-white dark:border-slate-600 dark:bg-slate-600",
    label: "ร่าง",
  },
  posted: {
    className: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
    label: "ผ่าน",
  },
  cancelled: {
    className: "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500",
    label: "ยกเลิก",
  },
};

export function ReceiptListPage({ initialGoodsReceipts, pendingPOs, warehouses, documentContext, filters }: Props) {
  const router = useRouter();
  const canCreate = useHasPermission("inventory.create_gr");
  const canCancel = useHasPermission("inventory.cancel_gr");
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createVersion, setCreateVersion] = useState(0);
  const [query, setQuery] = useState(filters.query);
  const [poFilter, setPoFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | GoodsReceipt["status"]>("all");
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [page, setPage] = useState(1);
  const [printDetail, setPrintDetail] = useState<ComponentProps<typeof GrPrintPreviewModal>["detail"] | null>(null);
  const [mobileDetail, setMobileDetail] = useState<{ detail: ComponentProps<typeof GrPrintPreviewModal>["detail"]; status: GoodsReceipt["status"] } | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GoodsReceipt | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const vendors = useMemo(() => [...new Set(initialGoodsReceipts.map((item) => item.vendor_name))], [initialGoodsReceipts]);
  const rows = useMemo(() => initialGoodsReceipts.filter((item) => {
    const keyword = query.trim().toLowerCase();
    const matchesText = !keyword || [item.gr_number, item.po_number, item.vendor_name, item.delivery_note_no ?? ""].some((value) => value.toLowerCase().includes(keyword));
    return matchesText && (poFilter === "all" || item.po_number === poFilter) && (vendorFilter === "all" || item.vendor_name === vendorFilter) && (statusFilter === "all" || item.status === statusFilter);
  }), [initialGoodsReceipts, poFilter, query, statusFilter, vendorFilter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const mobileRows = visibleRows.map((item) => ({
    details: [
      { label: "เลขที่ PO", value: item.po_number },
      { label: "ผู้ขาย", value: item.vendor_name },
      { label: "วันที่รับ", value: formatDisplayDate(item.document_date) },
      { label: "จำนวน", value: `${item.item_count ?? "-"} รายการ` },
      { label: "เอกสารผู้ขาย", value: item.delivery_note_no || "-" },
    ],
    id: item.id,
    meta: `${item.po_number} · ${formatDisplayDate(item.document_date)}`,
    status: <StatusBadge tone={statusTone(item.status)}>{GR_STATUS_META[item.status].label}</StatusBadge>,
    subtitle: item.vendor_name,
    title: item.gr_number,
  }));

  const loadPrint = async (receipt: { id: number }) => {
    setLoadingId(receipt.id);
    const result = await getGoodsReceiptDetailAction(receipt.id);
    setLoadingId(null);
    if (!result.success || !result.data) { toast.error(result.error ?? "ไม่สามารถโหลดรายละเอียดใบรับสินค้าได้"); return; }
    setPrintDetail({ ...receipt, ...result.data.header, items: result.data.items });
  };

  const loadMobileDetail = async (receipt: GoodsReceipt) => {
    setLoadingId(receipt.id);
    const result = await getGoodsReceiptDetailAction(receipt.id);
    setLoadingId(null);
    if (!result.success || !result.data) { toast.error(result.error ?? "ไม่สามารถโหลดรายละเอียดใบรับสินค้าได้"); return; }
    setMobileDetail({ detail: { ...receipt, ...result.data.header, items: result.data.items }, status: receipt.status });
  };

  const applyServerFilters = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);
    startTransition(() => router.push(`/purchase/receipts?${params}`));
  };

  const exportExcel = () => {
    const lines = [
      ["ลำดับ", "เลขที่ GR", "อ้างอิง PO", "ผู้ขาย", "เอกสารผู้ขาย", "วันที่เอกสาร", "วันที่รับ", "จำนวนรายการ", "สถานะ"],
      ...rows.map((item, index) => [index + 1, item.gr_number, item.po_number, item.vendor_name, `${supplierDocumentTypeLabel(item.supplier_document_type)} ${item.delivery_note_no ?? "-"}`, item.supplier_document_date ?? "-", item.document_date, item.item_count ?? "-", GR_STATUS_META[item.status]?.label ?? item.status]),
    ];
    const blob = new Blob(["\uFEFF" + lines.map((line) => line.join("\t")).join("\n")], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `Goods_Receipts_${startDate}_${endDate}.xls`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="flex min-h-[calc(100dvh-116px)] min-w-0 flex-col gap-2 text-on-surface">
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div><h1 className="text-[23px] font-bold leading-7">รับสินค้า (GR)</h1><p className="text-[12px] text-secondary">รายการรับสินค้าจากใบสั่งซื้อและบันทึกเข้าคลัง</p></div>
        <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          <ExcelExportButton onClick={exportExcel} />
          {canCreate ? <button className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-primary px-4 text-[12px] font-bold text-white" onClick={() => setCreateOpen(true)}><Plus size={15} />รับสินค้าใหม่</button> : null}
        </div>
      </header>

      <MobileListFilters activeCount={[poFilter !== "all", vendorFilter !== "all", startDate, endDate].filter(Boolean).length} onClear={() => { setPoFilter("all"); setVendorFilter("all"); setStartDate(""); setEndDate(""); setPage(1); }} resultLabel={`แสดง ${visibleRows.length.toLocaleString("th-TH")} รายการ`} search={<ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหา GR, PO, ผู้ขาย, เอกสารผู้ขาย" value={query} />}>
        <ListFilterSelect label="เลขที่ PO" onChange={(value) => { setPoFilter(value); setPage(1); }} value={poFilter}><option value="all">ทั้งหมด</option>{[...new Set(initialGoodsReceipts.map((item) => item.po_number))].map((po) => <option key={po} value={po}>{po}</option>)}</ListFilterSelect>
        <ListFilterSelect label="ผู้ขาย" onChange={(value) => { setVendorFilter(value); setPage(1); }} value={vendorFilter}><option value="all">ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}</ListFilterSelect>
        <ListDateRangeFilter endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
      </MobileListFilters>

      <ListFilterToolbar className="hidden min-w-0 md:grid md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1.25fr_auto] xl:[&>button]:col-span-1">
        <ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหา GR, PO, ผู้ขาย, เอกสารผู้ขาย" value={query} />
        <ListFilterSelect label="เลขที่ PO" onChange={(value) => { setPoFilter(value); setPage(1); }} value={poFilter}><option value="all">ทั้งหมด</option>{[...new Set(initialGoodsReceipts.map((item) => item.po_number))].map((po) => <option key={po} value={po}>{po}</option>)}</ListFilterSelect>
        <ListFilterSelect label="ผู้ขาย" onChange={(value) => { setVendorFilter(value); setPage(1); }} value={vendorFilter}><option value="all">ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}</ListFilterSelect>
        <ListDateRangeFilter endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
        <ListFilterButton disabled={isPending} icon={isPending ? <Loader2 className="animate-spin" size={15} /> : <Search size={17} />} onClick={applyServerFilters} tone="primary">ค้นหา</ListFilterButton>
      </ListFilterToolbar>

      <div className="grid grid-cols-3 overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-low md:hidden">
        {(["all", "draft", "posted"] as const).map((status) => {
          const label = status === "all" ? "ทั้งหมด" : status === "draft" ? "รอตรวจ" : "รับแล้ว";
          const count = status === "all" ? initialGoodsReceipts.length : initialGoodsReceipts.filter((item) => item.status === status).length;
          return <button className={`min-h-11 border-r border-outline-variant px-2 text-[13px] font-bold last:border-r-0 ${statusFilter === status ? "bg-primary text-white" : "text-on-surface"}`} key={status} onClick={() => { setStatusFilter(status); setPage(1); }} type="button">{label} ({count})</button>;
        })}
      </div>

      <MobileDocumentList
        actions={(mobileRow, close) => {
          const item = visibleRows.find((row) => row.id === mobileRow.id);
          if (!item) return null;
          return <>
            <button className="mobile-sheet-primary" onClick={() => { close(); void loadMobileDetail(item); }} type="button"><Eye size={18} />เปิดเอกสาร</button>
            <button className="mobile-sheet-secondary" onClick={() => { close(); void loadPrint(item); }} type="button"><Printer size={18} />พิมพ์</button>
            {canCancel && item.status === "posted" ? <button className="mobile-sheet-quiet" onClick={() => { close(); setCancelTarget(item); }} type="button"><Ban size={18} />ยกเลิกเอกสาร</button> : null}
          </>;
        }}
        emptyText="ไม่พบรายการรับสินค้าตามเงื่อนไข"
        rows={mobileRows}
      />

      <div className="erp-desktop-table flex-1 overflow-hidden rounded-[3px] border border-outline-variant bg-surface-container-lowest">
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="erp-data-table min-w-[1080px]">
            <thead className="h-8 bg-surface-container-low text-[11px] font-bold text-black dark:bg-white/5 dark:text-white"><tr><th className="w-[4%] text-center">ลำดับ</th><th className="w-[11%] text-left">เลขที่ GR</th><th className="w-[11%] text-left">อ้างอิง PO</th><th className="w-[21%] text-left">ผู้ขาย</th><th className="w-[18%] text-left">เอกสารผู้ขาย</th><th className="w-[10%] text-center">วันที่รับ</th><th className="w-[9%] text-center">จำนวนรายการ</th><th className="w-[9%] text-center">สถานะรับ</th><th className="w-[7%] text-center">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-outline-variant text-[13px] font-semibold text-black dark:text-white">
              {visibleRows.map((item, index) => {
                const meta = GR_STATUS_META[item.status] || { className: "border-slate-500 bg-slate-500 text-white", label: item.status };
                return (
                  <tr className="h-9 border-t border-outline-variant hover:bg-surface-container-low/50" data-row-actions={`gr-${item.id}`} key={item.id}>
                    <td className="text-center">{(page - 1) * pageSize + index + 1}</td>
                    <td className="font-bold text-primary">{item.gr_number}</td>
                    <td className="font-semibold">{item.po_number}</td>
                    <td className="truncate pr-2 font-medium" title={item.vendor_name}>{item.vendor_name}</td>
                    <td className="pr-2"><b className="block text-[11px]">{item.delivery_note_no || "-"}</b><small className="block truncate text-[10px] font-medium text-secondary">{supplierDocumentTypeLabel(item.supplier_document_type)} · {item.supplier_document_date ? formatDisplayDate(item.supplier_document_date) : "-"}</small></td>
                    <td className="text-center">{formatDisplayDate(item.document_date)}</td>
                    <td className="text-center">{item.item_count ?? "-"}</td>
                    <td className="text-center">
                      <StatusBadge tone={statusTone(item.status)}>
                        {meta.label}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className="flex justify-center">
                        <RowActionMenu
                          actions={[
                            { disabled: loadingId === item.id, icon: loadingId === item.id ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />, label: "ดูและพิมพ์เอกสาร", onSelect: () => void loadPrint(item) },
                            ...(canCancel ? [{ danger: true, disabled: item.status !== "posted", icon: <Ban size={16} />, label: "ยกเลิกเอกสาร", onSelect: () => setCancelTarget(item) }] : []),
                          ]}
                          contextId={`gr-${item.id}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && <tr><td className="h-28 text-center text-secondary" colSpan={9}>ไม่พบรายการรับสินค้าตามเงื่อนไข</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={page} onPageChange={setPage} pageSize={pageSize} totalItems={rows.length} totalPages={pageCount} />

      {createOpen && <ReceiptCreateModal key={createVersion} onNext={() => { setCreateVersion(value => value + 1); router.refresh(); }} onPrint={id => loadPrint({ id })} pendingPOs={pendingPOs} warehouses={warehouses} onClose={() => setCreateOpen(false)} onSaved={(message) => { toast.success(message); router.refresh(); }} />}
      {mobileDetail ? <MobileGoodsReceiptDetail data={mobileDetail} onClose={() => setMobileDetail(null)} onPrint={() => { setMobileDetail(null); setPrintDetail(mobileDetail.detail); }} /> : null}
      {printDetail && <GrPrintPreviewModal detail={printDetail} documentContext={documentContext} onClose={() => setPrintDetail(null)} />}
      {cancelTarget ? <DocumentCancelModal
        documentNumber={cancelTarget.gr_number}
        documentType="ใบรับสินค้า"
        isPending={cancelling}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (reason) => {
          setCancelling(true);
          const result = await cancelGoodsReceiptAction(cancelTarget.id, reason);
          setCancelling(false);
          if (!("success" in result)) { toast.error(result.error); return; }
          toast.success(`ยกเลิก ${cancelTarget.gr_number} และกลับรายการสต็อกแล้ว`);
          setCancelTarget(null);
          router.refresh();
        }}
      /> : null}
    </section>
  );
}

function MobileGoodsReceiptDetail({ data, onClose, onPrint }: { data: { detail: ComponentProps<typeof GrPrintPreviewModal>["detail"]; status: GoodsReceipt["status"] }; onClose: () => void; onPrint: () => void }) {
  const { detail, status } = data;
  return <section className="fixed inset-0 z-[125] flex flex-col overflow-hidden bg-background text-on-surface md:hidden">
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-3">
      <button aria-label="ย้อนกลับ" className="grid size-11 place-items-center" onClick={onClose} type="button"><ArrowLeft size={25} /></button>
      <h2 className="min-w-0 flex-1 truncate text-[20px] font-extrabold">{detail.gr_number}</h2>
      <StatusBadge tone={statusTone(status)}>{GR_STATUS_META[status].label}</StatusBadge>
      <button aria-label="เมนูเพิ่มเติม" className="grid size-11 place-items-center" type="button"><MoreVertical size={23} /></button>
    </header>
    <div className="flex-1 overflow-y-auto pb-24">
      <section className="px-4 py-4">
        <h3 className="mb-2 text-[15px] font-bold text-secondary">ข้อมูลเอกสาร</h3>
        <dl className="mobile-detail-definition">
          <div><dt>วันที่รับ</dt><dd>{formatDisplayDate(detail.document_date)}</dd></div>
          <div><dt>ผู้ขาย</dt><dd>{detail.vendor_name}</dd></div>
          <div><dt>อ้างอิง</dt><dd>{detail.po_number}</dd></div>
          <div><dt>เอกสารผู้ขาย</dt><dd>{detail.delivery_note_no || "-"}</dd></div>
        </dl>
      </section>
      <div className="h-3 bg-surface-container-low" />
      <section>
        <h3 className="border-b border-outline-variant px-4 py-3 text-[17px] font-extrabold">รายการสินค้า ({detail.items.length})</h3>
        <div className="mobile-item-ledger">
          {detail.items.map((item) => <article className="mobile-item-row" key={item.id}>
            <div className="min-w-0 flex-1">
              <strong>{item.item_code}</strong>
              <h4>{item.item_name}</h4>
              <dl><div><dt>จำนวนสั่งซื้อ</dt><dd>{item.quantity_ordered.toLocaleString("th-TH")} {item.unit_name}</dd></div><div><dt>จำนวนรับเข้า</dt><dd>{item.quantity_received.toLocaleString("th-TH")} {item.unit_name}</dd></div>{item.vendor_lot_no ? <div><dt>Lot No.</dt><dd>{item.vendor_lot_no}</dd></div> : null}</dl>
            </div>
          </article>)}
        </div>
      </section>
    </div>
    <footer className="absolute inset-x-0 bottom-0 border-t border-outline-variant bg-surface-container-lowest p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <button className="mobile-sheet-primary w-full" onClick={onPrint} type="button"><Printer size={19} />พิมพ์เอกสาร</button>
    </footer>
  </section>;
}
