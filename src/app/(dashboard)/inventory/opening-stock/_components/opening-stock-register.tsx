"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus, X, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { OpeningBatch, OpeningOptions } from "@/app/actions/opening-stock";
import { ListSearchField, ListFilterSelect, ListDateRangeFilter } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { useHasPermission } from "@/components/permission-context";
import { OPENING_STATUS, openingTotals, type OpeningStatus } from "@/lib/opening-stock";
import "./opening-stock.css";

export function OpeningStockRegister({ batches, options, error, migrationRequired }: { batches: OpeningBatch[]; options: OpeningOptions; error?: string; migrationRequired: boolean }) {
  const canCreate = useHasPermission("opening_stock.create");
  const [status, setStatus] = useState<OpeningStatus | "">("");
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [range, setRange] = useState({ startDate: "", endDate: "" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OpeningBatch | null>(null);
  const visible = batches.filter((b) => (!status || b.status === status) && (!warehouse || b.warehouse_id === Number(warehouse)) && (!range.startDate || b.cutoff_date >= range.startDate) && (!range.endDate || b.cutoff_date <= range.endDate) && `${b.opening_number} ${b.warehouse_name} ${b.created_by_name} ${b.reference}`.toLowerCase().includes(search.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 20)));
  return <main className={`os-page os-register ${selected ? "has-detail" : ""}`}>
    <section className="os-register-main">
      <header className="os-heading"><div><h1>สต็อกตั้งต้น</h1><p>นำเข้ายอดที่ตรวจนับแล้ว ก่อนเริ่มใช้งานคลังสินค้า</p></div>{canCreate && <Link className="os-primary-link" href="/inventory/opening-stock/new"><Plus size={18} />สร้างชุดนำเข้า</Link>}</header>
      {migrationRequired ? <p className="os-warning" role="status">ยังไม่ได้รัน Migration · เปิดหน้าสร้างเพื่อตรวจรูปแบบได้ ยังบันทึกหรือลงยอดไม่ได้</p> : error ? <p className="os-warning" role="alert">{error}</p> : null}
      <nav className="os-tabs" aria-label="สถานะชุดนำเข้า">{(["", "draft", "review", "posted", "reversed", "cancelled"] as const).map((s) => <button aria-current={status === s ? "page" : undefined} type="button" key={s} onClick={() => { setStatus(s); setPage(1); }}>{s ? OPENING_STATUS[s] : "ทั้งหมด"}<span>{batches.filter((b) => !s || b.status === s).length}</span></button>)}</nav>
      <div className="os-filters"><ListSearchField placeholder="ค้นหาเลขที่เอกสาร คลัง ผู้สร้าง" value={search} onChange={(s) => { setSearch(s); setPage(1); }} /><ListDateRangeFilter label="ช่วงวันที่ตัดยอด" startValue={range.startDate} endValue={range.endDate} onRangeChange={(r) => { setRange(r); setPage(1); }} /><ListFilterSelect label="คลังสินค้า" value={warehouse} onChange={(w) => { setWarehouse(w); setPage(1); }}><option value="">ทุกคลังสินค้า</option>{options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</ListFilterSelect></div>
      <div className="os-ledger"><table><thead><tr><th>เลขที่เอกสาร</th><th>คลังสินค้า</th><th>วันที่ตัดยอด</th><th>สินค้า / Lot</th><th>มูลค่ารวม (฿)</th><th>ผู้สร้าง</th><th>สถานะ</th><th /></tr></thead><tbody>{visible.slice((currentPage - 1) * 20, currentPage * 20).map((b) => { const total = openingTotals(b.rows); return <tr className={selected?.id === b.id ? "selected" : ""} key={b.id}><td><button className="os-document-number" type="button" onClick={() => setSelected(b)}>{b.opening_number}</button></td><td>{b.warehouse_name}</td><td>{b.cutoff_date}</td><td>{total.items} / {total.lines}</td><td className="os-numeric">{total.value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>{b.created_by_name}</td><td><span className={`os-status ${b.status}`}>{OPENING_STATUS[b.status]}</span></td><td><button aria-label={`ดู ${b.opening_number}`} onClick={() => setSelected(b)} type="button"><ChevronRight size={18} /></button></td></tr>; })}</tbody></table></div>
      <div className="os-register-mobile">{visible.slice((currentPage - 1) * 20, currentPage * 20).map((b) => <button type="button" key={b.id} onClick={() => setSelected(b)}><div><b>{b.opening_number}</b><span className={`os-status ${b.status}`}>{OPENING_STATUS[b.status]}</span></div><p>{b.warehouse_name} · {b.cutoff_date}</p><div><small>{b.rows.length} รายการ · {b.created_by_name}</small><ChevronRight size={18} /></div></button>)}</div>
      {!visible.length && <div className="os-empty"><FileSpreadsheet size={30} /><b>{batches.length ? "ไม่พบเอกสารตามตัวกรอง" : "ยังไม่มีชุดนำเข้าสต็อกตั้งต้น"}</b><p>เลือกคลัง วันที่ตัดยอด และยอดที่นับจริง เพื่อเริ่มใช้งานระบบ</p></div>}
      <Pagination currentPage={currentPage} pageSize={20} totalItems={visible.length} onPageChange={setPage} />
      <p className="os-safety-note"><ShieldCheck size={16} />ลงยอดได้เมื่อคลังยังไม่เริ่มใช้งานเท่านั้น · เอกสารที่ลงยอดแล้วแก้ไขไม่ได้</p>
    </section>
    {selected && <aside className="os-detail" aria-label="ข้อมูลชุดนำเข้า"><header><h2>{selected.opening_number}</h2><button aria-label="ปิดรายละเอียด" type="button" onClick={() => setSelected(null)}><X size={20} /></button></header><span className={`os-status ${selected.status}`}>{OPENING_STATUS[selected.status]}</span><h3>ข้อมูลเอกสาร</h3><dl>{[["คลังสินค้า",selected.warehouse_name],["วันที่ตัดยอด",selected.cutoff_date],["อ้างอิง",selected.reference],["ผู้สร้าง",selected.created_by_name],["หมายเหตุ",selected.notes || "—"]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.source_filename && <div className="os-file"><FileSpreadsheet size={24} /><b>{selected.source_filename}</b></div>}<div className="os-summary"><div><small>สินค้า</small><b>{openingTotals(selected.rows).items}</b></div><div><small>รายการ / Lot</small><b>{selected.rows.length}</b></div><div><small>มูลค่า (฿)</small><b>{openingTotals(selected.rows).value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b></div></div><p className="os-warning">ลงสต็อกเมื่อผู้มีสิทธิ์อนุมัติเท่านั้น เอกสารที่ลงยอดแล้วต้องกลับรายการ ไม่แก้ยอดตรง ๆ</p><Link className="os-primary-link" href={`/inventory/opening-stock/${selected.id}`}>เปิดตรวจรายการและประวัติ<ChevronRight size={17} /></Link></aside>}
  </main>;
}
