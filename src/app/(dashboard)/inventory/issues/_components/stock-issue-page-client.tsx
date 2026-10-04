"use client";

import "./stock-issue-theme.css";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Ban, ChevronRight, Eye, FileText, Info, Loader2,
  Plus, Printer, Trash2, X,
} from "lucide-react";
import {
  cancelStockIssueAction,
  getStockIssueDetailAction,
  getStockIssueFormOptionsAction,
  postStockIssueAction,
  type StockIssueFormOptions,
  type StockIssueItem,
  type StockIssueRecord,
} from "@/app/actions/stock-issues";
import { CompanyDocumentHeader } from "@/components/company-document-header";
import { CompanyDocumentFooter } from "@/components/company-document-footer";
import { DocumentPreviewShell } from "@/components/document-preview-shell";
import { CompanyFormLogo } from "@/components/company-logo";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Pagination } from "@/components/pagination";
import { MobileDocumentList } from "@/components/mobile-document-list";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { focusKeyboardTarget, runEnterAction } from "@/components/keyboard-workflow";
import type { CompanyDocumentContext } from "@/lib/company-settings";
import { exportElementPdf, printElement } from "@/lib/document-print";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import { buildStockIssueHistory, formatIssueLotNumber, formatIssueQuantity, getStockIssueCreateActions, getStockRequestLineNumbers, projectIssueCostRows, validateStockIssueDraft } from "@/lib/stock-issues";
import type { IssueAllocation } from "@/lib/stock-issues";
import { ItemPicker } from "@/components/item-picker";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";
import { LotAllocationDialog } from "./lot-allocation-dialog";
import { useHasPermission } from "@/components/permission-context";
import {
  ListDateRangeFilter,
  ListFilterSelect,
  ListFilterToolbar,
  ListSearchField,
  MobileListFilters,
} from "@/components/list-filters";

type Props = {
  documentContext: CompanyDocumentContext;
  initialIssues: StockIssueRecord[];
  initialQuery?: string;
};

type DraftLine = StockIssueFormOptions["items"][number] & { quantity: string; allocations?: IssueAllocation[]; fifoOverrideReason?: string };
type Detail = { header: StockIssueRecord; items: StockIssueItem[]; canViewCost: boolean; canCancel: boolean };
type DraftDisplayRow = { key: string; line: DraftLine; lotId: number | null; lotNumber: string; quantity: number; unitCost: number | null; amount: number | null };

const pageSize = 8;
const inputClass = "h-9 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px] font-medium text-on-surface outline-none placeholder:text-secondary focus:border-primary";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
  const [year, month] = todayIso().split("-");
  return `${year}-${month}-01`;
}

function formatIssueMoney(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function expandDraftRows(lines: DraftLine[], canViewCost: boolean): DraftDisplayRow[] {
  const result: DraftDisplayRow[] = [];
  for (const line of lines) {
    if (line.trackingMethod !== "lot" || !line.allocations?.length) {
      result.push({ key: String(line.id), line, lotId: null, lotNumber: "—", quantity: Number(line.quantity) || 0, unitCost: null, amount: null });
      continue;
    }
    projectIssueCostRows(line.lots, line.allocations, canViewCost).forEach((row, index) => result.push({ key: `${line.id}-${row.lotId}-${index}`, line, ...row }));
  }
  return result;
}

function IssueStatus({ status }: { status: StockIssueRecord["status"] }) {
  return <StatusBadge tone={status === "posted" ? "success" : "danger"}>{status === "posted" ? "บันทึกแล้ว" : "ยกเลิกแล้ว"}</StatusBadge>;
}

export function StockIssuePageClient({ documentContext, initialIssues, initialQuery = "" }: Props) {
  const canCreate = useHasPermission("inventory_issue.create");
  const [query, setQuery] = useState(initialQuery);
  const [startDate, setStartDate] = useState(initialQuery ? "" : monthStartIso);
  const [endDate, setEndDate] = useState(initialQuery ? "" : todayIso);
  const [department, setDepartment] = useState("all");
  const [warehouse, setWarehouse] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const departments = useMemo(() => [...new Set(initialIssues.map((item) => item.departmentName))], [initialIssues]);
  const warehouses = useMemo(() => [...new Set(initialIssues.map((item) => item.warehouseName))], [initialIssues]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("th");
    return initialIssues.filter((item) => {
      const matchesQuery = !keyword || [item.issueNumber, item.requesterName, item.departmentName, item.workPoint, item.reason]
        .some((value) => value.toLocaleLowerCase("th").includes(keyword));
      return matchesQuery
        && (!startDate || item.documentDate >= startDate)
        && (!endDate || item.documentDate <= endDate)
        && (department === "all" || item.departmentName === department)
        && (warehouse === "all" || item.warehouseName === warehouse)
        && (status === "all" || item.status === status);
    });
  }, [department, endDate, initialIssues, query, startDate, status, warehouse]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const mobileRows = visible.map((item) => ({
    details: [
      { label: "ผู้เบิก", value: item.requesterName },
      { label: "แผนก", value: item.departmentName },
      { label: "งาน / จุดใช้งาน", value: item.workPoint },
      { label: "คลังจ่าย", value: item.warehouseName },
      { label: "วันที่", value: formatDisplayDate(item.documentDate) },
      { label: "จำนวน", value: `${item.itemCount} รายการ` },
    ],
    id: item.id,
    meta: `${item.warehouseName} · ${item.itemCount} รายการ`,
    status: <IssueStatus status={item.status} />,
    subtitle: item.requesterName,
    title: item.issueNumber,
  }));

  const openDetail = async (issue: StockIssueRecord) => {
    setLoadingId(issue.id);
    const result = await getStockIssueDetailAction(issue.id);
    setLoadingId(null);
    if (!("data" in result) || !result.data) return void toast.error(result.error ?? "ไม่สามารถโหลดรายละเอียดใบเบิกได้");
    setDetail(result.data);
  };

  const exportExcel = () => {
    const rows = [
      ["เลขที่ใบเบิก", "วันที่", "ผู้เบิก", "แผนก", "งาน / จุดใช้งาน", "คลังจ่าย", "จำนวนรายการ", "สถานะ"],
      ...filtered.map((item) => [item.issueNumber, item.documentDate, item.requesterName, item.departmentName, item.workPoint, item.warehouseName, item.itemCount, item.status === "posted" ? "บันทึกแล้ว" : "ยกเลิก"]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.join("\t")).join("\n")], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `Stock_Issues_${startDate}_${endDate}.xls`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="issue-page-shell flex min-h-[calc(100dvh-116px)] min-w-0 flex-col gap-2.5 text-on-surface">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-bold leading-7">ใบเบิกใช้สินค้า</h1>
          <p className="text-[12px] text-secondary">บันทึกการเบิกใช้สินค้าจากคลัง พร้อมแนะนำ FIFO และยืนยัน Lot ที่จ่ายจริง</p>
        </div>
        <div className="issue-page-actions flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-4 text-[13px] font-bold" onClick={() => setRequestFormOpen(true)} type="button"><FileText size={17} />แบบฟอร์มขอเบิก A5</button>
          {canCreate ? <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] bg-primary px-5 text-[14px] font-bold text-white" onClick={() => setCreateOpen(true)} type="button"><Plus size={18} />สร้างใบเบิก</button> : null}
          <ExcelExportButton onClick={exportExcel} />
        </div>
      </header>

      <MobileListFilters
        activeCount={(startDate ? 1 : 0) + (endDate ? 1 : 0) + (department === "all" ? 0 : 1) + (warehouse === "all" ? 0 : 1) + (status === "all" ? 0 : 1)}
        onClear={() => { setStartDate(""); setEndDate(""); setDepartment("all"); setWarehouse("all"); setStatus("all"); setPage(1); }}
        search={<ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่ใบเบิก, ผู้เบิก, แผนก, งาน..." value={query} />}
      >
        <ListDateRangeFilter label="วันที่เบิก" endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
        <ListFilterSelect label="แผนก" onChange={(value) => { setDepartment(value); setPage(1); }} value={department}><option value="all">ทั้งหมด</option>{departments.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="คลังจ่าย" onChange={(value) => { setWarehouse(value); setPage(1); }} value={warehouse}><option value="all">ทั้งหมด</option>{warehouses.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิก</option></ListFilterSelect>
      </MobileListFilters>

      <ListFilterToolbar className="hidden md:grid md:grid-cols-2 xl:grid-cols-4">
        <ListSearchField className="md:col-span-2 xl:col-span-4" onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่ใบเบิก, ผู้เบิก, แผนก, งาน..." value={query} />
        <ListDateRangeFilter label="วันที่เบิก" endValue={endDate} minEnd={startDate || undefined} onEndChange={(value) => { setEndDate(value); setPage(1); }} onStartChange={(value) => { setStartDate(value); setPage(1); }} startValue={startDate} />
        <ListFilterSelect label="แผนก" onChange={(value) => { setDepartment(value); setPage(1); }} value={department}><option value="all">ทั้งหมด</option>{departments.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="คลังจ่าย" onChange={(value) => { setWarehouse(value); setPage(1); }} value={warehouse}><option value="all">ทั้งหมด</option>{warehouses.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิก</option></ListFilterSelect>
      </ListFilterToolbar>

      <div className="issue-list-frame hidden flex-1 overflow-hidden rounded-[3px] border bg-surface-container-lowest md:block">
        <div className="overflow-x-auto">
          <table className="erp-data-table min-w-[980px]">
            <thead className="h-9 bg-surface-container-low text-[11px] font-bold"><tr><th className="w-[13%] text-left">เลขที่ใบเบิก</th><th className="w-[11%] text-center">วันที่</th><th className="w-[17%] text-left">ผู้เบิก</th><th className="w-[21%] text-left">แผนก / งาน</th><th className="w-[14%] text-left">คลังจ่าย</th><th className="w-[10%] text-center">จำนวนรายการ</th><th className="w-[9%] text-center">สถานะ</th><th className="w-[5%] text-center">จัดการ</th></tr></thead>
            <tbody className="divide-y divide-outline-variant text-[12px]">
              {visible.map((item) => <tr className="h-9 hover:bg-surface-container-low/60" key={item.id}>
                <td className="font-bold text-primary">{item.issueNumber}</td><td className="text-center">{formatDisplayDate(item.documentDate)}</td><td>{item.requesterName}</td>
                <td><strong className="block font-semibold">{item.departmentName}</strong><span className="text-[11px] text-secondary">{item.workPoint}</span></td>
                <td>{item.warehouseName}</td><td className="text-center font-semibold">{item.itemCount}</td><td className="text-center"><IssueStatus status={item.status} /></td>
                <td><button aria-label="ดูเอกสาร" className="mx-auto flex items-center gap-1 text-[11px] font-bold text-blue-700" disabled={loadingId === item.id} onClick={() => openDetail(item)}>{loadingId === item.id ? <Loader2 className="animate-spin" size={15} /> : <><Eye size={15} />ดู</>}</button></td>
              </tr>)}
              {visible.length === 0 && <tr><td className="h-28 text-center text-secondary" colSpan={8}>ไม่พบรายการใบเบิก</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <MobileDocumentList
        actions={(mobileRow, close) => {
          const item = visible.find((row) => row.id === mobileRow.id);
          return item ? <button className="mobile-sheet-primary" onClick={() => { close(); void openDetail(item); }} type="button"><Eye size={18} />เปิดเอกสาร</button> : null;
        }}
        emptyText="ไม่พบรายการใบเบิก"
        rows={mobileRows}
      />

      <Pagination currentPage={currentPage} onPageChange={setPage} pageSize={pageSize} totalItems={filtered.length} totalPages={totalPages} />
      {createOpen && <CreateIssueModal documentContext={documentContext} onClose={() => setCreateOpen(false)} />}
      {requestFormOpen && <BlankIssueRequestPreview documentContext={documentContext} onClose={() => setRequestFormOpen(false)} />}
      {detail && <IssueDetail detail={detail} documentContext={documentContext} onChange={setDetail} onClose={() => setDetail(null)} />}

      <style>{`
        
        .issue-filter { position: relative; display: flex; min-height: 42px; flex-direction: column; justify-content: center; border: 1px solid var(--issue-border); border-radius: 3px; background: var(--color-surface-container-lowest); padding: 3px 10px; }
        .issue-filter > span { font-size: 10px; line-height: 12px; color: var(--color-secondary); }
        .issue-filter select, .issue-filter input { min-width: 0; flex: 1; background: transparent; font-size: 12px; font-weight: 600; outline: none; }
        .issue-page-shell input, .issue-page-shell select, .issue-list-frame, .issue-mobile-card { border-color: var(--issue-border); }
        .issue-list-frame .erp-data-table th, .issue-list-frame .erp-data-table td { border-color: var(--issue-border); padding-left: 10px; padding-right: 10px; }
        .issue-page-actions > button:not(:first-child) { border-color: var(--issue-border) !important; color: var(--color-on-surface) !important; }
      `}</style>
    </section>
  );
}

function CreateIssueModal({ documentContext, onClose }: { documentContext: CompanyDocumentContext; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<StockIssueFormOptions | null>(null);
  const [documentDate, setDocumentDate] = useState(todayIso);
  const [reservation, setReservation] = useState({ date: "", number: "", error: "" });
  const [reservationVersion, setReservationVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void reserveBusinessNumberAction("IS", documentDate).then((result) => {
      if (active) setReservation(result.success ? { date: documentDate, number: result.number, error: "" } : { date: documentDate, number: "", error: result.error });
    });
    return () => { active = false; };
  }, [documentDate, reservationVersion]);
  const [requesterName, setRequesterName] = useState("");
  const [departmentId, setDepartmentId] = useState(0);
  const [workPoint, setWorkPoint] = useState("");
  const [warehouseId, setWarehouseId] = useState(0);
  const [reason, setReason] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [allocationItemId, setAllocationItemId] = useState<number | null>(null);
  const [savedIssueNumber, setSavedIssueNumber] = useState<string | null>(null);
  const [savedDetail, setSavedDetail] = useState<Detail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const allocationLine = lines.find((line) => line.id === allocationItemId);
  const actions = getStockIssueCreateActions(savedIssueNumber);

  useEffect(() => {
    getStockIssueFormOptionsAction().then((result) => {
      setLoading(false);
      if (!("data" in result) || !result.data) return void toast.error(result.error ?? "ไม่สามารถโหลดข้อมูลได้");
      const loaded = result.data;
      setOptions(loaded);
      setRequesterName(loaded.requesterName);
      setDepartmentId(loaded.departments[0]?.id ?? 0);
      setWarehouseId(loaded.warehouses[0]?.id ?? 0);
    });
  }, []);

  useEffect(() => {
    if (!warehouseId || loading) return;
    const timer = window.setTimeout(async () => {
      const result = await getStockIssueFormOptionsAction(warehouseId, "");
      if ("data" in result && result.data) {
        setOptions((current) => current ? { ...current, items: result.data!.items } : result.data!);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loading, warehouseId]);

  const candidates = useMemo(() => {
    return (options?.items ?? []).filter((item) => item.warehouseId === warehouseId && !lines.some((line) => line.id === item.id));
  }, [lines, options, warehouseId]);
  const totalQuantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const summaryUnit = lines.length > 0 && lines.every((line) => line.unitName === lines[0].unitName) ? lines[0].unitName : "หน่วย";
  const displayRows = useMemo(() => expandDraftRows(lines, Boolean(options?.canViewCost)), [lines, options?.canViewCost]);
  const totalAmount = displayRows.length > 0 && displayRows.every((row) => row.amount !== null)
    ? displayRows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
    : null;
  const updateLineQuantity = (line: DraftLine, value: string) => {
    const quantity = Number(value);
    if (value && (!Number.isFinite(quantity) || quantity < 0 || quantity > line.onHandQty)) {
      toast.error(`จำนวนเบิกต้องอยู่ระหว่าง 0 ถึง ${formatIssueQuantity(line.onHandQty)} ${line.unitName}`);
      return;
    }
    setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: value, allocations: undefined, fifoOverrideReason: undefined } : item));
  };
  const addLines = (selected: StockIssueFormOptions["items"]) => {
    setLines((current) => [...current, ...selected.map((item) => ({ ...item, quantity: "" }))]);
    setShowResults(false);
    if (selected[0]) focusKeyboardTarget(`issue-quantity-${selected[0].id}`);
  };

  const save = () => {
    if (reservation.date !== documentDate || !reservation.number) return toast.error(reservation.error || "กำลังจองเลขที่ใบเบิก กรุณารอสักครู่");
    if (lines.some((line) => line.trackingMethod === "lot" && !line.allocations?.length)) return toast.error("กรุณายืนยัน Lot ที่หยิบจริงให้ครบทุกรายการ");
    const draft = {
      documentDate, requesterName, departmentId, workPoint, warehouseId, reason,
      issueNumber: reservation.number,
      items: lines.map((line) => ({ itemMasterId: line.id, quantity: Number(line.quantity), onHandQty: line.onHandQty, allocations: line.allocations, fifoOverrideReason: line.fifoOverrideReason })),
    };
    const error = validateStockIssueDraft(draft);
    if (error) return toast.error(error);
    startTransition(async () => {
      const result = await postStockIssueAction(draft);
      if (!("success" in result) || !result.issueNumber || !result.id) {
        toast.error(("error" in result && result.error) || "บันทึกใบเบิกไม่สำเร็จ");
        return;
      }
      toast.success(`บันทึกใบเบิก ${result.issueNumber} แล้ว`);
      setSavedIssueNumber(result.issueNumber);
      const detailResult = await getStockIssueDetailAction(result.id);
      if ("data" in detailResult && detailResult.data) setSavedDetail(detailResult.data);
      else toast.error("บันทึกแล้ว แต่ยังโหลดข้อมูลสำหรับพิมพ์ไม่ได้");
      router.refresh();
    });
  };

  const createNext = () => {
    setSavedIssueNumber(null);
    setSavedDetail(null);
    setLines([]);
    setWorkPoint("");
    setReason("");
    setReservation({ date: "", number: "", error: "" });
    setReservationVersion((current) => current + 1);
  };

  return <div aria-label="สร้างใบเบิกใช้สินค้า" aria-modal="true" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:p-4" role="dialog">
    <div className="issue-create-modal flex max-h-[100dvh] w-full max-w-[1080px] flex-col overflow-hidden bg-surface-container-lowest shadow-2xl sm:max-h-[94dvh] sm:rounded-[3px] sm:border">
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3"><CompanyFormLogo/><span className="h-8 w-px bg-outline-variant"/><h2 className="text-[20px] font-bold">สร้างใบเบิกใช้สินค้า</h2></div>
        <button aria-label="ปิด" onClick={onClose} type="button"><X size={22} /></button>
      </header>

      {loading ? <div className="grid min-h-72 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : <fieldset className="min-h-0 overflow-y-auto border-0 p-3" disabled={!actions.canSave}>
        <section className="issue-create-section">
          <h3><ChevronRight size={15} />ข้อมูลเอกสาร</h3>
          <div className="issue-document-grid grid gap-x-4 gap-y-2 px-3 py-2">
            <label className="issue-field"><span>เลขที่ใบเบิก</span><input readOnly value={reservation.date === documentDate ? reservation.number || reservation.error : "กำลังจองเลข..."} /></label>
            <label className="issue-field"><span>วันที่เบิก <b>*</b></span><input onChange={(event) => setDocumentDate(event.target.value)} type="date" value={documentDate} /></label>
            <label className="issue-field issue-field-wide"><span>ผู้เบิก <b>*</b></span><textarea className="issue-requester-field" rows={1} wrap="off" aria-label="ผู้เบิก" title="กรอกชื่อผู้เบิกได้ โดยเริ่มต้นจากชื่อผู้เข้าสู่ระบบ" placeholder="กรอกชื่อผู้เบิก" maxLength={150} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }} onChange={(event) => setRequesterName(event.target.value.replace(/[\r\n]+/g, " "))} value={requesterName} /></label>
            <label className="issue-field"><span>แผนก <b>*</b></span><select onChange={(event) => setDepartmentId(Number(event.target.value))} value={departmentId}><option value={0}>เลือกแผนก</option>{options?.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="issue-field"><span>คลังจ่าย <b>*</b></span><select onChange={(event) => { setWarehouseId(Number(event.target.value)); setLines([]); }} value={warehouseId}><option value={0}>เลือกคลังจ่าย</option>{options?.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="issue-field issue-field-wide"><span>งาน / จุดใช้งาน <b>*</b></span><textarea className="issue-requester-field" rows={1} wrap="off" maxLength={200} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault(); }} onChange={(event) => setWorkPoint(event.target.value.replace(/[\r\n]+/g, " "))} placeholder="เช่น งานขึ้นรูป" value={workPoint} /></label>
          </div>
        </section>

        <section className="issue-create-section mt-2">
          <h3><ChevronRight size={15} />รายการสินค้า</h3>
          {showResults && <ItemPicker context={`ใบเบิกสินค้า · ${options?.warehouses.find((row) => row.id === warehouseId)?.name ?? "คลังจ่าย"}`} emptyText="ไม่พบสินค้าคงเหลือในคลังนี้" items={candidates.map((item) => ({ id: `${item.id}:${item.warehouseId}`, code: item.code, name: item.name, unit: item.unitName, searchText: item.name, value: item }))} columns={[{ key: "balance", label: "คงเหลือ", className: "text-right", render: (item) => formatIssueQuantity(item.value.onHandQty) }]} onClose={() => setShowResults(false)} onConfirm={addLines} />}

          <div className="issue-entry-scroll overflow-x-auto">
            <table className="issue-entry-table text-[12px]"><colgroup><col style={{ width: 44 }} /><col style={{ width: 92 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 62 }} />{options?.canViewCost && <><col style={{ width: 108 }} /><col style={{ width: 112 }} /></>}<col style={{ width: 38 }} /></colgroup>
              <thead><tr><th>ลำดับ</th><th>รหัสสินค้า</th><th className="text-left">สินค้า / รายการ</th><th>Lot</th><th>จำนวนเบิก</th><th>หน่วย</th>{options?.canViewCost && <><th>ต้นทุน/หน่วย</th><th>จำนวนเงิน</th></>}<th aria-label="จัดการ" /></tr></thead>
              <tbody>{displayRows.map((row, index) => <tr key={row.key}><td className="text-center">{index + 1}</td><td className="font-bold">{row.line.code}</td><td className="issue-product-name font-medium">{row.line.name}</td><td className="text-center">{row.lotId ? <button className="issue-lot-text" onClick={() => setAllocationItemId(row.line.id)} type="button">{formatIssueLotNumber(row.lotNumber)}</button> : row.line.trackingMethod === "lot" ? <button className="issue-select-lot-button" onClick={() => setAllocationItemId(row.line.id)} type="button">เลือก Lot</button> : "—"}</td><td className="text-center">{row.lotId ? formatIssueQuantity(row.quantity) : <input aria-label={`จำนวนเบิก ${row.line.code}`} className={`${inputClass} text-center`} data-keyboard-target={`issue-quantity-${row.line.id}`} max={row.line.onHandQty} min="0" onChange={(event) => updateLineQuantity(row.line, event.target.value)} onKeyDown={(event) => { if (row.line.trackingMethod === "lot") runEnterAction(event, () => setAllocationItemId(row.line.id)); }} step="any" type="number" value={row.line.quantity} />}</td><td className="text-center">{row.line.unitName}</td>{options?.canViewCost && <><td className="text-right">{formatIssueMoney(row.unitCost)}</td><td className="text-right font-semibold">{formatIssueMoney(row.amount)}</td></>}<td><button aria-label={`ลบ ${row.line.code}`} className="mx-auto block text-red-600" onClick={() => setLines((current) => current.filter((item) => item.id !== row.line.id))} type="button"><Trash2 size={15} /></button></td></tr>)}</tbody>
              {displayRows.length > 0 && <tfoot><tr><td colSpan={4} className="text-right font-bold">รวมทั้งสิ้น</td><td className="text-center font-bold">{formatIssueQuantity(totalQuantity)}</td><td />{options?.canViewCost && <><td /><td className="text-right font-bold">{formatIssueMoney(totalAmount)}</td></>}<td /></tr></tfoot>}
            </table>
            <div className="issue-entry-mobile-list">{displayRows.map((row, index) => <article key={row.key} className="issue-entry-mobile-row">
              <div className="issue-entry-mobile-title"><span>{index + 1}</span><strong>{row.line.code}</strong><button aria-label={`ลบ ${row.line.code}`} onClick={() => setLines((current) => current.filter((item) => item.id !== row.line.id))} type="button"><Trash2 size={16} /></button></div>
              <p>{row.line.name}</p>
              <dl><div><dt>Lot</dt><dd>{row.lotId ? <button className="issue-lot-text" onClick={() => setAllocationItemId(row.line.id)} type="button">{formatIssueLotNumber(row.lotNumber)}</button> : row.line.trackingMethod === "lot" ? <button className="issue-select-lot-button" onClick={() => setAllocationItemId(row.line.id)} type="button">เลือก Lot</button> : "—"}</dd></div><div><dt>จำนวนเบิก</dt><dd>{row.lotId ? `${formatIssueQuantity(row.quantity)} ${row.line.unitName}` : <input aria-label={`จำนวนเบิก ${row.line.code}`} className={`${inputClass} text-center`} data-keyboard-target={`issue-quantity-${row.line.id}`} max={row.line.onHandQty} min="0" onChange={(event) => updateLineQuantity(row.line, event.target.value)} onKeyDown={(event) => { if (row.line.trackingMethod === "lot") runEnterAction(event, () => setAllocationItemId(row.line.id)); }} step="any" type="number" value={row.line.quantity} />}</dd></div>{options?.canViewCost && <><div><dt>ต้นทุน/หน่วย</dt><dd>{formatIssueMoney(row.unitCost)}</dd></div><div><dt>จำนวนเงิน</dt><dd>{formatIssueMoney(row.amount)}</dd></div></>}</dl>
            </article>)}</div>
            {lines.length === 0 && <div className="py-7 text-center text-[11px] text-secondary">ค้นหาและเลือกสินค้าที่ต้องการเบิก</div>}
          </div>
          <div className="px-2 py-2"><button className="issue-add-item" disabled={!warehouseId} onClick={() => setShowResults(true)} type="button"><Plus size={16} />เพิ่มรายการสินค้า</button></div>
        </section>
        <label className="block px-2 pb-2 pt-3 text-[14px]"><span className="mb-2 block">เหตุผลการเบิก (ไม่บังคับ)</span><textarea className="issue-requester-field" rows={2} maxLength={500} style={{ height: 76, lineHeight: "28px", whiteSpace: "pre-wrap", overflowY: "auto" }} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเพิ่มเติม (ถ้ามี)" value={reason} /></label>
      </fieldset>}

      <footer className="issue-create-footer flex shrink-0 flex-col gap-2 border-t px-2 py-2 sm:flex-row sm:items-center">
        <div className="issue-fifo-note"><Info size={18} />FIFO: ระบบแนะนำ Lot เก่าสุด</div>
        <div className="issue-footer-summary flex flex-1 items-center justify-center gap-2 text-[12px]"><strong>{lines.length} รายการ</strong><span>•</span><strong>{formatIssueQuantity(totalQuantity)} {summaryUnit}</strong>{options?.canViewCost && <><span>•</span><strong>{formatIssueMoney(totalAmount)} บาท</strong></>}</div>
        <div className="issue-footer-actions flex gap-2">
          <button className="issue-footer-button" onClick={onClose} type="button">{actions.canSave ? "ยกเลิก" : "ปิด"}</button>
          <button className="issue-footer-button" disabled={!savedDetail} onClick={() => setPreviewOpen(true)} type="button">พิมพ์</button>
          <button className="issue-footer-button" disabled={!actions.canCreateNext} onClick={createNext} type="button">สร้างใบถัดไป</button>
          {actions.canSave && <button className="issue-footer-save" disabled={isPending || loading} onClick={save} type="button">{isPending ? <Loader2 className="mx-auto animate-spin" size={18} /> : "บันทึกใบเบิก"}</button>}
        </div>
      </footer>
    </div>
    {allocationLine && <LotAllocationDialog code={allocationLine.code} name={allocationLine.name} quantity={Number(allocationLine.quantity)} unitName={allocationLine.unitName} lots={allocationLine.lots} allocations={allocationLine.allocations} reason={allocationLine.fifoOverrideReason} onClose={() => setAllocationItemId(null)} onConfirm={(allocations, fifoOverrideReason, quantity) => { setLines((current) => current.map((line) => line.id === allocationLine.id ? { ...line, allocations, fifoOverrideReason, quantity: String(quantity) } : line)); setAllocationItemId(null); }} />}
    {previewOpen && savedDetail && <IssuePreview detail={savedDetail} documentContext={documentContext} onClose={() => setPreviewOpen(false)} />}
    <style>{`
      .issue-create-modal { border-color: var(--issue-border); }
      .issue-create-modal header, .issue-create-modal footer, .issue-create-modal table tr, .issue-create-modal table td, .issue-create-modal table th, .issue-create-modal input, .issue-create-modal select, .issue-create-modal .border, .issue-create-modal .border-b, .issue-create-modal .border-t { border-color: var(--issue-border); }
      .issue-create-section { position: relative; overflow: visible; }
      .issue-create-section > h3 { display: flex; height: 36px; align-items: center; gap: 3px; background: var(--surface-container-color); color: var(--on-surface-color); padding: 0 8px; font-size: 14px; font-weight: 700; }
      .issue-create-section > h3 svg { color: var(--color-primary); }
      .issue-document-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .issue-field { display: grid; min-width: 0; grid-template-columns: 120px minmax(0, 1fr); align-items: center; gap: 8px; font-size: 14px; font-weight: 500; line-height: 20px; }
      .issue-reason-field { grid-column: 1 / -1; }
      .issue-field b { color: var(--color-primary); }
      .issue-field input, .issue-field select { box-sizing: border-box; height: 42px; width: 100%; border: 1px solid var(--issue-border); border-radius: 3px; background: var(--color-surface-container-lowest); padding: 0 10px; line-height: normal; font-family: inherit; font-size: 14px; font-weight: 400; outline: none; }
      .issue-field input:focus, .issue-field select:focus { border-color: var(--color-primary); }
      .issue-create-modal .issue-requester-field { box-sizing: border-box; display: block; resize: none; width: 100%; min-width: 0; height: 42px; margin: 0; padding: 3px 10px; border: 1px solid var(--issue-border); border-radius: 3px; background: var(--color-surface-container-lowest); color: var(--color-on-surface); font-family: inherit; font-size: 14px; font-weight: 400; line-height: 34px; white-space: pre; overflow-x: auto; overflow-y: hidden; outline: none; }
      .issue-create-modal .issue-requester-field:focus { border-color: var(--color-primary); }
      .issue-field input:disabled { background: var(--color-surface-container-low); color: var(--color-secondary); }
      .issue-create-modal table tbody tr { border-top: 1px solid var(--issue-border); }
      main .issue-create-modal table.issue-entry-table { table-layout: fixed !important; width: 100% !important; min-width: 790px; border-collapse: collapse; font-size: 12px; }
      .issue-create-modal .issue-entry-table th, .issue-create-modal .issue-entry-table td { border: 1px solid var(--issue-border); padding: 8px 7px; line-height: 1.5; vertical-align: middle; }
      .issue-create-modal .issue-entry-table th { background: var(--surface-container-low-color); font-size: 11px; font-weight: 700; text-align: center; white-space: nowrap; }
      .issue-create-modal .issue-entry-table td:nth-child(1) { padding-left: 4px; padding-right: 4px; }
      .issue-create-modal .issue-entry-table .issue-product-name { white-space: normal; overflow-wrap: normal; text-wrap: balance; }
      .issue-create-modal .issue-entry-table td:not(.issue-product-name) { white-space: nowrap; }
      .issue-create-modal .issue-entry-table tfoot td { background: var(--surface-container-low-color); font-weight: 700; }
      .issue-create-modal .issue-lot-text { color: var(--on-surface-color); font-weight: 600; white-space: nowrap; }
      .issue-create-modal .issue-lot-text:hover { color: var(--issue-accent); text-decoration: underline; }
      .issue-entry-mobile-list { display: none; }
      .issue-create-modal .issue-entry-table input { line-height: 1.7; padding-top: 4px; padding-bottom: 4px; }
      .issue-create-modal .issue-field { line-height: 1.7; }
      .issue-create-modal .issue-field input, .issue-create-modal .issue-field select { min-height: 42px; }
      .issue-create-modal .issue-item-search-cell input { min-height: 40px; line-height: 1.7; }
      .issue-item-results { position: relative !important; inset: auto !important; margin: 8px; }
       .issue-create-modal table input { height: 34px; } .issue-create-modal table td { padding-top: 8px; padding-bottom: 8px; }
      .issue-item-search-cell { position: relative; padding-left: 0; font-weight: 400; color: var(--color-secondary); }
      .issue-item-search-cell svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; }
      .issue-item-search-cell input { box-sizing: border-box; height: 31px; width: 100%; border: 0; background: transparent; padding: 0 8px 0 38px !important; font-size: 13px; outline: none; }
      .issue-item-results { top: 61px; border-color: var(--issue-border); }
      .issue-add-item { display: inline-flex; height: 32px; align-items: center; gap: 5px; border: 1px solid var(--issue-border); border-radius: 3px; padding: 0 11px; color: var(--issue-accent); font-size: 11px; font-weight: 700; }
      .issue-create-footer { border-color: var(--issue-border); background: var(--surface-container-lowest-color); color: var(--on-surface-color); }
      .issue-fifo-note { display: flex; align-items: center; gap: 6px; color: var(--issue-info-text); font-size: 12px; white-space: nowrap; }
      .issue-footer-button, .issue-footer-save { display: inline-flex; height: 40px; align-items: center; justify-content: center; gap: 5px; border-radius: 3px; padding: 0 17px; font-size: 12px; font-weight: 700; white-space: nowrap; }
      .issue-footer-button { border: 1px solid var(--issue-border); background: var(--surface-container-lowest-color); }
      .issue-footer-save { min-width: 124px; border: 1px solid var(--issue-accent); background: var(--issue-accent); color: white; }
      .issue-footer-button:disabled { cursor: not-allowed; background: var(--surface-container-low-color); color: var(--color-secondary); opacity: .55; }
      .issue-create-modal fieldset:disabled { color: inherit; }
      @media (max-width: 900px) { .issue-create-modal .issue-document-grid { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 10px 2px; gap: 10px; } .issue-create-modal .issue-field { grid-template-columns: minmax(0,1fr); gap: 4px; align-content: start; font-size: 13px; } .issue-create-modal .issue-field-wide { grid-column: 1 / -1; } .issue-create-modal .issue-field > span { min-height: 23px; } .issue-create-modal .issue-field input, .issue-create-modal .issue-field select, .issue-create-modal .issue-field textarea { min-width: 0; max-width: 100%; font-size: 13px; } }
      @media (max-width: 900px) {
        .issue-create-modal { height: 100dvh; }
        .issue-create-modal h2 { font-size: 18px; }
        .issue-entry-scroll { overflow: visible; }
        .issue-entry-table { display: none; }
        .issue-entry-mobile-list { display: grid; gap: 8px; padding: 8px; }
        .issue-entry-mobile-row { border: 1px solid var(--issue-border); border-radius: 3px; padding: 9px; background: var(--surface-container-lowest-color); }
        .issue-entry-mobile-title { display: grid; grid-template-columns: 22px 1fr 28px; align-items: center; color: var(--issue-accent); }
        .issue-entry-mobile-title button { justify-self: end; color: var(--issue-accent); }
        .issue-entry-mobile-row > p { margin: 5px 0 8px 22px; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
        .issue-entry-mobile-row dl { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px 12px; margin-left: 22px; }
        .issue-entry-mobile-row dl > div { min-width: 0; }
        .issue-entry-mobile-row dt { color: var(--color-secondary); font-size: 10px; }
        .issue-entry-mobile-row dd { margin: 1px 0 0; min-width: 0; font-size: 12px; font-weight: 600; }
        .issue-entry-mobile-row input { height: 34px; }
        .issue-create-footer { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
        .issue-fifo-note { width: 100%; }
        .issue-footer-summary { flex-wrap: wrap; }
        .issue-footer-actions { width: 100%; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
        .issue-footer-actions button { padding: 0 8px; }
        .issue-footer-save { grid-column: 1 / -1; }
      }
    `}</style>
  </div>;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function IssueDetail({ detail, documentContext, onChange, onClose }: { detail: Detail; documentContext: CompanyDocumentContext; onChange: (detail: Detail) => void; onClose: () => void }) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const totalAmount = detail.items.length > 0 && detail.items.every((item) => item.amount !== null) ? detail.items.reduce((sum, item) => sum + (item.amount ?? 0), 0) : null;
  const history = buildStockIssueHistory({
    createdAt: detail.header.createdAt,
    createdByName: detail.header.requesterName,
    cancelledAt: detail.header.cancelledAt,
    cancelledByName: detail.header.cancelledByName,
    cancellationReason: detail.header.cancellationReason,
    reversalNumber: detail.header.reversalNumber,
  });

  const cancel = async (reason: string) => {
    setCancelling(true);
    const result = await cancelStockIssueAction(detail.header.id, reason);
    setCancelling(false);
    if (!("success" in result)) return void toast.error(result.error);
    const reversalNumber = result.reversalNumber || "—";
    onChange({ ...detail, header: { ...detail.header, status: "cancelled", cancellationReason: reason.trim().replace(/\s+/g, " "), cancelledAt: new Date().toISOString(), cancelledByName: "ผู้ใช้งานปัจจุบัน", reversalNumber } });
    setCancelOpen(false);
    toast.success(`ยกเลิกใบเบิกและคืนสต็อกแล้ว · ${reversalNumber}`);
    router.refresh();
  };

  return <div aria-label={`รายละเอียดใบเบิก ${detail.header.issueNumber}`} aria-modal="true" className="issue-detail-overlay" role="dialog">
    <section className="issue-detail-panel">
      <header className="issue-detail-header"><div><span>คลังสินค้า › ใบเบิกใช้สินค้า</span><div className="flex items-center gap-3"><h2>รายละเอียดใบเบิกใช้สินค้า</h2><IssueStatus status={detail.header.status} /></div></div><div className="issue-detail-actions"><button onClick={() => setPreviewOpen(true)} type="button"><Eye size={16} />Preview / PDF</button><button onClick={() => setPreviewOpen(true)} type="button"><Printer size={16} />พิมพ์</button>{detail.canCancel && detail.header.status === "posted" && <button className="danger" onClick={() => setCancelOpen(true)} type="button"><Ban size={16} />ยกเลิกใบเบิก</button>}<button aria-label="ปิด" className="close" onClick={onClose} type="button"><X size={21} /></button></div></header>
      <div className="issue-detail-body">
        <dl className="issue-detail-meta"><div><dt>เลขที่เอกสาร</dt><dd>{detail.header.issueNumber}</dd></div><div><dt>วันที่</dt><dd>{formatDisplayDate(detail.header.documentDate)}</dd></div><div><dt>ผู้เบิก</dt><dd>{detail.header.requesterName}</dd></div><div><dt>แผนก</dt><dd>{detail.header.departmentName}</dd></div><div><dt>งาน / จุดใช้งาน</dt><dd>{detail.header.workPoint}</dd></div><div><dt>คลังจ่าย</dt><dd>{detail.header.warehouseName}</dd></div><div><dt>เหตุผลการเบิก</dt><dd>{detail.header.reason || "—"}</dd></div>{detail.header.reversalNumber && <div><dt>เอกสารคืนสต็อก</dt><dd className="text-primary">{detail.header.reversalNumber}</dd></div>}</dl>
        <div className="issue-detail-table-wrap"><table className="issue-detail-table"><thead><tr><th>ลำดับ</th><th>รหัสสินค้า</th><th>สินค้า / รายการ</th><th>Lot</th><th>จำนวนเบิก</th><th>หน่วย</th>{detail.canViewCost && <><th>ต้นทุน/หน่วย</th><th>จำนวนเงิน</th></>}</tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.lineNo}</td><td>{item.itemCode}</td><td className="product">{item.itemName}</td><td>{formatIssueLotNumber(item.lotNumber)}</td><td>{formatIssueQuantity(item.quantity)}</td><td>{item.unitName}</td>{detail.canViewCost && <><td>{formatIssueMoney(item.unitCost)}</td><td>{formatIssueMoney(item.amount)}</td></>}</tr>)}</tbody><tfoot><tr><td colSpan={4}>รวม {detail.items.length} รายการ</td><td>{formatIssueQuantity(detail.items.reduce((sum, item) => sum + item.quantity, 0))}</td><td>หน่วย</td>{detail.canViewCost && <><td /><td>{formatIssueMoney(totalAmount)}</td></>}</tr></tfoot></table></div>
        <section className="issue-detail-history"><h3>ประวัติเอกสาร</h3><div className="issue-detail-table-wrap"><table><thead><tr><th>ลำดับ</th><th>วันที่ / เวลา</th><th>เหตุการณ์</th><th>ผู้ดำเนินการ</th><th>หมายเหตุ</th></tr></thead><tbody>{history.map((row, index) => <tr key={`${row.at}-${row.event}`}><td>{index + 1}</td><td>{formatHistoryDate(row.at)}</td><td>{row.event}</td><td>{row.actor}</td><td>{row.note}</td></tr>)}</tbody></table></div></section>
      </div>
    </section>
    {previewOpen && <IssuePreview detail={detail} documentContext={documentContext} onClose={() => setPreviewOpen(false)} />}
    {cancelOpen && <IssueCancellationModal detail={detail} isPending={cancelling} onClose={() => setCancelOpen(false)} onConfirm={cancel} />}
  </div>;
}

function IssueCancellationModal({ detail, isPending, onClose, onConfirm }: { detail: Detail; isPending: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const valid = reason.trim().replace(/\s+/g, " ").length >= 10;
  return <div aria-label={`ยกเลิกใบเบิก ${detail.header.issueNumber}`} aria-modal="true" className="issue-cancel-overlay" role="dialog"><section className="issue-cancel-modal">
    <header><h2>ยกเลิกใบเบิก {detail.header.issueNumber}</h2><button aria-label="ปิด" disabled={isPending} onClick={onClose} type="button"><X size={20} /></button></header>
    <div className="issue-cancel-body"><div className="issue-cancel-warning"><Info size={20} /><span>เมื่อยกเลิก สินค้าจะถูกคืนเข้าคลังตาม Lot เดิมและชั้นต้นทุนเดิม เอกสารต้นฉบับจะไม่สามารถแก้ไขได้อีก</span></div>
      <label><strong>เหตุผลในการยกเลิก <b>*</b></strong><textarea autoFocus maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร" value={reason} /></label>
      <h3>รายการสินค้าที่จะคืนเข้าคลัง</h3><div className="issue-detail-table-wrap issue-cancel-table"><table><thead><tr><th>ลำดับ</th><th>รหัสสินค้า</th><th>สินค้า / รายการ</th><th>Lot</th><th>จำนวนคืน</th><th>หน่วย</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.lineNo}</td><td>{item.itemCode}</td><td className="product">{item.itemName}</td><td>{formatIssueLotNumber(item.lotNumber)}</td><td>{formatIssueQuantity(item.quantity)}</td><td>{item.unitName}</td></tr>)}</tbody></table></div>
      <label className="issue-cancel-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>ข้าพเจ้ายืนยันว่าต้องการยกเลิกใบเบิกนี้ และคืนสต็อกตามรายการข้างต้น</span></label>
    </div><footer><button disabled={isPending} onClick={onClose} type="button">ไม่ยกเลิก</button><button className="primary" disabled={isPending || !confirmed || !valid} onClick={() => onConfirm(reason)} type="button">{isPending ? "กำลังคืนสต็อก..." : "ยืนยันยกเลิกและคืนสต็อก"}</button></footer>
  </section></div>;
}

function BlankIssueRequestPreview({ documentContext, onClose }: { documentContext: CompanyDocumentContext; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);
  const output = async (pdf: boolean) => {
    if (!printRootRef.current) return;
    setBusy(true);
    try {
      const options = { paperSize: "A5" as const, orientation: "landscape" as const, styles: [".issue-request-print-root{margin:0!important;box-shadow:none!important}"] };
      if (pdf) await exportElementPdf(printRootRef.current, { ...options, filename: "แบบฟอร์มใบขอเบิกสินค้า-A5-8รายการ" });
      else await printElement(printRootRef.current, { ...options, title: "พิมพ์แบบฟอร์มใบขอเบิกสินค้า" });
    } finally { setBusy(false); }
  };
  return <DocumentPreviewShell ariaLabel="ตัวอย่างแบบฟอร์มใบขอเบิกสินค้า A5" isBusy={busy} onClose={onClose} onExportPdf={() => output(true)} onPrint={() => output(false)} paperHeightMm={148} paperLabel="A5 (แนวนอน)" paperWidthMm={210} title="ตัวอย่างก่อนพิมพ์แบบฟอร์มใบขอเบิกสินค้า">
    <div className="issue-request-print-root" ref={printRootRef}><article className="issue-request-page"><CompanyDocumentHeader context={documentContext} priority /><section className="issue-request-heading"><h1>ใบขอเบิกสินค้า</h1><dl><div><dt>เลขที่</dt><dd>REQ________________</dd></div><div><dt>วันที่</dt><dd>____/____/________</dd></div></dl></section><section className="issue-request-fields"><span>ผู้ขอ</span><b>............................................................</b><span>แผนก</span><b>............................................................</b><span>งาน / จุดใช้งาน</span><b>............................................................</b></section><table><thead><tr>{["ลำดับ", "รหัสสินค้า", "สินค้า / รายการ", "จำนวนที่ขอ", "หน่วย", "หมายเหตุ"].map((label) => <th key={label}><span>{label}</span></th>)}</tr></thead><tbody>{getStockRequestLineNumbers().map((line) => <tr key={line}><td><span>{line}</span></td><td /><td /><td /><td /><td /></tr>)}</tbody></table><section className="issue-request-bottom"><div><strong>เหตุผลการเบิก</strong><p>................................................................................................................................................................................</p><div className="issue-request-signatures"><span><b>ผู้ขอ</b>(............................................)<small>วันที่ ____/____/________</small></span><span><b>ผู้อนุมัติ</b>(............................................)<small>วันที่ ____/____/________</small></span></div></div><aside><strong>สำหรับเจ้าหน้าที่คลัง</strong><span>เลขที่ใบเบิก ....................................</span><span>วันที่ ____/____/________</span><span>ผู้จ่าย .............................................</span></aside></section></article></div>
  </DocumentPreviewShell>;
}

function IssuePreview({ detail, documentContext, onClose }: { detail: Detail; documentContext: CompanyDocumentContext; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);
  const totalAmount = detail.items.length > 0 && detail.items.every((item) => item.amount !== null)
    ? detail.items.reduce((sum, item) => sum + (item.amount ?? 0), 0)
    : null;
  const print = async () => {
    if (!printRootRef.current) return;
    setBusy(true);
    try { await printElement(printRootRef.current, { title: detail.header.issueNumber, paperSize: "A4", orientation: "portrait", styles: [".issue-print-root{margin:0!important}.issue-print-page{box-shadow:none!important}"] }); }
    finally { setBusy(false); }
  };
  const pdf = async () => {
    if (!printRootRef.current) return;
    setBusy(true);
    try { await exportElementPdf(printRootRef.current, { filename: detail.header.issueNumber, paperSize: "A4", orientation: "portrait", styles: [".issue-print-root{margin:0!important}.issue-print-page{box-shadow:none!important}"] }); }
    finally { setBusy(false); }
  };

  return <>
    <DocumentPreviewShell ariaLabel={`ตัวอย่างใบเบิกใช้สินค้า ${detail.header.issueNumber}`} documentNumber={detail.header.issueNumber} isBusy={busy} onClose={onClose} onExportPdf={pdf} onPrint={print} paperHeightMm={297} paperLabel="A4 (แนวตั้ง)" paperWidthMm={210} statusDate={formatDisplayDate(detail.header.documentDate)} statusDescription="เอกสารถูกบันทึกและตัดจ่ายสินค้าแล้ว" statusLabel={detail.header.status === "cancelled" ? "ยกเลิกแล้ว" : "บันทึกแล้ว"} title="ตัวอย่างก่อนพิมพ์ใบเบิกใช้สินค้า">
    <div className="issue-print-root" ref={printRootRef}><article className="issue-print-page">
      <CompanyDocumentHeader context={documentContext} priority />
      <section className="issue-document-heading">
        <h1>ใบเบิกใช้สินค้า</h1>
        <dl><div><dt>เลขที่</dt><dd>{detail.header.issueNumber}</dd></div><div><dt>วันที่</dt><dd>{formatDisplayDate(detail.header.documentDate)}</dd></div></dl>
      </section>
      <section className="issue-print-meta"><dl><div><dt>ผู้เบิก</dt><dd>{detail.header.requesterName}</dd></div><div><dt>แผนก</dt><dd>{detail.header.departmentName}</dd></div><div><dt>งาน / จุดใช้งาน</dt><dd>{detail.header.workPoint}</dd></div><div><dt>คลังจ่าย</dt><dd>{detail.header.warehouseName}</dd></div></dl></section>
      <table className="issue-print-table"><thead><tr><th className="w-[6%]">ลำดับ</th><th className="w-[11%] text-left">รหัสสินค้า</th><th className="text-left">สินค้า / รายการ</th><th className="w-[16%]">Lot</th><th className="w-[10%] text-right">จำนวนเบิก</th><th className="w-[7%]">หน่วย</th>{detail.canViewCost && <><th className="w-[11%] text-right">ต้นทุน/หน่วย</th><th className="w-[12%] text-right">จำนวนเงิน</th></>}</tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.lineNo}</td><td className="text-left font-semibold">{item.itemCode}</td><td className="issue-print-product text-left">{item.itemName}</td><td>{formatIssueLotNumber(item.lotNumber)}</td><td className="text-right font-semibold">{formatIssueQuantity(item.quantity)}</td><td>{item.unitName}</td>{detail.canViewCost && <><td className="text-right">{formatIssueMoney(item.unitCost)}</td><td className="text-right font-semibold">{formatIssueMoney(item.amount)}</td></>}</tr>)}</tbody><tfoot><tr><td colSpan={4}>รวม {detail.items.length} รายการ</td><td className="text-right">{formatIssueQuantity(detail.items.reduce((sum, item) => sum + item.quantity, 0))}</td><td>หน่วย</td>{detail.canViewCost && <><td /><td className="text-right">{formatIssueMoney(totalAmount)}</td></>}</tr></tfoot></table>
      <section className="issue-print-reason"><strong>เหตุผลการเบิก</strong><span>{detail.header.reason || "-"}</span></section>
      <section className="issue-signatures">{["ผู้เบิก", "ผู้จ่าย", "ผู้รับ"].map((label) => <div key={label}><strong>{label}</strong><span>(........................................)</span><span>วันที่ ......../......../........</span></div>)}</section>
      <CompanyDocumentFooter
        context={documentContext}
        customNote={documentContext.documentSettings.footerTextTh}
        documentNumber={detail.header.issueNumber}
        placement="page"
        printedBy={detail.header.requesterName}
        variant="standard"
      />
    </article></div>
    </DocumentPreviewShell>
    <style>{`
      .issue-preview-overlay { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; background: rgba(20,20,20,.78); backdrop-filter: blur(4px); }
      .issue-preview-toolbar { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e4c9c9; background: #fff; padding: 8px 18px; color: #171717; }
      .issue-preview-toolbar > div:first-child > div { display: flex; flex-direction: column; }
      .issue-preview-toolbar strong { font-size: 15px; } .issue-preview-toolbar span { font-size: 11px; color: #666; }
      .issue-preview-secondary, .issue-preview-primary { display: inline-flex; height: 34px; align-items: center; gap: 6px; border-radius: 3px; padding: 0 14px; font-size: 12px; font-weight: 700; }
      .issue-preview-secondary { border: 1px solid #c80f1e; color: #c80f1e; } .issue-preview-primary { background: #c80f1e; color: white; }
      .issue-preview-scroll { flex: 1; overflow: auto; padding: 22px; }
      .issue-print-root { width: 210mm; margin: 0 auto; transform-origin: top center; }
      .issue-print-page { box-sizing: border-box; position: relative; display: flex; flex-direction: column; --document-footer-bottom: 3mm; --document-page-padding-inline: 12mm; margin: 0 auto; height: 297mm; width: 210mm; overflow: hidden; background: white; padding: 9mm 12mm 8mm; color: #111; box-shadow: 0 8px 30px rgba(0,0,0,.3); font-family: var(--font-inter), "Sarabun", "Noto Sans Thai", sans-serif; }
      .issue-document-heading { position: relative; min-height: 16mm; padding-top: 3mm; }
      .issue-document-heading h1 { margin: 0; color: #111; font-size: 15pt; font-weight: 700; line-height: 1.35; text-align: center; }
      .issue-document-heading dl { position: absolute; top: 3mm; right: 0; display: grid; width: 48mm; gap: 1mm; margin: 0; font-size: 8.5pt; }
      .issue-document-heading dl > div { display: grid; grid-template-columns: 13mm 1fr; gap: 2mm; }
      .issue-document-heading dt, .issue-document-heading dd { margin: 0; line-height: 1.35; } .issue-document-heading dt { font-weight: 600; } .issue-document-heading dd { font-weight: 700; }
      .issue-print-meta { margin: 1mm 0 4mm; font-size: 9pt; } .issue-print-meta dl { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 8mm; margin: 0; } .issue-print-meta dl > div { display: grid; grid-template-columns: 27mm 1fr; } .issue-print-meta dt, .issue-print-meta dd { margin: 0; line-height: 1.35; } .issue-print-meta dt { font-weight: 700; }
      .issue-print-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8.5pt; } .issue-print-table th, .issue-print-table td { border: 1px solid #aaa; padding: 1.8mm 1mm; line-height: 1.35; text-align: center; vertical-align: middle; white-space: nowrap; } .issue-print-table th { background: #fff; font-weight: 700; } .issue-print-table .issue-print-product { font-size: 8pt; text-align: left; white-space: normal; overflow-wrap: normal; text-wrap: balance; } .issue-print-table tfoot { font-weight: 700; }
      .issue-print-reason { display: grid; grid-template-columns: 28mm 1fr; gap: 2mm; min-height: 10mm; padding-top: 3mm; font-size: 9pt; line-height: 1.35; }
      .issue-signatures { display: grid; grid-template-columns: repeat(3,1fr); gap: 12mm; margin-top: auto; padding: 0 8mm 8mm; text-align: center; font-size: 9pt; } .issue-signatures div { display: flex; flex-direction: column; gap: 5mm; } .issue-signatures span:last-child { margin-top: -3mm; }
      .issue-print-footer { display: flex; justify-content: space-between; border-top: 1px solid #bbb; padding-top: 2mm; font-size: 8pt; color: #555; }
      @media (max-width: 700px) { .issue-preview-toolbar { padding: 8px 10px; } .issue-preview-toolbar strong { font-size: 13px; } .issue-preview-toolbar span { display: none; } .issue-preview-secondary, .issue-preview-primary { padding: 0 10px; } .issue-preview-scroll { padding: 10px; } }
    `}</style>
  </>;
}
