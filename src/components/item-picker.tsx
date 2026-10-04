"use client";

import "./item-picker.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, Search, X } from "lucide-react";
import { filterPickerItems, togglePickerSelection, type PickerSearchItem } from "@/lib/item-picker";

export type ItemPickerColumn<T> = { key: string; label: string; className?: string; render: (item: T) => ReactNode };
export type ItemPickerItem<T> = PickerSearchItem & { value: T; unit: string; meta?: string };

export function ItemPicker<T>({ title = "เลือกรายการสินค้า", context, items, columns = [], initialSelectedIds = [], single = false, filter, emptyText = "ไม่พบรายการสินค้า", onClose, onConfirm }: {
  title?: string; context: string; items: ItemPickerItem<T>[]; columns?: ItemPickerColumn<ItemPickerItem<T>>[]; initialSelectedIds?: string[]; single?: boolean; filter?: ReactNode; emptyText?: string; onClose: () => void; onConfirm: (items: T[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedOpen, setSelectedOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));
  const pickerItems = useMemo(() => [...new Map(items.map((item) => [item.id, item])).values()], [items]);
  const groups = useMemo(() => [...new Set(pickerItems.flatMap((item) => item.group ? [item.group] : []))].sort((a, b) => a.localeCompare(b, "th")), [pickerItems]);
  const visible = useMemo(() => filterPickerItems(pickerItems, query, group, activeOnly), [pickerItems, query, group, activeOnly]);
  const selectedItems = useMemo(() => pickerItems.filter((item) => selected.has(item.id)), [pickerItems, selected]);
  const selectableVisible = visible.filter((item) => !item.disabled);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((item) => selected.has(item.id));
  const asOfDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok" }).format(new Date());
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const toggle = (item: ItemPickerItem<T>) => {
    const next = togglePickerSelection(selected, item.id, item.disabled, single);
    if (single && next.has(item.id)) { onConfirm([item.value]); onClose(); return; }
    setSelected(next);
  };
  const toggleVisible = () => setSelected((current) => {
    const next = new Set(current);
    for (const item of selectableVisible) if (allVisibleSelected) next.delete(item.id); else next.add(item.id);
    return next;
  });
  const confirm = () => { onConfirm(pickerItems.filter((item) => selected.has(item.id)).map((item) => item.value)); onClose(); };
  return <dialog ref={ref} className="item-picker" aria-labelledby="item-picker-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="item-picker-title">{title}</h2><p>{context}{!single && " · เลือกได้หลายรายการ"}</p></div><button aria-label="ปิด" onClick={onClose} type="button"><X size={21} /></button></header>
    <div className={`item-picker-toolbar ${filter || groups.length > 1 ? "" : "no-filter"}`}><label className="item-picker-search"><Search size={21} /><input autoFocus placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{filter ?? (groups.length > 1 && <div className="item-picker-filter"><button aria-expanded={filterOpen} aria-label="กรองประเภทสินค้า" className="filter" onClick={() => setFilterOpen((value) => !value)} type="button"><SlidersHorizontal size={20} /></button>{filterOpen && <select aria-label="ประเภทสินค้า" autoFocus onChange={(event) => { setGroup(event.target.value); setFilterOpen(false); }} value={group}><option value="">ทุกประเภท</option>{groups.map((value) => <option key={value} value={value}>{value}</option>)}</select>}</div>)}<label className="active-toggle"><input checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} type="checkbox" />แสดงเฉพาะรายการที่ใช้งาน</label><div className="item-picker-result"><span className="mobile-active">รายการที่ใช้งาน · </span>พบ {visible.length.toLocaleString("th-TH")} รายการ<small>ข้อมูล ณ วันที่ {asOfDate}</small></div></div>
    <div className="item-picker-table-wrap"><table className={columns.length ? "has-context" : ""}><thead><tr><th>{!single && <input aria-label="เลือกทั้งหมดที่แสดง" checked={allVisibleSelected} onChange={toggleVisible} type="checkbox" />}</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วย</th>{columns.map((column) => <th className={column.className} key={column.key}>{column.label}</th>)}</tr></thead><tbody>{visible.map((item) => <tr aria-disabled={item.disabled || undefined} className={selected.has(item.id) ? "selected" : ""} key={item.id} onClick={() => toggle(item)}><td><input aria-label={`เลือก ${item.code}`} checked={selected.has(item.id)} disabled={item.disabled} onChange={() => toggle(item)} onClick={(event) => event.stopPropagation()} type={single ? "radio" : "checkbox"} /></td><td><b>{item.code}</b></td><td><span className="item-picker-name">{item.name}</span>{item.meta && <small>{item.meta}</small>}</td><td>{item.unit}</td>{columns.map((column) => <td className={column.className} key={column.key} data-label={column.label}>{column.render(item)}</td>)}</tr>)}{visible.length === 0 && <tr><td className="empty" colSpan={4 + columns.length}>{emptyText}</td></tr>}</tbody></table></div>
    {selectedOpen && selectedItems.length > 0 && <div className="item-picker-selected" role="region" aria-label="รายการสินค้าที่เลือก"><header><b>รายการที่เลือก ({selectedItems.length})</b><button aria-label="ปิดรายการที่เลือก" onClick={() => setSelectedOpen(false)} type="button"><X size={18} /></button></header>{selectedItems.map((item) => <div key={item.id}><b>{item.code}</b><span>{item.name}</span><button aria-label={`นำ ${item.code} ออกจากรายการที่เลือก`} onClick={() => toggle(item)} type="button"><X size={16} /></button></div>)}</div>}
    <footer><button aria-expanded={selectedOpen} className="selected-count" disabled={selected.size === 0} onClick={() => setSelectedOpen((value) => !value)} type="button">เลือกแล้ว <b>{selected.size}</b> รายการ <ChevronDown className={selectedOpen ? "open" : ""} size={18} /></button><div><button onClick={onClose} type="button">ยกเลิก</button>{!single && <button className="primary" disabled={selected.size === 0} onClick={confirm} type="button"><span className="desktop-add">เพิ่ม {selected.size} รายการ</span><span className="mobile-add">เพิ่มรายการ</span></button>}</div></footer>
  </dialog>;
}
