"use client";

import { useMemo, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, MoreVertical, Plus, Search } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { getGoodsReceiptDetailAction } from "@/app/actions/inventory";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { GrPrintPreviewModal } from "./gr-print-preview-modal";
import { ReceiptCreateModal } from "./receipt-create-modal";
import { toast } from "@/components/toast";

type GoodsReceipt = {
  id: number; gr_number: string; document_date: string; purchase_order_id: number;
  po_number: string; vendor_code: string; vendor_name: string; delivery_note_no: string | null;
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
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState(filters.query);
  const [poFilter, setPoFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [page, setPage] = useState(1);
  const [printDetail, setPrintDetail] = useState<ComponentProps<typeof GrPrintPreviewModal>["detail"] | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const vendors = useMemo(() => [...new Set(initialGoodsReceipts.map((item) => item.vendor_name))], [initialGoodsReceipts]);
  const rows = useMemo(() => initialGoodsReceipts.filter((item) => {
    const keyword = query.trim().toLowerCase();
    const matchesText = !keyword || [item.gr_number, item.po_number, item.vendor_name, item.delivery_note_no ?? ""].some((value) => value.toLowerCase().includes(keyword));
    return matchesText && (poFilter === "all" || item.po_number === poFilter) && (vendorFilter === "all" || item.vendor_name === vendorFilter);
  }), [initialGoodsReceipts, poFilter, query, vendorFilter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const loadPrint = async (receipt: GoodsReceipt) => {
    setLoadingId(receipt.id);
    const result = await getGoodsReceiptDetailAction(receipt.id);
    setLoadingId(null);
    if (!result.success || !result.data) return toast.error(result.error ?? "ไม่สามารถโหลดรายละเอียดใบรับสินค้าได้");
    setPrintDetail({ ...receipt, ...result.data.header, items: result.data.items });
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
      ["ลำดับ", "เลขที่ GR", "อ้างอิง PO", "ผู้ขาย", "วันที่รับ", "จำนวนรายการ", "สถานะ"],
      ...rows.map((item, index) => [index + 1, item.gr_number, item.po_number, item.vendor_name, item.document_date, item.item_count ?? "-", "รับแล้ว"]),
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
          <button className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-primary px-4 text-[12px] font-bold text-white" onClick={() => setCreateOpen(true)}><Plus size={15} />รับสินค้าใหม่</button>
        </div>
      </header>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1.25fr_auto] xl:[&>button]:col-span-1">
        <label className="relative"><Search className="absolute left-3 top-2.5 text-secondary" size={15} /><input className="h-9 w-full rounded-[2px] border border-outline-variant bg-surface-container-lowest pl-9 pr-3 text-[12px] outline-none focus:border-primary" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ค้นหาเลขที่ GR, PO, ผู้ขาย" value={query} /></label>
        <select className="h-9 rounded-[2px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px]" onChange={(event) => { setPoFilter(event.target.value); setPage(1); }} value={poFilter}><option value="all">เลขที่ PO: ทั้งหมด</option>{[...new Set(initialGoodsReceipts.map((item) => item.po_number))].map((po) => <option key={po} value={po}>{po}</option>)}</select>
        <select className="h-9 rounded-[2px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px]" onChange={(event) => { setVendorFilter(event.target.value); setPage(1); }} value={vendorFilter}><option value="all">ผู้ขาย: ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}</select>
        <div className="flex h-9 items-center gap-1 rounded-[2px] border border-outline-variant bg-surface-container-lowest px-2"><input className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /><span>-</span><input className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></div>
        <button className="h-9 rounded-[2px] border border-primary px-4 text-[12px] font-bold text-primary" onClick={applyServerFilters}>{isPending ? <Loader2 className="mx-auto animate-spin" size={15} /> : "ค้นหา"}</button>
      </div>

      <div className="flex-1 overflow-hidden rounded-[3px] border border-outline-variant bg-surface-container-lowest">
        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table className="erp-data-table min-w-[920px]">
            <thead className="h-8 bg-surface-container-low text-[11px] font-bold text-black dark:bg-white/5 dark:text-white"><tr><th className="w-[5%] text-center">ลำดับ</th><th className="w-[13%] text-left">เลขที่ GR</th><th className="w-[13%] text-left">อ้างอิง PO</th><th className="w-[28%] text-left">ผู้ขาย</th><th className="w-[13%] text-center">วันที่รับ</th><th className="w-[11%] text-center">จำนวนรายการ</th><th className="w-[10%] text-center">สถานะรับ</th><th className="w-[7%] text-center">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-outline-variant text-[13px] font-semibold text-black dark:text-white">
              {visibleRows.map((item, index) => {
                const meta = GR_STATUS_META[item.status] || { className: "border-slate-500 bg-slate-500 text-white", label: item.status };
                return (
                  <tr className="h-9 border-t border-outline-variant hover:bg-surface-container-low/50" key={item.id}>
                    <td className="text-center">{(page - 1) * pageSize + index + 1}</td>
                    <td className="font-bold text-primary">{item.gr_number}</td>
                    <td className="font-semibold">{item.po_number}</td>
                    <td className="truncate pr-2 font-medium" title={item.vendor_name}>{item.vendor_name}</td>
                    <td className="text-center">{formatDisplayDate(item.document_date)}</td>
                    <td className="text-center">{item.item_count ?? "-"}</td>
                    <td className="text-center">
                      <StatusBadge tone={statusTone(item.status)}>
                        {meta.label}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className="flex justify-center gap-1">
                        <button aria-label="ดูและพิมพ์" className="p-1" disabled={loadingId === item.id} onClick={() => loadPrint(item)}>
                          {loadingId === item.id ? <Loader2 className="animate-spin" size={15} /> : <Eye size={15} />}
                        </button>
                        <button aria-label="เมนูเพิ่มเติม" className="p-1">
                          <MoreVertical size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && <tr><td className="h-28 text-center text-secondary" colSpan={8}>ไม่พบรายการรับสินค้าตามเงื่อนไข</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={page} onPageChange={setPage} pageSize={pageSize} totalItems={rows.length} totalPages={pageCount} />

      {createOpen && <ReceiptCreateModal pendingPOs={pendingPOs} warehouses={warehouses} onClose={() => setCreateOpen(false)} onSaved={(message) => { setCreateOpen(false); toast.success(message); router.refresh(); }} />}
      {printDetail && <GrPrintPreviewModal detail={printDetail} documentContext={documentContext} onClose={() => setPrintDetail(null)} />}
    </section>
  );
}
