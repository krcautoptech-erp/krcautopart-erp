"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  QrCode,
  ArrowRightLeft,
  Eye,
  Archive,
} from "lucide-react";
import {
  getAssetCatalogAction,
  getAssetSummaryAction,
} from "@/app/actions/assets";
import type {
  AssetRecord,
  AssetSummary,
  AssetLookupData,
} from "@/lib/assets";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { AssetSideDrawer } from "./asset-side-drawer";
import { AssetQrModal } from "./asset-qr-modal";
import { AssetTransferModal } from "./asset-transfer-modal";
import { AssetMobileLedger } from "./asset-mobile-ledger";
import { toast } from "@/components/toast";
import { useHasPermission } from "@/components/permission-context";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";

interface AssetCatalogProps {
  initialItems: AssetRecord[];
  initialPagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  initialSummary: AssetSummary;
  lookups: AssetLookupData;
}

export function AssetCatalog({
  initialItems,
  initialPagination,
  initialSummary,
  lookups,
}: AssetCatalogProps) {
  const canManage = useHasPermission("assets.manage");
  const [items, setItems] = useState<AssetRecord[]>(initialItems);
  const [summary, setSummary] = useState<AssetSummary>(initialSummary);
  const [page, setPage] = useState(initialPagination.currentPage);
  const [pageSize, setPageSize] = useState(initialPagination.pageSize);
  const [totalCount, setTotalCount] = useState(initialPagination.totalCount);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isFetching, setIsFetching] = useState(false);

  // Modals & Drawer State
  const [drawerAsset, setDrawerAsset] = useState<AssetRecord | null>(null);
  const [qrAsset, setQrAsset] = useState<AssetRecord | null>(null);
  const [transferAsset, setTransferAsset] = useState<AssetRecord | null>(null);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchAssets = useCallback(
    async (
      targetPage = page,
      targetPageSize = pageSize,
      targetSearch = debouncedSearch,
      targetStatus = statusFilter,
      targetDept = departmentFilter,
    ) => {
      setIsFetching(true);
      try {
        const [catRes, sumRes] = await Promise.all([
          getAssetCatalogAction({
            page: targetPage,
            pageSize: targetPageSize,
            search: targetSearch,
            status: targetStatus,
            departmentId: targetDept || undefined,
          }),
          getAssetSummaryAction(),
        ]);

        if (catRes.success && catRes.data) {
          setItems(catRes.data.items);
          setTotalCount(catRes.data.pagination.totalCount);
          setTotalPages(catRes.data.pagination.totalPages);
          setPage(catRes.data.pagination.currentPage);
        }

        if (sumRes.success && sumRes.data) {
          setSummary(sumRes.data);
        }
      } catch (err) {
        console.error("Failed to load assets:", err);
      } finally {
        setIsFetching(false);
      }
    },
    [page, pageSize, debouncedSearch, statusFilter, departmentFilter],
  );

  // Re-fetch on filter changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAssets(1, pageSize, debouncedSearch, statusFilter, departmentFilter);
    }, 0);
    return () => window.clearTimeout(timer);
    // fetchAssets deliberately reads the current page for manual refreshes; filter changes always request page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, departmentFilter, pageSize]);

  const handlePageChange = (newPage: number) => {
    fetchAssets(newPage, pageSize, debouncedSearch, statusFilter, departmentFilter);
  };

  const handleSaved = (msg: string) => {
    toast.success(msg);
    fetchAssets();
  };

  const formatDate = (val: string | null) => {
    if (!val) return "-";
    try {
      const d = new Date(val);
      return d.toLocaleDateString("th-TH", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return val;
    }
  };

  const formatPrice = (price: number | null) => {
    if (price == null) return "-";
    return `${price.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;
  };

  const exportToCsv = () => {
    if (items.length === 0) return;
    const headers = [
      "ลำดับ",
      "รหัสสินค้า",
      "ชื่อรายการ",
      "ประเภท",
      "Serial Number",
      "สถานะ",
      "แผนกผู้ดูแล",
      "ผู้ถือครอง",
      "ตำแหน่งที่ตั้ง",
      "วันที่รับเข้า",
      "เลขที่ GR",
      "เลขที่ PO",
      "ราคาต่อหน่วย",
    ];

    const rows = items.map((item, idx) => [
      idx + 1,
      item.itemCode,
      `"${item.itemName.replace(/"/g, '""')}"`,
      item.itemTypeName,
      item.serialNumber,
      item.statusLabel,
      item.departmentName || "ส่วนกลาง",
      item.custodianName || "-",
      item.locationNote || "-",
      item.receiptDate || "-",
      item.grNumber || "-",
      item.poNumber || "-",
      item.unitPrice ?? "",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Asset_Register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="min-w-0 bg-surface-container-lowest text-on-surface">
      {/* Page Title & Breadcrumbs */}
      <header className="hidden flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-1 pb-4 sm:flex">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">
            สินทรัพย์และอุปกรณ์ (Fixed Assets)
          </h1>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            ทะเบียนคุมอุปกรณ์ ครุภัณฑ์ และหมายเลข Serial Number ประจำองค์กร
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAssets()}
            disabled={isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-4 text-[14px] font-semibold hover:bg-surface-container"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            รีเฟรช
          </button>
          <ExcelExportButton onClick={exportToCsv} />
        </div>
      </header>

      {/* 1. Compact status summary */}
      <div className="mt-4 hidden grid-cols-2 border border-outline-variant bg-surface-container-lowest sm:grid sm:grid-cols-5">
        {/* Total Assets */}
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`min-h-[66px] cursor-pointer border-b border-r border-outline-variant px-3 py-2 text-center transition-colors sm:border-b-0 ${
            statusFilter === "ALL"
              ? "bg-primary/[0.04]"
              : "hover:bg-surface-container-low/60"
          }`}
        >
          <span className="text-[12px] font-semibold text-on-surface-variant">ทั้งหมด</span>
          <p className="mt-0.5 text-[18px] font-bold text-primary">
            {summary.totalCount.toLocaleString("th-TH")}
          </p>
        </div>

        {/* In Use */}
        <div
          onClick={() => setStatusFilter("in_use")}
          className={`min-h-[66px] cursor-pointer border-b border-outline-variant px-3 py-2 text-center transition-colors sm:border-b-0 sm:border-r ${
            statusFilter === "in_use"
              ? "bg-emerald-500/[0.05]"
              : "hover:bg-surface-container-low/60"
          }`}
        >
          <span className="text-[12px] font-semibold text-on-surface-variant">ใช้งานอยู่</span>
          <p className="mt-0.5 text-[18px] font-bold text-emerald-700 dark:text-emerald-400">
            {summary.inUseCount.toLocaleString("th-TH")}
          </p>
        </div>

        {/* In Stock (Ready) */}
        <div
          onClick={() => setStatusFilter("in_stock")}
          className={`min-h-[66px] cursor-pointer border-r border-outline-variant px-3 py-2 text-center transition-colors ${
            statusFilter === "in_stock"
              ? "bg-blue-500/[0.05]"
              : "hover:bg-surface-container-low/60"
          }`}
        >
          <span className="text-[12px] font-semibold text-on-surface-variant">พร้อมใช้</span>
          <p className="mt-0.5 text-[18px] font-bold text-blue-700 dark:text-blue-400">
            {summary.inStockCount.toLocaleString("th-TH")}
          </p>
        </div>

        {/* Maintenance / Repair */}
        <div
          onClick={() => setStatusFilter("under_repair")}
          className={`min-h-[66px] cursor-pointer border-r border-t border-outline-variant px-3 py-2 text-center transition-colors sm:border-t-0 ${
            statusFilter === "under_repair"
              ? "bg-amber-500/[0.05]"
              : "hover:bg-surface-container-low/60"
          }`}
        >
          <span className="text-[12px] font-semibold text-on-surface-variant">ส่งซ่อม</span>
          <p className="mt-0.5 text-[18px] font-bold text-amber-700 dark:text-amber-400">
            {summary.repairCount.toLocaleString("th-TH")}
          </p>
        </div>

        <div
          onClick={() => setStatusFilter("disposed")}
          className={`col-span-2 min-h-[66px] cursor-pointer border-t border-outline-variant px-3 py-2 text-center transition-colors sm:col-span-1 sm:border-t-0 ${
            statusFilter === "disposed" ? "bg-red-500/[0.05]" : "hover:bg-surface-container-low/60"
          }`}
        >
          <span className="text-[12px] font-semibold text-on-surface-variant">ตัดจำหน่าย</span>
          <p className="mt-0.5 text-[18px] font-bold text-red-700 dark:text-red-400">
            {summary.disposedCount.toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div className="mt-4 hidden gap-3 border border-outline-variant bg-surface-container-lowest p-3 sm:grid sm:grid-cols-[minmax(280px,1fr)_180px_180px_auto] sm:items-center">
        <ListSearchField onChange={setSearch} placeholder="ค้นหา Serial Number, รหัสสินค้า, ชื่ออุปกรณ์, หรือผู้ถือครอง..." value={search} />
        <ListFilterSelect label="แผนก" onChange={(value) => { setDepartmentFilter(value); setPage(1); }} value={departmentFilter}><option value="">ทั้งหมด</option>{lookups.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setPage(1); }} value={statusFilter}><option value="ALL">ทั้งหมด</option><option value="in_use">ใช้งานอยู่</option><option value="in_stock">พร้อมใช้งาน (ในคลัง)</option><option value="under_repair">ส่งซ่อม/เคลม</option><option value="disposed">ตัดจำหน่าย</option></ListFilterSelect>

        {/* Page Size */}
        <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
          <span className="font-medium">แสดง</span>
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-10 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[13px] font-semibold text-on-surface outline-none focus:border-primary"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={25}>25 รายการ / หน้า</option>
            <option value={50}>50 รายการ / หน้า</option>
            <option value={100}>100 รายการ / หน้า</option>
          </select>
        </div>
      </div>

      <MobileListFilters activeCount={[statusFilter !== "ALL", departmentFilter].filter(Boolean).length} onClear={() => { setStatusFilter("ALL"); setDepartmentFilter(""); setPage(1); }} resultLabel={`แสดง ${totalCount.toLocaleString("th-TH")} รายการ`} search={<ListSearchField onChange={setSearch} placeholder="ค้นหา..." value={search} />}>
        <ListFilterSelect label="แผนก" onChange={(value) => { setDepartmentFilter(value); setPage(1); }} value={departmentFilter}><option value="">ทั้งหมด</option>{lookups.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</ListFilterSelect>
        <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setPage(1); }} value={statusFilter}><option value="ALL">ทั้งหมด</option><option value="in_use">ใช้งานอยู่</option><option value="in_stock">พร้อมใช้งาน</option><option value="under_repair">ส่งซ่อม</option><option value="disposed">ตัดจำหน่าย</option></ListFilterSelect>
      </MobileListFilters>

      {/* 3. Main Data Table */}
      <div className="mt-4 hidden overflow-x-auto border border-outline-variant sm:block">
        <table className="w-full min-w-[1120px] table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[10%]" />
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-surface-container">
            <tr>
              {[
                "ลำดับ",
                "รหัสสินทรัพย์",
                "ชื่อรายการ / รุ่น",
                "Serial Number",
                "แผนก / ผู้ถือครอง",
                "วันที่รับ",
                "ราคาต่อหน่วย",
                "สถานะ",
                "จัดการ",
              ].map((head) => (
                <th key={head} className="h-10 border-b border-outline-variant px-3 font-bold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-28 text-center text-on-surface-variant">
                  <Archive size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">ไม่พบข้อมูลสินทรัพย์</p>
                  <p className="mt-0.5 text-[11px] opacity-70">
                    รายการสินทรัพย์ที่มี Serial Number จากใบรับสินค้า (GR) จะปรากฏที่นี่โดยอัตโนมัติ
                  </p>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.id}
                  className="h-12 cursor-pointer border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low/60"
                  onClick={() => setDrawerAsset(item)}
                >
                  <td className="px-3 text-on-surface-variant">
                    {(page - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-3 font-bold text-primary">{item.itemCode}</td>
                  <td className="px-3">
                    <p className="line-clamp-1 font-bold text-on-surface" title={item.itemName}>
                      {item.itemName}
                    </p>
                  </td>
                  <td className="px-3 font-semibold">
                    {item.serialNumber}
                  </td>
                  <td className="px-3">
                    <p className="font-semibold text-on-surface">
                      {item.departmentName || "ส่วนกลาง"}
                    </p>
                    {item.custodianName && (
                      <p className="text-[11px] text-on-surface-variant">{item.custodianName}</p>
                    )}
                  </td>
                  <td className="px-3 font-medium">
                    {formatDate(item.receiptDate)}
                  </td>
                  <td className="px-3 text-right font-medium">
                    {formatPrice(item.unitPrice)}
                  </td>
                  <td className="px-3">
                    <StatusBadge tone={statusTone(item.status)}>
                      {item.statusLabel}
                    </StatusBadge>
                  </td>
                  <td
                    className="px-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        aria-label={`ดูรายละเอียด ${item.itemCode}`}
                        title="ดูรายละเอียด"
                        onClick={() => setDrawerAsset(item)}
                        className="text-on-surface-variant hover:text-primary"
                        type="button"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        aria-label={`พิมพ์ QR ${item.itemCode}`}
                        title="พิมพ์ป้ายสติกเกอร์ / QR"
                        onClick={() => setQrAsset(item)}
                        className="text-on-surface-variant hover:text-primary"
                        type="button"
                      >
                        <QrCode size={18} />
                      </button>
                      {canManage ? <button
                        aria-label={`โอนย้าย ${item.itemCode}`}
                        title="โอนย้าย / ส่งมอบ"
                        onClick={() => setTransferAsset(item)}
                        className="text-on-surface-variant hover:text-primary"
                        type="button"
                      >
                        <ArrowRightLeft size={18} />
                      </button> : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 sm:hidden">
        <AssetMobileLedger
          disabled={isFetching}
          items={items}
          onOpenDetails={setDrawerAsset}
          onPageChange={handlePageChange}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
        />
      </div>

      {/* Pagination Footer */}
      <div className="hidden border border-t-0 border-outline-variant bg-surface-container-lowest sm:block">
        <Pagination
          currentPage={page}
          disabled={isFetching}
          onPageChange={handlePageChange}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
        />
      </div>

      {/* Side Drawer Details */}
      <AssetSideDrawer
        asset={drawerAsset}
        onClose={() => setDrawerAsset(null)}
        onOpenQr={(a) => {
          setDrawerAsset(null);
          setQrAsset(a);
        }}
        onOpenTransfer={canManage ? (a) => {
          setDrawerAsset(null);
          setTransferAsset(a);
        } : undefined}
      />

      {/* Asset QR Sticker Modal */}
      <AssetQrModal asset={qrAsset} onClose={() => setQrAsset(null)} />

      {/* Asset Transfer Modal */}
      {canManage ? <AssetTransferModal
        asset={transferAsset}
        departments={lookups.departments}
        onClose={() => setTransferAsset(null)}
        onSaved={handleSaved}
      /> : null}
    </section>
  );
}
