"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Box, CalendarDays, ChevronDown, ChevronUp, Filter, History, Loader2, LockKeyhole, PackageCheck, RefreshCw, Warehouse } from "lucide-react";
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
import { ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";

type Props = {
  initialRows: CentralStockRow[];
  initialSummary?: CentralInventorySummary;
  initialTotal: number;
  itemTypes: CentralInventoryOption[];
  warehouses: CentralInventoryOption[];
};
type DetailData = { lots: CentralInventoryLot[]; serials: CentralInventorySerial[]; movements: CentralInventoryMovement[] };

const EMPTY_SUMMARY: CentralInventorySummary = { total: 0, available: 0, reserved: 0, lowStock: 0, stale: 0, inventoryValue: null, rawMaterialValue: null, canViewCost: false, canExportCost: false };
const PAGE_SIZE = 25;
const tabLabels: Record<StockDetailTab, string> = {
  overview: "ข้อมูล", locations: "คลัง", lot: "Lot", serial: "Serial", attributes: "รายละเอียด", history: "Stock Card",
};

function quantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 4 });
}
function money(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;
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

function mobileDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function mobileDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function movementLabel(value: string) {
  const labels: Record<string, string> = {
    receipt: "รับสินค้า",
    goods_receipt: "รับสินค้า",
    issue: "เบิกสินค้า",
    stock_issue: "เบิกสินค้า",
    transfer: "โอนย้าย",
    adjustment: "ปรับปรุงสต็อก",
    reversal: "กลับรายการ",
  };
  return labels[value.toLowerCase()] ?? value;
}

function primaryDetailTab(row: CentralStockRow): StockDetailTab {
  if (row.trackingMethod === "lot") return "lot";
  if (row.trackingMethod === "serial") return "serial";
  return "overview";
}

function SummaryStrip({ summary, active, onSelect }: { summary: CentralInventorySummary; active: StockStateCode | null; onSelect: (state: StockStateCode | null) => void }) {
  const cards: Array<{ label: string; value: number | null; state: StockStateCode | null; color: string; money?: boolean }> = [
    { label: "รายการสินค้า", value: summary.total, state: null, color: "text-primary dark:text-red-400" },
    { label: "ใกล้จุดสั่งซื้อ", value: summary.lowStock, state: "low_stock", color: "text-amber-700 dark:text-amber-400" },
    ...(summary.canViewCost ? [
      { label: "มูลค่าสต็อก", value: summary.inventoryValue, state: null, color: "text-on-surface", money: true },
      { label: "มูลค่าคงเหลือวัตถุดิบ", value: summary.rawMaterialValue, state: null, color: "text-on-surface", money: true },
    ] : []),
  ];
  return <div className={`grid min-h-[76px] divide-x divide-outline-variant rounded-[6px] border border-outline-variant bg-surface-container-lowest px-1 py-2 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:px-3 sm:py-3 ${summary.canViewCost ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
    {cards.map((card, index) => <button className={`min-w-0 px-1 text-center transition-colors hover:bg-surface-container-low ${card.state && active === card.state ? "bg-surface-container-low" : ""}`} key={`${card.label}-${index}`} onClick={() => onSelect(card.state)} type="button">
      <span className="block whitespace-normal text-[10px] leading-4 text-secondary sm:text-[12px]">{card.label}</span>
      <strong className={`mt-0.5 block whitespace-nowrap leading-6 tabular-nums ${card.money ? "text-[clamp(10px,2.8vw,20px)] tracking-tight sm:text-[clamp(12px,1.25vw,20px)]" : "text-[17px] sm:text-[20px]"} ${card.color}`}>{card.money ? money(card.value) : Number(card.value ?? 0).toLocaleString("th-TH")}</strong>
    </button>)}
  </div>;
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
  const showVendorLot = details?.lots.some((lot) => lot.vendorLotNumber !== "-") ?? false;
  const showExpiry = row.expiryControlled;
  const showCost = row.inventoryValue !== null;
  const lotColumnCount = 4 + Number(showVendorLot) + Number(showExpiry) + (showCost ? 2 : 0);

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
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-outline-variant lg:border-r lg:pr-5"><dt className="text-secondary">คลัง</dt><dd>{row.warehouseName}</dd><dt className="text-secondary">คงเหลือ</dt><dd className="font-bold">{quantity(row.onHandQty)} {row.unitSymbol}</dd></dl>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2"><dt className="text-secondary">การควบคุม</dt><dd className="capitalize">{row.trackingMethod}</dd><dt className="text-secondary">จุดสั่งซื้อ</dt><dd>{quantity(row.reorderPoint)} {row.unitSymbol}</dd><dt className="text-secondary">อัปเดตล่าสุด</dt><dd>{dateTime(row.updatedAt)}</dd><dt className="text-secondary">สถานะ</dt><dd><StateBadge row={row} /></dd></dl>
          </div>
          {overviewFields.length > 0 && <section className="mt-4 border-t border-outline-variant pt-3"><h3 className="mb-2 font-bold">ข้อมูลประเภท</h3><div className="grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{overviewFields.map((field) => <div className="grid grid-cols-2 border-b border-outline-variant/60 py-1.5" key={field.key}><span className="text-secondary">{field.label}</span><strong>{field.value}</strong></div>)}</div></section>}
        </div>}
        {activeTab === "lot" && <section className="min-w-0 overflow-x-auto">
          <table className="w-max border-collapse text-[10px] sm:text-[11px]">
            <thead className="border-b border-outline-variant bg-surface-container-low text-left"><tr>
              <th className="whitespace-nowrap px-3 py-2">Internal Lot</th>
              {showVendorLot && <th className="whitespace-nowrap px-3 py-2">Vendor Lot</th>}
              <th className="whitespace-nowrap px-3 py-2">วันที่รับเข้า ↑ FIFO</th>
              <th className="whitespace-nowrap px-3 py-2">อ้างอิง GR</th>
              {showExpiry && <th className="whitespace-nowrap px-3 py-2">วันหมดอายุ</th>}
              <th className="whitespace-nowrap px-3 py-2 text-right">คงเหลือ</th>
              {showCost && <><th className="whitespace-nowrap px-3 py-2 text-right">ต้นทุน/หน่วย (฿)</th><th className="whitespace-nowrap px-3 py-2 text-right">มูลค่าคงเหลือ (฿)</th></>}
            </tr></thead>
            <tbody>{details?.lots.map((lot) => <tr className="border-b border-outline-variant/60 last:border-0" key={lot.id}>
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{lot.lotNumber}</td>
              {showVendorLot && <td className="whitespace-nowrap px-3 py-2">{lot.vendorLotNumber}</td>}
              <td className="whitespace-nowrap px-3 py-2">{date(lot.receivedAt)}</td>
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-primary dark:text-red-400">{lot.grNumber}</td>
              {showExpiry && <td className="whitespace-nowrap px-3 py-2">{date(lot.expiryDate)}</td>}
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{quantity(lot.onHandQty)} {row.unitSymbol}</td>
              {showCost && <><td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(lot.unitCost).replace(" ฿", "")}</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{money(lot.inventoryValue).replace(" ฿", "")}</td></>}
            </tr>)}{!details?.lots.length && <tr><td colSpan={lotColumnCount} className="py-7 text-center text-secondary">ไม่พบข้อมูล Lot</td></tr>}</tbody>
          </table>
        </section>}
        {activeTab === "serial" && <div className="erp-data-table-frame overflow-x-auto"><table className="erp-data-table min-w-[560px] text-[11px]"><thead><tr><th>Serial Number</th><th>สถานะ</th><th>วันที่รับเข้าระบบ</th></tr></thead><tbody>{details?.serials.map((serial) => <tr key={serial.id}><td className="font-sans font-bold text-primary">{serial.serialNumber}</td><td><StatusBadge tone={serial.status === "in_stock" ? "info" : "success"}>{serial.status === "in_stock" ? "ในคลัง" : serial.status}</StatusBadge></td><td>{dateTime(serial.createdAt)}</td></tr>)}{!details?.serials.length && <tr><td colSpan={3} className="py-7 text-center text-secondary">ไม่พบ Serial Number</td></tr>}</tbody></table></div>}
        {activeTab === "history" && <StockCard movements={details?.movements ?? []} unit={row.unitSymbol} />}
      </>}
    </div>
  </div>;
}

function MobileStockDetail({ row, onClose }: { row: CentralStockRow; onClose: () => void }) {
  const [details, setDetails] = useState<DetailData | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "lot" | "serial" | "history">("history");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

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

  const movements = useMemo(() => {
    const newestFirst = [...(details?.movements ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return newestFirst.reduce<{ rows: Array<CentralInventoryMovement & { balance: number }>; balance: number }>((result, movement) => ({
      rows: [...result.rows, { ...movement, balance: result.balance }],
      balance: result.balance - movement.quantityChange,
    }), { rows: [], balance: row.onHandQty }).rows.filter((movement) => {
      const day = movement.createdAt.slice(0, 10);
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  }, [details?.movements, endDate, row.onHandQty, startDate]);

  const dateRange = useMemo(() => {
    const dates = (details?.movements ?? []).map((movement) => movement.createdAt.slice(0, 10)).sort();
    if (!dates.length) return "ทุกช่วงเวลา";
    const first = startDate || dates[0];
    const last = endDate || dates.at(-1) || dates[0];
    return `${mobileDate(first)} - ${mobileDate(last)}`;
  }, [details?.movements, endDate, startDate]);

  const tabs: Array<{ id: "overview" | "lot" | "serial" | "history"; label: string }> = [
    { id: "overview", label: "ภาพรวม" },
    ...(row.trackingMethod === "lot" ? [{ id: "lot" as const, label: "Lot" }] : []),
    ...(row.trackingMethod === "serial" ? [{ id: "serial" as const, label: "Serial" }] : []),
    { id: "history", label: "Stock Card" },
  ];
  const fields = configuredStockFields(row.formFieldConfig, { ...row.attributes, description: row.description, reorderPoint: row.reorderPoint, warehouseName: row.warehouseName });

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-surface-container-lowest text-on-surface md:hidden">
    <header className="sticky top-0 z-10 flex h-[58px] items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" aria-label="กลับไปหน้าสต็อกสินค้า" onClick={onClose} className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center"><ArrowLeft size={26} /></button>
        <h1 className="truncate text-[22px] font-bold">รายละเอียดสินค้า</h1>
      </div>
      <strong className="ml-3 shrink-0 text-[20px] font-black"><span className="text-primary dark:text-red-400">KRC</span> ERP</strong>
    </header>

    <section className="px-5 pb-5 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><strong className="block text-[26px] font-black leading-8">{row.itemCode}</strong><h2 className="mt-1 whitespace-normal break-words text-[20px] font-bold leading-7">{row.itemName}</h2>{row.description && <p className="mt-1 text-[13px] leading-5 text-on-surface-variant">{row.description}</p>}</div>
        <StateBadge row={row} />
      </div>
      <div className="mt-5 grid grid-cols-2 divide-x divide-outline-variant text-[15px]">
        <div className="flex items-center gap-3 pr-4"><Warehouse size={22} /><span>{row.warehouseName}</span></div>
        <div className="flex items-center gap-3 pl-5"><Box size={22} /><span>หน่วย: {row.unitSymbol || row.unitName}</span></div>
      </div>
      <div className={`mt-5 grid divide-x divide-outline-variant text-center ${row.inventoryValue === null ? "grid-cols-2" : "grid-cols-3"}`}>
        {[{ label: "คงเหลือ", value: quantity(row.onHandQty) }, { label: "จุดสั่งซื้อ", value: quantity(row.reorderPoint) }, ...(row.inventoryValue === null ? [] : [{ label: "มูลค่าคงเหลือ", value: money(row.inventoryValue) }])].map((metric) => <div className="min-w-0 px-2" key={metric.label}><span className="block text-[12px] text-on-surface-variant">{metric.label}</span><strong className={`mt-1 block whitespace-nowrap leading-7 tabular-nums ${metric.label === "มูลค่าคงเหลือ" ? "text-[clamp(14px,4.5vw,20px)]" : "text-[22px]"}`}>{metric.value}</strong></div>)}
      </div>
    </section>

    <nav className="sticky top-[58px] z-10 grid border-y border-outline-variant bg-surface-container-lowest" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} aria-label="รายละเอียดสินค้า">
      {tabs.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`h-[48px] border-b-[3px] text-[15px] font-semibold ${activeTab === tab.id ? "border-primary text-primary dark:text-red-400" : "border-transparent text-on-surface"}`}>{tab.label}</button>)}
    </nav>

    <main className="px-5 py-4">
      {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-primary" size={26} /></div> : error ? <p className="py-16 text-center text-red-700">{error}</p> : <>
        {activeTab === "overview" && <div className="space-y-1"><dl className="divide-y divide-outline-variant"><div className="grid grid-cols-2 py-3"><dt className="text-on-surface-variant">ประเภทสินค้า</dt><dd className="text-right font-semibold">{row.typeName}</dd></div><div className="grid grid-cols-2 py-3"><dt className="text-on-surface-variant">วิธีติดตาม</dt><dd className="text-right font-semibold">{row.trackingMethod === "none" ? "ไม่ควบคุม Lot / Serial" : row.trackingMethod === "lot" ? "Lot" : "Serial"}</dd></div><div className="grid grid-cols-2 py-3"><dt className="text-on-surface-variant">อัปเดตล่าสุด</dt><dd className="text-right font-semibold">{mobileDateTime(row.updatedAt)}</dd></div>{fields.map((field) => <div className="grid grid-cols-2 gap-4 py-3" key={field.key}><dt className="text-on-surface-variant">{field.label}</dt><dd className="break-words text-right font-semibold">{field.value}</dd></div>)}</dl></div>}

        {activeTab === "lot" && <section>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-outline-variant pb-2 text-[14px]"><div className="flex items-center gap-2"><strong>Lot / วันที่รับเข้า</strong><span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-primary dark:bg-red-950/40 dark:text-red-300">FIFO: เก่าก่อน</span></div><strong>คงเหลือ</strong></div>
          <div className="divide-y divide-outline-variant">{details?.lots.map((lot) => <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3.5" key={lot.id}><div className="min-w-0"><strong className="block break-all text-[16px] leading-5">{lot.lotNumber}</strong><p className="mt-1 text-[13px] leading-5 text-on-surface-variant">{mobileDate(lot.receivedAt)} · <span className="text-primary dark:text-red-400">{lot.grNumber}</span></p>{(lot.vendorLotNumber !== "-" || lot.expiryDate) && <p className="text-[12px] leading-5 text-on-surface-variant">{lot.vendorLotNumber !== "-" && <>Vendor: {lot.vendorLotNumber}</>}{lot.vendorLotNumber !== "-" && lot.expiryDate && " · "}{lot.expiryDate && <>หมดอายุ: {mobileDate(lot.expiryDate)}</>}</p>}</div><strong className="self-center whitespace-nowrap text-[18px] tabular-nums">{quantity(lot.onHandQty)} {row.unitSymbol}</strong></article>)}{!details?.lots.length && <p className="py-14 text-center text-[14px] text-on-surface-variant">ไม่พบข้อมูล Lot</p>}</div>
        </section>}

        {activeTab === "serial" && <section><div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-outline-variant pb-2 text-[14px] font-bold"><span>Serial Number</span><span>สถานะ</span></div><div className="divide-y divide-outline-variant">{details?.serials.map((serial) => <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3" key={serial.id}><div><strong className="break-all text-[15px]">{serial.serialNumber}</strong><p className="text-[12px] text-on-surface-variant">รับเข้าระบบ {mobileDateTime(serial.createdAt)}</p></div><StatusBadge tone={serial.status === "in_stock" ? "success" : "neutral"}>{serial.status === "in_stock" ? "ในคลัง" : serial.status}</StatusBadge></article>)}{!details?.serials.length && <p className="py-14 text-center text-on-surface-variant">ไม่พบ Serial Number</p>}</div></section>}

        {activeTab === "history" && <section>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><button type="button" onClick={() => setShowFilters((value) => !value)} className="flex h-11 min-w-0 items-center gap-2 rounded-[5px] border border-outline-variant px-2 text-left text-[12px]"><CalendarDays className="shrink-0" size={18} /><span className="min-w-0 flex-1 whitespace-nowrap">{dateRange}</span><ChevronDown className="shrink-0" size={15} /></button><button type="button" onClick={() => setShowFilters((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-[5px] border border-outline-variant px-3 text-[14px]"><Filter size={19} />ตัวกรอง</button></div>
          {showFilters && <div className="mt-2 grid grid-cols-2 gap-2 rounded-[5px] border border-outline-variant bg-surface-container-low p-2"><label className="text-[11px] text-on-surface-variant">ตั้งแต่<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-9 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-2 text-[12px] text-on-surface dark:[color-scheme:dark]" /></label><label className="text-[11px] text-on-surface-variant">ถึงวันที่<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-9 w-full rounded-[4px] border border-outline-variant bg-surface-container-lowest px-2 text-[12px] text-on-surface dark:[color-scheme:dark]" /></label></div>}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_82px_68px] border-b border-outline-variant pb-2 text-[13px] font-semibold"><span>วันที่ / เอกสาร</span><span className="text-right">เปลี่ยนแปลง</span><span className="text-right">คงเหลือ</span></div>
          <div className="divide-y divide-outline-variant">{movements.map((movement) => <article className="grid grid-cols-[minmax(0,1fr)_82px_68px] items-center py-2.5" key={movement.id}><div className="min-w-0"><strong className="block text-[14px] font-medium">{mobileDateTime(movement.createdAt)}</strong><p className="truncate text-[12px] text-on-surface-variant">{movement.referenceDocNumber} · {movementLabel(movement.transactionType)}</p></div><strong className={`text-right text-[16px] tabular-nums ${movement.quantityChange > 0 ? "text-emerald-700 dark:text-emerald-400" : movement.quantityChange < 0 ? "text-primary dark:text-red-400" : "text-on-surface-variant"}`}>{movement.quantityChange > 0 ? "+" : ""}{quantity(movement.quantityChange)}</strong><strong className="text-right text-[16px] tabular-nums">{quantity(movement.balance)}</strong></article>)}{!movements.length && <p className="py-14 text-center text-on-surface-variant">ไม่พบประวัติการเคลื่อนไหวในช่วงวันที่เลือก</p>}</div>
        </section>}
      </>}
    </main>
  </div>;
}

export function StockDashboardPage({ initialRows, initialSummary = EMPTY_SUMMARY, initialTotal, itemTypes, warehouses }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [trackingMethod, setTrackingMethod] = useState("");
  const [state, setState] = useState<StockStateCode | null>(null);
  const [page, setPage] = useState(1);
  const [expandedKey, setExpandedKey] = useState("");
  const [activeTab, setActiveTab] = useState<StockDetailTab>("overview");
  const [mobileDetailRow, setMobileDetailRow] = useState<CentralStockRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstRun = useRef(true);
  const requestId = useRef(0);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const floatingScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const [floatingScroll, setFloatingScroll] = useState({ visible: false, left: 0, width: 0, scrollWidth: 0 });

  const syncFromFloating = useCallback(() => {
    if (syncingScrollRef.current || !tableScrollRef.current || !floatingScrollRef.current) return;
    syncingScrollRef.current = true;
    tableScrollRef.current.scrollLeft = floatingScrollRef.current.scrollLeft;
    requestAnimationFrame(() => { syncingScrollRef.current = false; });
  }, []);
  const syncFromTable = useCallback(() => {
    if (syncingScrollRef.current || !tableScrollRef.current || !floatingScrollRef.current) return;
    syncingScrollRef.current = true;
    floatingScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    requestAnimationFrame(() => { syncingScrollRef.current = false; });
  }, []);

  const load = (nextPage = page) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const result = await getCentralInventoryStockAction({ search, itemTypeId: Number(typeId) || null, warehouseId: Number(warehouseId) || null, trackingMethod: (trackingMethod || null) as CentralStockRow["trackingMethod"] | null, state, page: nextPage, pageSize: PAGE_SIZE });
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
  }, [search, typeId, warehouseId, trackingMethod, state, page]);
  useEffect(() => {
    const table = tableScrollRef.current;
    if (!table) return;
    const update = () => {
      const rect = table.getBoundingClientRect();
      const visible = table.scrollWidth > table.clientWidth + 2 && rect.bottom > window.innerHeight && rect.top < window.innerHeight - 60;
      setFloatingScroll({ visible, left: rect.left, width: rect.width, scrollWidth: table.scrollWidth });
      if (visible && floatingScrollRef.current) floatingScrollRef.current.scrollLeft = table.scrollLeft;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(table);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); observer.disconnect(); };
  }, [rows, summary.canViewCost]);

  const toggle = (row: CentralStockRow) => {
    const key = `${row.itemId}:${row.warehouseId}`;
    setExpandedKey((current) => current === key ? "" : key);
    setActiveTab(primaryDetailTab(row));
  };
  const exportRows = () => {
    const includeCost = summary.canExportCost;
    const lines = [["รหัสสินค้า", "ชื่อสินค้า", "ประเภท", "คลัง", "คงเหลือ", "หน่วย", ...(includeCost ? ["มูลค่าคงเหลือ (FIFO)"] : [])], ...rows.map((row) => [row.itemCode, row.itemName, row.typeCode, row.warehouseName, row.onHandQty, row.unitSymbol, ...(includeCost ? [row.inventoryValue ?? ""] : [])])];
    const blob = new Blob(["\uFEFF" + lines.map((line) => line.join("\t")).join("\n")], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "Central_Inventory.xls"; anchor.click(); URL.revokeObjectURL(url);
    toast.success("ส่งออกรายงานสต็อกสินค้าเรียบร้อย");
  };
  const filterFields = <>
    <ListFilterSelect label="ประเภทสินค้า" value={typeId} onChange={(value) => { setTypeId(value); setPage(1); }}><option value="">ทั้งหมด</option>{itemTypes.map((type) => <option key={type.id} value={type.id}>{type.code} · {type.name}</option>)}</ListFilterSelect>
    <ListFilterSelect label="คลัง" value={warehouseId} onChange={(value) => { setWarehouseId(value); setPage(1); }}><option value="">ทั้งหมด</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</ListFilterSelect>
    <ListFilterSelect label="วิธีติดตาม" value={trackingMethod} onChange={(value) => { setTrackingMethod(value); setPage(1); }}><option value="">ทั้งหมด</option><option value="none">ไม่ควบคุม</option><option value="lot">Lot</option><option value="serial">Serial</option></ListFilterSelect>
    <ListFilterSelect label="สถานะ" value={state ?? ""} onChange={(value) => { setState((value || null) as StockStateCode | null); setPage(1); }}><option value="">ทั้งหมด</option><option value="available">พร้อมใช้</option><option value="low_stock">ใกล้จุดสั่งซื้อ</option><option value="out_of_stock">หมดสต็อก</option><option value="stale">ค้างนาน</option></ListFilterSelect>
  </>;

  return <section className="flex min-h-[calc(100dvh-116px)] min-w-0 flex-col gap-4 text-on-surface">
    <header className="flex min-h-[58px] flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 border-r border-outline-variant pr-3 text-center sm:pr-4"><strong className="block text-[24px] font-black leading-6 text-primary dark:text-red-400 sm:text-[26px] sm:leading-7">KRC</strong><span className="block text-[9px] font-bold tracking-[0.16em] text-primary dark:text-red-400 sm:text-[10px]">ERP</span></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold leading-tight sm:text-[26px]">สต็อกสินค้าคงเหลือกลาง</h1>{summary.canViewCost && <span className="inline-flex h-7 items-center gap-1 rounded-[3px] border border-primary/40 px-2 text-[11px] font-bold text-primary dark:border-red-400/50 dark:text-red-400"><LockKeyhole size={13} />มุมมองต้นทุน</span>}</div><p className="mt-1 text-[12px] text-on-surface-variant sm:text-[13px]">ตรวจสอบคงเหลือ ต้นทุน และมูลค่าคงเหลือทุกคลัง</p></div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2"><span suppressHydrationWarning className="mr-auto whitespace-nowrap text-[10px] text-on-surface-variant sm:mr-2 sm:self-start sm:pt-1 sm:text-[13px]">วันที่ {new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())} น.</span><button type="button" onClick={() => load()} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px] font-semibold text-on-surface hover:bg-surface-container sm:h-10 sm:px-4 sm:text-[14px]"><RefreshCw size={16} className={isPending ? "animate-spin" : ""} />รีเฟรช</button><ExcelExportButton className="!h-9 !px-3 !text-[12px] whitespace-nowrap sm:!h-10 sm:!px-4 sm:!text-[14px]" onClick={exportRows} /></div>
    </header>
    <SummaryStrip summary={summary} active={state} onSelect={(next) => { setState((current) => current === next && next !== null ? null : next); setPage(1); }} />
    <div className="space-y-3 md:space-y-0"><div className="hidden md:block"><ListFilterToolbar className="md:grid-cols-[minmax(280px,1.7fr)_repeat(4,minmax(130px,1fr))]"><ListSearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหารหัสสินค้า, ชื่อสินค้า, รายละเอียด, Part No." />{filterFields}</ListFilterToolbar></div><MobileListFilters activeCount={[typeId, warehouseId, trackingMethod, state].filter(Boolean).length} onClear={() => { setTypeId(""); setWarehouseId(""); setTrackingMethod(""); setState(null); setPage(1); }} resultLabel={`แสดง ${total.toLocaleString("th-TH")} รายการ`} search={<ListSearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="ค้นหารหัสสินค้า, ชื่อสินค้า, รายละเอียด, Part No." />}>{filterFields}</MobileListFilters></div>
    <div className={`relative ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>{isPending && <Loader2 className="absolute right-3 top-3 z-20 animate-spin text-primary" size={18} />}
      <div className="hidden min-w-0 md:block">
        <div className="erp-data-table-frame max-w-full">
        <div className="erp-data-table-scroll" onScroll={syncFromTable} ref={tableScrollRef}>
        <table className={`erp-data-table !w-full table-fixed text-[12px] [&_th]:!px-1 [&_td]:!px-1 ${summary.canViewCost ? "min-w-[1110px]" : "min-w-[995px]"}`}>
          <colgroup>
            <col className="w-[40px]" />
            <col className="w-[180px]" />
            <col className="w-[300px]" />
            <col className="w-[70px]" />
            <col className="w-[110px]" />
            <col className="w-[65px]" />
            <col className="w-[55px]" />
            {summary.canViewCost && <col className="w-[115px]" />}
            <col className="w-[85px]" />
            <col className="w-[90px]" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="เปิดรายละเอียด" />
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า / รายละเอียด</th>
              <th>ประเภท</th>
              <th>คลัง</th>
              <th className="text-center">คงเหลือ</th>
              <th className="text-center">หน่วย</th>
              {summary.canViewCost && <th className="text-right">มูลค่าคงเหลือ</th>}
              <th className="text-center">จุดสั่งซื้อ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.itemId}:${row.warehouseId}`;
              const open = expandedKey === key;
              return <Fragment key={key}>
                <tr className={`min-h-[58px] ${open ? "border-l-2 border-l-primary !bg-surface-container-low" : ""}`}>
                  <td className="!px-2 text-center"><button type="button" aria-label={open ? "ปิดรายละเอียด" : "ดูรายละเอียด"} onClick={() => toggle(row)} className="inline-flex h-8 w-8 items-center justify-center">{open ? <ChevronUp className="text-primary" size={16} /> : <ChevronDown className="-rotate-90" size={16} />}</button></td>
                  <td className="!px-2 break-all font-bold leading-[16px] text-primary dark:text-red-400">{row.itemCode}</td>
                  <td className="!px-2 !py-2 align-middle"><strong className="block whitespace-normal break-words text-[12px] leading-[17px]">{row.itemName}</strong>{row.description && <span className="mt-0.5 block whitespace-normal break-words text-[11px] font-normal leading-[15px] text-on-surface-variant">{row.description}</span>}</td>
                  <td className="!px-2 whitespace-nowrap">
                    <ItemTypeBadge code={row.typeCode} name={row.typeName} />
                  </td>
                  <td className="!px-2"><span className="block whitespace-normal break-words leading-[17px]">{row.warehouseName}</span></td>
                  <td className="!px-2 text-center font-bold tabular-nums whitespace-nowrap">{quantity(row.onHandQty)}</td>
                  <td className="!px-2 text-center whitespace-nowrap">{row.unitSymbol || row.unitName}</td>
                  {summary.canViewCost && <td className="!px-2 text-right font-semibold tabular-nums whitespace-nowrap">{money(row.inventoryValue).replace(" ฿", "")}</td>}
                  <td className="!px-2 text-center font-semibold tabular-nums whitespace-nowrap">{quantity(row.reorderPoint)}</td>
                  <td className="!px-2 whitespace-nowrap"><StateBadge row={row} /></td>
                </tr>
                {open && <tr><td className="!p-3" colSpan={summary.canViewCost ? 10 : 9}><div className="rounded-[6px] border border-outline-variant bg-surface-container-lowest"><ExpandedPanel row={row} activeTab={activeTab} onTabChange={setActiveTab} /></div></td></tr>}
              </Fragment>;
            })}
            {rows.length === 0 && <tr><td colSpan={summary.canViewCost ? 10 : 9} className="py-16 text-center text-secondary"><PackageCheck className="mx-auto mb-2" size={28} />ไม่พบรายการสต็อกตามเงื่อนไข</td></tr>}
          </tbody>
        </table>
        </div>
        </div>
        {floatingScroll.visible && <div aria-hidden="true" className="fixed bottom-0 z-40 overflow-x-auto border-t border-outline-variant/80 bg-surface-container/95 shadow-[0_-4px_12px_rgba(0,0,0,0.15)] backdrop-blur-md" onScroll={syncFromFloating} ref={floatingScrollRef} style={{ left: floatingScroll.left, width: floatingScroll.width, height: 14 }}><div style={{ width: floatingScroll.scrollWidth, height: 1 }} /></div>}
        <Pagination currentPage={page} disabled={isPending} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={total} />
      </div>
      <div className="border border-outline-variant bg-surface-container-lowest md:hidden">
        {rows.map((row) => { const key = `${row.itemId}:${row.warehouseId}`; return <article className="border-b border-outline-variant" key={key} style={{ contentVisibility: "auto", containIntrinsicSize: "90px" }}><button type="button" onClick={() => setMobileDetailRow(row)} className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto_18px] items-start gap-2 px-2 py-3 text-left"><span className="pt-0.5"><ChevronDown className="-rotate-90" size={16} /></span><span className="min-w-0"><strong className="block text-[13px] text-on-surface">{row.itemCode}</strong><strong className="block whitespace-normal break-words text-[12px] leading-[17px]">{row.itemName}</strong>{row.description && <span className="block whitespace-normal break-words text-[11px] leading-[15px] text-on-surface-variant">{row.description}</span>}<span className="mt-1 block text-[11px] font-semibold">คงเหลือ <b>{quantity(row.onHandQty)}</b> {row.unitSymbol} · จุดสั่งซื้อ <b>{quantity(row.reorderPoint)}</b></span></span><StateBadge row={row} /><span className="pt-0.5 text-secondary">⋮</span></button></article>; })}
        {rows.length === 0 && <div className="py-14 text-center text-[14px] text-on-surface-variant">ไม่พบรายการสต็อกตามเงื่อนไข</div>}<Pagination currentPage={page} disabled={isPending} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={total} />
      </div>
      {summary.canViewCost && <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-[0_-6px_16px_rgb(0_0_0/0.08)] md:hidden"><span className="text-[12px] font-bold">มูลค่าคงเหลือ</span><strong className="text-[20px] tabular-nums">{money(summary.inventoryValue)}</strong></div>}
    </div>
    {mobileDetailRow && <MobileStockDetail row={mobileDetailRow} onClose={() => setMobileDetailRow(null)} />}
  </section>;
}
