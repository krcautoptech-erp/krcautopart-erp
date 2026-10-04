"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Building2, ChevronRight, FileSpreadsheet, FileText, Package, Printer, Search, Share2, X } from "lucide-react";
import {
  getStockIssueReportAction,
  getStockIssueReportDetailAction,
  type StockIssueDocumentDetail,
  type StockIssueGroupDetail,
  type StockIssueReportResult,
  type StockIssueReportRow,
} from "@/app/actions/stock-issue-reports";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Pagination } from "@/components/pagination";
import { ReportBackLink } from "@/components/report-back-link";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { ListDateRangeFilter, ListFilterButton, ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { MobileReportActions } from "@/components/mobile-report-actions";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { exportElementPdf, printElement } from "@/lib/document-print";
import { canUseMobilePdfShare } from "@/lib/pdf-delivery";
import { stockIssueReportExportUrl, type StockIssueReportStatus, type StockIssueReportView } from "@/lib/stock-issue-report";
import styles from "./stock-issue-report.module.css";

type Applied = { startDate: string; endDate: string; warehouseId: number | null; departmentId: number | null; status: StockIssueReportStatus; search: string };
type Detail = StockIssueDocumentDetail | StockIssueGroupDetail;
const labels: Record<StockIssueReportView, string> = { document: "ภาพรวม", product: "ตามสินค้า", department: "ตามหน่วยงาน" };
const statusLabels: Record<StockIssueReportStatus, string> = { all: "ทั้งหมด", posted: "บันทึกแล้ว", cancelled: "ยกเลิก" };
const quantity = (value: number) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 4 });
const money = (value: number | null) => value === null ? "—" : Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value?: string) => value ? new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00+07:00`)) : "—";
const longDate = (value: string) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00+07:00`));

export function StockIssueReport({ documentContext, initialData, printedBy, today }: { documentContext: CompanyDocumentContext; initialData: StockIssueReportResult; printedBy: string; today: string }) {
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<StockIssueReportView>("document");
  const [data, setData] = useState(initialData);
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [status, setStatus] = useState<StockIssueReportStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailRow, setDetailRow] = useState<StockIssueReportRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [printRows, setPrintRows] = useState<StockIssueReportRow[] | null>(null);
  const [printMode, setPrintMode] = useState<"print" | "pdf">("print");
  const [canSharePdf, setCanSharePdf] = useState(false);
  const printRoot = useRef<HTMLDivElement>(null);
  const [applied, setApplied] = useState<Applied>({ startDate, endDate, warehouseId, departmentId, status, search: "" });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCanSharePdf(canUseMobilePdfShare());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const load = (nextView: StockIssueReportView, nextPage: number, nextPageSize = pageSize, filters = applied) => startTransition(async () => {
    const result = await getStockIssueReportAction({ view: nextView, ...filters, page: nextPage, pageSize: nextPageSize });
    if (!result.data) { toast.error(result.error ?? "ไม่สามารถโหลดรายงานได้"); return; }
    setData(result.data); setView(nextView); setPage(nextPage);
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!startDate || !endDate || startDate > endDate || endDate > today) return toast.error("กรุณาเลือกช่วงวันที่ให้ถูกต้อง");
    const filters = { startDate, endDate, warehouseId, departmentId, status, search: query.trim() };
    setApplied(filters); load(view, 1, pageSize, filters);
  };
  const changeView = (next: StockIssueReportView) => { if (next !== view) { setDetailRow(null); setDetail(null); load(next, 1); } };
  const openDetail = (row: StockIssueReportRow) => {
    setDetailRow(row); setDetail(null); setDetailError("");
    startTransition(async () => {
      const result = await getStockIssueReportDetailAction({ view, groupId: row.group_id, ...applied, page: 1, pageSize: 20 });
      if (!result.data) setDetailError(result.error ?? "ไม่สามารถโหลดรายละเอียดได้"); else setDetail(result.data);
    });
  };
  const closeDetail = useCallback(() => { setDetailRow(null); setDetail(null); setDetailError(""); }, []);
  const preparePrint = (pdf = false) => startTransition(async () => {
    const rows: StockIssueReportRow[] = [];
    for (let nextPage = 1; ; nextPage += 1) {
      const result = await getStockIssueReportAction({ view, ...applied, page: nextPage, pageSize: 500 });
      if (!result.data) { toast.error(result.error ?? "ไม่สามารถเตรียมรายงานได้"); return; }
      rows.push(...result.data.rows);
      if (rows.length >= result.data.total) break;
    }
    setPrintMode(pdf ? "pdf" : "print");
    setPrintRows(rows);
  });
  useEffect(() => {
    if (!printRows || !printRoot.current) return;
    const options = {
      paperSize: "A4" as const,
      orientation: "portrait" as const,
      styles: [`.${styles.printRoot}{display:block!important;position:relative!important;width:210mm!important;min-height:297mm!important;margin:0!important;padding:10mm 7mm 14mm!important}`],
    };
    const task = printMode === "pdf"
      ? exportElementPdf(printRoot.current, { ...options, filename: `stock-issue-report-${view}-${applied.startDate}-${applied.endDate}` })
      : printElement(printRoot.current, { ...options, title: `stock-issue-report-${view}` });
    void task
      .catch((error) => toast.error(
        error instanceof Error ? error.message : printMode === "pdf" ? "ไม่สามารถสร้างไฟล์ PDF ได้" : "ไม่สามารถเตรียมเอกสารสำหรับพิมพ์ได้",
      ))
      .finally(() => setPrintRows(null));
  }, [applied.endDate, applied.startDate, printMode, printRows, view]);

  const exportUrl = stockIssueReportExportUrl({ view, ...applied });
  const defaultStartDate = `${today.slice(0, 7)}-01`;
  const activeCount = Number(startDate !== defaultStartDate) + Number(endDate !== today) + Number(warehouseId !== null) + Number(departmentId !== null) + Number(status !== "all");
  const clearFilters = () => {
    setStartDate(defaultStartDate);
    setEndDate(today);
    setWarehouseId(null);
    setDepartmentId(null);
    setStatus("all");
    setQuery("");
  };

  return <section aria-busy={pending} className={styles.report}>
    <ReportBackLink />
    <header className={styles.header}><div><h1>รายงานการเบิกจ่ายสินค้า</h1><p>สรุปการเบิกสินค้าแยกตามเอกสาร สินค้า และหน่วยงาน</p></div><span>ข้อมูล ณ วันที่ {longDate(today)}</span></header>
    <nav aria-label="มุมมองรายงาน" className={styles.tabs}>{(Object.keys(labels) as StockIssueReportView[]).map((key) => <button aria-current={view === key ? "page" : undefined} className={view === key ? styles.activeTab : ""} disabled={pending} key={key} onClick={() => changeView(key)} type="button">{labels[key]}</button>)}</nav>
    <form className="min-[901px]:hidden" id="stock-issue-mobile-filters" onSubmit={submit}>
      <MobileListFilters
        activeCount={activeCount}
        className="min-[901px]:hidden"
        formId="stock-issue-mobile-filters"
        onClear={clearFilters}
        resultLabel="แสดงรายงาน"
        search={<ListSearchField onChange={setQuery} placeholder="เลขที่ใบเบิก ชื่อผู้เบิก สินค้า..." value={query} />}
        title="ตัวกรองรายงาน"
      >
        <ListDateRangeFilter label="วันที่เอกสาร" endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
        <ListFilterSelect label="คลังสินค้า" onChange={(value) => setWarehouseId(value ? Number(value) : null)} value={String(warehouseId ?? "")}><option value="">ทั้งหมด</option>{data.options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="หน่วยงาน / จุดใช้งาน" onChange={(value) => setDepartmentId(value ? Number(value) : null)} value={String(departmentId ?? "")}><option value="">ทั้งหมด</option>{data.options.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => setStatus(value as StockIssueReportStatus)} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิก</option></ListFilterSelect>
      </MobileListFilters>
    </form>
    <MobileReportActions actions={[
      { disabled: pending, icon: <FileSpreadsheet size={18} />, label: "ส่งออก Excel", onSelect: () => window.open(exportUrl, "_self") },
      { disabled: pending, icon: canSharePdf ? <Share2 size={18} /> : <FileText size={18} />, label: canSharePdf ? "แชร์ PDF" : "บันทึก PDF", onSelect: () => preparePrint(true) },
      { disabled: pending, icon: <Printer size={18} />, label: "พิมพ์ A4", onSelect: () => preparePrint() },
    ]} />
    <div className="hidden min-[901px]:block">
    <form className={styles.filters} onSubmit={submit}><div className={styles.controls}>
      <ListDateRangeFilter className={styles.dates} label="วันที่เอกสาร" endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
      <ListFilterSelect className={styles.warehouse} label="คลังสินค้า" onChange={(value) => setWarehouseId(value ? Number(value) : null)} value={String(warehouseId ?? "")}><option value="">ทั้งหมด</option>{data.options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
      <ListFilterSelect className={styles.department} label="หน่วยงาน / จุดใช้งาน" onChange={(value) => setDepartmentId(value ? Number(value) : null)} value={String(departmentId ?? "")}><option value="">ทั้งหมด</option>{data.options.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
      <ListFilterSelect className={styles.status} label="สถานะ" onChange={(value) => setStatus(value as StockIssueReportStatus)} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิก</option></ListFilterSelect>
      <ListSearchField className={styles.search} onChange={setQuery} placeholder="เลขที่ใบเบิก ชื่อผู้เบิก สินค้า..." value={query} />
      <ListFilterButton className={styles.searchButton} disabled={pending} icon={<Search size={18} />} tone="primary" type="submit">ค้นหา</ListFilterButton>
      <ExcelExportButton className={styles.exportButton} disabled={pending} onClick={() => window.open(exportUrl, "_self")} />
      <PdfExportButton className={styles.pdfButton} disabled={pending} label="ส่งออก PDF" onClick={() => preparePrint(true)} title="ดาวน์โหลดไฟล์ PDF" />
      <button className={styles.printButton} disabled={pending} onClick={() => preparePrint()} type="button"><Printer size={18} />พิมพ์ A4</button>
    </div></form>
    </div>
    <div className={styles.summary}><b>{quantity(data.summary.document_count)} เอกสาร</b><i /><b>{quantity(data.summary.item_count)} รายการ</b><i />เบิกจ่าย <strong>{quantity(data.summary.quantity_total)}</strong> หน่วย{data.canViewCost && <><i />มูลค่า <strong>{money(data.summary.amount_total)}</strong> บาท</>}</div>
    <div className={styles.desktop}><DataTableFrame>{renderTable(data.rows, view, page, pageSize, data, openDetail)}</DataTableFrame></div>
    <div className={styles.mobile}>{data.rows.map((row) => <button className={styles.mobileRow} key={row.group_id} onClick={() => openDetail(row)} type="button"><div><b>{row.code || row.name}</b>{view === "document" && <StatusBadge tone={row.status === "cancelled" ? "danger" : "success"}>{row.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"}</StatusBadge>}<ChevronRight size={18} /></div>{view !== "department" && <p>{view === "document" ? row.name : row.name}</p>}<small>{mobileMeta(row, view)}</small><strong>{quantity(row.quantity_total)} {row.unit_name ?? "หน่วย"}{data.canViewCost ? ` · ${money(row.amount_total)} บาท` : ""}</strong></button>)}{data.rows.length === 0 && <p className={styles.empty}>ไม่พบข้อมูลตามตัวกรองที่เลือก</p>}</div>
    <footer className={styles.footer}><label>แสดง <select onChange={(event) => { const size = Number(event.target.value); setPageSize(size); load(view, 1, size); }} value={pageSize}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select> รายการต่อหน้า</label><Pagination currentPage={page} onPageChange={(next) => load(view, next)} pageSize={pageSize} totalItems={data.total} /></footer>
    {detailRow && <DetailDrawer detail={detail} error={detailError} loading={pending && !detail} onClose={closeDetail} row={detailRow} view={view} />}
    {printRows && <PrintReport applied={applied} context={documentContext} data={data} printedBy={printedBy} rootRef={printRoot} rows={printRows} view={view} />}
  </section>;
}

function renderTable(rows: StockIssueReportRow[], view: StockIssueReportView, page: number, pageSize: number, data: StockIssueReportResult, onDetail: (row: StockIssueReportRow) => void, printable = false) {
  const columns = (view === "document" ? 9 : view === "product" ? 8 : 7) + Number(data.canViewCost) + Number(!printable);
  const widths = printable
    ? view === "document"
      ? data.canViewCost ? [3, 10, 13, 10, 17, 10, 7, 8, 12, 10] : [3, 11, 14, 12, 19, 12, 8, 9, 12]
      : view === "product"
        ? data.canViewCost ? [3, 11, 30, 7, 9, 9, 10, 11, 10] : [3, 12, 34, 8, 10, 10, 12, 11]
        : data.canViewCost ? [3, 29, 10, 10, 12, 14, 12, 10] : [3, 34, 11, 11, 14, 15, 12]
    : view === "document"
      ? [3, 8, 10, 10, 15, 10, 8, 9, ...(data.canViewCost ? [10] : []), 8, 7]
      : view === "product"
        ? [3, 11, 31, 7, 9, 9, 10, ...(data.canViewCost ? [10] : []), 9, 6]
        : [3, 27, 10, 10, 11, ...(data.canViewCost ? [12] : []), 15, 10, 6];
  const viewClass = view === "document" ? styles.documentTable : view === "product" ? styles.productTable : styles.departmentTable;

  return <DataTable className={`${styles.table} ${viewClass} ${printable ? styles.printTable : ""}`}>
    <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
    <thead><tr><th>#</th>{view === "document" ? <><th>วันที่</th><th>เลขที่ใบเบิก</th><th>ผู้เบิก</th><th>หน่วยงาน / จุดใช้งาน</th><th>คลังจ่าย</th><th className={styles.numeric}>จำนวนรายการ</th><th className={styles.numeric}>จำนวนรวม</th>{data.canViewCost && <th className={styles.numeric}>มูลค่า (บาท)</th>}<th>สถานะ</th></> : view === "product" ? <><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วย</th><th className={styles.numeric}>จำนวนใบเบิก</th><th className={styles.numeric}>จำนวนรายการ</th><th className={styles.numeric}>จำนวนรวม</th>{data.canViewCost && <th className={styles.numeric}>มูลค่า (บาท)</th>}<th>เบิกล่าสุด</th></> : <><th>หน่วยงาน</th><th className={styles.numeric}>จำนวนใบเบิก</th><th className={styles.numeric}>จำนวนรายการ</th><th className={styles.numeric}>จำนวนรวม</th>{data.canViewCost && <th className={styles.numeric}>มูลค่า (บาท)</th>}<th>ผู้เบิกล่าสุด</th><th>วันที่ล่าสุด</th></>}{!printable && <th>รายละเอียด</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.group_id}><td>{printable ? index + 1 : (page - 1) * pageSize + index + 1}</td>{view === "document" ? <><td>{date(row.document_date)}</td><td className={styles.code}>{row.code}</td><td className={styles.nameCell}>{row.name}</td><td className={styles.wrap}><b>{row.department_name}</b><small>{row.work_point}</small></td><td>{row.warehouse_name}</td><td className={styles.numeric}>{quantity(row.item_count)}</td><td className={styles.numeric}>{quantity(row.quantity_total)}</td>{data.canViewCost && <td className={styles.numeric}>{money(row.amount_total)}</td>}<td><StatusBadge tone={row.status === "cancelled" ? "danger" : "success"}>{row.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"}</StatusBadge></td></> : view === "product" ? <><td className={styles.code}>{row.code}</td><td className={`${styles.nameCell} ${styles.productName}`}>{row.name}</td><td>{row.unit_name}</td><td className={styles.numeric}>{quantity(row.issue_count ?? 0)}</td><td className={styles.numeric}>{quantity(row.item_count)}</td><td className={styles.numeric}>{quantity(row.quantity_total)}</td>{data.canViewCost && <td className={styles.numeric}>{money(row.amount_total)}</td>}<td>{date(row.latest_date)}</td></> : <><td className={styles.nameCell}><b>{row.name}</b></td><td className={styles.numeric}>{quantity(row.issue_count ?? 0)}</td><td className={styles.numeric}>{quantity(row.item_count)}</td><td className={styles.numeric}>{quantity(row.quantity_total)}</td>{data.canViewCost && <td className={styles.numeric}>{money(row.amount_total)}</td>}<td className={styles.nameCell}>{row.latest_requester}</td><td>{date(row.latest_date)}</td></>}{!printable && <td><button aria-label={`ดูรายละเอียด ${row.code || row.name}`} className={styles.detailButton} onClick={() => onDetail(row)} type="button"><FileText size={16} /></button></td>}</tr>)}{rows.length === 0 && <DataTableEmpty colSpan={columns}>ไม่พบข้อมูลตามตัวกรองที่เลือก</DataTableEmpty>}</tbody>
    {rows.length > 0 && <tfoot><tr><th colSpan={view === "document" ? 6 : view === "product" ? 4 : 2}>รวมทั้งหมด</th>{view !== "document" && <th className={styles.numeric}>{quantity(data.summary.document_count)}</th>}<th className={styles.numeric}>{quantity(data.summary.item_count)}</th><th className={styles.numeric}>{quantity(data.summary.quantity_total)}</th>{data.canViewCost && <th className={styles.numeric}>{money(data.summary.amount_total)}</th>}<th colSpan={printable ? (view === "department" ? 2 : 1) : (view === "department" ? 3 : 2)} /></tr></tfoot>}
  </DataTable>;
}

function mobileMeta(row: StockIssueReportRow, view: StockIssueReportView) {
  if (view === "document") return `${date(row.document_date)} · ${row.department_name} / ${row.work_point} · ${row.warehouse_name} · ${row.item_count} รายการ`;
  if (view === "product") return `${row.issue_count ?? 0} ใบเบิก · ${row.item_count} รายการ · ล่าสุด ${date(row.latest_date)}`;
  return `${row.issue_count ?? 0} ใบเบิก · ${row.item_count} รายการ · ผู้เบิกล่าสุด ${row.latest_requester ?? "—"} · ${date(row.latest_date)}`;
}

function DetailDrawer({ detail, error, loading, onClose, row, view }: { detail: Detail | null; error: string; loading: boolean; onClose: () => void; row: StockIssueReportRow; view: StockIssueReportView }) {
  return <div className={styles.drawerOverlay} role="presentation"><aside aria-label={`รายละเอียด ${row.code || row.name}`} aria-modal="true" className={styles.drawer} role="dialog"><header><button aria-label="กลับ" className={styles.mobileBack} onClick={onClose}><ArrowLeft size={20} /></button><h2>{view === "document" ? "รายละเอียดใบเบิก" : view === "product" ? "รายละเอียดสินค้า" : "รายละเอียดหน่วยงาน"}</h2><button aria-label="ปิด" className={styles.desktopClose} onClick={onClose}><X size={20} /></button></header>{loading && <p className={styles.drawerState}>กำลังโหลด...</p>}{error && <p className={styles.drawerState}>{error}</p>}{detail && ("header" in detail ? <DocumentDetail detail={detail} /> : <GroupDetail detail={detail} />)}</aside></div>;
}
function DocumentDetail({ detail }: { detail: StockIssueDocumentDetail }) {
  const totalQty = detail.items.reduce((sum, row) => sum + row.quantity, 0); const totalAmount = detail.items.every((row) => row.amount !== null) ? detail.items.reduce((sum, row) => sum + Number(row.amount), 0) : null;
  return <div className={styles.drawerBody}><section className={styles.detailIdentity}><div className={styles.identityMain}><span className={styles.detailIcon}><FileText /></span><div><b>{detail.header.issueNumber}</b><p>{detail.header.requesterName}</p></div></div><StatusBadge tone={detail.header.status === "cancelled" ? "danger" : "success"}>{detail.header.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"}</StatusBadge></section><dl className={styles.detailMeta}><div><dt>วันที่</dt><dd>{date(detail.header.documentDate)}</dd></div><div><dt>หน่วยงาน</dt><dd>{detail.header.departmentName}</dd></div><div><dt>จุดใช้งาน</dt><dd>{detail.header.workPoint}</dd></div><div><dt>คลังจ่าย</dt><dd>{detail.header.warehouseName}</dd></div><div><dt>เหตุผล</dt><dd>{detail.header.reason || "—"}</dd></div></dl><h3 className={styles.detailSectionTitle}>รายการสินค้า ({detail.items.length} รายการ)</h3><div className={styles.detailDesktopTable}><DataTableFrame className={styles.detailTableFrame}><DataTable className={styles.detailTable}><colgroup><col className={styles.noCol} /><col className={styles.codeCol} /><col /><col className={styles.qtyCol} /><col className={styles.unitCol} />{detail.canViewCost && <col className={styles.moneyCol} />}</colgroup><thead><tr><th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th className={styles.numeric}>จำนวน</th><th>หน่วย</th>{detail.canViewCost && <th className={styles.numeric}>มูลค่า (บาท)</th>}</tr></thead><tbody>{detail.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td className={styles.detailCode}>{item.itemCode}</td><td className={styles.detailProductName}>{item.itemName}</td><td className={styles.numeric}>{quantity(item.quantity)}</td><td>{item.unitName}</td>{detail.canViewCost && <td className={styles.numeric}>{money(item.amount)}</td>}</tr>)}</tbody><tfoot><tr><th colSpan={3}>รวมทั้งหมด</th><th className={styles.numeric}>{quantity(totalQty)}</th><th>หน่วย</th>{detail.canViewCost && <th className={styles.numeric}>{money(totalAmount)}</th>}</tr></tfoot></DataTable></DataTableFrame></div><div className={styles.detailMobileList}>{detail.items.map((item, index) => <article key={item.id}><div><span>{index + 1}</span><b>{item.itemCode}</b></div><p>{item.itemName}</p><footer><strong>{quantity(item.quantity)} {item.unitName}</strong>{detail.canViewCost && <strong>{money(item.amount)} บาท</strong>}</footer></article>)}<div className={styles.detailMobileTotal}><b>รวมทั้งหมด</b><strong>{quantity(totalQty)} หน่วย{detail.canViewCost ? ` · ${money(totalAmount)} บาท` : ""}</strong></div></div></div>;
}
function GroupDetail({ detail }: { detail: StockIssueGroupDetail }) {
  const isProduct = detail.view === "product";
  return <div className={styles.drawerBody}><section className={styles.detailIdentity}><div className={styles.identityMain}><span className={styles.detailIcon}>{isProduct ? <Package /> : <Building2 />}</span><div><b>{detail.identity?.code || detail.identity?.name || "—"}</b>{detail.identity?.code && <p className={styles.identityName}>{detail.identity.name}</p>}</div></div></section><div className={styles.detailKpis}><span><b>{quantity(detail.summary.document_count)}</b> ใบเบิก</span><span><b>{quantity(detail.summary.quantity_total)}</b> หน่วย</span>{detail.can_view_cost && <span><b>{money(detail.summary.amount_total)}</b> บาท</span>}</div><h3 className={styles.detailSectionTitle}>รายการเบิก ({detail.entries.length} รายการ)</h3><div className={styles.detailDesktopTable}><DataTableFrame className={styles.detailTableFrame}><DataTable className={`${styles.detailTable} ${styles.groupDetailTable}`}><colgroup><col className={styles.noCol} /><col className={styles.issueCol} />{!isProduct && <col className={styles.groupProductCol} />}<col className={styles.dateCol} /><col className={styles.requesterCol} /><col className={styles.departmentCol} /><col className={styles.warehouseCol} /><col className={styles.qtyCol} />{detail.can_view_cost && <col className={styles.moneyCol} />}<col className={styles.statusCol} /></colgroup><thead><tr><th>#</th><th>เลขที่ใบเบิก</th>{!isProduct && <th>สินค้า</th>}<th>วันที่</th><th>ผู้เบิก</th><th>หน่วยงาน / จุดใช้งาน</th><th>คลังจ่าย</th><th className={styles.numeric}>จำนวน</th>{detail.can_view_cost && <th className={styles.numeric}>มูลค่า (บาท)</th>}<th>สถานะ</th></tr></thead><tbody>{detail.entries.map((entry, index) => <tr key={`${entry.issue_id}-${entry.item_code}-${index}`}><td>{index + 1}</td><td><b className={styles.detailCode}>{entry.issue_number}</b></td>{!isProduct && <td><small className={styles.itemCode}>{entry.item_code}</small><span className={styles.detailProductName}>{entry.item_name}</span></td>}<td>{date(entry.document_date)}</td><td className={styles.detailName}>{entry.requester_name}</td><td className={styles.detailName}><b>{entry.department_name}</b><small>{entry.work_point}</small></td><td className={styles.detailName}>{entry.warehouse_name}</td><td className={styles.numeric}>{quantity(entry.quantity)}<small>{entry.unit_name}</small></td>{detail.can_view_cost && <td className={styles.numeric}>{money(entry.amount)}</td>}<td><StatusBadge tone={entry.status === "cancelled" ? "danger" : "success"}>{entry.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"}</StatusBadge></td></tr>)}</tbody><tfoot><tr><th colSpan={isProduct ? 6 : 7}>รวมทั้งหมด</th><th className={styles.numeric}>{quantity(detail.summary.quantity_total)}</th>{detail.can_view_cost && <th className={styles.numeric}>{money(detail.summary.amount_total)}</th>}<th /></tr></tfoot></DataTable></DataTableFrame></div><div className={styles.detailMobileList}>{detail.entries.map((entry, index) => <article key={`${entry.issue_id}-${entry.item_code}-${index}`}><div><span>{index + 1}</span><b>{entry.issue_number}</b><StatusBadge tone={entry.status === "cancelled" ? "danger" : "success"}>{entry.status === "cancelled" ? "ยกเลิก" : "บันทึกแล้ว"}</StatusBadge></div><p className={styles.detailProductName}>{entry.item_code} · {entry.item_name}</p><small>{date(entry.document_date)} · {entry.requester_name}</small><small>{entry.department_name} / {entry.work_point} · {entry.warehouse_name}</small><footer><strong>{quantity(entry.quantity)} {entry.unit_name}</strong>{detail.can_view_cost && <strong>{money(entry.amount)} บาท</strong>}</footer></article>)}<div className={styles.detailMobileTotal}><b>รวมทั้งหมด</b><strong>{quantity(detail.summary.quantity_total)} หน่วย{detail.can_view_cost ? ` · ${money(detail.summary.amount_total)} บาท` : ""}</strong></div></div></div>;
}

function PrintReport({ applied, context, data, printedBy, rootRef, rows, view }: { applied: Applied; context: CompanyDocumentContext; data: StockIssueReportResult; printedBy: string; rootRef: React.RefObject<HTMLDivElement | null>; rows: StockIssueReportRow[]; view: StockIssueReportView }) {
  const warehouse = data.options.warehouses.find((row) => row.id === applied.warehouseId)?.name ?? "ทั้งหมด";
  const department = data.options.departments.find((row) => row.id === applied.departmentId)?.name ?? "ทั้งหมด";
  return <div className={styles.printRoot} ref={rootRef}>
    <CompanyDocumentHeader context={context} meta={[{ label: "พิมพ์เมื่อ", value: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) }, { label: "ผู้พิมพ์", value: printedBy }]} priority />
    <section className={styles.printHeading}>
      <h1>รายงานการเบิกจ่ายสินค้า</h1>
      <p>สรุปการเบิกสินค้าแยกตามเอกสาร สินค้า และหน่วยงาน</p>
      <dl className={styles.printMeta}>
        <div><dt>วันที่เอกสาร</dt><dd>{date(applied.startDate)} – {date(applied.endDate)}</dd></div>
        <div><dt>คลังสินค้า</dt><dd>{warehouse}</dd></div>
        <div><dt>หน่วยงาน</dt><dd>{department}</dd></div>
        <div><dt>สถานะ</dt><dd>{statusLabels[applied.status]}</dd></div>
      </dl>
    </section>
    <div className={styles.printSummary}><b>{quantity(data.summary.document_count)} เอกสาร</b><i /><b>{quantity(data.summary.item_count)} รายการ</b><i />เบิกจ่าย <strong>{quantity(data.summary.quantity_total)}</strong> หน่วย{data.canViewCost && <><i />มูลค่า <strong>{money(data.summary.amount_total)}</strong> บาท</>}</div>
    {renderTable(rows, view, 1, rows.length, data, () => undefined, true)}
    <CompanyDocumentFooter
      className={styles.printFooter}
      context={context}
      customNote={context.documentSettings.footerTextTh}
      placement="report"
      printedBy={printedBy}
      variant="report"
    />
  </div>;
}
