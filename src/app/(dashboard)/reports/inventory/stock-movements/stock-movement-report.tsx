"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, FileSpreadsheet, FileText, Printer, Search } from "lucide-react";
import { getStockCardAction, getStockMovementReportAction, type StockJournalRow, type StockReportResult, type StockSummaryRow } from "@/app/actions/stock-reports";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ListDateRangeFilter, ListFilterButton, ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { MobileReportActions } from "@/components/mobile-report-actions";
import { Pagination } from "@/components/pagination";
import { ReportBackLink } from "@/components/report-back-link";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { toast } from "@/components/toast";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { printElement } from "@/lib/document-print";
import styles from "./stock-movement-report.module.css";

const number = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 });
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" });
const time = (value: string) => new Date(value).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const longDate = (value: string) => { const d = new Date(`${value}T00:00:00+07:00`); return `${d.getDate()} ${["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"][d.getMonth()]} ${d.getFullYear()}`; };
const kinds: Record<string, { label: string; tone: StatusTone }> = { receipt: { label: "รับเข้า", tone: "success" }, issue: { label: "จ่ายออก", tone: "danger" }, adjustment: { label: "ปรับปรุง", tone: "neutral" }, reversal: { label: "กลับรายการ", tone: "info" } };
type Applied = { startDate: string; endDate: string; warehouseId: number | null; itemTypeId: number | null; movementKind: string | null; search: string };

export function StockMovementReport({ documentContext, initialData, printedBy = "KRC ERP", today }: { documentContext?: CompanyDocumentContext; initialData: StockReportResult; printedBy?: string; today: string }) {
  const printRoot = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"summary" | "journal">("summary");
  const [data, setData] = useState(initialData);
  const [printRows, setPrintRows] = useState<(StockSummaryRow | StockJournalRow)[] | null>(null);
  const [card, setCard] = useState<{ summary: StockSummaryRow; rows: StockJournalRow[]; total: number } | null>(null);
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [itemTypeId, setItemTypeId] = useState<number | null>(null);
  const [movementKind, setMovementKind] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState<Applied>({ startDate, endDate, warehouseId, itemTypeId, movementKind, search: query });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const summaries = data.rows as StockSummaryRow[];
  const journal = data.rows as StockJournalRow[];
  const load = (nextView: "summary" | "journal", nextPage: number, nextPageSize = pageSize, filters = applied) => startTransition(async () => {
    const result = await getStockMovementReportAction({ view: nextView, ...filters, page: nextPage, pageSize: nextPageSize });
    if (!result.data) { toast.error(result.error ?? "ไม่สามารถโหลดรายงานได้"); return; }
    setData(result.data); setView(nextView); setPage(nextPage); setCard(null);
  });
  const search = (event: React.FormEvent) => { event.preventDefault(); if (!startDate || !endDate || startDate > endDate || endDate > today) return toast.error("กรุณาเลือกช่วงวันที่ให้ถูกต้อง"); const filters = { startDate, endDate, warehouseId, itemTypeId, movementKind, search: query }; setApplied(filters); load(view, 1, pageSize, filters); };
  const openCard = (row: StockSummaryRow) => startTransition(async () => {
    const result = await getStockCardAction({ startDate: applied.startDate, endDate: applied.endDate, warehouseId: row.warehouse_id, itemTypeId: null, movementKind: null, search: "", itemMasterId: row.item_master_id, page: 1, pageSize });
    if (!result.data?.summary) { toast.error(result.error ?? "ไม่สามารถโหลด Stock Card ได้"); return; }
    setCard({ summary: result.data.summary, rows: result.data.rows as StockJournalRow[], total: result.data.total }); setPage(1); window.scrollTo({ top: 0, behavior: "instant" });
  });
  const loadCardPage = (nextPage: number, nextPageSize = pageSize) => { if (!card) return; startTransition(async () => { const result = await getStockCardAction({ startDate: applied.startDate, endDate: applied.endDate, warehouseId: card.summary.warehouse_id, itemTypeId: null, movementKind: null, search: "", itemMasterId: card.summary.item_master_id, page: nextPage, pageSize: nextPageSize }); if (!result.data?.summary) { toast.error(result.error ?? "ไม่สามารถโหลด Stock Card ได้"); return; } setCard({ summary: result.data.summary, rows: result.data.rows as StockJournalRow[], total: result.data.total }); setPage(nextPage); }); };
  const change = (value: number) => <span className={value > 0 ? styles.positive : value < 0 ? styles.negative : ""}>{value > 0 ? "+" : ""}{number(value)}</span>;
  const badge = (row: StockJournalRow) => <StatusBadge className={styles.badge} tone={kinds[row.movement_kind]?.tone ?? "neutral"}>{kinds[row.movement_kind]?.label ?? "รายการ"}</StatusBadge>;
  const documentLink = (row: StockJournalRow) => { const href = row.reference_doc_type === "goods_receipt" ? `/purchase/receipts?q=${encodeURIComponent(row.reference_doc_number)}&start=1900-01-01&end=9999-12-31` : row.reference_doc_type === "stock_issue" ? `/inventory/issues?q=${encodeURIComponent(row.reference_doc_number)}` : row.reference_doc_type === "stock_adjustment" ? `/inventory/adjustments?q=${encodeURIComponent(row.reference_doc_number)}` : null; return href ? <Link className={styles.link} href={href}>{row.reference_doc_number}</Link> : <span>{row.reference_doc_number}</span>; };
  const totals = (row: StockSummaryRow) => <dl className={styles.summaryTotals}>{[["ยกมา", row.opening, ""], ["รับเข้า", row.received, styles.positive], ["จ่ายออก", row.issued, styles.negative], ["ปรับปรุง", row.adjustment, ""], ["คงเหลือ", row.closing, styles.closing]].map(([label, value, cls]) => <div key={label}><dt>{label}</dt><dd className={String(cls)}>{number(Number(value))}</dd></div>)}</dl>;
  const preparePrint = () => startTransition(async () => {
    if (card) {
      const result = await getStockCardAction({
        startDate: applied.startDate,
        endDate: applied.endDate,
        warehouseId: card.summary.warehouse_id,
        itemTypeId: null,
        movementKind: null,
        search: "",
        itemMasterId: card.summary.item_master_id,
        page: 1,
        pageSize: 500,
      });
      if (!result.data) { toast.error("ไม่สามารถเตรียมข้อมูลสำหรับพิมพ์ได้"); return; }
      setPrintRows(result.data.rows as StockJournalRow[]);
      return;
    }

    const rows: (StockSummaryRow | StockJournalRow)[] = [];
    for (let nextPage = 1; ; nextPage += 1) {
      const result = await getStockMovementReportAction({ view, ...applied, page: nextPage, pageSize: 200 });
      if (!result.data) { toast.error("ไม่สามารถเตรียมข้อมูลสำหรับพิมพ์ได้"); return; }
      rows.push(...(result.data.rows as (StockSummaryRow | StockJournalRow)[]));
      if (rows.length >= result.data.total) break;
    }
    setPrintRows(rows);
  });

  useEffect(() => {
    if (!printRows || !printRoot.current) return;
    void printElement(printRoot.current, {
      title: `stock-movement-${card ? "card" : view}-${applied.startDate}-${applied.endDate}`,
      paperSize: "A4",
      orientation: "landscape",
    }).finally(() => setPrintRows(null));
  }, [applied.endDate, applied.startDate, card, printRows, view]);

  const total = card ? card.total : data.total;
  const exportUrl = `/reports/inventory/stock-movements/export?view=${card ? "card" : view}&start=${applied.startDate}&end=${applied.endDate}${applied.warehouseId ? `&warehouse=${applied.warehouseId}` : ""}${applied.itemTypeId ? `&group=${applied.itemTypeId}` : ""}${applied.movementKind ? `&kind=${applied.movementKind}` : ""}${card ? `&item=${card.summary.item_master_id}` : ""}&q=${encodeURIComponent(applied.search)}`;
  const defaultStartDate = `${today.slice(0, 7)}-01`;
  const activeCount = Number(startDate !== defaultStartDate) + Number(endDate !== today) + Number(warehouseId !== null) + Number(view === "summary" ? itemTypeId !== null : movementKind !== null);
  const clearFilters = () => {
    setStartDate(defaultStartDate);
    setEndDate(today);
    setWarehouseId(null);
    setItemTypeId(null);
    setMovementKind(null);
    setQuery("");
  };

  return <section className={styles.report} aria-busy={pending}>
    <ReportBackLink />
    {card ? <><button className={styles.back} onClick={() => { setCard(null); load(view, 1); }} type="button"><ArrowLeft size={18} />รายงานความเคลื่อนไหวสต็อก <span>/ Stock Card</span></button><h1>Stock Card</h1></> : <><header className={styles.header}><div><h1>รายงานความเคลื่อนไหวสต็อก</h1><p>สรุปยอดคงเหลือและการเคลื่อนไหวสินค้า แยกตามสินค้าและคลัง</p></div><span>ข้อมูลวันที่ {longDate(today)}</span></header><nav className={styles.tabs} aria-label="มุมมองรายงาน">{[["summary", "สรุปตามสินค้า"], ["journal", "รายการเคลื่อนไหวรวม"]].map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} className={view === value ? styles.selected : ""} onClick={() => load(value as "summary" | "journal", 1)}>{label}</button>)}</nav></>}
    {!card && <form className="min-[901px]:hidden" id="stock-movement-mobile-filters" onSubmit={search}>
      <MobileListFilters
        activeCount={activeCount}
        className="min-[901px]:hidden"
        formId="stock-movement-mobile-filters"
        onClear={clearFilters}
        resultLabel="แสดงรายงาน"
        search={<ListSearchField onChange={setQuery} placeholder="รหัส ชื่อสินค้า หรือเลขที่เอกสาร..." value={query} />}
        title="ตัวกรองรายงาน"
      >
        <ListDateRangeFilter endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
        <ListFilterSelect label="คลังสินค้า" onChange={(value) => setWarehouseId(value ? Number(value) : null)} value={String(warehouseId ?? "")}><option value="">ทั้งหมด</option>{data.options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label={view === "summary" ? "กลุ่มสินค้า" : "ประเภทการเคลื่อนไหว"} onChange={(value) => view === "summary" ? setItemTypeId(value ? Number(value) : null) : setMovementKind(value || null)} value={String(view === "summary" ? itemTypeId ?? "" : movementKind ?? "")}><option value="">ทั้งหมด</option>{view === "summary" ? data.options.groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>) : Object.entries(kinds).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</ListFilterSelect>
      </MobileListFilters>
    </form>}
    <MobileReportActions actions={[
      { disabled: pending, icon: <FileSpreadsheet size={18} />, label: "ส่งออก Excel", onSelect: () => window.open(exportUrl, "_self") },
      { disabled: pending, icon: <Printer size={18} />, label: "พิมพ์ A4", onSelect: preparePrint },
    ]} />
    <div className="hidden min-[901px]:block">
    <form className={`${styles.filters} ${card ? styles.cardFilters : ""}`} onSubmit={search}>
      <ListDateRangeFilter className={styles.dates} endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
      <ListFilterSelect disabled={Boolean(card)} label="คลังสินค้า" onChange={(value) => setWarehouseId(value ? Number(value) : null)} value={String(card?.summary.warehouse_id ?? warehouseId ?? "")}><option value="">ทั้งหมด</option>{data.options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
      {!card && <><ListFilterSelect label={view === "summary" ? "กลุ่มสินค้า" : "ประเภทการเคลื่อนไหว"} onChange={(value) => view === "summary" ? setItemTypeId(value ? Number(value) : null) : setMovementKind(value || null)} value={String(view === "summary" ? itemTypeId ?? "" : movementKind ?? "")}><option value="">ทั้งหมด</option>{view === "summary" ? data.options.groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>) : Object.entries(kinds).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</ListFilterSelect><ListSearchField className={styles.searchField} onChange={setQuery} placeholder="รหัส ชื่อสินค้า หรือเลขที่เอกสาร..." value={query} /></>}
      <ListFilterButton className={styles.searchButton} disabled={pending} icon={<Search size={19} />} tone="primary" type="submit">ค้นหา</ListFilterButton>
      <button className={styles.printButton} disabled={pending} onClick={preparePrint} type="button"><Printer size={17} />พิมพ์ A4</button>
      <ExcelExportButton className={styles.export} disabled={pending} onClick={() => window.open(exportUrl, "_self")} />
    </form>
    </div>
    {card && <div className={styles.stockStrip}><div className={styles.stockIdentity}><h2>{card.summary.item_code}</h2><p>{card.summary.item_name}</p><dl className={styles.stockMeta}><div><dt>คลังสินค้า</dt><dd>{card.summary.warehouse_name}</dd></div><div><dt>หน่วยนับ</dt><dd>{card.summary.unit_name}</dd></div></dl></div><div className={styles.totals}>{[["ยอดยกมา", card.summary.opening, ""], ["รับเข้า", card.summary.received, styles.positive], ["จ่ายออก", card.summary.issued, styles.negative], ["ปรับปรุง", card.summary.adjustment, ""], ["คงเหลือปลายงวด", card.summary.closing, ""]].map(([label, value, cls]) => <div key={label}><span>{label}</span><b className={String(cls)}>{number(Number(value))}</b></div>)}</div></div>}
    <div className={styles.desktop}><DataTableFrame><DataTable className={styles.table}><thead><tr>{(card ? ["#", "วันที่ – เวลา", "ประเภท", "เลขที่เอกสาร", "Lot / Serial", "รับเข้า", "จ่ายออก", "ปรับปรุง", "คงเหลือหลังรายการ", "ผู้ดำเนินการ"] : view === "summary" ? ["#", "รหัสสินค้า", "ชื่อสินค้า", "คลัง", "หน่วย", "ยอดยกมา", "รับเข้า", "จ่ายออก", "ปรับปรุง", "คงเหลือปลายงวด", "ดู Stock Card"] : ["#", "วันที่ – เวลา", "รหัสสินค้า", "ชื่อสินค้า", "คลัง", "ประเภท", "เลขที่เอกสาร", "Lot / Serial", "จำนวนเปลี่ยนแปลง", "หน่วย", "ผู้ดำเนินการ"]).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {card ? <>{page === 1 && <tr><td>—</td><td>{date(`${applied.startDate}T00:00:00+07:00`)}</td><td>ยอดยกมา</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>{number(card.summary.opening)}</td><td>ระบบ</td></tr>}{card.rows.map((row, index) => <tr key={row.id}><td>{(page - 1) * pageSize + index + 1}</td><td>{date(row.created_at)} {time(row.created_at)}</td><td>{badge(row)}</td><td>{documentLink(row)}</td><td>{row.lot_number}</td><td>{row.movement_kind === "receipt" ? change(row.quantity_change) : "—"}</td><td>{row.movement_kind === "issue" ? change(row.quantity_change) : "—"}</td><td>{["adjustment", "reversal"].includes(row.movement_kind) ? change(row.quantity_change) : "—"}</td><td>{number(row.balance)}</td><td>{row.actor_name}</td></tr>)}</> : view === "summary" ? summaries.map((row, index) => <tr key={`${row.item_master_id}:${row.warehouse_id}`}><td>{(page - 1) * pageSize + index + 1}</td><td className={styles.codeCell}>{row.item_code}</td><td className={styles.nameCell} data-report-long>{row.item_name}</td><td>{row.warehouse_name}</td><td>{row.unit_name}</td><td>{number(row.opening)}</td><td>{number(row.received)}</td><td>{number(row.issued)}</td><td>{number(row.adjustment)}</td><td>{number(row.closing)}</td><td><button className={styles.documentButton} aria-label={`ดู Stock Card ${row.item_code}`} onClick={() => openCard(row)}><FileText size={17} /></button></td></tr>) : journal.map((row, index) => <tr key={row.id}><td>{(page - 1) * pageSize + index + 1}</td><td>{date(row.created_at)} {time(row.created_at)}</td><td className={styles.codeCell}>{row.item_code}</td><td className={styles.nameCell} data-report-long>{row.item_name}</td><td>{row.warehouse_name}</td><td>{badge(row)}</td><td>{documentLink(row)}</td><td>{row.lot_number}</td><td>{change(row.quantity_change)}</td><td>{row.unit_name}</td><td>{row.actor_name}</td></tr>)}
      {data.total === 0 && <DataTableEmpty colSpan={card ? 10 : 11}>ไม่พบรายการในช่วงวันที่ที่เลือก</DataTableEmpty>}</tbody></DataTable></DataTableFrame></div>
    <div className={styles.mobile}>{card ? <><div className={styles.ledgerHeading}><span>วันที่ – เวลา / รายการ</span><span>เปลี่ยนแปลง</span><span>คงเหลือ</span></div>{page === 1 && <div className={styles.ledgerRow}><div>{date(`${applied.startDate}T00:00:00+07:00`)}<p>ยอดยกมา</p></div><b>—</b><b>{number(card.summary.opening)}</b></div>}{card.rows.map((row) => <div className={styles.ledgerRow} key={row.id}><div>{date(row.created_at)} {time(row.created_at)}<p>{kinds[row.movement_kind].label} | {documentLink(row)}</p><small>{row.lot_number} · {row.actor_name}</small></div><b>{change(row.quantity_change)}</b><b>{number(row.balance)}</b></div>)}</> : view === "summary" ? <><h3>รายการสินค้า ({data.total} รายการ)</h3>{summaries.map((row) => <button type="button" className={styles.summaryRow} key={`${row.item_master_id}:${row.warehouse_id}`} onClick={() => openCard(row)}><div className={styles.summaryMain}><b className={styles.summaryCode}>{row.item_code}</b><div className={styles.summaryProduct}><p>{row.item_name}</p><small>{row.warehouse_name} <i /> หน่วย: {row.unit_name}</small></div><ChevronRight size={20} />{totals(row)}</div></button>)}</> : journal.map((row) => <article className={styles.journalRow} key={row.id}><div className={styles.timestamp}>{date(row.created_at)}<br />{time(row.created_at)}</div><div>{badge(row)}<p><b>{row.item_code}</b> {row.item_name}</p><small>{row.warehouse_name} | {documentLink(row)}</small></div><div className={styles.changeButton}><b>{change(row.quantity_change)}</b><small>{row.unit_name}</small></div></article>)}</div>
    <div className={styles.footer}><label>แสดง <select aria-label="จำนวนรายการต่อหน้า" value={pageSize} onChange={(event) => { const size = Number(event.target.value); setPageSize(size); if (card) loadCardPage(1, size); else load(view, 1, size); }}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select> รายการ/หน้า</label><Pagination currentPage={page} pageSize={pageSize} totalItems={total} onPageChange={(next) => { if (card) loadCardPage(next); else load(view, next); }} /></div>

    {printRows && documentContext && (
      <div className={styles.printRoot} ref={printRoot}>
        <CompanyDocumentHeader
          context={documentContext}
          meta={[
            { label: "พิมพ์เมื่อ", value: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) },
            { label: "ผู้พิมพ์", value: printedBy },
          ]}
          priority
        />
        <section className={styles.printHeading}>
          <h1>
            {card
              ? `Stock Card: ${card.summary.item_code} ${card.summary.item_name}`
              : `รายงานความเคลื่อนไหวสต็อก (${view === "summary" ? "สรุปตามสินค้า" : "รายการเคลื่อนไหวรวม"})`}
          </h1>
          <p>สรุปยอดคงเหลือและการเคลื่อนไหวสินค้า แยกตามสินค้าและคลัง</p>
          <dl className={styles.printMeta}>
            <div><dt>ช่วงวันที่</dt><dd>{date(`${applied.startDate}T00:00:00+07:00`)} – {date(`${applied.endDate}T00:00:00+07:00`)}</dd></div>
            <div><dt>คลังสินค้า</dt><dd>{data.options.warehouses.find((r) => r.id === applied.warehouseId)?.name ?? "ทั้งหมด"}</dd></div>
            <div><dt>มุมมอง</dt><dd>{card ? "Stock Card" : view === "summary" ? "สรุปตามสินค้า" : "เคลื่อนไหวรวม"}</dd></div>
          </dl>
        </section>

        <table className={styles.printTable}>
          <thead>
            <tr>
              {(card
                ? ["#", "วันที่ – เวลา", "ประเภท", "เลขที่เอกสาร", "Lot / Serial", "รับเข้า", "จ่ายออก", "ปรับปรุง", "คงเหลือ", "ผู้ดำเนินการ"]
                : view === "summary"
                ? ["#", "รหัสสินค้า", "ชื่อสินค้า", "คลัง", "หน่วย", "ยอดยกมา", "รับเข้า", "จ่ายออก", "ปรับปรุง", "คงเหลือ"]
                : ["#", "วันที่ – เวลา", "รหัสสินค้า", "ชื่อสินค้า", "คลัง", "ประเภท", "เลขที่เอกสาร", "Lot / Serial", "จำนวนเปลี่ยนแปลง", "หน่วย", "ผู้ดำเนินการ"]
              ).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card ? (
              <>
                <tr>
                  <td>—</td>
                  <td>{date(`${applied.startDate}T00:00:00+07:00`)}</td>
                  <td>ยอดยกมา</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{number(card.summary.opening)}</td>
                  <td>ระบบ</td>
                </tr>
                {(printRows as StockJournalRow[]).map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>{date(row.created_at)} {time(row.created_at)}</td>
                    <td>{kinds[row.movement_kind]?.label ?? "รายการ"}</td>
                    <td>{row.reference_doc_number}</td>
                    <td>{row.lot_number || "-"}</td>
                    <td>{row.movement_kind === "receipt" ? number(row.quantity_change) : "—"}</td>
                    <td>{row.movement_kind === "issue" ? number(Math.abs(row.quantity_change)) : "—"}</td>
                    <td>{["adjustment", "reversal"].includes(row.movement_kind) ? number(row.quantity_change) : "—"}</td>
                    <td>{number(row.balance)}</td>
                    <td>{row.actor_name}</td>
                  </tr>
                ))}
              </>
            ) : view === "summary" ? (
              (printRows as StockSummaryRow[]).map((row, index) => (
                <tr key={`${row.item_master_id}:${row.warehouse_id}`}>
                  <td>{index + 1}</td>
                  <td className={styles.codeCell}>{row.item_code}</td>
                  <td className={styles.nameCell}>{row.item_name}</td>
                  <td>{row.warehouse_name}</td>
                  <td>{row.unit_name}</td>
                  <td>{number(row.opening)}</td>
                  <td>{number(row.received)}</td>
                  <td>{number(row.issued)}</td>
                  <td>{number(row.adjustment)}</td>
                  <td>{number(row.closing)}</td>
                </tr>
              ))
            ) : (
              (printRows as StockJournalRow[]).map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{date(row.created_at)} {time(row.created_at)}</td>
                  <td className={styles.codeCell}>{row.item_code}</td>
                  <td className={styles.nameCell}>{row.item_name}</td>
                  <td>{row.warehouse_name}</td>
                  <td>{kinds[row.movement_kind]?.label ?? "รายการ"}</td>
                  <td>{row.reference_doc_number}</td>
                  <td>{row.lot_number || "-"}</td>
                  <td>{number(row.quantity_change)}</td>
                  <td>{row.unit_name}</td>
                  <td>{row.actor_name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <CompanyDocumentFooter
          className={styles.printFooter}
          context={documentContext}
          customNote={documentContext.documentSettings.footerTextTh}
          placement="report"
          printedBy={printedBy}
          variant="report"
        />
      </div>
    )}
  </section>;
}
