"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DataTable, DataTableEmpty, DataTableFrame } from "@/components/data-table";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { AVAILABLE_REPORT_CATALOG, REPORT_CATEGORY_META } from "@/lib/report-catalog";

type Category = "all" | keyof typeof REPORT_CATEGORY_META;
type ReportGroup = "all" | (typeof AVAILABLE_REPORT_CATALOG)[number]["group"];
type Scope = "catalog" | "favorites" | "recent";

const PURCHASE_GROUPS = [["pr", "ใบขอซื้อ (PR)", 6], ["po", "ใบสั่งซื้อ (PO)", 8], ["vendor", "ผู้ขาย", 6], ["receipt", "การรับสินค้า", 4], ["return", "การคืนสินค้า", 4]] as const;

export function ReportCenter() {
  const [category, setCategory] = useState<Category>("purchase");
  const [group, setGroup] = useState<ReportGroup>("all");
  const [view, setView] = useState<"list" | "grid">("list");
  const [scope, setScope] = useState<Scope>("catalog");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(() => new Set(["pending-receipts", "purchase-by-vendor"]));
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const savedFavorites = JSON.parse(localStorage.getItem("report-favorites") ?? "null");
        const savedRecent = JSON.parse(localStorage.getItem("report-recent") ?? "[]");
        if (Array.isArray(savedFavorites)) setFavorites(new Set(savedFavorites));
        if (Array.isArray(savedRecent)) setRecent(savedRecent);
      } catch { /* ใช้ค่าเริ่มต้นเมื่อข้อมูลเดิมไม่ถูกต้อง */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const rows = useMemo(() => AVAILABLE_REPORT_CATALOG.filter((report) =>
    (category === "all" || report.category === category) &&
    (group === "all" || report.group === group) &&
    (scope !== "favorites" || favorites.has(report.id)) &&
    (scope !== "recent" || recent.includes(report.id)) &&
    `${report.name} ${report.description}`.toLowerCase().includes(query.trim().toLowerCase())), [category, favorites, group, query, recent, scope]);

  const visibleRows = scope === "recent" ? [...rows].sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id)) : rows;

  const selectCategory = (next: Category) => { setCategory(next); setGroup("all"); setScope("catalog"); };

  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem("report-favorites", JSON.stringify([...next]));
    return next;
  });

  const selectScope = (next: Exclude<Scope, "catalog">) => { setScope(next); setCategory("all"); setGroup("all"); };
  const recordOpen = (id: string) => setRecent((current) => {
    const next = [id, ...current.filter((item) => item !== id)].slice(0, 20);
    localStorage.setItem("report-recent", JSON.stringify(next));
    return next;
  });

  return (
    <section className="flex min-h-[calc(100dvh-128px)] min-w-0 flex-col gap-3">
      <div>
        <h1 className="text-[24px] font-bold leading-[1.25]">ศูนย์รวมรายงาน</h1>
        <p className="text-[13px] font-medium text-secondary">ค้นหา เรียกดู และเปิดใช้งานรายงานขององค์กร</p>
      </div>

      <MobileListFilters
        activeCount={(category === "purchase" ? 0 : 1) + (group === "all" ? 0 : 1)}
        onClear={() => { setCategory("purchase"); setGroup("all"); setScope("catalog"); }}
        search={<ListSearchField onChange={setQuery} placeholder="ค้นหารายงาน ชื่อรายงาน หรือคำอธิบาย..." value={query} />}
      >
        <ListFilterSelect label="หมวดหมู่รายงาน" onChange={(value) => selectCategory(value as Category)} value={category}>
          <option value="all">หมวดหมู่ทั้งหมด</option>
          {Object.entries(REPORT_CATEGORY_META).filter(([, value]) => value.count > 0).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </ListFilterSelect>
        {category === "purchase" ? <ListFilterSelect label="หมวดย่อยจัดซื้อ" onChange={(value) => setGroup(value as ReportGroup)} value={group}>
          <option value="all">รายงานจัดซื้อทั้งหมด</option>
          {PURCHASE_GROUPS.map(([value, label, count]) => <option key={value} value={value}>{label} ({count})</option>)}
        </ListFilterSelect> : null}
        <div className="grid h-[38px] min-w-0 grid-cols-2 overflow-hidden rounded-[4px] border border-outline-variant bg-surface-container-lowest">
          <button aria-pressed={view === "list"} className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-[13px] font-bold ${view === "list" ? "bg-primary text-white" : "text-secondary"}`} onClick={() => setView("list")} type="button"><span className="material-symbols-outlined shrink-0 text-[18px]">view_list</span><span>รายการ</span></button>
          <button aria-pressed={view === "grid"} className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-[13px] font-bold ${view === "grid" ? "bg-primary text-white" : "text-secondary"}`} onClick={() => setView("grid")} type="button"><span className="material-symbols-outlined shrink-0 text-[18px]">grid_view</span><span>ไอคอน</span></button>
        </div>
      </MobileListFilters>

      <div className="hidden gap-2 md:grid xl:grid-cols-[minmax(320px,1fr)_275px_240px]">
        <ListSearchField onChange={setQuery} placeholder="ค้นหารายงาน ชื่อรายงาน หรือคำอธิบาย..." value={query} />
        <ListFilterSelect label="หมวดหมู่รายงาน" onChange={(value) => selectCategory(value as Category)} value={category}>
          <option value="all">หมวดหมู่ทั้งหมด</option>
          {Object.entries(REPORT_CATEGORY_META).filter(([, value]) => value.count > 0).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </ListFilterSelect>
        <div className="grid h-[38px] min-w-0 grid-cols-2 overflow-hidden rounded-[4px] border border-outline-variant bg-surface-container-lowest">
          <button aria-pressed={view === "list"} className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-[13px] font-bold ${view === "list" ? "bg-primary text-white" : "text-secondary"}`} onClick={() => setView("list")} type="button"><span className="material-symbols-outlined shrink-0 text-[18px]">view_list</span><span>รายการ</span></button>
          <button aria-pressed={view === "grid"} className={`flex min-w-0 items-center justify-center gap-1.5 px-3 text-[13px] font-bold ${view === "grid" ? "bg-primary text-white" : "text-secondary"}`} onClick={() => setView("grid")} type="button"><span className="material-symbols-outlined shrink-0 text-[18px]">grid_view</span><span>ไอคอน</span></button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-[5px] border border-[#d8dde4] bg-surface-container-lowest xl:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="border-b border-[#d8dde4] xl:border-b-0 xl:border-r">
          <h2 className="border-b border-[#d8dde4] px-4 py-3 text-[18px] font-bold">แค็ตตาล็อกรายงาน</h2>
          <div className="grid gap-2 p-3 xl:hidden">
            <div className="grid grid-cols-2 gap-2">
              <button className={`flex h-10 items-center justify-center gap-2 rounded-[4px] border border-[#d8dde4] text-[13px] font-semibold ${scope === "favorites" ? "bg-primary-fixed text-primary" : "bg-background"}`} onClick={() => selectScope("favorites")} type="button"><span className="material-symbols-outlined text-[19px] text-amber-500">star</span>รายการโปรด ({favorites.size})</button>
              <button className={`flex h-10 items-center justify-center gap-2 rounded-[4px] border border-[#d8dde4] text-[13px] font-semibold ${scope === "recent" ? "bg-primary-fixed text-primary" : "bg-background"}`} onClick={() => selectScope("recent")} type="button"><span className="material-symbols-outlined text-[19px]">history</span>เปิดล่าสุด ({recent.length})</button>
            </div>
          </div>
          <nav className="hidden space-y-1 p-2 xl:block" aria-label="หมวดรายงาน">
            <button className={`flex min-w-max items-center gap-2 rounded-[3px] px-3 py-2 text-[14px] font-semibold lg:w-full ${scope === "favorites" ? "bg-primary-fixed text-primary" : "hover:bg-surface-container-low"}`} onClick={() => selectScope("favorites")} type="button"><span className="material-symbols-outlined text-amber-500">star</span>รายการโปรด ({favorites.size})</button>
            <button className={`flex min-w-max items-center gap-2 rounded-[3px] px-3 py-2 text-[14px] font-semibold lg:w-full ${scope === "recent" ? "bg-primary-fixed text-primary" : "hover:bg-surface-container-low"}`} onClick={() => selectScope("recent")} type="button"><span className="material-symbols-outlined">history</span>เปิดล่าสุด ({recent.length})</button>
            {Object.entries(REPORT_CATEGORY_META).filter(([, meta]) => meta.count > 0).map(([key, meta]) => {
              const active = category === key;
              return <div key={key}>
                <button className={`flex min-w-max items-center gap-2 rounded-[3px] px-3 py-2 text-[14px] font-bold lg:w-full ${active && group === "all" ? "bg-primary-fixed text-primary" : "hover:bg-surface-container-low"}`} onClick={() => selectCategory(key as Category)} type="button"><span className="material-symbols-outlined text-[20px]">{active ? "folder_open" : meta.icon}</span><span className="flex-1 text-left">{meta.label}</span><span>({meta.count})</span><span className="material-symbols-outlined hidden text-[17px] lg:inline">{active ? "expand_more" : "chevron_right"}</span></button>
                {active && key === "purchase" ? <div className="ml-7 border-l border-[#d8dde4] pl-2">
                  {PURCHASE_GROUPS.map(([value, label, count]) => <button className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px] font-semibold ${group === value ? "bg-primary-fixed text-primary" : "hover:bg-surface-container-low"}`} key={value} onClick={() => setGroup(value)} type="button"><span className="material-symbols-outlined text-[18px]">{group === value ? "folder_open" : "folder"}</span><span className="flex-1 text-left">{label}</span><span>({count})</span></button>)}
                </div> : null}
              </div>;
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-[#d8dde4] px-4 py-3"><h2 className="text-[18px] font-bold">{scope === "favorites" ? "รายการโปรด" : scope === "recent" ? "เปิดล่าสุด" : group !== "all" ? PURCHASE_GROUPS.find(([value]) => value === group)?.[1] : category === "all" ? "รายงานทั้งหมด" : `รายงาน${REPORT_CATEGORY_META[category].label}`}</h2><span className="text-[13px] font-medium text-secondary">ทั้งหมด {visibleRows.length} รายการ</span></div>
          {view === "list" ? <DataTableFrame className="min-h-0 flex-1 !rounded-none !border-0 !shadow-none">
            <DataTable className="min-w-[880px]">
              <colgroup><col className="w-[48px]" /><col className="w-[280px]" /><col /><col className="w-[130px]" /><col className="w-[110px]" /></colgroup>
              <thead><tr><th aria-label="รายการโปรด" /><th>ชื่อรายงาน</th><th>คำอธิบาย</th><th>ปรับปรุงล่าสุด</th><th>การดำเนินการ</th></tr></thead>
              <tbody>{visibleRows.length ? visibleRows.map((report) => <tr key={report.id}>
                <td><button aria-label={favorites.has(report.id) ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด"} className={`material-symbols-outlined text-[20px] ${favorites.has(report.id) ? "text-primary" : "text-secondary"}`} onClick={() => toggleFavorite(report.id)} style={{fontVariationSettings: favorites.has(report.id) ? "'FILL' 1" : undefined}} type="button">star</button></td>
                <td className="font-bold">{report.name}</td><td className="font-medium text-secondary">{report.description}</td><td>{report.updatedAt}</td>
                <td>{report.href === "#" ? <button className="inline-flex h-8 items-center gap-1 rounded-[3px] border border-[#d8dde4] px-3 font-bold text-secondary" disabled type="button"><span className="material-symbols-outlined text-[17px]">schedule</span>เร็ว ๆ นี้</button> : <Link className="inline-flex h-8 items-center gap-1 rounded-[3px] border border-[#d8dde4] px-3 font-bold hover:border-primary hover:text-primary" href={report.href} onClick={() => recordOpen(report.id)}><span className="material-symbols-outlined text-[17px]">open_in_new</span>เปิด</Link>}</td>
              </tr>) : <DataTableEmpty colSpan={5}>ไม่พบรายงานในหมวดนี้</DataTableEmpty>}</tbody>
            </DataTable>
          </DataTableFrame> : <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 overflow-auto p-3">
            {visibleRows.map((report) => <article className="flex min-h-36 flex-col rounded-[5px] border border-[#d8dde4] bg-background p-3" key={report.id}>
              <div className="flex items-start gap-2"><span className="material-symbols-outlined text-[22px] text-primary">description</span><h3 className="flex-1 font-bold leading-5">{report.name}</h3><button aria-label={favorites.has(report.id) ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด"} className={`material-symbols-outlined text-[20px] ${favorites.has(report.id) ? "text-primary" : "text-secondary"}`} onClick={() => toggleFavorite(report.id)} style={{fontVariationSettings: favorites.has(report.id) ? "'FILL' 1" : undefined}} type="button">star</button></div>
              <p className="mt-2 flex-1 text-[12px] leading-5 text-secondary">{report.description}</p>
              <div className="mt-3 flex items-center justify-between border-t border-[#d8dde4] pt-2 text-[12px] text-secondary"><span>{report.updatedAt}</span>{report.href === "#" ? <button className="font-bold" disabled type="button">เร็ว ๆ นี้</button> : <Link className="font-bold text-primary" href={report.href} onClick={() => recordOpen(report.id)}>เปิด</Link>}</div>
            </article>)}
          </div>}
          <Pagination currentPage={1} onPageChange={() => undefined} pageSize={50} totalItems={visibleRows.length} />
        </div>
      </div>
    </section>
  );
}
