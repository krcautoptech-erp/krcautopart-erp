"use client";

import Link from "next/link";
import Image from "next/image";
import { DataTable, DataTableFrame } from "@/components/data-table";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Download, FileText, Coins, Pencil, Plus, Trash2 } from "lucide-react";
import { decideOpeningStockAction, saveOpeningStockAction, type OpeningBatch, type OpeningEvent, type OpeningOptions } from "@/app/actions/opening-stock";
import { ConfirmModal } from "@/components/confirm-modal";
import { ItemPicker } from "@/components/item-picker";
import { ListFilterButton } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { useHasPermission } from "@/components/permission-context";
import { useToast } from "@/components/toast";
import { useFormDraft } from "@/components/form-draft";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { downloadCsvTemplate, readSpreadsheet } from "@/lib/spreadsheet-import";
import { emptyOpeningRow, openingRowsFromSpreadsheet, openingLineValue, openingTotals, validateOpeningRows, validateOpeningHeader, OPENING_STATUS, type OpeningItem, type OpeningRow } from "@/lib/opening-stock";
import "@/components/document-form.css";
import "./opening-stock.css";

export function OpeningStockEditor({ options, batch, events = [], requestKey, today, error, migrationRequired, canEdit = true }: { options: OpeningOptions; batch?: OpeningBatch; events?: OpeningEvent[]; requestKey: string; today: string; error?: string; migrationRequired: boolean; canEdit?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const canCreate = useHasPermission("opening_stock.create");
  const canApprove = useHasPermission("opening_stock.approve");
  const canCancel = useHasPermission("opening_stock.cancel");
  const editable = (!batch || batch.status === "draft") && canCreate && canEdit;
  const [initial] = useState({ warehouseId: batch?.warehouse_id ?? 0, cutoffDate: batch?.cutoff_date ?? today, reference: batch?.reference ?? "", notes: batch?.notes ?? "", rows: batch?.rows ?? [] as OpeningRow[], filename: batch?.source_filename ?? "", requestKey });
  const [form, setForm] = useState(initial);
  const [page, setPage] = useState(1);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [picker, setPicker] = useState(false);
  const [reading, setReading] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"submit" | "post" | "return" | "cancel" | "reverse" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = pending || reading;
  const errors = validateOpeningRows(form.rows, options.items, form.cutoffDate);
  const invalid = errors.filter((row) => row.length).length;
  const totals = openingTotals(form.rows);
  const selectedWarehouse = options.warehouses.find((w) => w.id === form.warehouseId);
  const { draftPrompt, clearDraft, hasChanges } = useFormDraft({ key: `opening-stock:${batch?.id ?? "new"}`, value: form, initialValue: initial, revision: String(batch?.revision ?? "new"), enabled: editable, onRestore: (saved) => {
    if (!Array.isArray(saved.rows) || saved.rows.length > 500 || saved.rows.some((r) => !r || Object.values(r).some((v) => typeof v !== "string"))) throw new Error("ฉบับร่างไม่สมบูรณ์");
    setForm(saved);
  } });
  useUnsavedChanges("opening-stock-editor", hasChanges);
  const patchRow = (index: number, patch: Partial<OpeningRow>) => setForm((current) => ({ ...current, rows: current.rows.map((r, i) => i === index ? { ...r, ...patch } : r) }));
  const deleteRow = (index: number) => setForm((current) => ({ ...current, rows: current.rows.filter((_, i) => i !== index) }));
  const visible = form.rows.map((row, index) => ({ row, index, errors: errors[index], item: options.items.find((item) => item.code.toUpperCase() === row.itemCode.trim().toUpperCase()) })).filter((r) => !onlyErrors || r.errors.length);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 20)));
  const pageRows = visible.slice((currentPage - 1) * 20, currentPage * 20);
  const groups = [...new Set(pageRows.map((r) => r.row.itemCode))].map((code) => ({ code, rows: pageRows.filter((r) => r.row.itemCode === code) }));
  const blocked = Boolean(selectedWarehouse?.blocked && (!batch || batch.status === "draft" || batch.status === "review"));
  const canSubmit = editable && !busy && !migrationRequired && form.rows.length > 0 && invalid === 0 && !blocked;
  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  async function importFile(file?: File, confirmed = false) {
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("ไฟล์ต้องไม่เกิน 5 MB");
    if (form.rows.length && !confirmed) { setReplacementFile(file); return; }
    setReading(true);
    try {
      const rows = openingRowsFromSpreadsheet(await readSpreadsheet(file));
      update({ rows, filename: file.name }); setPage(1); setReplacementFile(null);
      toast.success(`นำเข้าเพื่อตรวจสอบ ${rows.length} รายการ ยังไม่ลงสต็อก`);
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "อ่านไฟล์ไม่ได้"); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  function addItems(items: OpeningItem[]) {
    const added = items.map((item) => emptyOpeningRow(item.code));
    if (form.rows.length + added.length > 500) return toast.error("เพิ่มได้ไม่เกิน 500 รายการ");
    update({ rows: [...form.rows, ...added] }); setPage(Math.ceil((form.rows.length + added.length) / 20) || 1);
  }
  function save(submit: boolean) {
    const validation = validateOpeningHeader(form.warehouseId, form.cutoffDate, form.reference, form.notes, today);
    if (validation) { toast.error(validation); return; }
    if (submit && !canSubmit) { toast.error("กรุณาแก้ไขรายการให้ถูกต้องก่อนส่งตรวจสอบ"); return; }
    startTransition(async () => {
      try {
        const result = await saveOpeningStockAction({ ...form, id: batch?.id ?? null, revision: batch?.revision ?? 0, submit });
        if (result.error) { toast.error(result.error); return; }
        clearDraft(); setConfirm(null); toast.success(submit ? "ส่งตรวจสอบแล้ว ยังไม่ลงสต็อก" : "บันทึกร่างแล้ว");
        router.push(`/inventory/opening-stock/${result.id}`); router.refresh();
      } catch { toast.error("เชื่อมต่อไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่"); }
    });
  }
  function decide(reason = "") {
    if (!batch || !confirm || confirm === "submit") return;
    const action = confirm;
    startTransition(async () => {
      try {
        const result = await decideOpeningStockAction(batch.id, batch.revision, action, reason);
        if (result.error) { toast.error(result.error); return; }
        setConfirm(null); toast.success("ดำเนินการเรียบร้อย"); router.refresh();
      } catch { toast.error("เชื่อมต่อไม่สำเร็จ กรุณาโหลดเอกสารเพื่อตรวจสถานะก่อนลองใหม่"); }
    });
  }
  function rowFields(entry: typeof pageRows[number], mobile: boolean) {
    const { row, index, item } = entry;
    const saved = row as OpeningRow & { unitName?: string };
    const field = (key: keyof OpeningRow, label: string, type = "text") => <label><span className={mobile ? "" : "sr-only"}>{label}</span><input aria-label={`${label} รายการ ${index + 1}`} value={row[key]} type={type} inputMode={key === "quantity" || key === "unitCost" ? "decimal" : undefined} min={type === "date" ? form.cutoffDate : undefined} maxLength={key === "notes" ? 500 : 100} disabled={!editable || busy} onChange={(e) => patchRow(index, { [key]: e.target.value })} /></label>;
    return mobile ? <>
      {!item && editable && field("itemCode", "รหัสสินค้า")}
      <div className="os-lot-fields">{field("lotNumber", "Lot")}{field("quantity", `จำนวน (${(!editable ? saved.unitName : undefined) ?? item?.unitName ?? "หน่วย"})`)}{field("unitCost", "ต้นทุน/หน่วย (฿)")}{(item?.expiryControlled || row.expiryDate) && field("expiryDate", "หมดอายุ", "date")}</div>
      {entry.errors.length > 0 && editable ? <p className="os-errors" role="status">{entry.errors.join(" · ")}</p> : null}
      <div className="os-lot-tail"><small>มูลค่า ฿{openingLineValue(row).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>{editable && <button aria-label={`ลบรายการ ${index + 1}`} disabled={busy} onClick={() => deleteRow(index)} type="button"><Trash2 size={16} /></button>}</div>
    </> : <>
      <td>{field("lotNumber", "Lot")}</td><td>{field("expiryDate", "วันหมดอายุ", "date")}</td><td>{field("quantity", "จำนวน")}</td><td>{(!editable ? saved.unitName : undefined) ?? item?.unitName ?? "—"}</td><td>{field("unitCost", "ต้นทุนต่อหน่วย")}</td><td className="os-numeric">{openingLineValue(row).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td><span className={`os-status ${entry.errors.length && editable ? "error" : "posted"}`}>{entry.errors.length && editable ? "ต้องแก้ไข" : "ถูกต้อง"}</span>{entry.errors.length > 0 && editable && <small className="os-row-error" title={entry.errors.join(" · ")}>{entry.errors.map((e) => e.startsWith("จำนวนต้อง") ? "ตรวจจำนวน" : e.startsWith("ระบุต้นทุน") ? "ตรวจต้นทุน" : e).join(" · ")}</small>}</td>{editable && <td><button aria-label={`ลบรายการ ${index + 1}`} disabled={busy} onClick={() => deleteRow(index)} type="button"><Trash2 size={16} /></button></td>}
    </>;
  }
  return <main className="os-page">
    <div className="os-heading"><div><Link className="os-back" href="/inventory/opening-stock">คลังสินค้า › สต็อกตั้งต้น</Link><h1>{batch?.opening_number ?? "นำเข้าสต็อกตั้งต้น"}</h1></div>{batch && <span className={`os-status ${batch.status}`}>{OPENING_STATUS[batch.status]}</span>}</div>
    {migrationRequired && <p className="os-warning" role="status">ยังไม่ได้รัน Migration · ทดลองกรอกและตรวจไฟล์ได้ แต่ยังบันทึกหรือลงยอดไม่ได้</p>}{error && <p className="os-warning" role="alert">{error}</p>}
    <section className="os-editor">
      {draftPrompt}
      <fieldset className="os-fields" disabled={!editable || busy}>
        <label>คลังสินค้า *<select aria-label="คลังสินค้า" value={form.warehouseId} onChange={(e) => update({ warehouseId: Number(e.target.value) })}><option value={0}>เลือกคลังสินค้า</option>{options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.blocked ? " · เริ่มใช้งานแล้ว" : ""}</option>)}</select></label>
        <label>วันที่ตัดยอด *<input aria-label="วันที่ตัดยอด" type="date" max={today} value={form.cutoffDate} onChange={(e) => update({ cutoffDate: e.target.value })} /></label>
        <label>เลขที่เอกสารอ้างอิง *<input aria-label="เลขที่เอกสารอ้างอิง" placeholder="เช่น OB-2026" maxLength={100} value={form.reference} onChange={(e) => update({ reference: e.target.value })} /></label>
      </fieldset>
      {blocked && <p className="os-warning"><AlertCircle size={17} />คลังนี้มีรายการเคลื่อนไหวหรือมีสต็อกแล้ว ไม่สามารถตั้งต้นซ้ำได้</p>}
      {editable && <div className="os-import">
        <p className="os-import-label">นำเข้าข้อมูลจากไฟล์ Excel / CSV</p>
        <input ref={fileRef} hidden type="file" accept=".xlsx,.csv" onChange={(e) => void importFile(e.target.files?.[0])} />
        <button className="os-drop" disabled={busy} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void importFile(e.dataTransfer.files[0]); }} type="button"><Image src="/icon/opening-stock-excel.png" alt="Excel" width={80} height={80} /><span><b>นำเข้าไฟล์ Excel หรือ CSV</b><small>ลากและวางไฟล์ที่นี่ หรือ <em>คลิกเพื่อเลือกไฟล์</em></small><small>รองรับ .xlsx, .csv · ไม่เกิน 5 MB / 500 รายการ</small></span></button>
        <ListFilterButton icon={<Download size={18} />} onClick={() => downloadCsvTemplate("OpeningStock-Template.csv", [["รหัสสินค้า","Lot","จำนวน","ต้นทุนต่อหน่วย","วันหมดอายุ","หมายเหตุ"]])}>ดาวน์โหลด Template</ListFilterButton>
        <ListFilterButton icon={<Pencil size={18} />} disabled={busy} onClick={() => setPicker(true)}>กรอกด้วยมือ</ListFilterButton>
        {form.filename && <div className="os-file"><CheckCircle2 size={26} className="os-success" /><span><b>{form.filename}</b><small>นำเข้าแล้ว {form.rows.length} รายการ · ยังไม่ลงสต็อก</small></span><button disabled={busy} onClick={() => fileRef.current?.click()} type="button">เปลี่ยนไฟล์</button></div>}
      </div>}
      <div className="os-summary"><div><FileText size={25} /><small>จำนวนรายการทั้งหมด</small><b>{totals.lines} รายการ <small>/ {totals.items} สินค้า</small></b></div><div><CheckCircle2 size={25} className="os-success" /><small>รายการถูกต้อง</small><b>{form.rows.length - (editable ? invalid : 0)} รายการ</b></div><div><AlertCircle size={25} className="os-errors" /><small>รายการต้องแก้ไข</small><b className="os-errors">{editable ? invalid : 0} รายการ</b></div><div><Coins size={25} /><small>มูลค่ารวม</small><b>฿{totals.value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div></div>
      {editable && form.rows.length > 0 && <div className="os-grid-tools"><label><input type="checkbox" checked={onlyErrors} onChange={(e) => { setOnlyErrors(e.target.checked); setPage(1); }} />แสดงเฉพาะรายการที่ต้องแก้ไข</label><small>จำนวนและต้นทุนไม่เกิน 4 ตำแหน่ง · หน่วยตามทะเบียนสินค้า</small></div>}
      <DataTableFrame className="os-desktop"><DataTable><colgroup><col style={{ width: 34 }} /><col style={{ width: 85 }} /><col style={{ width: 285 }} /><col style={{ width: 112 }} /><col style={{ width: 120 }} /><col style={{ width: 70 }} /><col style={{ width: 45 }} /><col style={{ width: 105 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} />{editable && <col style={{ width: 32 }} />}</colgroup><thead><tr><th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>Lot เดิม</th><th>วันหมดอายุ</th><th>จำนวน</th><th>หน่วย</th><th>ต้นทุน/หน่วย (฿)</th><th>มูลค่า (฿)</th><th>สถานะ</th>{editable && <th />}</tr></thead><tbody>{pageRows.map((entry) => <tr className={entry.errors.length && editable ? "os-invalid" : ""} key={entry.index}><td>{entry.index + 1}</td><td>{editable ? <input aria-label={`รหัสสินค้า รายการ ${entry.index + 1}`} value={entry.row.itemCode} maxLength={100} disabled={busy} onChange={(e) => patchRow(entry.index, { itemCode: e.target.value })} /> : <b>{entry.row.itemCode}</b>}</td><td>{(!editable ? (entry.row as OpeningRow & { itemName?: string }).itemName : undefined) ?? entry.item?.name ?? "ไม่พบสินค้า"}</td>{rowFields(entry, false)}</tr>)}</tbody></DataTable></DataTableFrame>
      <div className="os-mobile">{groups.map((group, i) => <details key={group.code} open={i === 0 || onlyErrors}><summary><div><b>{group.code || "ไม่พบรหัส"}</b><span>{(!editable ? (group.rows[0].row as OpeningRow & { itemName?: string }).itemName : undefined) ?? group.rows[0].item?.name ?? "ไม่พบสินค้า"}</span></div><small>{group.rows.length} Lot</small><ChevronDown size={18} /></summary>{group.rows.map((entry) => <div className={`os-lot ${entry.errors.length ? "invalid" : ""}`} key={entry.index}>{rowFields(entry, true)}</div>)}{editable && group.rows[0].item?.trackingMethod === "lot" && <button className="os-add-lot" disabled={busy || form.rows.length >= 500} onClick={() => { update({ rows: [...form.rows, emptyOpeningRow(group.code)] }); setOnlyErrors(false); setPage(Math.ceil((form.rows.length + 1) / 20)); }} type="button"><Plus size={15} />เพิ่ม Lot</button>}</details>)}</div>
      {!visible.length && <div className="os-empty">{form.rows.length ? "ไม่พบรายการที่ต้องแก้ไข" : "นำเข้าไฟล์หรือเลือกสินค้าเพื่อเริ่มกรอกยอดตั้งต้น"}</div>}
      {form.rows.length > 0 && <Pagination currentPage={currentPage} pageSize={20} totalItems={visible.length} onPageChange={setPage} disabled={busy} />}
      <fieldset className="os-notes" disabled={!editable || busy}><label>หมายเหตุ<textarea aria-label="หมายเหตุ" rows={2} maxLength={1000} value={form.notes} onChange={(e) => update({ notes: e.target.value })} /></label></fieldset>
      {events.length > 0 && <section className="os-history"><h2>ประวัติการดำเนินการ</h2>{events.map((event) => <div key={event.id}><b>{event.event}</b><span>{event.actor_name} · {new Date(event.created_at).toLocaleString("th-TH")}</span>{event.reason && <p>{event.reason}</p>}</div>)}</section>}
      <footer className="os-footer"><Link href="/inventory/opening-stock">กลับทะเบียน</Link><div>{editable ? <>{batch && canCancel && <ListFilterButton disabled={busy} onClick={() => setConfirm("cancel")}>ยกเลิกเอกสาร</ListFilterButton>}<ListFilterButton disabled={busy || migrationRequired} onClick={() => save(false)}>บันทึกร่าง</ListFilterButton><ListFilterButton tone="primary" disabled={!canSubmit} onClick={() => setConfirm("submit")}>{busy ? "กำลังดำเนินการ..." : "ส่งตรวจสอบ"}</ListFilterButton></> : <>{batch?.status === "review" && canApprove && <><ListFilterButton disabled={busy} onClick={() => setConfirm("return")}>ส่งกลับแก้ไข</ListFilterButton><ListFilterButton tone="primary" disabled={busy || blocked} onClick={() => setConfirm("post")}>อนุมัติและลงยอด</ListFilterButton></>}{batch?.status === "posted" && canCancel && <ListFilterButton disabled={busy} onClick={() => setConfirm("reverse")}>กลับรายการ</ListFilterButton>}{batch && ["draft","review"].includes(batch.status) && canCancel && <ListFilterButton disabled={busy} onClick={() => setConfirm("cancel")}>ยกเลิกเอกสาร</ListFilterButton>}</>}</div></footer>
    </section>
    {picker && <ItemPicker<OpeningItem> title="เลือกสินค้าตั้งต้น" context="สินค้าใช้งานและเก็บสต็อก · หน่วยตามทะเบียน" items={options.items.filter((i) => i.trackingMethod !== "serial").map((item) => ({ id: String(item.id), code: item.code, name: item.name, unit: item.unitName, value: item }))} onClose={() => setPicker(false)} onConfirm={(items) => { addItems(items); setPicker(false); }} />}
    <ConfirmModal isOpen={Boolean(replacementFile)} onClose={() => setReplacementFile(null)} isPending={reading} title="แทนที่รายการที่กรอกไว้" description="รายการจากไฟล์ใหม่จะแทนที่รายการทั้งหมดในหน้าจอนี้ แต่ยังไม่เปลี่ยนยอดสต็อก" onConfirm={() => { void importFile(replacementFile ?? undefined, true); }} />
    <ConfirmModal isOpen={Boolean(confirm)} onClose={() => { if (!pending) setConfirm(null); }} isPending={pending} tone={confirm === "reverse" || confirm === "cancel" ? "danger" : "primary"} title={confirm === "submit" ? "ส่งตรวจสอบยอดตั้งต้น" : confirm === "post" ? "อนุมัติและลงยอดตั้งต้น" : confirm === "reverse" ? "กลับรายการสต็อกตั้งต้น" : confirm === "cancel" ? "ยกเลิกเอกสาร" : "ส่งกลับแก้ไข"} description={confirm === "post" ? `ลงยอด ${totals.lines} รายการ มูลค่า ฿${totals.value.toLocaleString("th-TH")} หลังลงยอดจะแก้ไขไม่ได้ กรุณาตรวจใบตรวจนับและต้นทุนก่อนยืนยัน` : confirm === "submit" ? "ส่งให้ผู้มีสิทธิ์ตรวจสอบ โดยยังไม่เปลี่ยนยอดสต็อก" : "ระบบเก็บเหตุผลและผู้ดำเนินการไว้ในประวัติ เอกสารที่มีการใช้สต็อกแล้วจะกลับรายการไม่ได้"} requiresReason={Boolean(confirm && !["submit","post"].includes(confirm))} onConfirm={(reason) => confirm === "submit" ? save(true) : decide(reason)} />
  </main>;
}
