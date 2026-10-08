"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import "./stock-count.css";
import "./stock-count-visual.css";
import { useMemo, useState } from "react";
import { Eye, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StockCountCreateOptions, StockCountListRecord } from "@/app/actions/stock-counts";
import { StockCountCreateModal } from "./stock-count-create-page";
import { MobileDocumentList } from "@/components/mobile-document-list";
import {
  ListDateRangeFilter,
  ListFilterButton,
  ListFilterSelect,
  ListFilterToolbar,
  ListSearchField,
  MobileListFilters,
} from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { useHasPermission } from "@/components/permission-context";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { formatDisplayDate } from "@/lib/purchase-requisitions";
import {
  isStockCountDateInRange,
  stockCountStatusLabel,
} from "@/lib/stock-counts";

const pageSize = 12;
const tone: Record<StockCountListRecord["status"], StatusTone> = {
  draft: "neutral",
  counting: "info",
  review: "pending",
  recount: "danger",
  approved: "success",
  cancelled: "danger",
};
function CountStatus({ row }: { row: StockCountListRecord }) {
  return (
    <StatusBadge tone={tone[row.status]}>
      {stockCountStatusLabel[row.status]}
    </StatusBadge>
  );
}

export function StockCountListPage({
  initialRows,
  initialCreateOptions,
}: {
  initialRows: StockCountListRecord[];
  initialCreateOptions?: StockCountCreateOptions;
}) {
  useListScroll();
  const router = useRouter();
  const canCreate = useHasPermission("stock_count.create");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useListState("query", "");
  const [status, setStatus] = useListState("status", "all");
  const [warehouse, setWarehouse] = useListState("warehouse", "all");
  const [startDate, setStartDate] = useListState("startDate", "");
  const [endDate, setEndDate] = useListState("endDate", "");
  const [page, setPage] = useListState("page", 1);
  const warehouses = useMemo(
    () => [...new Set(initialRows.map((row) => row.warehouseName))],
    [initialRows],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("th");
    return initialRows.filter(
      (row) =>
        (!q ||
          `${row.countNumber} ${row.warehouseName} ${row.assignedToName}`
            .toLocaleLowerCase("th")
            .includes(q)) &&
        (status === "all" || row.status === status) &&
        (warehouse === "all" || row.warehouseName === warehouse) &&
        isStockCountDateInRange(row.documentDate, startDate, endDate),
    );
  }, [endDate, initialRows, query, startDate, status, warehouse]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const mobileRows = rows.map((row) => ({
    id: row.id,
    title: row.countNumber,
    subtitle: `${formatDisplayDate(row.documentDate)} · ${row.warehouseName}`,
    meta: `${row.assignedToName} · ${row.completedCount}/${row.lotCount} จุดนับ`,
    status: <CountStatus row={row} />,
    details: [
      { label: "สินค้า / Lot", value: `${row.itemCount} / ${row.lotCount}` },
      { label: "ผลต่าง", value: `${row.varianceCount}` },
      { label: "หมายเหตุ", value: row.notes || "-" },
    ],
  }));
  const dateRange = (
    <ListDateRangeFilter
      className="stock-count-date-filter"
      endValue={endDate}
      minEnd={startDate || undefined}
      onEndChange={(value) => { setEndDate(value); setPage(1); }}
      onStartChange={(value) => { setStartDate(value); setPage(1); }}
      startValue={startDate}
    />
  );
  const selectFields = (
    <>
      <ListFilterSelect
        label="คลังสินค้า"
        value={warehouse}
        onChange={(value) => {
          setWarehouse(value);
          setPage(1);
        }}
      >
        <option value="all">ทั้งหมด</option>
        {warehouses.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </ListFilterSelect>
      <ListFilterSelect
        label="สถานะ"
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <option value="all">ทั้งหมด</option>
        {Object.entries(stockCountStatusLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </ListFilterSelect>
    </>
  );
  return (
    <section className="stock-count-page">
      <header className="stock-count-heading">
        <div>
          <h1>ทะเบียนรอบตรวจนับ</h1>
          <p>จัดการรอบตรวจนับสต็อกทั้งหมด</p>
        </div>
        {canCreate && (
          <button
            className="stock-count-primary md:hidden"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            <Plus size={17} />
            สร้างรอบ
          </button>
        )}
      </header>
      <MobileListFilters
        activeCount={(startDate ? 1 : 0) + (endDate ? 1 : 0) + (warehouse === "all" ? 0 : 1) + (status === "all" ? 0 : 1)}
        onClear={() => { setStartDate(""); setEndDate(""); setWarehouse("all"); setStatus("all"); setPage(1); }}
        search={<ListSearchField value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="ค้นหาเลขที่รอบ..." />}
      >
        {dateRange}
        {selectFields}
      </MobileListFilters>
      <div className="stock-count-filter-panel hidden md:block">
        <ListFilterToolbar className="stock-count-filter-grid">
          {dateRange}
          {selectFields}
          <ListSearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="ค้นหาเลขที่รอบ..."
          />
          <ListFilterButton icon={<Search size={16} />} tone="primary">
            ค้นหา
          </ListFilterButton>
          {canCreate && (
            <button
              className="stock-count-primary"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <Plus size={17} />
              สร้างรอบตรวจนับ
            </button>
          )}
        </ListFilterToolbar>
      </div>
      <div className="stock-count-table-wrap">
        <table className="erp-data-table stock-count-list-table">
          <colgroup>
            <col className="stock-count-list-col-index" />
            <col className="stock-count-list-col-number" />
            <col className="stock-count-list-col-date" />
            <col className="stock-count-list-col-warehouse" />
            <col className="stock-count-list-col-assignee" />
            <col className="stock-count-list-col-status" />
            <col className="stock-count-list-col-progress" />
            <col className="stock-count-list-col-notes" />
            <col className="stock-count-list-col-creator" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>เลขที่รอบตรวจนับ</th>
              <th>วันที่เอกสาร</th>
              <th>คลังสินค้า</th>
              <th>ผู้รับผิดชอบ</th>
              <th>สถานะ</th>
              <th>ความคืบหน้า</th>
              <th>หมายเหตุ</th>
              <th>สร้างโดย</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
              onClick={() => router.push(`/inventory/stock-counts/${row.id}`)}
              >
                <td className="text-center">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td>
                  <Link
                    className="font-bold text-primary"
                    href={`/inventory/stock-counts/${row.id}`}
                  >
                    {row.countNumber}
                  </Link>
                </td>
                <td>{formatDisplayDate(row.documentDate)}</td>
                <td className="stock-count-list-long">{row.warehouseName}</td>
                <td className="stock-count-list-long">{row.assignedToName}</td>
                <td className="text-center">
                  <CountStatus row={row} />
                </td>
                <td>
                  <div className="stock-count-progress-row">
                    <div className="stock-count-progress">
                      <i
                        style={{
                          width: `${row.lotCount ? (row.completedCount / row.lotCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <small>
                      {row.lotCount
                        ? Math.round((row.completedCount / row.lotCount) * 100)
                        : 0}
                      %
                    </small>
                  </div>
                </td>
                <td className="stock-count-list-long">{row.notes || "-"}</td>
                <td className="stock-count-list-long">{row.createdByName}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="h-28 text-center text-secondary">
                  ไม่พบรอบตรวจนับ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MobileDocumentList
        emptyText="ไม่พบรอบตรวจนับ"
        rows={mobileRows}
        actions={(row) => (
          <Link
            className="mobile-sheet-primary"
            href={`/inventory/stock-counts/${String(row.id)}`}
          >
            <Eye size={18} />
            เปิดเอกสาร
          </Link>
        )}
      />
      <Pagination
        currentPage={currentPage}
        onPageChange={setPage}
        pageSize={pageSize}
        totalItems={filtered.length}
        totalPages={totalPages}
      />
      {createOpen && (
        <StockCountCreateModal
          initialOptions={initialCreateOptions}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </section>
  );
}
