"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Printer, Search } from "lucide-react";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ExcelExportButton } from "@/components/excel-export-button";
import { MobileDocumentList } from "@/components/mobile-document-list";
import { MobileReportActions } from "@/components/mobile-report-actions";
import { Pagination } from "@/components/pagination";
import { ReportBackLink } from "@/components/report-back-link";
import { StatusBadge } from "@/components/status-badge";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { printElement } from "@/lib/document-print";
import { pendingReceiptStatus, purchaseOrderSearchHref } from "@/lib/pending-receipts";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { ListDateRangeFilter, ListFilterButton, ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";

export type PendingReceiptRow = {
  buyerName: string;
  contactName: string;
  contactPhone: string;
  deliveryDate: string;
  documentDate: string;
  id: number;
  itemCode: string;
  itemName: string;
  lastReceiptDate: string | null;
  orderedQty: number;
  pendingAmount: number;
  pendingQty: number;
  poNumber: string;
  receivedQty: number;
  sentAt: string | null;
  unitName: string;
  vendorCode: string;
  vendorName: string;
};

const PAGE_SIZE = 14;
const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 4 });

export function PendingReceiptsReport({
  documentContext,
  printedBy = "KRC ERP",
  rows,
  todayIso,
}: {
  documentContext?: CompanyDocumentContext;
  printedBy?: string;
  rows: PendingReceiptRow[];
  todayIso: string;
}) {
  const printRoot = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const activeCount = Number(Boolean(status)) + Number(Boolean(startDate)) + Number(Boolean(endDate));
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const filtered = useMemo(() => rows.filter((row) => {
    const meta = pendingReceiptStatus(row.deliveryDate, row.sentAt, todayIso);
    const matchesQuery = `${row.poNumber} ${row.vendorCode} ${row.vendorName} ${row.itemCode} ${row.itemName}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (!status || meta.tone === status) && (!startDate || row.deliveryDate >= startDate) && (!endDate || row.deliveryDate <= endDate);
  }), [endDate, query, rows, startDate, status, todayIso]);

  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePrint = () => {
    setIsPrinting(true);
  };

  useEffect(() => {
    if (!isPrinting || !printRoot.current) return;
    void printElement(printRoot.current, {
      title: `pending-receipts-${todayIso}`,
      paperSize: "A4",
      orientation: "landscape",
      styles: [`.pending-receipts-print-root{display:block!important;position:relative!important;--document-footer-bottom:3mm;--document-page-padding-inline:10mm;width:297mm!important;min-height:210mm!important;margin:0!important;padding:8mm 10mm 12mm!important;background:#fff!important}`],
    }).finally(() => setIsPrinting(false));
  }, [isPrinting, todayIso]);

  const exportExcel = () => {
    const header = ["สถานะ", "กำหนดส่ง", "เลขที่ PO", "ผู้ขาย", "รหัสสินค้า", "ชื่อสินค้า", "ค้างรับ", "สั่งซื้อ", "รับแล้ว", "มูลค่าค้างรับ", "ผู้ซื้อ", "ผู้ติดต่อผู้ขาย", "รับล่าสุด"];
    const body = filtered.map((row) => [pendingReceiptStatus(row.deliveryDate, row.sentAt, todayIso).label, row.deliveryDate, row.poNumber, row.vendorName, row.itemCode, row.itemName, row.pendingQty, row.orderedQty, row.receivedQty, row.pendingAmount, row.buyerName, `${row.contactName} ${row.contactPhone}`, row.lastReceiptDate ?? "-"]);
    const blob = new Blob([`\uFEFF${[header, ...body].map((line) => line.join("\t")).join("\n")}`], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pending-receipts-${todayIso}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex min-h-[calc(100dvh-128px)] min-w-0 flex-col gap-3">
      <ReportBackLink />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold leading-[1.25]">รายงานสินค้าค้างรับและติดตามกำหนดส่ง</h1>
          <p className="text-[13px] font-medium text-secondary">รายการสินค้าที่สั่งซื้อแล้วแต่ยังไม่ได้รับครบ และติดตามกำหนดส่งจากผู้ขาย</p>
        </div>
        <div className="hidden items-center gap-2 min-[901px]:flex">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-4 text-[14px] font-semibold text-on-surface hover:bg-surface-container"
            onClick={handlePrint}
            type="button"
          >
            <Printer size={18} />
            พิมพ์ A4
          </button>
          <ExcelExportButton className="w-full sm:w-auto" onClick={exportExcel} />
        </div>
      </div>
      <MobileListFilters
        activeCount={activeCount}
        className="min-[901px]:hidden"
        onClear={clearFilters}
        resultLabel={`แสดง ${filtered.length} รายการ`}
        search={<ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่ PO, รหัสสินค้า, ชื่อสินค้า, ผู้ขาย..." value={query} />}
        title="ตัวกรองรายงาน"
      >
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}>
          <option value="">ทั้งหมด</option>
          <option value="danger">เกินกำหนด</option>
          <option value="pending">ใกล้ครบกำหนด</option>
          <option value="success">กำลังจัดส่ง</option>
          <option value="neutral">รอส่ง PO</option>
        </ListFilterSelect>
        <ListDateRangeFilter label="กำหนดส่ง" endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
      </MobileListFilters>
      <MobileReportActions actions={[
        { icon: <FileSpreadsheet size={18} />, label: "ส่งออก Excel", onSelect: exportExcel },
        { icon: <Printer size={18} />, label: "พิมพ์ A4", onSelect: handlePrint },
      ]} />
      <ListFilterToolbar className="hidden min-[901px]:grid min-[901px]:grid-cols-2 xl:grid-cols-[minmax(300px,1.35fr)_245px_minmax(300px,1fr)_180px]">
        <ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่ PO, รหัสสินค้า, ชื่อสินค้า, ผู้ขาย..." value={query} />
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}>
          <option value="">ทั้งหมด</option>
          <option value="danger">เกินกำหนด</option>
          <option value="pending">ใกล้ครบกำหนด</option>
          <option value="success">กำลังจัดส่ง</option>
          <option value="neutral">รอส่ง PO</option>
        </ListFilterSelect>
        <ListDateRangeFilter label="กำหนดส่ง" endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
        <ListFilterButton icon={<Search size={17} />} tone="primary">
          ค้นหา
        </ListFilterButton>
      </ListFilterToolbar>
      <MobileDocumentList
        actions={(row, close) => {
          const source = visibleRows.find((item) => item.id === row.id);
          return source ? <Link className="mobile-sheet-primary" href={purchaseOrderSearchHref(source.poNumber, source.documentDate)} onClick={close}>เปิดเอกสาร PO</Link> : null;
        }}
        className="min-[901px]:hidden"
        emptyText="ไม่พบสินค้าค้างรับตามเงื่อนไข"
        rows={visibleRows.map((row) => {
          const meta = pendingReceiptStatus(row.deliveryDate, row.sentAt, todayIso);
          return {
            id: row.id,
            title: row.poNumber,
            subtitle: `${row.itemCode} · ${row.itemName}`,
            meta: `${row.vendorName} · กำหนดส่ง ${formatDisplayDate(row.deliveryDate)}`,
            status: <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>,
            details: [
              { label: "กำหนดส่ง", value: formatDisplayDate(row.deliveryDate) },
              { label: "ผู้ขาย", value: `${row.vendorName} (${row.vendorCode})` },
              { label: "สินค้า", value: `${row.itemCode} · ${row.itemName}` },
              { label: "จำนวนสั่งซื้อ", value: `${quantity(row.orderedQty)} ${row.unitName}` },
              { label: "รับแล้ว", value: `${quantity(row.receivedQty)} ${row.unitName}` },
              { label: "ค้างรับ", value: `${quantity(row.pendingQty)} ${row.unitName}` },
              { label: "มูลค่าค้างรับ", value: `${row.pendingAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท` },
              { label: "ผู้ซื้อ", value: row.buyerName },
              { label: "ผู้ติดต่อผู้ขาย", value: `${row.contactName} · ${row.contactPhone}` },
              { label: "รับล่าสุด", value: row.lastReceiptDate ? formatDisplayDate(row.lastReceiptDate) : "-" },
            ],
          };
        })}
      />
      <DataTableFrame className="hidden min-[901px]:block min-h-0 flex-1">
        <DataTable className="pending-receipts-table min-w-[1420px] table-fixed">
          <colgroup><col className="w-[108px]"/><col className="w-[100px]"/><col className="w-[130px]"/><col className="w-[190px]"/><col className="w-[180px]"/><col className="w-[96px]"/><col className="w-[92px]"/><col className="w-[92px]"/><col className="w-[128px]"/><col className="w-[115px]"/><col className="w-[145px]"/><col className="w-[110px]"/></colgroup>
          <thead><tr>{["สถานะ", "กำหนดส่ง", "เลขที่ PO", "ผู้ขาย", "สินค้า", "จำนวนค้างรับ", "จำนวนสั่งซื้อ", "จำนวนรับแล้ว", "มูลค่าค้างรับ (บาท)", "ผู้ซื้อ", "ผู้ติดต่อผู้ขาย", "รับล่าสุด"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{visibleRows.length ? visibleRows.map((row) => { const meta = pendingReceiptStatus(row.deliveryDate, row.sentAt, todayIso); return <tr key={row.id}>
            <td><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td><td>{formatDisplayDate(row.deliveryDate)}</td><td><Link className="font-bold text-primary underline decoration-primary/40 underline-offset-2" href={purchaseOrderSearchHref(row.poNumber, row.documentDate)}>{row.poNumber}</Link></td>
            <td data-report-long><div className="font-bold">{row.vendorName}</div><div className="text-[11px] font-medium text-secondary">{row.vendorCode}</div></td><td data-report-long><div className="text-[11px] font-medium text-secondary">{row.itemCode}</div><div className="whitespace-normal font-semibold" title={row.itemName}>{row.itemName}</div></td>
            <td className="text-right font-bold">{quantity(row.pendingQty)} {row.unitName}</td><td className="text-right">{quantity(row.orderedQty)} {row.unitName}</td><td className="text-right">{quantity(row.receivedQty)} {row.unitName}</td><td className="text-right">{row.pendingAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>{row.buyerName}</td><td><div>{row.contactName}</div><div className="text-[11px] font-medium text-secondary">{row.contactPhone}</div></td><td>{row.lastReceiptDate ? formatDisplayDate(row.lastReceiptDate) : "-"}</td>
          </tr>; }) : <DataTableEmpty colSpan={12}>ไม่พบสินค้าค้างรับตามเงื่อนไข</DataTableEmpty>}</tbody>
        </DataTable>
      </DataTableFrame>
      <Pagination currentPage={page} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={filtered.length} />

      {isPrinting && documentContext && (
        <div className="hidden pending-receipts-print-root" ref={printRoot} style={{ display: "none" }}>
          <CompanyDocumentHeader
            context={documentContext}
            meta={[
              { label: "พิมพ์เมื่อ", value: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) },
              { label: "ผู้พิมพ์", value: printedBy },
            ]}
            priority
          />
          <section style={{ padding: "3mm 0 2mm", textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: "16pt", fontWeight: 800 }}>รายงานสินค้าค้างรับและติดตามกำหนดส่ง</h1>
            <p style={{ margin: "1mm 0 2.5mm", color: "#444", fontSize: "8.5pt" }}>รายการสินค้าที่สั่งซื้อแล้วแต่ยังไม่ได้รับครบ และติดตามกำหนดส่งจากผู้ขาย</p>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.5mm 8mm", borderBottom: "0.35mm solid #d31220", padding: "0 1mm 2.5mm", fontSize: "8pt", textAlign: "left" }}>
              <div><dt style={{ display: "inline", fontWeight: 600 }}>สถานะ: </dt><dd style={{ display: "inline" }}>{status ? (status === "danger" ? "เกินกำหนด" : status === "pending" ? "ใกล้ครบกำหนด" : status === "success" ? "กำลังจัดส่ง" : "รอส่ง PO") : "ทั้งหมด"}</dd></div>
              <div><dt style={{ display: "inline", fontWeight: 600 }}>รายการค้างรับ: </dt><dd style={{ display: "inline", fontWeight: 700 }}>{filtered.length} รายการ</dd></div>
              <div><dt style={{ display: "inline", fontWeight: 600 }}>มูลค่าค้างรับรวม: </dt><dd style={{ display: "inline", fontWeight: 700 }}>{filtered.reduce((sum, r) => sum + r.pendingAmount, 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</dd></div>
            </dl>
          </section>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt", marginTop: "2.5mm" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "center", width: "24px" }}>#</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "center", width: "70px" }}>กำหนดส่ง</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "left", width: "90px" }}>เลขที่ PO</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "left" }}>ผู้ขาย</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "left" }}>สินค้า</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", width: "65px" }}>ค้างรับ</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", width: "55px" }}>สั่งซื้อ</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", width: "55px" }}>รับแล้ว</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", width: "85px" }}>มูลค่าค้างรับ (บาท)</th>
                <th style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "left", width: "80px" }}>ผู้ซื้อ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={row.id}>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "center" }}>{index + 1}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "center" }}>{formatDisplayDate(row.deliveryDate)}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", fontWeight: 700 }}>{row.poNumber}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm" }}>{row.vendorName}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm" }}>
                    <div style={{ fontWeight: 600 }}>{row.itemName}</div>
                    <div style={{ fontSize: "6.5pt", color: "#666" }}>{row.itemCode}</div>
                  </td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{quantity(row.pendingQty)} {row.unitName}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{quantity(row.orderedQty)}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{quantity(row.receivedQty)}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.pendingAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ border: "0.2mm solid #9aa0a6", padding: "1.2mm" }}>{row.buyerName}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <CompanyDocumentFooter
            context={documentContext}
            customNote={documentContext.documentSettings.footerTextTh}
            placement="report"
            printedBy={printedBy}
            variant="report"
          />
        </div>
      )}
    </section>
  );
}
