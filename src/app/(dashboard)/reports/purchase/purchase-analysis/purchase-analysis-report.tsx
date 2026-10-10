"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight, Clock3, FileSpreadsheet, FileText, PackageCheck, Printer, Search, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getPurchaseAnalysisAction, type PurchaseAnalysisResult, type PurchaseAnalysisRow } from "@/app/actions/purchase-analysis";
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
import { purchaseAnalysisExportUrl, purchaseAnalysisShareRows, type PurchaseAnalysisView } from "@/lib/purchase-analysis";
import styles from "./purchase-analysis-report.module.css";
import { PurchaseAnalysisProductDrawer } from "./purchase-analysis-product-detail";
import { PurchaseAnalysisVendorDrawer } from "./purchase-analysis-vendor-detail";

type Applied = { startDate: string; endDate: string; vendorId: number | null; itemTypeId: number | null; search: string };
const number = (value: number, digits = 0) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits || 4 });
const money = (value: number) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number) => `${Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}%`;
const date = (value: string) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00+07:00`));
const longDate = (value: string) => { const d = new Date(`${value}T00:00:00+07:00`); return `${d.getDate()} ${["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"][d.getMonth()]} ${d.getFullYear()}`; };

export function PurchaseAnalysisReport({ documentContext, initialData, printedBy, today }: { documentContext: CompanyDocumentContext; initialData: PurchaseAnalysisResult; printedBy: string; today: string }) {
  useListScroll();
  const printRoot = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [view, setView] = useListState<PurchaseAnalysisView>("view", "vendor");
  const [data, setData] = useState(initialData);
  const [startDate, setStartDate] = useListState("startDate", `${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useListState("endDate", today);
  const [vendorId, setVendorId] = useListState<number | null>("vendorId", null);
  const [itemTypeId, setItemTypeId] = useListState<number | null>("itemTypeId", null);
  const [query, setQuery] = useListState("query", "");
  const [page, setPage] = useListState("page", 1);
  const [pageSize, setPageSize] = useListState("pageSize", 20);
  const [printRows, setPrintRows] = useState<PurchaseAnalysisRow[] | null>(null);
  const [detailRow, setDetailRow] = useState<PurchaseAnalysisRow | null>(null);
  const [applied, setApplied] = useListState<Applied>("applied", { startDate, endDate, vendorId, itemTypeId, search: "" });

  const load = (nextView: PurchaseAnalysisView, nextPage: number, nextPageSize = pageSize, filters = applied) => {
    setView(nextView); setPage(nextPage); setPageSize(nextPageSize); setApplied(filters);
  };
  const appliedKey = JSON.stringify(applied);
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getPurchaseAnalysisAction({ view, ...JSON.parse(appliedKey) as Applied, page, pageSize });
      if (cancelled) return;
      if (!result.data) { toast.error(result.error ?? "ไม่สามารถโหลดรายงานได้"); return; }
      setData(result.data);
    });
    return () => { cancelled = true; };
  }, [view, appliedKey, page, pageSize]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!startDate || !endDate || startDate > endDate || endDate > today) return toast.error("กรุณาเลือกช่วงวันที่ให้ถูกต้อง");
    const filters = { startDate, endDate, vendorId, itemTypeId, search: query.trim() };
    setApplied(filters); load(view, 1, pageSize, filters);
  };
  const changeView = (next: PurchaseAnalysisView) => { if (next === view) return; setDetailRow(null); load(next, 1); };
  const closeDetail = useCallback(() => setDetailRow(null), []);
  const preparePrint = () => startTransition(async () => {
    const rows: PurchaseAnalysisRow[] = [];
    for (let nextPage = 1; ; nextPage += 1) {
      const result = await getPurchaseAnalysisAction({ view, ...applied, page: nextPage, pageSize: 500 });
      if (!result.data) { toast.error(result.error ?? "ไม่สามารถเตรียมรายงานสำหรับพิมพ์ได้"); return; }
      rows.push(...result.data.rows);
      if (rows.length >= result.data.total) break;
    }
    setPrintRows(rows);
  });

  useEffect(() => {
    if (!printRows || !printRoot.current) return;
    void printElement(printRoot.current, {
      title: `purchase-analysis-${view}-${applied.startDate}-${applied.endDate}`,
      paperSize: "A4",
      orientation: "portrait",
    }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "ไม่สามารถสร้าง PDF ได้")).finally(() => setPrintRows(null));
  }, [applied.endDate, applied.startDate, printRows, view]);

  const exportUrl = purchaseAnalysisExportUrl({ view, ...applied });
  const optionVendor = data.options.vendors.find((row) => row.id === applied.vendorId)?.name ?? "ทั้งหมด";
  const optionGroup = data.options.groups.find((row) => row.id === applied.itemTypeId)?.name ?? "ทั้งหมด";
  const rateTone = (rate: number): StatusTone => rate >= 90 ? "success" : rate >= 70 ? "pending" : "danger";
  const receivedValue = data.summary.total_value * data.summary.received_rate / 100;
  const pendingValue = Math.max(data.summary.total_value - receivedValue, 0);
  const rankedRows = [...data.rows].sort((a, b) => b.total_value - a.total_value).slice(0, 10);
  const rankingMaximum = Math.max(...rankedRows.map((row) => row.total_value), 1);
  const shareRows = purchaseAnalysisShareRows(data.rows, 4, data.summary.total_value);
  const shareTotal = shareRows.reduce((sum, row) => sum + row.value, 0);
  const shareColors = ["#c8101e", "#ee3343", "#f66b76", "#f5a3aa", "#cbd5e1"];
  const defaultStartDate = `${today.slice(0, 7)}-01`;
  const mobileFilterCount = Number(startDate !== defaultStartDate) + Number(endDate !== today) + Number(vendorId !== null) + Number(itemTypeId !== null);
  const clearMobileFilters = () => {
    setStartDate(defaultStartDate);
    setEndDate(today);
    setVendorId(null);
    setItemTypeId(null);
    setQuery("");
  };

  const table = (rows: PurchaseAnalysisRow[], printable = false) => <DataTable className={`${styles.table} ${printable ? styles.printTable : ""}`}>
    {printable && <colgroup>{(view === "vendor" ? [3.5, 8, 29, 7, 8, 8, 7.5, 15, 14] : [3.5, 7, 26.5, 6.5, 7, 7.5, 7.5, 7.5, 15, 12]).map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>}
    <thead><tr><th>#</th><th>{view === "vendor" ? "รหัสผู้ขาย" : "รหัสสินค้า"}</th><th>{view === "vendor" ? "ผู้ขาย" : "สินค้า"}</th><th>จำนวน PO</th>{view === "product" && <th>ผู้ขาย</th>}<th>จำนวนสั่ง</th><th>จำนวนรับ</th><th>ค้างรับ</th><th>มูลค่า PO (บาท)</th><th>ส่งตรงเวลา</th>{!printable && <th>ดูรายละเอียด</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.group_id}:${row.code}:${index}`}><td>{printable ? index + 1 : (page - 1) * pageSize + index + 1}</td><td className={styles.code}>{row.code}</td><td className={styles.name} data-report-long><b>{row.name}</b>{row.meta && <small>{row.meta}</small>}</td><td>{number(row.po_count)}</td>{view === "product" && <td>{number(row.vendor_count)}</td>}<td>{number(row.ordered_qty)}</td><td>{number(row.received_qty)}</td><td>{number(row.pending_qty)}</td><td>{money(row.total_value)}</td><td><StatusBadge className={styles.rate} tone={rateTone(row.on_time_rate)}>{percent(row.on_time_rate)}</StatusBadge></td>{!printable && <td><button className={styles.detail} onClick={() => setDetailRow(row)} type="button" aria-label={`ดูรายการ ${row.code}`}><FileText size={16} /></button></td>}</tr>)}
      {rows.length === 0 && <DataTableEmpty colSpan={view === "product" ? 11 : 10}>ไม่พบข้อมูลตามตัวกรองที่เลือก</DataTableEmpty>}
    </tbody>
    {rows.length > 0 && <tfoot><tr><th colSpan={3}>รวมทั้งหมด</th><th>{number(data.summary.po_count)}</th>{view === "product" && <th>{number(data.summary.vendor_count)}</th>}<th>{number(data.summary.ordered_qty)}</th><th>{number(data.summary.received_qty)}</th><th>{number(data.summary.pending_qty)}</th><th>{money(data.summary.total_value)}</th><th className={styles.goodText}>{percent(data.summary.on_time_rate)}</th>{!printable && <th />}</tr></tfoot>}
  </DataTable>;

  return <section className={styles.report} aria-busy={pending}>
    <ReportBackLink />
    <fieldset aria-label="เลือกมุมมองรายงาน" className={styles.views}><legend className={styles.viewLegend}>มุมมองรายงาน</legend><button aria-pressed={view === "vendor"} className={view === "vendor" ? styles.selected : ""} onClick={() => changeView("vendor")} type="button">ผู้ขาย</button><button aria-pressed={view === "product"} className={view === "product" ? styles.selected : ""} onClick={() => changeView("product")} type="button">สินค้า</button></fieldset>
    <header className={styles.header}><div><h1>รายงานสรุปยอดซื้อแยกตามผู้ขายและสินค้า</h1><p>สรุปยอดการสั่งซื้อ แยกตามผู้ขายและสินค้า พร้อมสถานะการรับสินค้าและการส่งมอบ</p></div><span>ข้อมูลวันที่ {longDate(today)}</span></header>
    <form className="min-[901px]:hidden" id="purchase-analysis-mobile-filters" onSubmit={submit}>
      <MobileListFilters
        activeCount={mobileFilterCount}
        className="min-[901px]:hidden"
        formId="purchase-analysis-mobile-filters"
        onClear={clearMobileFilters}
        resultLabel="แสดงรายงาน"
        search={<ListSearchField onChange={setQuery} placeholder={view === "vendor" ? "ค้นหารหัสผู้ขาย ชื่อผู้ขาย..." : "ค้นหารหัสสินค้า ชื่อสินค้า..."} value={query} />}
        title="ตัวกรองรายงาน"
      >
        <ListDateRangeFilter endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
        <ListFilterSelect label="ผู้ขาย" onChange={(value) => setVendorId(value ? Number(value) : null)} value={String(vendorId ?? "")}><option value="">ทั้งหมด</option>{data.options.vendors.map((row) => <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="กลุ่มสินค้า" onChange={(value) => setItemTypeId(value ? Number(value) : null)} value={String(itemTypeId ?? "")}><option value="">ทั้งหมด</option>{data.options.groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
      </MobileListFilters>
    </form>
    <MobileReportActions actions={[
      { disabled: pending, icon: <FileSpreadsheet size={18} />, label: "ส่งออก Excel", onSelect: () => window.open(exportUrl, "_self") },
      { disabled: pending, icon: <Printer size={18} />, label: "พิมพ์ A4", onSelect: preparePrint },
    ]} />
    <div className="hidden min-[901px]:block">
    <form className={styles.filters} onSubmit={submit}>
      <div className={styles.controls}>
        <ListDateRangeFilter className={styles.dates} endValue={endDate} maxEnd={today} maxStart={endDate} minEnd={startDate} onEndChange={setEndDate} onStartChange={setStartDate} startValue={startDate} />
        <ListFilterSelect label="ผู้ขาย" onChange={(value) => setVendorId(value ? Number(value) : null)} value={String(vendorId ?? "")}><option value="">ทั้งหมด</option>{data.options.vendors.map((row) => <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="กลุ่มสินค้า" onChange={(value) => setItemTypeId(value ? Number(value) : null)} value={String(itemTypeId ?? "")}><option value="">ทั้งหมด</option>{data.options.groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</ListFilterSelect>
        <ListSearchField className={styles.query} onChange={setQuery} placeholder={view === "vendor" ? "ค้นหารหัสผู้ขาย ชื่อผู้ขาย..." : "ค้นหารหัสสินค้า ชื่อสินค้า..."} value={query} />
        <p className={styles.mobileSummary}>ผู้ขาย: {optionVendor} · กลุ่มสินค้า: {optionGroup}</p>
        <ListFilterButton className={styles.searchButton} disabled={pending} icon={<Search size={18} />} tone="primary" type="submit">ค้นหา</ListFilterButton>
        <ExcelExportButton className={styles.export} disabled={pending} onClick={() => window.open(exportUrl, "_self")} />
        <button className={styles.printButton} disabled={pending} onClick={preparePrint} type="button"><Printer size={18} />พิมพ์ A4</button>
      </div>
    </form>
    </div>
    <section aria-label="สรุปรายงาน" className={styles.kpis}>
      <article><FileSpreadsheet aria-hidden="true" /><div><small>มูลค่า PO</small><strong>฿ {money(data.summary.total_value)}</strong><em>{number(data.summary.po_count)} ใบสั่งซื้อ</em></div></article>
      <article><PackageCheck aria-hidden="true" /><div><small>รับของแล้ว</small><strong>฿ {money(receivedValue)}</strong><em>{percent(data.summary.received_rate)} ของมูลค่า PO</em></div></article>
      <article><Clock3 aria-hidden="true" /><div><small>ค้างรับ</small><strong>฿ {money(pendingValue)}</strong><em>{number(data.summary.pending_qty)} หน่วย</em></div></article>
      <article><Users aria-hidden="true" /><div><small>ผู้ขาย</small><strong>{number(data.summary.vendor_count)} ราย</strong><em>ส่งตรงเวลา {percent(data.summary.on_time_rate)}</em></div></article>
    </section>
    {rankedRows.length ? <section className={styles.insights} aria-label="ภาพวิเคราะห์ยอดซื้อ">
      <article className={styles.ranking}><header><div><h2>10 {view === "vendor" ? "ผู้ขาย" : "สินค้า"}ยอดซื้อสูงสุด</h2><p>มูลค่า PO (บาท)</p></div><b>สูงสุด {money(rankingMaximum)}</b></header><ol>{rankedRows.map((row, index) => <li key={`${row.group_id}:${row.code}:${index}`}><span title={row.name}>{row.name}</span><progress max={rankingMaximum} value={row.total_value} /><strong>{money(row.total_value)}</strong></li>)}</ol></article>
      <article className={styles.share}><header><div><h2>สัดส่วนมูลค่า PO ตาม{view === "vendor" ? "ผู้ขาย" : "สินค้า"}</h2><p>สัดส่วนจากมูลค่า PO ในช่วงที่เลือก</p></div></header><div className={styles.shareBody}><div className={styles.donutWrap}><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={shareRows} dataKey="value" innerRadius="57%" nameKey="name" outerRadius="82%" paddingAngle={1} stroke="var(--color-surface-container-lowest)" strokeWidth={2}>{shareRows.map((row, index) => <Cell fill={shareColors[index % shareColors.length]} key={`${row.name}:${index}`} />)}</Pie><Tooltip formatter={(value) => [`฿ ${money(Number(value))}`, "มูลค่า PO"]} /></PieChart></ResponsiveContainer><div aria-hidden="true" className={styles.donutCenter}><span>รวมทั้งสิ้น</span><strong>{money(shareTotal)}</strong><small>บาท</small></div></div><ol className={styles.shareLegend}>{shareRows.map((row, index) => <li key={`${row.name}:${index}`}><i style={{ backgroundColor: shareColors[index % shareColors.length] }} /><span title={row.name}>{row.name}</span><strong>{shareTotal ? percent(row.value / shareTotal * 100) : "0%"}</strong></li>)}</ol></div></article>
    </section> : null}
    <div className={`${styles.desktop} ${styles.tableSection}`}><header><div><h2>รายละเอียดยอดซื้อตาม{view === "vendor" ? "ผู้ขาย" : "สินค้า"}</h2><p>แสดง {number(data.rows.length)} จากทั้งหมด {number(data.total)} รายการ</p></div></header><DataTableFrame>{table(data.rows)}</DataTableFrame></div>
    <div className={styles.mobile}><h2>รายการ{view === "vendor" ? "ผู้ขาย" : "สินค้า"} ({number(data.total)} รายการ)</h2>{data.rows.map((row, index) => <button className={styles.card} key={`${row.group_id}:${row.code}:${index}`} onClick={() => setDetailRow(row)} type="button"><div className={styles.cardHead}><b>{row.code}</b><ChevronRight size={20} /></div><p>{row.name}</p>{row.meta && <small>{row.meta}</small>}<div className={styles.cardMeta}>{row.po_count} PO · มูลค่า {money(row.total_value)}</div><dl><div><dt>รับแล้ว</dt><dd className={styles.goodText}>{money(row.received_value)}</dd></div><div><dt>ค้างรับ</dt><dd className={row.pending_value > 0 ? styles.warnText : styles.goodText}>{money(row.pending_value)}</dd></div><div><dt>ตรงเวลา</dt><dd><StatusBadge className={styles.rate} tone={rateTone(row.on_time_rate)}>{percent(row.on_time_rate)}</StatusBadge></dd></div></dl></button>)}{data.total === 0 && <p className={styles.empty}>ไม่พบข้อมูลตามตัวกรองที่เลือก</p>}</div>
    <footer className={styles.footer}><label>แสดง <select value={pageSize} onChange={(e) => { const size = Number(e.target.value); setPageSize(size); load(view, 1, size); }}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select> รายการต่อหน้า</label><Pagination currentPage={page} onPageChange={(next) => load(view, next)} pageSize={pageSize} totalItems={data.total} /></footer>
    {detailRow && (view === "vendor" ? <PurchaseAnalysisVendorDrawer endDate={applied.endDate} onClose={closeDetail} row={detailRow} startDate={applied.startDate} /> : <PurchaseAnalysisProductDrawer endDate={applied.endDate} onClose={closeDetail} row={detailRow} startDate={applied.startDate} />)}
    {printRows && <div className={styles.printRoot} ref={printRoot}>
      <CompanyDocumentHeader context={documentContext} meta={[{ label: "พิมพ์เมื่อ", value: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) }, { label: "ผู้พิมพ์", value: printedBy }]} priority />
      <section className={styles.printHeading}>
        <h1>รายงานสรุปยอดซื้อแยกตาม{view === "vendor" ? "ผู้ขาย" : "สินค้า"}</h1>
        <p>สรุปยอดการสั่งซื้อ การรับสินค้า และผลการส่งมอบ</p>
        <dl className={styles.printMeta}>
          <div><dt>วันที่เอกสาร</dt><dd>{date(applied.startDate)} – {date(applied.endDate)}</dd></div>
          <div><dt>กลุ่มสินค้า</dt><dd>{optionGroup}</dd></div>
          <div><dt>ผู้ขาย</dt><dd>{optionVendor}</dd></div>
          <div><dt>มุมมอง</dt><dd>{view === "vendor" ? "ผู้ขาย" : "สินค้า"}</dd></div>
        </dl>
      </section>
      <div className={styles.printSummary}><b>{number(data.summary.vendor_count)} ผู้ขาย</b><i /> <b>{number(data.summary.po_count)} PO</b><i /> มูลค่า <strong>{money(data.summary.total_value)}</strong> บาท<i /> รับแล้ว <strong>{percent(data.summary.received_rate)}</strong><i /> ตรงเวลา <strong>{percent(data.summary.on_time_rate)}</strong></div>
      {table(printRows, true)}
      <CompanyDocumentFooter
        className={styles.printFooter}
        context={documentContext}
        customNote={documentContext.documentSettings.footerTextTh}
        placement="report"
        printedBy={printedBy}
        variant="report"
      />
    </div>}
  </section>;
}
