"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, History, Info, Settings2, Upload, X } from "lucide-react";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ListFilterButton, ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { RowActionMenu } from "@/components/row-action-menu";
import { useHasPermission } from "@/components/permission-context";
import { StatusBadge } from "@/components/status-badge";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { attachTableTouchScroll } from "@/lib/table-touch-scroll";
import { scheduleTotal, type DeliverySchedule, type ScheduleArchive } from "@/lib/delivery-schedules";
import styles from "./schedule-workspace.module.css";

type Customer = { id: number; customer_name: string };
const number = (value: number | string | null | undefined) => value === null || value === undefined ? "–" : typeof value === "number" ? value.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : value;
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const month = (value: string, short = false) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(date(`${value}-01`));
const day = (value: string) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", timeZone: "UTC" }).format(date(value));
const weekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const imported = (value: string) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
const subscribeView = (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); };
const storedView = () => { try { return localStorage.getItem("krc:delivery-schedule-view") === "list" ? "list" : "table"; } catch { return "table"; } };
const subscribeMobile = (notify: () => void) => { const media = window.matchMedia("(max-width: 767px)"); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); };

function ImportDialog({ customers, onClose, onSaved }: { customers: Customer[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useBodyScrollLock(true);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={styles.dialog} onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/delivery-schedules", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "นำเข้าไม่สำเร็จ");
        onSaved(result.id);
      } catch (e) { setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ"); setBusy(false); }
    }}>
      <header><h2>นำเข้าแผนส่งมอบลูกค้า</h2><button aria-label="ปิด" disabled={busy} onClick={onClose} type="button"><X size={21} /></button></header>
      <div className={styles.dialogBody}>
        <label>ลูกค้า<select name="customerId" required disabled={busy} defaultValue=""><option value="" disabled>เลือกลูกค้า</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.customer_name}</option>)}</select></label>
        <label>ไฟล์ต้นฉบับ<input name="file" type="file" accept=".xlsx" required disabled={busy} /></label>
        <p>รองรับแบบฟอร์ม KRC (.xlsx ไม่เกิน 5 MB) เก็บไฟล์และข้อมูลแยกตามเดือน / ผู้ส่งมอบ / Revision โดยไม่ทับฉบับเดิม</p>
        <p>ใช้ดูย้อนหลัง ไม่สร้างรายการขายหรือเคลื่อนไหวสต็อก</p>
        {!customers.length && <p role="alert">ไม่พบรายชื่อลูกค้า กรุณาตรวจสอบทะเบียนลูกค้าและสิทธิ์อ่านข้อมูลคู่ค้า</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
      <footer><button disabled={busy} onClick={onClose} type="button">ยกเลิก</button><button className={styles.primary} disabled={busy || !customers.length} type="submit">{busy ? "กำลังนำเข้า…" : "นำเข้าและเก็บต้นฉบับ"}</button></footer>
    </form>
  </dialog>;
}

function FileDetailsDialog({ archive, payload, onClose }: { archive: ScheduleArchive; payload: DeliverySchedule | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useBodyScrollLock(true);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="schedule-file-details-title" onCancel={onClose}>
    <header><h2 id="schedule-file-details-title">รายละเอียดไฟล์แผนส่งมอบ</h2><button autoFocus aria-label="ปิดรายละเอียดไฟล์" type="button" onClick={onClose}><X size={21} /></button></header>
    <div className={styles.dialogBody}>
      <dl className={styles.fileDetails}>
        <div><dt>ไฟล์ต้นฉบับ</dt><dd>{archive.filename}</dd></div>
        <div><dt>ลูกค้า</dt><dd>{archive.customer_name}</dd></div>
        <div><dt>ผู้ส่งมอบ</dt><dd>{payload?.supplierName || "–"} ({archive.supplier_code})</dd></div>
        <div><dt>ช่วงเดือน / Revision</dt><dd>{month(archive.period)} · Rev.{archive.revision}</dd></div>
        <div><dt>จำนวน / ขนาดไฟล์</dt><dd>{number(archive.row_count)} รายการ · {number(Math.ceil(archive.file_size / 1024))} KB</dd></div>
        <div><dt>อัปโหลดโดย</dt><dd>{archive.imported_by_name}</dd></div>
        <div><dt>วันที่นำเข้า</dt><dd>{imported(archive.created_at)}</dd></div>
      </dl>
      <p>เก็บเพื่อดูย้อนหลัง ไม่สร้างรายการขายหรือเคลื่อนไหวสต็อก</p>
    </div>
    <footer><ListFilterButton onClick={onClose}>ปิด</ListFilterButton></footer>
  </dialog>;
}

export function ScheduleWorkspace({ archives, initialPayload, initialError, customers }: {
  archives: ScheduleArchive[]; initialPayload: DeliverySchedule | null; initialError: string | null; customers: Customer[];
}) {
  const router = useRouter();
  const canImport = useHasPermission("delivery_schedule.create");
  const canDownload = useHasPermission("delivery_schedule.export");
  const [selectedId, setSelectedId] = useState(archives[0]?.id ?? "");
  const selected = archives.find((a) => a.id === selectedId) ?? archives[0];
  const [loaded, setLoaded] = useState<{ id: string; payload: DeliverySchedule | null }>({ id: archives[0]?.id ?? "", payload: initialPayload });
  const payload = selected?.id === loaded.id ? loaded.payload : selected?.id === archives[0]?.id ? initialPayload : null;
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"table" | "files">("table");
  const savedMode = useSyncExternalStore(subscribeView, storedView, () => "table");
  const [modeOverride, setMode] = useState<string | null>(null);
  const mode = modeOverride ?? savedMode;
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("parts");
  const [forecast, setForecast] = useState(false);
  const [columns, setColumns] = useState(false);
  const [pack, setPack] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsFocus = useRef<HTMLElement | null>(null);
  const fileTabRef = useRef<HTMLButtonElement>(null);
  const matrixRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia("(max-width: 767px)").matches, () => false);
  const pageSize = mobile ? 16 : 17;

  useEffect(() => {
    if (!selected?.id || selected.id === loaded.id && loaded.payload) return;
    const controller = new AbortController();
    fetch(`/api/delivery-schedules/${selected.id}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "อ่านแผนส่งมอบไม่สำเร็จ");
      setLoaded({ id: selected.id, payload: data });
      setError(null);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [selected?.id, loaded.id, loaded.payload]);

  const choose = (id: string) => { setSelectedId(id); setPage(1); setExpanded(null); setHighlight(null); setError(null); };
  const chooseMode = (value: string) => { setMode(value); try { localStorage.setItem("krc:delivery-schedule-view", value); } catch { /* Preference is optional. */ } };
  const openImport = () => { lastFocus.current = document.activeElement as HTMLElement; setImportOpen(true); };
  const closeImport = () => { setImportOpen(false); lastFocus.current?.focus(); };
  const openDetails = () => { detailsFocus.current = document.activeElement as HTMLElement; setDetailsOpen(true); };
  const closeDetails = () => { setDetailsOpen(false); detailsFocus.current?.focus(); };
  const download = async (archive = selected) => {
    if (!archive || busy) return;
    setBusy(true);
    try { const { exportSpreadsheetUrl } = await import("@/lib/spreadsheet-delivery"); await exportSpreadsheetUrl(`/api/delivery-schedules/${archive.id}?download=1`); }
    finally { setBusy(false); }
  };
  const showFiles = () => { setTab("files"); requestAnimationFrame(() => fileTabRef.current?.focus()); };
  const currentFamily = archives.filter((a) => a.customer_id === selected?.customer_id && a.period === selected?.period && a.supplier_code === selected?.supplier_code);
  const periods = [...new Set(archives.map((a) => a.period))];
  const archiveCustomers = [...new Map(archives.map((a) => [a.customer_id, a.customer_name])).entries()];
  const rows = (payload?.rows ?? []).filter((r) => r.section === section && `${r.partNumber} ${r.name} ${r.erpCode} ${r.direction}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const dates = payload?.dates ?? [];
  const forecastMonths = payload?.forecastMonths ?? [];
  const extraCols = pack ? 4 : 0;
  const totalCols = 3 + extraCols + Math.max(1, dates.length) + (forecast ? forecastMonths.length : 0);
  useEffect(() => {
    if (tab !== "table" || (mobile && mode !== "table") || !payload) return;
    const scroller = matrixRef.current?.querySelector<HTMLElement>(".erp-data-table-scroll");
    if (scroller) return attachTableTouchScroll(scroller);
  }, [mobile, tab, mode, payload, safePage, search, section]);
  const monthSelect = (className = "") => <ListFilterSelect label="เดือนแผนส่งมอบ" className={`${styles.compactSelect} ${className}`} value={selected?.period ?? ""} disabled={!archives.length} onChange={(value) => {
    const next = archives.find((a) => a.period === value && a.customer_id === selected?.customer_id) ?? archives.find((a) => a.period === value);
    if (next) choose(next.id);
  }}>{!periods.length && <option value="">เลือกเดือน</option>}{periods.map((p) => <option key={p} value={p}>{month(p, true)}</option>)}</ListFilterSelect>;
  const revisionSelect = () => <ListFilterSelect label="Revision" className={styles.compactSelect} value={selected?.id ?? ""} disabled={!selected} onChange={choose}>{!selected && <option value="">Rev.</option>}{currentFamily.map((a) => <option key={a.id} value={a.id}>Rev.{a.revision}</option>)}</ListFilterSelect>;
  const customerSelect = () => <ListFilterSelect label="ลูกค้า" className={styles.compactSelect} value={selected ? String(selected.customer_id) : ""} disabled={!selected} onChange={(value) => { const next = archives.find((a) => a.customer_id === Number(value) && a.period === selected?.period) ?? archives.find((a) => a.customer_id === Number(value)); if (next) choose(next.id); }}>
    {!selected && <option value="">เลือกลูกค้า</option>}{archiveCustomers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</ListFilterSelect>;
  const searchField = <ListSearchField placeholder="ค้นหาด้วย Part No. หรือชื่อสินค้า" value={search} onChange={(s) => { setSearch(s); setPage(1); }} />;
  const filterFields = <>
    <div className={styles.filterField}><span>ลูกค้า</span>{customerSelect()}</div>
    <ListFilterSelect label="กลุ่มข้อมูล" value={section} onChange={(value) => { setSection(value); setPage(1); }}><option value="parts">ชิ้นส่วน</option><option value="cu">CU — รับเข้า / ส่งกลับ</option></ListFilterSelect>
    <label className={styles.check}><input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} />แสดง Forecast</label>
  </>;

  return <section className={styles.workspace} aria-label="แผนส่งมอบลูกค้า">
    <div className={styles.desktopHeading}>
      <div><p className={styles.breadcrumb}>หน้าแรก <ChevronRight size={12} /> ข้อมูลแผนส่งมอบ <ChevronRight size={12} /> แผนส่งมอบลูกค้า</p><h1>แผนส่งมอบลูกค้า</h1></div>
      <div className={styles.actions}><ListFilterButton icon={<Info size={17} />} disabled={!selected} onClick={openDetails}>รายละเอียดไฟล์</ListFilterButton>{canImport && <ListFilterButton tone="primary" className={styles.primary} icon={<Upload size={17} />} onClick={openImport}>นำเข้าไฟล์</ListFilterButton>}{canDownload && <ListFilterButton icon={<Download size={17} />} disabled={!selected || busy} onClick={() => void download()}>ดาวน์โหลดต้นฉบับ</ListFilterButton>}</div>
    </div>
    <div className={styles.mobileContext}>{monthSelect()}{revisionSelect()}<button aria-label="รายละเอียดไฟล์" title="รายละเอียดไฟล์" disabled={!selected} onClick={openDetails}><Info size={21} /></button><button aria-label="ไฟล์และประวัติ" onClick={showFiles}><History size={22} /></button><RowActionMenu contextId="schedule-mobile" actions={[
      ...(canImport ? [{ icon: <Upload size={16} />, label: "นำเข้าไฟล์", onSelect: openImport }] : []),
      ...(canDownload && selected ? [{ icon: <Download size={16} />, label: "ดาวน์โหลดต้นฉบับ", onSelect: () => void download(), disabled: busy }] : []),
      { icon: <History size={16} />, label: "ไฟล์และประวัติ", onSelect: showFiles },
    ]} /></div>
    <div className={styles.tabs}><button aria-pressed={tab === "table"} onClick={() => setTab("table")}>ตารางส่งมอบ</button><button ref={fileTabRef} aria-pressed={tab === "files"} onClick={() => setTab("files")}>ไฟล์และประวัติ ({archives.length})</button></div>
    {(error || initialError && !archives.length) && <p role="alert" className={styles.error}>{error ?? initialError}</p>}
    {tab === "files" ? <>
      <div className={styles.historyIntro}><h2>ไฟล์ต้นฉบับและประวัติ</h2><button onClick={() => setTab("table")}>กลับไปตาราง</button></div>
      <DataTableFrame><DataTable className={styles.history}><thead><tr><th>ช่วงเดือน / ลูกค้า</th><th>ไฟล์ต้นฉบับ</th><th>Revision</th><th>นำเข้าเมื่อ / โดย</th><th>จัดการ</th></tr></thead><tbody>
        {archives.map((a) => <tr key={a.id} aria-selected={a.id === selected?.id}><td>{month(a.period)}<small>{a.customer_name}</small></td><td>{a.filename}<small>{a.row_count} รายการ · {Math.ceil(a.file_size / 1024)} KB</small></td><td><StatusBadge tone={a.id === selected?.id ? "danger" : "neutral"}>Rev.{a.revision}</StatusBadge></td><td>{imported(a.created_at)}<small>{a.imported_by_name}</small></td><td><button onClick={() => { choose(a.id); setTab("table"); }}>ดูข้อมูล</button>{canDownload && <button aria-label={`ดาวน์โหลด ${a.filename}`} disabled={busy} onClick={() => void download(a)}><Download size={17} /></button>}</td></tr>)}
        {!archives.length && <DataTableEmpty colSpan={5}>ยังไม่มีไฟล์แผนส่งมอบ</DataTableEmpty>}
      </tbody></DataTable></DataTableFrame>
    </> : <>
      <ListFilterToolbar className={styles.desktopFilters}>
        {searchField}<div className={styles.filterField}><span>เดือน</span>{monthSelect()}</div><div className={styles.filterField}><span>ลูกค้า</span>{customerSelect()}</div><div className={styles.filterField}><span>Revision</span>{revisionSelect()}</div>
        <div className={styles.columnPicker}><ListFilterButton aria-expanded={columns} icon={<Settings2 size={16} />} onClick={() => setColumns(!columns)}>เลือกคอลัมน์</ListFilterButton>{columns && <div>
          <label className={styles.check}><input type="checkbox" checked={pack} onChange={(e) => setPack(e.target.checked)} />หน่วย / ถุง / กล่อง / STD/JOB</label>
          <ListFilterSelect label="กลุ่มข้อมูล" value={section} onChange={(value) => { setSection(value); setPage(1); }}><option value="parts">ชิ้นส่วน</option><option value="cu">CU — รับเข้า / ส่งกลับ</option></ListFilterSelect>
        </div>}</div>
        <label className={styles.check} title={forecastMonths.map((m) => month(m, true)).join(" / ")}><input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} />แสดง Forecast</label>
      </ListFilterToolbar>
      <div className={styles.mobileToolbar}><MobileListFilters search={searchField} onClear={() => { setSearch(""); setSection("parts"); setForecast(false); setPage(1); }} activeCount={Number(section !== "parts") + Number(forecast)}>{filterFields}</MobileListFilters><div className={styles.mode}><button aria-pressed={mode === "table"} onClick={() => chooseMode("table")}>ตาราง</button><button aria-pressed={mode === "list"} onClick={() => chooseMode("list")}>รายการ</button></div></div>
      {section === "cu" && <p className={styles.notice}>CU — แสดงของรับเข้าและส่งกลับตามต้นฉบับ แยกจากยอดส่งมอบชิ้นส่วน</p>}
      {!payload && selected && !error ? <p role="status" className={styles.loading}>กำลังโหลดข้อมูล…</p> : <>
        <div ref={matrixRef} className={`${styles.matrixWrap} ${!dates.length ? styles.emptyMatrixWrap : ""} ${mode === "list" ? styles.mobileHidden : ""}`}>
          <DataTableFrame><DataTable className={`${styles.matrix} ${!dates.length ? styles.emptyMatrix : ""} ${forecast ? styles.withForecast : ""}`} style={{ "--desktop-width": `${(pack ? 612 : 356) + dates.length * 44 + (forecast ? forecastMonths.length * 88 : 0)}px`, "--mobile-width": `${220 + dates.length * 40 + (forecast ? forecastMonths.length * 88 : 0)}px` } as React.CSSProperties}>
            <colgroup><col className={styles.indexCol} /><col className={styles.identityCol} />{pack && <><col className={styles.packCol} /><col className={styles.packCol} /><col className={styles.packCol} /><col className={styles.packCol} /></>}{dates.length ? dates.map((d) => <col className={styles.dayCol} key={d} />) : <col className={styles.emptyDateCol} />}<col className={styles.totalCol} />{forecast && forecastMonths.map((m) => <col className={styles.forecastCol} key={m} />)}</colgroup>
            <thead>{dates.length ? <><tr className={styles.monthHeader}><th rowSpan={2} className={styles.index}>ลำดับ</th><th rowSpan={2} className={styles.identity}>Part No. / ชื่อสินค้า<small>รหัสสินค้า (ERP)</small></th>{pack && <><th rowSpan={2} className={styles.pack}>หน่วย</th><th rowSpan={2} className={styles.pack}>จำนวน<br />ต่อถุง</th><th rowSpan={2} className={styles.pack}>จำนวน<br />ต่อกล่อง</th><th rowSpan={2} className={styles.pack}>STD/JOB</th></>}<th colSpan={Math.max(1, dates.length)} className={styles.monthTitle}>{selected ? `${month(selected.period)} (จำนวนส่งมอบรายวัน)` : "กำหนดส่งรายวัน"}</th><th rowSpan={2} className={styles.total}>รวม<br />{selected ? `(${month(selected.period, true)})` : "เดือน"}</th>{forecast && <th colSpan={forecastMonths.length} className={styles.forecastTitle}>Forecast</th>}</tr>
              <tr>{dates.map((d) => <th key={d} className={`${styles.date} ${date(d).getUTCDay() === 0 ? styles.sunday : ""} ${!d.startsWith(payload?.period ?? "") ? styles.outside : ""}`} title={day(d)}>{d.slice(8)}<small>{weekdays[date(d).getUTCDay()]}</small></th>)}{forecast && forecastMonths.map((m) => <th className={styles.forecastCell} key={m}>{month(m, true)}</th>)}</tr>
            </> : <tr>
              <th className={styles.index} scope="col">ลำดับ</th><th className={styles.identity} scope="col">Part No. / ชื่อสินค้า<small>รหัสสินค้า (ERP)</small></th>
              {pack && <><th className={styles.pack} scope="col">หน่วย</th><th className={styles.pack} scope="col">จำนวน<br />ต่อถุง</th><th className={styles.pack} scope="col">จำนวน<br />ต่อกล่อง</th><th className={styles.pack} scope="col">STD/JOB</th></>}
              <th className={styles.emptyDaily} scope="col">กำหนดส่งรายวัน</th><th className={styles.total} scope="col">รวมเดือน</th>
            </tr>}</thead>
            <tbody>{visible.map((r, i) => <tr key={r.sourceRow} aria-selected={highlight === r.sourceRow} onClick={() => setHighlight(r.sourceRow)}><td className={styles.index}>{(safePage - 1) * pageSize + i + 1}</td><td className={styles.identity}><button className={styles.identityButton} onClick={() => { setHighlight(r.sourceRow); setExpanded(r.sourceRow); chooseMode("list"); }}><span className={styles.desktopPart}>{r.name} / </span>{r.partNumber}<small className={styles.mobileName}>{r.name}</small><small className={styles.erp}>{r.erpCode}{r.direction ? ` · ${r.direction}` : ""}</small></button></td>{pack && <><td className={styles.pack}>{r.unit}</td><td className={styles.pack}>{number(r.bag)}</td><td className={styles.pack}>{number(r.box)}</td><td className={styles.pack}>{number(r.job)}</td></>}{dates.map((d) => <td className={`${styles.date} ${date(d).getUTCDay() === 0 ? styles.sunday : ""} ${!d.startsWith(payload?.period ?? "") ? styles.outside : ""}`} key={d}>{number(r.deliveries[d])}</td>)}<td className={styles.total}>{number(scheduleTotal(r, selected?.period ?? ""))}</td>{forecast && forecastMonths.map((m) => <td className={styles.forecastCell} key={m}>{number(r.forecasts[m])}</td>)}</tr>)}
              {!visible.length && <DataTableEmpty colSpan={totalCols}>{archives.length ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีแผนส่งมอบ — นำเข้าไฟล์เพื่อเก็บประวัติ"}</DataTableEmpty>}
            </tbody>
            {rows.length > 0 && <tfoot><tr><th className={styles.index} /><th className={styles.identity}>รวมส่งมอบรายวัน</th>{pack && Array.from({ length: 4 }, (_, i) => <td className={styles.pack} key={i} />)}{dates.map((d) => <td key={d}>{number(rows.reduce((sum, r) => sum + (r.deliveries[d] ?? 0), 0))}</td>)}<td className={styles.total}>{number(rows.reduce((sum, r) => sum + scheduleTotal(r, selected?.period ?? ""), 0))}</td>{forecast && forecastMonths.map((m) => <td key={m}>{rows.some((r) => r.forecasts[m] === null) ? "–" : number(rows.reduce((sum, r) => sum + (r.forecasts[m] ?? 0), 0))}</td>)}</tr></tfoot>}
          </DataTable></DataTableFrame>
        </div>
        <div className={`${styles.mobileList} ${mode !== "list" ? styles.mobileHidden : ""}`}>
          <div className={styles.listHeading}><span>ชิ้นส่วน</span><span>รวมเดือน (ชิ้น)</span></div>
          {visible.map((r) => <Fragment key={r.sourceRow}><button className={styles.listRow} aria-expanded={expanded === r.sourceRow} onClick={() => setExpanded(expanded === r.sourceRow ? null : r.sourceRow)}><span><strong>{r.partNumber}</strong><small>{r.name}</small></span><b>{number(scheduleTotal(r, selected?.period ?? ""))}</b><ChevronDown size={18} style={{ transform: expanded === r.sourceRow ? "rotate(180deg)" : undefined }} /></button>{expanded === r.sourceRow && <div className={styles.listDetail}>
            {Object.entries(r.deliveries).map(([d, qty]) => <div key={d}><span>{day(d)}{!d.startsWith(payload?.period ?? "") ? " (นอกเดือน)" : ""}</span><b>{number(qty)}</b></div>)}
            {!Object.keys(r.deliveries).length && <p>ไม่มีกำหนดส่งในไฟล์</p>}
            <p>{r.erpCode} · ถุง {number(r.bag)} · กล่อง {number(r.box)} · STD/JOB {number(r.job)}</p>
            {r.direction && <p>{r.direction}</p>}
            <details><summary>Forecast / แหล่งข้อมูล</summary>{forecastMonths.map((m) => <div key={m}><span>{month(m, true)}</span><b>{number(r.forecasts[m])}</b></div>)}<p>{payload?.sheetName} · แถว {r.sourceRow}</p></details>
          </div>}</Fragment>)}
          {!rows.length && <p className={styles.loading}>ไม่พบรายการ</p>}
        </div>
      </>}
      <div className={styles.tableFooter}><div className={styles.footerNote}><p>ข้อมูลจากไฟล์แผนส่งมอบ ไม่ใช่ยอดขายจริง</p>{payload?.warnings.length ? <details className={styles.warnings}><summary>ข้อสังเกตจากไฟล์ ({payload.warnings.length})</summary><ul>{payload.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details> : null}</div><Pagination currentPage={safePage} onPageChange={setPage} pageSize={pageSize} totalItems={rows.length} /></div>
    </>}
    {importOpen && <ImportDialog customers={customers} onClose={closeImport} onSaved={(id) => { closeImport(); choose(id); router.refresh(); }} />}
    {detailsOpen && selected && <FileDetailsDialog archive={selected} payload={payload} onClose={closeDetails} />}
  </section>;
}
