"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, FileText, History, Loader2, PackageCheck, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import {
  getCentralInventoryDetailsAction,
  getCentralInventoryStockAction,
  type CentralInventoryLot,
  type CentralInventoryMovement,
  type CentralInventoryOption,
  type CentralInventorySerial,
  type CentralInventorySummary,
} from "@/app/actions/inventory";
import {
  configuredStockFields,
  getStockState,
  stockDetailTabs,
  type CentralStockRow,
  type StockDetailTab,
  type StockStateCode,
} from "@/lib/central-stock";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { toast } from "@/components/toast";

type Props = {
  initialRows: CentralStockRow[];
  initialSummary?: CentralInventorySummary;
  initialTotal: number;
  itemTypes: CentralInventoryOption[];
  warehouses: CentralInventoryOption[];
};
type DetailData = { lots: CentralInventoryLot[]; serials: CentralInventorySerial[]; movements: CentralInventoryMovement[] };

const EMPTY_SUMMARY: CentralInventorySummary = { total: 0, available: 0, reserved: 0, lowStock: 0, stale: 0 };
const PAGE_SIZE = 25;
const tabLabels: Record<StockDetailTab, string> = {
  overview: "ข้อมูล", locations: "คลัง", lot: "Lot", serial: "Serial", attributes: "รายละเอียด", history: "Stock Card",
};

function quantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 4 });
}
function date(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function StateBadge({ row }: { row: CentralStockRow }) {
  const state = getStockState(row.availableQty, row.reorderPoint, row.updatedAt);
  return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>;
}

function availableQuantityClass(row: CentralStockRow) {
  const state = getStockState(row.availableQty, row.reorderPoint, row.updatedAt).code;
  if (state === "low_stock") return "text-amber-700 dark:text-amber-400";
  if (state === "out_of_stock") return "text-red-700 dark:text-red-400";
  if (state === "stale") return "text-slate-600 dark:text-slate-300";
  return "text-emerald-700 dark:text-emerald-400";
}

function primaryDetailTab(row: CentralStockRow): StockDetailTab {
  if (row.trackingMethod === "lot") return "lot";
  if (row.trackingMethod === "serial") return "serial";
  return "overview";
}

function SummaryStrip({ summary, active, onSelect }: { summary: CentralInventorySummary; active: StockStateCode | null; onSelect: (state: StockStateCode | null) => void }) {
  const cards: Array<{ label: string; value: number; state: StockStateCode | null; color: string }> = [
    { label: "รายการสินค้า", value: summary.total, state: null, color: "text-primary dark:text-red-400" },
    { label: "พร้อมใช้", value: summary.available, state: "available", color: "text-emerald-700 dark:text-emerald-400" },
    { label: "ติดจอง", value: summary.reserved, state: null, color: "text-blue-700 dark:text-blue-400" },
    { label: "ใกล้จุดสั่งซื้อ", value: summary.lowStock, state: "low_stock", color: "text-amber-700 dark:text-amber-400" },
    { label: "ค้างนาน", value: summary.stale, state: "stale", color: "text-slate-600 dark:text-slate-300" },
  ];
  return <div className="grid h-[58px] grid-cols-5 divide-x divide-outline-variant rounded-[6px] border border-outline-variant bg-surface-container-lowest px-1 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:h-[76px] sm:px-4 sm:py-3">
    {cards.map((card, index) => <button className={`min-w-0 text-center transition-colors hover:bg-surface-container-low ${card.state && active === card.state ? "bg-surface-container-low" : ""}`} key={`${card.label}-${index}`} onClick={() => onSelect(card.state)} type="button">
      <span className="block truncate text-[11px] text-secondary sm:text-[13px]">{card.label}</span>
      <strong className={`mt-0.5 block text-[18px] leading-6 tabular-nums sm:text-[22px] ${card.color}`}>{card.value.toLocaleString("th-TH")}</strong>
    </button>)}
  </div>;
}

function FilterSelect({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="relative mt-0.5 block h-10 rounded-[5px] border border-neutral-300 bg-surface-container-lowest focus-within:border-primary dark:border-neutral-700">
    <span className="pointer-events-none absolute left-2.5 top-0 z-10 -translate-y-1/2 bg-surface-container-lowest px-1 text-[10px] font-medium leading-3 text-on-surface-variant">{label}</span>
    <select aria-label={label} className="h-full w-full appearance-auto bg-transparent px-3 pb-0.5 pt-3 text-[13px] font-semibold text-on-surface outline-none dark:[color-scheme:dark]" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>
  </label>;
}

function StockCard({ movements, unit }: { movements: CentralInventoryMovement[]; unit: string }) {
  const rows = [...movements].reverse().reduce<Array<CentralInventoryMovement & { balance: number }>>((result, movement) => {
    const previousBalance = result.at(-1)?.balance ?? 0;
    return [...result, { ...movement, balance: previousBalance + movement.quantityChange }];
  }, []).reverse();
  return <div>
    <div className="mb-2 flex items-center gap-2 text-[13px] font-bold"><History size={16} className="text-primary" />ประวัติการเคลื่อนไหว</div>
    <div className="erp-data-table-frame overflow-x-auto">
      <table className="erp-data-table min-w-[760px] text-[13px]">
        <thead><tr><th>วันที่ - เวลา</th><th>รายการ</th><th>เอกสารอ้างอิง</th><th className="text-right">รับเข้า</th><th className="text-right">จ่ายออก</th><th className="text-right">คงเหลือ</th><th>ผู้ดำเนินการ</th></tr></thead>
        <tbody>{rows.map((movement) => <tr key={movement.id}><td>{dateTime(movement.createdAt)}</td><td>{movement.transactionType}</td><td className="font-bold text-primary">{movement.referenceDocNumber}</td><td className="text-right font-semibold text-emerald-700">{movement.quantityChange > 0 ? `+${quantity(movement.quantityChange)}` : "-"}</td><td className="text-right font-semibold text-red-700">{movement.quantityChange < 0 ? quantity(Math.abs(movement.quantityChange)) : "-"}</td><td className="text-right font-bold">{quantity(movement.balance)} {unit}</td><td>{movement.actorName}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-secondary">ยังไม่มีประวัติการเคลื่อนไหว</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}

function ExpandedPanel({ row, activeTab, onTabChange }: { row: CentralStockRow; activeTab: StockDetailTab; onTabChange: (tab: StockDetailTab) => void }) {
  const [details, setDetails] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fields = useMemo(() => configuredStockFields(row.formFieldConfig, { ...row.attributes, description: row.description, reorderPoint: row.reorderPoint, warehouseName: row.warehouseName }), [row]);
  const overviewFields = useMemo(() => fields.filter((field) => field.key !== "warehouse" && field.key !== "reorderPoint"), [fields]);
  const tabs = stockDetailTabs(row.trackingMethod);

  useEffect(() => {
    let live = true;
    void getCentralInventoryDetailsAction(row.itemId, row.warehouseId).then((result) => {
      if (!live) return;
      if ("error" in result) setError(result.error ?? "ไม่สามารถโหลดรายละเอียดได้");
      else setDetails({ lots: result.lots, serials: result.serials, movements: result.movements });
      setLoading(false);
    });
    return () => { live = false; };
  }, [row.itemId, row.warehouseId]);

  return <div className="border-t-2 border-primary bg-surface-container-lowest px-3 pb-3 sm:px-4">
    <nav className="flex gap-5 overflow-x-auto border-b border-outline-variant" aria-label="รายละเอียดสต็อก">
      {tabs.map((tab) => <button key={tab} type="button" onClick={() => onTabChange(tab)} className={`h-11 shrink-0 border-b-2 px-1 text-[13px] font-bold ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-secondary"}`}>{tabLabels[tab]}</button>)}
    </nav>
    <div className="pt-3 text-[13px]">
      {loading ? <div className="flex h-28 items-center justify-center"><Loader2 className="animate-spin text-primary" size={22} /></div> : error ? <p className="py-8 text-center text-red-700">{error}</p> : <>
        {activeTab === "overview" && <div>
          <div className="grid gap-4 lg:grid-cols-3">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-outline-variant lg:border-r lg:pr-5"><dt className="text-secondary">รหัสสินค้า</dt><dd className="font-bold text-primary">{row.itemCode}</dd><dt className="text-secondary">ชื่อสินค้า</dt><dd className="font-semibold">{row.itemName}</dd><dt className="text-secondary">ประเภท</dt><dd>{row.typeCode} · {row.typeName}</dd><dt className="text-secondary">หน่วย</dt><dd>{row.unitName || row.unitSymbol}</dd></dl>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-outline-variant lg:border-r lg:pr-5"><dt className="text-secondary">คลัง</dt><dd>{row.warehouseName}</dd><dt className="text-secondary">คงเหลือ</dt><dd className="font-bold">{quantity(row.onHandQty)} {row.unitSymbol}</dd><dt className="text-secondary">จอง</dt><dd>{quantity(row.reservedQty)} {row.unitSymbol}</dd><dt className="text-secondary">พร้อมใช้</dt><dd className={`font-bold ${availableQuantityClass(row)}`}>{quantity(row.availableQty)} {row.unitSymbol}</dd></dl>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2"><dt className="text-secondary">การควบคุม</dt><dd className="capitalize">{row.trackingMethod}</dd><dt className="text-secondary">จุดสั่งซื้อ</dt><dd>{quantity(row.reorderPoint)} {row.unitSymbol}</dd><dt className="text-secondary">อัปเดตล่าสุด</dt><dd>{dateTime(row.updatedAt)}</dd><dt className="text-secondary">สถานะ</dt><dd><StateBadge row={row} /></dd></dl>
          </div>
          {overviewFields.length > 0 && <section className="mt-4 border-t border-outline-variant pt-3"><h3 className="mb-2 font-bold">ข้อมูลประเภท</h3><div className="grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{overviewFields.map((field) => <div className="grid grid-cols-2 border-b border-outline-variant/60 py-1.5" key={field.key}><span className="text-secondary">{field.label}</span><strong>{field.value}</strong></div>)}</div></section>}
        </div>}
        {activeTab === "lot" && <div>
          <section className="min-w-0"><h3 className="mb-2 font-bold">ข้อมูล Lot</h3><div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-[11px]"><thead className="border-b border-outline-variant text-left"><tr><th className="py-2 pr-3">Internal Lot</th><th className="py-2 pr-3">Vendor Lot</th><th className="py-2 pr-3">วันที่รับเข้า</th><th className="py-2 pr-3">วันหมดอายุ</th><th className="py-2 pr-3 text-right">คงเหลือ</th><th className="py-2 pr-3 text-right">ติดจอง</th><th className="py-2 text-right">พร้อมใช้</th></tr></thead><tbody>{details?.lots.map((lot) => <tr className="border-b border-outline-variant/60 last:border-0" key={lot.id}><td className="py-2 pr-3 font-bold text-primary">{lot.lotNumber}</td><td className="py-2 pr-3">{lot.vendorLotNumber}</td><td className="py-2 pr-3">{date(lot.receivedAt)}</td><td className="py-2 pr-3">{date(lot.expiryDate)}</td><td className="py-2 pr-3 text-right">{quantity(lot.onHandQty)}</td><td className="py-2 pr-3 text-right">{quantity(lot.reservedQty)}</td><td className="py-2 text-right font-bold text-emerald-700">{quantity(lot.availableQty)}</td></tr>)}{!details?.lots.length && <tr><td colSpan={7} className="py-7 text-center text-secondary">ไม่พบข้อมูล Lot</td></tr>}</tbody></table></div></section>
        </div>}
        {activeTab === "serial" && <div className="erp-data-table-frame overflow-x-auto"><table className="erp-data-table min-w-[560px] text-[11px]"><thead><tr><th>Serial Number</th><th>สถานะ</th><th>วันที่รับเข้าระบบ</th></tr></thead><tbody>{details?.serials.map((serial) => <tr key={serial.id}><td className="font-sans font-bold text-primary">{serial.serialNumber}</td><td><StatusBadge tone={serial.status === "in_stock" ? "info" : "success"}>{serial.status === "in_stock" ? "ในคลัง" : serial.status}</StatusBadge></td><td>{dateTime(serial.createdAt)}</td></tr>)}{!details?.serials.length && <tr><td colSpan={3} className="py-7 text-center text-secondary">ไม่พบ Serial Number</td></tr>}</tbody></table></div>}
        {activeTab === "history" && <StockCard movements={details?.movements ?? []} unit={row.unitSymbol} />}
      </>}
    </div>
  </div>;
}

export function StockDashboardPage({ initialRows, initialSummary = EMPTY_SUMMARY, initialTotal, itemTypes, warehouses }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [state, setState] = useState<StockStateCode | null>(null);
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState("");
  const [activeTab, setActiveTab] = useState<StockDetailTab>("overview");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [isPending, startTransition] = useTransition();
  const firstRun = useRef(true);
  const requestId = useRef(0);

  const load = (nextPage = page) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const result = await getCentralInventoryStockAction({ search, itemTypeId: Number(typeId) || null, warehouseId: Number(warehouseId) || null, state, page: nextPage, pageSize: PAGE_SIZE });
      if (id !== requestId.current || "error" in result) return;
      setRows(result.data); setTotal(result.total); setSummary(result.summary); setExpandedKey("");
    });
  };
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const timer = window.setTimeout(() => load(page), 250);
    return () => window.clearTimeout(timer);
    // Query state below intentionally drives the debounced server request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeId, warehouseId, state, page]);

  const toggle = (row: CentralStockRow) => {
    const key = `${row.itemId}:${row.warehouseId}`;
    setExpandedKey((current) => current === key ? "" : key);
    setActiveTab(primaryDetailTab(row));
  };
  const exportRows = () => {
    const lines = [["รหัสสินค้า", "ชื่อสินค้า", "ประเภท", "คงเหลือ", "จอง", "พร้อมใช้", "หน่วย", "คลัง"], ...rows.map((row) => [row.itemCode, row.itemName, row.typeCode, row.onHandQty, row.reservedQty, row.availableQty, row.unitSymbol, row.warehouseName])];
    const blob = new Blob(["\uFEFF" + lines.map((line) => line.join("\t")).join("\n")], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "Central_Inventory.xls"; anchor.click(); URL.revokeObjectURL(url);
    toast.success("ส่งออกรายงานสต็อกสินค้าเรียบร้อย");
  };
  const filterFields = <>
    <FilterSelect label="ประเภทสินค้า" value={typeId} onChange={(value) => { setTypeId(value); setPage(1); }}><option value="">ทั้งหมด</option>{itemTypes.map((type) => <option key={type.id} value={type.id}>{type.code} · {type.name}</option>)}</FilterSelect>
    <FilterSelect label="คลัง" value={warehouseId} onChange={(value) => { setWarehouseId(value); setPage(1); }}><option value="">ทั้งหมด</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</FilterSelect>
    <FilterSelect label="สถานะ" value={state ?? ""} onChange={(value) => { setState((value || null) as StockStateCode | null); setPage(1); }}><option value="">ทั้งหมด</option><option value="available">พร้อมใช้</option><option value="low_stock">ใกล้จุดสั่งซื้อ</option><option value="out_of_stock">หมดสต็อก</option><option value="stale">ค้างนาน</option></FilterSelect>
  </>;

  return <section className="flex min-h-[calc(100dvh-116px)] min-w-0 flex-col gap-4 text-on-surface">
    <header className="flex min-h-[58px] items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="hidden shrink-0 border-r border-outline-variant pr-4 text-center sm:block"><strong className="block text-[26px] font-black leading-7 text-primary dark:text-red-400">KRC</strong><span className="block text-[10px] font-bold tracking-[0.16em] text-primary dark:text-red-400">ERP</span></div>
        <div className="min-w-0"><h1 className="text-[24px] font-bold leading-tight sm:text-[28px]">สต็อกสินค้าคงเหลือกลาง</h1><p className="mt-1 text-[13px] text-on-surface-variant sm:text-[14px]">ตรวจสอบคงเหลือจริง ยอดจอง และยอดพร้อมใช้ทุกคลัง</p></div>
      </div>
      <div className="hidden shrink-0 items-end gap-2 sm:flex"><span suppressHydrationWarning className="mr-2 self-start pt-1 text-[13px] text-on-surface-variant">วันที่ {new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())} น.</span><button type="button" onClick={() => load()} className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-4 text-[14px] font-semibold text-on-surface hover:bg-surface-container"><RefreshCw size={18} className={isPending ? "animate-spin" : ""} />รีเฟรช</button><ExcelExportButton onClick={exportRows} /></div>
    </header>
    <SummaryStrip summary={summary} active={state} onSelect={(next) => { setState((current) => current === next && next !== null ? null : next); setPage(1); }} />
    <div><div className="grid gap-3 md:grid-cols-[minmax(300px,1.7fr)_repeat(3,minmax(150px,1fr))]"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={19} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-10 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary" placeholder="ค้นหารหัสสินค้า, ชื่อสินค้า, รายละเอียด, Part No." /></label><button type="button" aria-label="ตัวกรอง" onClick={() => setMobileFilters((value) => !value)} className="inline-flex h-10 w-11 items-center justify-center rounded-[3px] border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container md:hidden"><SlidersHorizontal size={18} /></button><div className="hidden contents md:contents">{filterFields}</div></div>{mobileFilters && <div className="mt-2 grid gap-2 md:hidden">{filterFields}</div>}</div>
    <div className={`relative ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>{isPending && <Loader2 className="absolute right-3 top-3 z-20 animate-spin text-primary" size={18} />}
      <div className="erp-data-table-frame hidden overflow-x-auto md:block">
        <table className="erp-data-table min-w-[1000px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[3.5%]" />
            <col className="w-[8.5%]" />
            <col className="w-[27%]" />
            <col className="w-[5.5%]" />
            <col className="w-[6.5%]" />
            <col className="w-[6%]" />
            <col className="w-[6.5%]" />
            <col className="w-[5.5%]" />
            <col className="w-[13.5%]" />
            <col className="w-[9.5%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="เปิดรายละเอียด" />
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า / รายละเอียด</th>
              <th>ประเภท</th>
              <th className="text-center">คงเหลือ</th>
              <th className="text-center">ติดจอง</th>
              <th className="text-center">พร้อมใช้</th>
              <th className="text-center">หน่วย</th>
              <th>คลัง</th>
              <th>สถานะ</th>
              <th className="text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.itemId}:${row.warehouseId}`;
              const open = expandedKey === key;
              return <Fragment key={key}>
                <tr className={`!h-[58px] ${open ? "border-l-2 border-l-primary !bg-surface-container-low" : ""}`}>
                  <td className="!px-2 text-center"><button type="button" aria-label={open ? "ปิดรายละเอียด" : "ดูรายละเอียด"} onClick={() => toggle(row)} className="inline-flex h-8 w-8 items-center justify-center">{open ? <ChevronUp className="text-primary" size={16} /> : <ChevronDown className="-rotate-90" size={16} />}</button></td>
                  <td className="!px-2 font-bold text-primary dark:text-red-400 whitespace-nowrap">{row.itemCode}</td>
                  <td className="!px-2"><strong className="block whitespace-normal break-words text-[13px] leading-[18px]">{row.itemName}</strong>{row.description && <span className="mt-0.5 block whitespace-normal break-words text-[12px] font-normal leading-[16px] text-on-surface-variant">{row.description}</span>}</td>
                  <td className="!px-2 whitespace-nowrap">
                    <ItemTypeBadge code={row.typeCode} name={row.typeName} />
                  </td>
                  <td className="!px-2 text-center font-bold tabular-nums whitespace-nowrap">{quantity(row.onHandQty)}</td>
                  <td className="!px-2 text-center tabular-nums whitespace-nowrap">{quantity(row.reservedQty)}</td>
                  <td className={`!px-2 text-center font-bold tabular-nums whitespace-nowrap ${availableQuantityClass(row)}`}>{quantity(row.availableQty)}</td>
                  <td className="!px-2 text-center whitespace-nowrap">{row.unitSymbol || row.unitName}</td>
                  <td className="!px-2"><strong className="block whitespace-normal break-words text-[13px] leading-[18px]">{row.warehouseName}</strong></td>
                  <td className="!px-2 whitespace-nowrap"><StateBadge row={row} /></td>
                  <td className="!px-2 text-center whitespace-nowrap"><button type="button" onClick={() => { setExpandedKey(key); setActiveTab("history"); }} className="inline-flex h-8 items-center gap-1 rounded-[3px] border border-primary/35 bg-surface-container-lowest px-2 text-[12px] font-bold text-primary hover:bg-surface-container dark:border-red-400/40 dark:text-red-400"><FileText size={14} />บัตรสต็อก</button></td>
                </tr>
                {open && <tr><td className="!p-3" colSpan={11}><div className="rounded-[6px] border border-outline-variant bg-surface-container-lowest"><ExpandedPanel row={row} activeTab={activeTab} onTabChange={setActiveTab} /></div></td></tr>}
              </Fragment>;
            })}
            {rows.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-secondary"><PackageCheck className="mx-auto mb-2" size={28} />ไม่พบรายการสต็อกตามเงื่อนไข</td></tr>}
          </tbody>
        </table>
        <Pagination currentPage={page} disabled={isPending} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={total} />
      </div>
      <div className="border border-outline-variant bg-surface-container-lowest md:hidden"><div className="grid grid-cols-[34px_1fr_auto] border-b border-outline-variant bg-surface-container-low px-2 py-2 text-[11px] font-bold"><span>ลำดับ</span><span>รหัส / ชื่อสินค้า</span><span>สถานะ</span></div>
        {rows.map((row, index) => { const key = `${row.itemId}:${row.warehouseId}`; const open = expandedKey === key; return <article className={`border-b border-outline-variant ${open ? "border-l-2 border-l-primary" : ""}`} key={key} style={{ contentVisibility: "auto", containIntrinsicSize: "90px" }}><button type="button" onClick={() => toggle(row)} className="grid w-full grid-cols-[34px_1fr_auto_18px] items-start gap-1 px-2 py-2.5 text-left"><span className="text-center text-[13px]">{(page - 1) * PAGE_SIZE + index + 1}</span><span className="min-w-0"><strong className="block text-[13px] text-primary">{row.itemCode}</strong><strong className="block whitespace-normal break-words text-[13px] leading-[18px]">{row.itemName}</strong><span className="mt-0.5 block whitespace-normal break-words text-[12px] leading-[16px] text-on-surface-variant">{row.typeCode} · {row.warehouseName} · พร้อมใช้ {quantity(row.availableQty)} {row.unitSymbol}</span></span><StateBadge row={row} />{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{open && <ExpandedPanel row={row} activeTab={activeTab} onTabChange={setActiveTab} />}</article>; })}
        {rows.length === 0 && <div className="py-14 text-center text-[14px] text-on-surface-variant">ไม่พบรายการสต็อกตามเงื่อนไข</div>}<Pagination currentPage={page} disabled={isPending} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={total} />
      </div>
    </div>
  </section>;
}
