"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import "./stock-adjustment-theme.css";
import { DocumentEntryTable, DocumentMobileWorkspace } from "@/components/document-form";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { Ban, Eye, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  cancelStockAdjustmentAction, getStockAdjustmentDetailAction, getStockAdjustmentOptionsAction,
  postStockAdjustmentAction, type StockAdjustmentDetail, type StockAdjustmentOption, type StockAdjustmentRecord,
} from "@/app/actions/stock-adjustments";
import { reserveBusinessNumberAction } from "@/app/actions/number-series";
import { useHasPermission } from "@/components/permission-context";
import { ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { ItemPicker } from "@/components/item-picker";
import { CompanyFormLogo } from "@/components/company-logo";
import { Pagination } from "@/components/pagination";
import { MobileDocumentList } from "@/components/mobile-document-list";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { adjustmentDifference, validateStockAdjustmentDraft } from "@/lib/stock-adjustments";
import { formatDisplayDate } from "@/lib/purchase-requisitions";

type DraftLine = StockAdjustmentOption & { countedQty: string; positiveUnitCost: string };
const pageSize = 12;
const qty = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(value);
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function AdjustmentStatus({ value }: { value: StockAdjustmentRecord["status"] }) {
  return <StatusBadge tone={value === "posted" ? "success" : "danger"}>{value === "posted" ? "บันทึกแล้ว" : "ยกเลิกแล้ว"}</StatusBadge>;
}

export function StockAdjustmentPageClient({ initialRows, initialQuery = "" }: { initialRows: StockAdjustmentRecord[]; initialQuery?: string }) {
  useListScroll();
  const canCreate = useHasPermission("inventory_adjustment.create");
  const [query, setQuery] = useListState("query", initialQuery);
  const [status, setStatus] = useListState("status", "all");
  const [warehouse, setWarehouse] = useListState("warehouse", "all");
  const [page, setPage] = useListState("page", 1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<StockAdjustmentDetail | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const warehouses = useMemo(() => [...new Set(initialRows.map((row) => row.warehouseName))], [initialRows]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("th");
    return initialRows.filter((row) => (!keyword || `${row.adjustmentNumber} ${row.reason} ${row.createdByName}`.toLocaleLowerCase("th").includes(keyword))
      && (status === "all" || row.status === status) && (warehouse === "all" || row.warehouseName === warehouse));
  }, [initialRows, query, status, warehouse]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const mobileRows = rows.map((row) => ({
    details: [
      { label: "วันที่เอกสาร", value: formatDisplayDate(row.documentDate) },
      { label: "คลังสินค้า", value: row.warehouseName },
      { label: "ผู้บันทึก", value: row.createdByName },
      { label: "จำนวน", value: `${row.itemCount} รายการ` },
      { label: "เหตุผล", value: row.reason },
    ],
    id: row.id,
    meta: `${row.warehouseName} · ${row.itemCount} รายการ`,
    status: <AdjustmentStatus value={row.status} />,
    subtitle: row.reason,
    title: row.adjustmentNumber,
  }));
  const openDetail = async (row: StockAdjustmentRecord) => {
    setLoadingId(row.id);
    const result = await getStockAdjustmentDetailAction(row.id);
    setLoadingId(null);
    if (!("data" in result) || !result.data) return toast.error(result.error ?? "ไม่สามารถเปิดเอกสารได้");
    setDetail(result.data);
  };
  return <section className="adjustment-page flex min-h-[calc(100dvh-116px)] min-w-0 flex-col gap-3 text-on-surface">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[23px] font-bold">ปรับปรุงสต็อก</h1><p className="text-[12px] text-secondary">บันทึกผลตรวจนับและปรับยอดจริง พร้อมประวัติการกลับรายการ</p></div>{canCreate && <button className="adjustment-primary" onClick={() => setCreateOpen(true)} type="button"><Plus size={18} />สร้างใบปรับปรุง</button>}</header>
    <MobileListFilters
      activeCount={(warehouse === "all" ? 0 : 1) + (status === "all" ? 0 : 1)}
      onClear={() => { setWarehouse("all"); setStatus("all"); setPage(1); }}
      search={<ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่เอกสาร, เหตุผล, ผู้บันทึก..." value={query} />}
    >
      <ListFilterSelect label="คลังสินค้า" onChange={(value) => { setWarehouse(value); setPage(1); }} value={warehouse}><option value="all">ทั้งหมด</option>{warehouses.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
      <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิกแล้ว</option></ListFilterSelect>
    </MobileListFilters>
    <ListFilterToolbar className="hidden md:grid md:grid-cols-[1fr_220px_180px]">
      <ListSearchField onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่เอกสาร, เหตุผล, ผู้บันทึก..." value={query} />
      <ListFilterSelect label="คลังสินค้า" onChange={(value) => { setWarehouse(value); setPage(1); }} value={warehouse}><option value="all">ทั้งหมด</option>{warehouses.map((name) => <option key={name}>{name}</option>)}</ListFilterSelect>
      <ListFilterSelect label="สถานะ" onChange={(value) => { setStatus(value); setPage(1); }} value={status}><option value="all">ทั้งหมด</option><option value="posted">บันทึกแล้ว</option><option value="cancelled">ยกเลิกแล้ว</option></ListFilterSelect>
    </ListFilterToolbar>
    <div className="hidden flex-1 overflow-x-auto rounded-[3px] border border-outline-variant bg-surface-container-lowest md:block"><table className="erp-data-table min-w-[900px]"><thead><tr><th>เลขที่เอกสาร</th><th>วันที่</th><th>คลังสินค้า</th><th>รายการ</th><th>ผู้บันทึก</th><th>สถานะ</th><th>เหตุผล</th><th>จัดการ</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="font-bold text-primary">{row.adjustmentNumber}</td><td className="text-center">{formatDisplayDate(row.documentDate)}</td><td>{row.warehouseName}</td><td className="text-center">{row.itemCount}</td><td>{row.createdByName}</td><td className="text-center"><AdjustmentStatus value={row.status} /></td><td><span className="adjustment-two-lines" title={row.reason}>{row.reason}</span></td><td><button aria-label={`ดู ${row.adjustmentNumber}`} className="mx-auto flex items-center gap-1 text-blue-700" disabled={loadingId === row.id} onClick={() => openDetail(row)}>{loadingId === row.id ? <Loader2 className="animate-spin" size={15} /> : <><Eye size={15} />ดู</>}</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="h-28 text-center text-secondary">ไม่พบรายการ</td></tr>}</tbody></table></div>
    <MobileDocumentList actions={(mobileRow, close) => { const row = rows.find((item) => item.id === mobileRow.id); return row ? <button className="mobile-sheet-primary" onClick={() => { close(); void openDetail(row); }} type="button"><Eye size={18} />เปิดเอกสาร</button> : null; }} emptyText="ไม่พบรายการ" rows={mobileRows} />
    <Pagination currentPage={currentPage} onPageChange={setPage} pageSize={pageSize} totalItems={filtered.length} totalPages={totalPages} />
    {createOpen && <CreateAdjustment onClose={() => setCreateOpen(false)} />}
    {detail && <AdjustmentDetail detail={detail} onClose={() => setDetail(null)} onChange={setDetail} />}
  </section>;
}

function CreateAdjustment({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<{ warehouses: Array<{ id: number; name: string }>; items: StockAdjustmentOption[] }>({ warehouses: [], items: [] });
  const [documentDate, setDocumentDate] = useState(today);
  const [reservation, setReservation] = useState({ date: "", number: "", error: "" });
  const [warehouseId, setWarehouseId] = useState(0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const draftValue = { documentDate, warehouseId, reason, notes, lines: lines.map(({ id, countedQty, positiveUnitCost }) => ({ id, countedQty, positiveUnitCost })) };
  const [initialDraft, setInitialDraft] = useState(draftValue);
  const [restoring, setRestoring] = useState(false);
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({
    key: "stock-adjustment:new", value: draftValue, initialValue: initialDraft, enabled: !loading,
    onRestore: async (draft) => {
      setRestoring(true);
      try {
        const result = await getStockAdjustmentOptionsAction(draft.warehouseId, "");
        if (!("data" in result) || !result.data) throw new Error(result.error ?? "โหลดสินค้าไม่สำเร็จ");
        const loaded = result.data;
        const restored = draft.lines.map((line) => {
          const item = loaded.items.find((row) => row.id === line.id && row.trackingMethod !== "serial");
          if (!item) throw new Error("สินค้าที่บันทึกไว้บางรายการไม่พร้อมใช้งาน กรุณาละทิ้งข้อมูลเดิมและเลือกสินค้าใหม่");
          return { ...item, countedQty: line.countedQty, positiveUnitCost: line.positiveUnitCost };
        });
        setOptions(loaded);
        setLines(restored);
        setDocumentDate(draft.documentDate);
        setWarehouseId(draft.warehouseId);
        setReason(draft.reason);
        setNotes(draft.notes);
      } finally { setRestoring(false); }
    },
  });
  useUnsavedChanges("stock-adjustment-create", hasChanges);
  useEffect(() => {
    let active = true;
    void reserveBusinessNumberAction("AD", documentDate).then((result) => {
      if (active) setReservation(result.success ? { date: documentDate, number: result.number, error: "" } : { date: documentDate, number: "", error: result.error });
    });
    return () => { active = false; };
  }, [documentDate]);
  useEffect(() => { void getStockAdjustmentOptionsAction().then((result) => { setLoading(false); if (!("data" in result) || !result.data) return toast.error(result.error ?? "ไม่สามารถโหลดข้อมูลได้"); setOptions(result.data); const warehouse = result.data.warehouses[0]?.id ?? 0; setWarehouseId((current) => current || warehouse); setInitialDraft((current) => ({ ...current, warehouseId: warehouse })); }); }, []);
  useEffect(() => { if (!warehouseId) return; let active = true; void getStockAdjustmentOptionsAction(warehouseId, "").then((result) => { if (active && "data" in result && result.data) setOptions((current) => ({ ...current, items: result.data!.items })); }); return () => { active = false; }; }, [warehouseId]);
  const candidates = options.items.filter((item) => !lines.some((line) => line.id === item.id) && item.trackingMethod !== "serial");
  const add = (selected: StockAdjustmentOption[]) => setLines((current) => [...current, ...selected.map((item) => ({ ...item, countedQty: String(item.onHandQty), positiveUnitCost: "" }))]);
  const save = () => {
    if (restoring) return toast.error("กำลังโหลดข้อมูลสินค้าที่กู้คืน กรุณารอสักครู่");
    if (reservation.date !== documentDate || !reservation.number) return toast.error(reservation.error || "กำลังจองเลขที่ใบปรับปรุง กรุณารอสักครู่");
    const draft = { adjustmentNumber: reservation.number, documentDate, warehouseId, reason, notes, items: lines.map((line) => ({ itemMasterId: line.id, systemQty: line.onHandQty, countedQty: Number(line.countedQty), positiveUnitCost: line.positiveUnitCost === "" ? null : Number(line.positiveUnitCost) })) };
    const error = validateStockAdjustmentDraft(draft);
    if (error) return toast.error(error);
    startTransition(async () => { const result = await postStockAdjustmentAction(draft); if (!("success" in result)) { toast.error(result.error); return; } clearDraft(); toast.success(`บันทึก ${result.adjustmentNumber} แล้ว`); router.refresh(); onClose(); });
  };
  return <div className="adjustment-overlay" role="presentation"><section aria-modal="true" className="document-form adjustment-modal document-adjustment-form" role="dialog" aria-labelledby="adjustment-title"><header className="document-form-header flex items-center justify-between"><div className="flex items-center gap-4"><CompanyFormLogo className="document-brand" /><div><h2 id="adjustment-title">สร้างใบปรับปรุงสต็อก</h2><small className="text-secondary">ยังไม่บันทึก · เลขที่เอกสารสร้างอัตโนมัติ</small></div></div><button aria-label="ปิด" onClick={onClose}><X /></button></header>
    {draftPrompt}
    <DocumentMobileWorkspace initialTab="document"><fieldset className="document-form-body border-0" disabled={restoring}><section className="document-metadata-section"><div className="document-fields"><label className="document-field"><span>เลขที่เอกสาร</span><input disabled value={reservation.date === documentDate ? reservation.number || reservation.error || "กำลังสร้างเลขเอกสาร..." : "กำลังสร้างเลขเอกสาร..."} /></label><label className="document-field"><span>วันที่เอกสาร *</span><input max={today()} type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></label><label className="document-field"><span>คลังสินค้า *</span><select value={warehouseId} onChange={(event) => { setWarehouseId(Number(event.target.value)); setLines([]); }}><option value={0}>เลือกคลัง</option>{options.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="document-field"><span>เหตุผล *</span><input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น ตรวจนับประจำเดือน" /></label></div></section>
      <section className="document-items-section adjustment-lines"><button className="adjustment-add-items" disabled={loading || !warehouseId} onClick={() => setPickerOpen(true)} type="button"><Search size={17} />ค้นหาและเลือกรายการสินค้า</button>
        <div className="document-table-scroll"><DocumentEntryTable className="adjustment-entry-table"><thead><tr><th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>ยอดในระบบ</th><th>ยอดตรวจนับ</th><th>ผลต่าง</th><th>หน่วย</th><th>ต้นทุนของจำนวนที่เพิ่ม<br /><small>กรอกเมื่อยอดตรวจนับมากกว่ายอดในระบบ</small></th><th>จัดการ</th></tr></thead><tbody>{lines.map((line, index) => { const difference = adjustmentDifference(line.onHandQty, Number(line.countedQty || 0)); return <tr key={line.id}><td>{index + 1}</td><td className="font-bold">{line.code}</td><td><span className="document-product adjustment-two-lines">{line.name}</span></td><td className="text-right">{qty(line.onHandQty)}</td><td><input aria-label={`ยอดตรวจนับ ${line.code}`} min="0" step="0.0001" type="number" value={line.countedQty} onChange={(event) => setLines((rows) => rows.map((row) => row.id === line.id ? { ...row, countedQty: event.target.value } : row))} /></td><td className={`text-right font-bold ${difference > 0 ? "text-emerald-700" : difference < 0 ? "text-red-600" : ""}`}>{difference > 0 ? "+" : ""}{qty(difference)}</td><td>{line.unitName}</td><td><input aria-label={`ต้นทุนต่อหน่วย ${line.code}`} disabled={difference <= 0} min="0" step="0.0001" type="number" value={line.positiveUnitCost} onChange={(event) => setLines((rows) => rows.map((row) => row.id === line.id ? { ...row, positiveUnitCost: event.target.value } : row))} /></td><td><button aria-label={`ลบ ${line.code}`} onClick={() => setLines((rows) => rows.filter((row) => row.id !== line.id))}><Trash2 size={16} /></button></td></tr>; })}{lines.length === 0 && <tr><td colSpan={9} className="adjustment-empty h-24 text-center text-secondary">ค้นหาและเลือกสินค้าที่ตรวจนับ</td></tr>}</tbody></DocumentEntryTable></div>
      </section><section className="document-items-section"><label className="document-note"><span>หมายเหตุ</span><textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></section></fieldset></DocumentMobileWorkspace>
    <footer className="document-form-footer"><span className="summary">{lines.length} รายการ</span><button disabled={pending} onClick={onClose}>ยกเลิก</button><button className="primary" disabled={pending || loading || reservation.date !== documentDate || !reservation.number} onClick={save}>{pending ? "กำลังบันทึก..." : "บันทึกใบปรับปรุง"}</button></footer></section>{pickerOpen && <ItemPicker context={`ใบปรับปรุงสต็อก · ${options.warehouses.find((row) => row.id === warehouseId)?.name ?? "คลังสินค้า"}`} emptyText="ไม่พบสินค้าที่เลือกได้" items={candidates.map((item) => ({ id: String(item.id), code: item.code, name: item.name, unit: item.unitName, value: item }))} columns={[{ key: "system", label: "ยอดในระบบ", className: "text-right", render: (item) => qty(item.value.onHandQty) }]} onClose={() => setPickerOpen(false)} onConfirm={add} />}</div>;
}

function AdjustmentDetail({ detail, onClose, onChange }: { detail: StockAdjustmentDetail; onClose: () => void; onChange: (value: StockAdjustmentDetail) => void }) {
  const router = useRouter(); const [confirming, setConfirming] = useState(false); const [reason, setReason] = useState(""); const [pending, startTransition] = useTransition();
  const cancel = () => startTransition(async () => { const result = await cancelStockAdjustmentAction(detail.header.id, reason); if (!("success" in result)) { toast.error(result.error); return; } toast.success(`ยกเลิกแล้ว · ${result.reversalNumber}`); const refreshed = await getStockAdjustmentDetailAction(detail.header.id); if ("data" in refreshed && refreshed.data) onChange(refreshed.data); setConfirming(false); router.refresh(); });
  return <div className="adjustment-overlay"><section aria-modal="true" className="adjustment-detail" role="dialog"><header><div><small>ใบปรับปรุงสต็อก</small><h2>{detail.header.adjustmentNumber}</h2>{detail.sourceCountNumber && <small>สร้างจากการตรวจนับ {detail.sourceCountNumber}</small>}</div><div>{detail.header.status === "posted" && detail.canCancel && <button className="danger" onClick={() => setConfirming(true)}><Ban size={16} />ยกเลิกเอกสาร</button>}<button aria-label="ปิด" onClick={onClose}><X /></button></div></header><div className="adjustment-detail-body"><dl><div><dt>วันที่เอกสาร</dt><dd>{formatDisplayDate(detail.header.documentDate)}</dd></div><div><dt>คลังสินค้า</dt><dd>{detail.header.warehouseName}</dd></div><div><dt>ผู้บันทึก</dt><dd>{detail.header.createdByName}</dd></div><div><dt>สถานะ</dt><dd><AdjustmentStatus value={detail.header.status} /></dd></div><div className="wide"><dt>เหตุผล</dt><dd>{detail.header.reason}</dd></div>{detail.header.notes && <div className="wide"><dt>หมายเหตุ</dt><dd>{detail.header.notes}</dd></div>}{detail.header.reversalNumber && <div className="wide"><dt>กลับรายการ</dt><dd>{detail.header.reversalNumber} · {detail.header.cancellationReason}</dd></div>}</dl><div className="overflow-x-auto"><table className="erp-data-table min-w-[860px]"><thead><tr><th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>Lot</th><th>ยอดในระบบ</th><th>ยอดตรวจนับ</th><th>ผลต่าง</th><th>หน่วย</th><th>ต้นทุน/หน่วย</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.id}><td>{item.lineNo}</td><td className="font-bold">{item.itemCode}</td><td><span className="adjustment-two-lines" title={item.itemName}>{item.itemName}</span></td><td>{item.lotNumber || "—"}</td><td className="text-right">{qty(item.systemQty)}</td><td className="text-right">{qty(item.countedQty)}</td><td className={`text-right font-bold ${item.differenceQty > 0 ? "text-emerald-700" : "text-red-600"}`}>{item.differenceQty > 0 ? "+" : ""}{qty(item.differenceQty)}</td><td>{item.unitName}</td><td className="text-right">{money(item.positiveUnitCost)}</td></tr>)}</tbody></table></div></div></section>{confirming && <div className="adjustment-confirm"><section role="alertdialog" aria-modal="true"><h3>ยืนยันยกเลิก {detail.header.adjustmentNumber}</h3><p>ระบบจะสร้างรายการกลับบัญชีสต็อก ไม่ลบประวัติเดิม</p><textarea autoFocus maxLength={500} placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร" value={reason} onChange={(event) => setReason(event.target.value)} /><footer><button disabled={pending} onClick={() => setConfirming(false)}>ไม่ยกเลิก</button><button className="danger" disabled={pending || reason.trim().length < 10} onClick={cancel}>{pending ? "กำลังกลับรายการ..." : "ยืนยันยกเลิก"}</button></footer></section></div>}</div>;
}
