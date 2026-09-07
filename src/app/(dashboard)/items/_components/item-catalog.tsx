"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Edit3,
  Eye,
  Image as ImageIcon,
  MoreVertical,
  PackagePlus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  checkItemDeletableAction,
  deactivateItemAction,
  deleteGenericItemAction,
  getExportCatalogItemsAction,
  getItemCatalogAction,
  type CatalogItem,
  type ItemCatalogData,
  type ItemDeletableCheck,
} from "@/app/actions/items";
import { Pagination } from "@/components/pagination";
import { ItemMasterTabs } from "@/components/item-master-tabs";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ItemDeletePromptModal } from "@/components/item-delete-prompt-modal";
import { toast } from "@/components/toast";
import { ItemColumnCustomizer } from "./item-column-customizer";
import { ItemCreateModal } from "./item-create-modal";
import {
  ALL_COLUMNS,
  type ColumnId,
  getAvailableColumnsForType,
  getDefaultColumnsForType,
  renderColumnValue,
} from "./item-dynamic-columns";
import { ItemSideDrawer } from "./item-side-drawer";

const inputClass =
  "h-10 w-full rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary disabled:!bg-surface-container-lowest disabled:text-on-surface disabled:opacity-100";

const STORAGE_KEY_PREFIX = "krc_item_cols_v7_";

export function ItemCatalog({
  initialData,
  initialTypeCode = "ALL",
  initialPage = 1,
  initialPageSize = 50,
  initialSearch = "",
}: {
  initialData: ItemCatalogData;
  initialTypeCode?: string;
  initialPage?: number;
  initialPageSize?: number;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState(() =>
    initialData.types.some((item) => item.code === initialTypeCode)
      ? initialTypeCode
      : "ALL",
  );
  const [query, setQuery] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [items, setItems] = useState<CatalogItem[]>(initialData.items);
  const [totalCount, setTotalCount] = useState(
    initialData.pagination?.totalCount ?? initialData.items.length,
  );
  const [totalPages, setTotalPages] = useState(
    initialData.pagination?.totalPages ?? 1,
  );
  const [isFetching, setIsFetching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null);
  const [deleteCheckData, setDeleteCheckData] = useState<ItemDeletableCheck | null>(null);
  const [isCheckingDeletable, setIsCheckingDeletable] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [drawerItem, setDrawerItem] = useState<CatalogItem | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Client-side memory cache for instant 0ms back-and-forth page navigation
  const pageCacheRef = useRef<
    Map<
      string,
      {
        items: CatalogItem[];
        totalCount: number;
        totalPages: number;
      }
    >
  >(new Map());

  // Search debounce timer ref
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [activeMenu, setActiveMenu] = useState<{
    item: CatalogItem;
    top: number;
    right: number;
  } | null>(null);

  const handleToggleMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, item: CatalogItem) => {
      e.stopPropagation();
      if (activeMenu?.item.id === item.id) {
        setActiveMenu(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const menuHeight = 135;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;

      setActiveMenu({
        item,
        top: openUpward ? rect.top - menuHeight : rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    },
    [activeMenu],
  );

  // Close floating action menu on scroll, resize, click outside, or Escape
  useEffect(() => {
    if (!activeMenu) return;
    function handleClose() {
      setActiveMenu(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveMenu(null);
    }
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    window.addEventListener("click", handleClose);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("click", handleClose);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMenu]);

  // Seed cache on mount with initial data
  useEffect(() => {
    const initialKey = `${initialTypeCode}__${initialPage}__${initialPageSize}__${initialSearch.trim().toLowerCase()}`;
    pageCacheRef.current.set(initialKey, {
      items: initialData.items,
      totalCount: initialData.pagination?.totalCount ?? initialData.items.length,
      totalPages: initialData.pagination?.totalPages ?? 1,
    });
  }, [initialData, initialPage, initialPageSize, initialSearch, initialTypeCode]);

  // Floating synced horizontal scrollbar
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const floatingScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);
  const [floatingScrollState, setFloatingScrollState] = useState<{
    visible: boolean;
    left: number;
    width: number;
    scrollWidth: number;
  }>({
    visible: false,
    left: 0,
    width: 0,
    scrollWidth: 0,
  });

  const handleFloatingScroll = useCallback(() => {
    if (isSyncingRef.current || !tableContainerRef.current || !floatingScrollRef.current) return;
    isSyncingRef.current = true;
    tableContainerRef.current.scrollLeft = floatingScrollRef.current.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  const handleTableScroll = useCallback(() => {
    if (isSyncingRef.current || !tableContainerRef.current || !floatingScrollRef.current) return;
    isSyncingRef.current = true;
    floatingScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  const activeTypes = useMemo(
    () => initialData.types.filter((item) => item.status === "active"),
    [initialData.types],
  );

  const selectedTypeRecord = useMemo(
    () => initialData.types.find((item) => item.code === type),
    [initialData.types, type],
  );

  // Lookups maps for high-speed O(1) cell rendering
  const lookups = useMemo(
    () => ({
      warehouses: new Map(initialData.warehouses.map((w) => [w.id, w.name])),
      groups: new Map(initialData.groups.map((g) => [g.id, g.name])),
      grades: new Map(initialData.grades.map((g) => [g.id, g.name])),
      vendors: new Map(initialData.vendors.map((v) => [v.id, v.name])),
    }),
    [
      initialData.warehouses,
      initialData.groups,
      initialData.grades,
      initialData.vendors,
    ],
  );

  // High-performance page & query fetcher
  const fetchCatalogData = useCallback(
    async (newType: string, newPage: number, newPageSize: number, newSearch: string) => {
      const trimmedSearch = newSearch.trim();
      const cacheKey = `${newType}__${newPage}__${newPageSize}__${trimmedSearch.toLowerCase()}`;
      const cached = pageCacheRef.current.get(cacheKey);

      // Sync URL without full-page reloads
      const params = new URLSearchParams();
      if (newType !== "ALL") params.set("type", newType);
      if (newPage > 1) params.set("page", String(newPage));
      if (newPageSize !== 50) params.set("pageSize", String(newPageSize));
      if (trimmedSearch) params.set("q", trimmedSearch);
      const queryStr = params.toString();
      window.history.replaceState(null, "", queryStr ? `/items?${queryStr}` : "/items");

      if (cached) {
        setItems(cached.items);
        setTotalCount(cached.totalCount);
        setTotalPages(cached.totalPages);
        setPage(newPage);
        return;
      }

      setIsFetching(true);
      try {
        const res = await getItemCatalogAction({
          type: newType,
          page: newPage,
          pageSize: newPageSize,
          search: trimmedSearch,
        });

        if ("data" in res && res.data) {
          const fetchedItems = res.data.items;
          const fetchedTotal = res.data.pagination?.totalCount ?? fetchedItems.length;
          const fetchedTotalPages = res.data.pagination?.totalPages ?? 1;

          pageCacheRef.current.set(cacheKey, {
            items: fetchedItems,
            totalCount: fetchedTotal,
            totalPages: fetchedTotalPages,
          });

          setItems(fetchedItems);
          setTotalCount(fetchedTotal);
          setTotalPages(fetchedTotalPages);
          setPage(newPage);
        }
      } catch (err) {
        console.error("Failed to load catalog data:", err);
      } finally {
        setIsFetching(false);
      }
    },
    [],
  );

  const handleStartDelete = useCallback(async (item: CatalogItem) => {
    setDeletingItem(item);
    setDeleteCheckData(null);
    setIsCheckingDeletable(true);
    const targetId = item.sourceId ?? item.id;
    const res = await checkItemDeletableAction(targetId);
    setIsCheckingDeletable(false);
    if ("error" in res) {
      toast.error(res.error, { title: "ไม่สามารถตรวจสอบสินค้าได้" });
      setDeletingItem(null);
      return;
    }
    setDeleteCheckData(res.data);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    const targetId = deletingItem.sourceId ?? deletingItem.id;
    const result = await deleteGenericItemAction(targetId);
    setIsDeleting(false);

    if ("error" in result) {
      toast.error(result.error || "ไม่สามารถลบรายการสินค้าได้", { title: "ไม่สามารถลบรายการได้" });
      setDeletingItem(null);
      setDeleteCheckData(null);
      return;
    }

    toast.success(`ลบรายการ ${deletingItem.code} ออกจากระบบเรียบร้อยแล้ว`, { title: "ลบสำเร็จ" });
    if (drawerItem?.id === deletingItem.id) {
      setDrawerItem(null);
    }
    setDeletingItem(null);
    setDeleteCheckData(null);
    pageCacheRef.current.clear();
    fetchCatalogData(type, page, pageSize, query);
  }, [deletingItem, drawerItem?.id, fetchCatalogData, page, pageSize, query, type]);

  const handleDeactivate = useCallback(async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    const targetId = deletingItem.sourceId ?? deletingItem.id;
    const result = await deactivateItemAction(targetId);
    setIsDeleting(false);

    if ("error" in result) {
      toast.error(result.error || "ไม่สามารถระงับการใช้งานสินค้าได้", { title: "เกิดข้อผิดพลาด" });
      return;
    }

    toast.success(`ปรับสถานะสินค้า ${deletingItem.code} เป็น 'ระงับการใช้งาน' เรียบร้อยแล้ว`, { title: "ระงับการใช้งานสำเร็จ" });
    if (drawerItem?.id === deletingItem.id) {
      setDrawerItem((prev) => (prev ? { ...prev, status: "inactive" } : null));
    }
    setDeletingItem(null);
    setDeleteCheckData(null);
    pageCacheRef.current.clear();
    fetchCatalogData(type, page, pageSize, query);
  }, [deletingItem, drawerItem?.id, fetchCatalogData, page, pageSize, query, type]);

  // Available columns for the current type
  const availableColumns = useMemo(
    () => getAvailableColumnsForType(type, selectedTypeRecord),
    [type, selectedTypeRecord],
  );

  // Calculate default columns for the current type
  const defaultColumns = useMemo(
    () => getDefaultColumnsForType(type, selectedTypeRecord),
    [type, selectedTypeRecord],
  );

  // Column visibility state (persisted per tab type)
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(defaultColumns);

  // Load / sync saved column preferences when switching type tabs
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${type}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setVisibleColumns(parsed as ColumnId[]);
          return;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setVisibleColumns(getDefaultColumnsForType(type, selectedTypeRecord));
  }, [type, selectedTypeRecord]);

  const saveColumns = useCallback(
    (cols: ColumnId[]) => {
      setVisibleColumns(cols);
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${type}`, JSON.stringify(cols));
      } catch {
        // Ignore localStorage quota errors
      }
    },
    [type],
  );

  const toggleColumn = useCallback(
    (colId: ColumnId) => {
      const colDef = ALL_COLUMNS.find((c) => c.id === colId);
      if (colDef?.isCore) return; // Core columns cannot be hidden

      if (visibleColumns.includes(colId)) {
        saveColumns(visibleColumns.filter((id) => id !== colId));
      } else {
        // Maintain column ordering as in ALL_COLUMNS
        const next = ALL_COLUMNS.filter(
          (c) => visibleColumns.includes(c.id) || c.id === colId,
        ).map((c) => c.id);
        saveColumns(next);
      }
    },
    [saveColumns, visibleColumns],
  );

  const resetColumns = useCallback(() => {
    const defaults = getDefaultColumnsForType(type, selectedTypeRecord);
    saveColumns(defaults);
  }, [saveColumns, selectedTypeRecord, type]);

  const selectAllColumns = useCallback(() => {
    saveColumns(availableColumns.map((c) => c.id));
  }, [availableColumns, saveColumns]);

  // Active column definitions to render in order
  const activeColDefs = useMemo(() => {
    const colMap = new Map(ALL_COLUMNS.map((c) => [c.id, c]));
    return visibleColumns
      .map((id) => colMap.get(id))
      .filter((c): c is (typeof ALL_COLUMNS)[number] => Boolean(c));
  }, [visibleColumns]);

  // Floating horizontal scrollbar synchronization
  useEffect(() => {
    const tableEl = tableContainerRef.current;
    if (!tableEl) return;

    function updateFloatingState() {
      if (!tableEl) return;
      const rect = tableEl.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const hasHorizontalOverflow = tableEl.scrollWidth > tableEl.clientWidth + 2;

      const isVisible =
        hasHorizontalOverflow &&
        rect.bottom > windowHeight &&
        rect.top < windowHeight - 60;

      setFloatingScrollState({
        visible: isVisible,
        left: rect.left,
        width: rect.width,
        scrollWidth: tableEl.scrollWidth,
      });

      if (floatingScrollRef.current && isVisible) {
        floatingScrollRef.current.scrollLeft = tableEl.scrollLeft;
      }
    }

    updateFloatingState();

    window.addEventListener("scroll", updateFloatingState, { passive: true });
    window.addEventListener("resize", updateFloatingState, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateFloatingState());
    resizeObserver.observe(tableEl);

    return () => {
      window.removeEventListener("scroll", updateFloatingState);
      window.removeEventListener("resize", updateFloatingState);
      resizeObserver.disconnect();
    };
  }, [items, visibleColumns]);

  function changeType(code: string) {
    setType(code);
    fetchCatalogData(code, 1, pageSize, query);
  }

  function handlePageChange(newPage: number) {
    fetchCatalogData(type, newPage, pageSize, query);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = 0;
    }
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize);
    fetchCatalogData(type, 1, newSize, query);
  }

  function handleQueryChange(val: string) {
    setQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchCatalogData(type, 1, pageSize, val);
    }, 350);
  }

  function handleClearQuery() {
    setQuery("");
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    fetchCatalogData(type, 1, pageSize, "");
  }

  function openCreate() {
    setOpen(true);
  }

  async function exportCsv() {
    setIsExporting(true);
    try {
      const res = await getExportCatalogItemsAction({
        type,
        search: query,
      });

      const exportItems = "data" in res ? res.data : items;

      const headers = activeColDefs
        .filter((col) => col.id !== "actions")
        .map((col) => col.label);

      const rows = exportItems.map((item: CatalogItem, index: number) =>
        activeColDefs
          .filter((col) => col.id !== "actions")
          .map((col) => renderColumnValue(col.id, item, index, lookups)),
      );

      const csvData = [headers, ...rows];
      const csv = `\uFEFF${csvData
        .map((row) =>
          row.map((cell: unknown) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
        )
        .join("\r\n")}`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      link.download = `item-master-${type.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="min-w-0 bg-surface-container-lowest text-on-surface">
      <ItemMasterTabs
        activeType={type}
        itemTypes={activeTypes}
        onTypeChange={changeType}
        stayInCatalog={true}
      />
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant px-1 pb-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">
            รายการสินค้า
          </h1>
          <p className="mt-1 text-[14px] text-on-surface-variant">
            {type === "ALL"
              ? "ศูนย์รวมรายการสินค้า วัตถุดิบ และอะไหล่ทั้งหมดในระบบ KRC ERP"
              : `หมวดหมู่: ${selectedTypeRecord?.name ?? type} (${selectedTypeRecord?.code ?? type})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ItemColumnCustomizer
            availableColumns={availableColumns}
            onReset={resetColumns}
            onSelectAll={selectAllColumns}
            onToggleColumn={toggleColumn}
            visibleColumns={visibleColumns}
          />
          <ExcelExportButton
            onClick={exportCsv}
            isLoading={isExporting}
          />
          {initialData.canManage && (
            <button
              onClick={openCreate}
              className="flex h-10 items-center gap-2 rounded-[3px] bg-primary px-4 text-[14px] font-bold text-on-primary hover:bg-primary/90"
              type="button"
            >
              <PackagePlus size={19} />
              เพิ่มรายการ
            </button>
          )}
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 py-4">
        <label className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3 top-2.5 text-on-surface-variant" size={19} />
          <input
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            className={`${inputClass} pl-10 pr-9`}
            placeholder="ค้นหารหัส ชื่อรายการ Part No. หรือรุ่น..."
          />
          {query ? (
            <button
              onClick={handleClearQuery}
              className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface"
              type="button"
              aria-label="ล้างการค้นหา"
            >
              <X size={18} />
            </button>
          ) : null}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-on-surface-variant">แสดง</span>
          <select
            aria-label="จำนวนรายการต่อหน้า"
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-10 rounded-[3px] border border-outline-variant bg-surface-container-lowest px-3 text-[13px] font-semibold text-on-surface outline-none focus:border-primary cursor-pointer"
          >
            <option value={25}>25 รายการ / หน้า</option>
            <option value={50}>50 รายการ / หน้า</option>
            <option value={100}>100 รายการ / หน้า</option>
            <option value={200}>200 รายการ / หน้า</option>
          </select>
        </div>
        {query ? (
          <button
            onClick={handleClearQuery}
            className="flex h-10 items-center gap-2 rounded-[3px] border border-outline-variant px-4 text-[14px] font-semibold hover:bg-surface-container"
            type="button"
          >
            <Settings2 size={18} />
            ล้างคำค้นหา
          </button>
        ) : null}
      </div>

      {/* Dynamic Table Grid */}
      <div
        ref={tableContainerRef}
        onScroll={handleTableScroll}
        className="relative overflow-x-auto border border-outline-variant overscroll-x-contain"
      >
        <table className="item-catalog-table min-w-full w-max border-collapse text-left text-[13px]">
          <thead className="bg-surface-container">
            <tr>
              {activeColDefs.map((col) => {
                const isStickyLeft = col.id === "index" || col.id === "code";
                const isStickyRight = col.id === "status" || col.id === "actions";

                let stickyClass = "";
                const inlineStyle: React.CSSProperties = isStickyLeft || isStickyRight
                  ? { width: col.minWidth ? `${col.minWidth}px` : undefined, minWidth: col.minWidth ? `${col.minWidth}px` : undefined }
                  : { minWidth: col.minWidth ? `${col.minWidth}px` : undefined };

                if (col.id === "index") {
                  stickyClass =
                    "sticky left-0 z-20 w-[48px] min-w-[48px] max-w-[48px] text-center px-1 bg-surface-container shadow-[1px_0_0_0_var(--outline-variant,#e2e8f0)]";
                } else if (col.id === "code") {
                  stickyClass =
                    "sticky left-[48px] z-20 w-[165px] min-w-[165px] max-w-[165px] px-3 bg-surface-container border-r border-outline-variant/80 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.1)]";
                } else if (col.id === "status") {
                  stickyClass =
                    "sticky right-[54px] z-20 w-[76px] min-w-[76px] max-w-[76px] px-1 text-center bg-surface-container border-l border-outline-variant/80 shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.1)]";
                } else if (col.id === "actions") {
                  stickyClass =
                    "sticky right-0 z-20 w-[54px] min-w-[54px] max-w-[54px] px-1 text-center bg-surface-container shadow-[-1px_0_0_0_var(--outline-variant,#e2e8f0)]";
                }

                return (
                  <th
                    key={col.id}
                    style={inlineStyle}
                    className={`h-11 border-b border-outline-variant px-3 font-bold text-on-surface whitespace-nowrap ${stickyClass}`}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="transition-opacity duration-150">
            {items.map((item, index) => (
              <tr
                key={item.id}
                className="group border-b border-outline-variant transition-colors hover:bg-surface-container-low/60 cursor-pointer"
                onClick={() => setDrawerItem(item)}
              >
                {activeColDefs.map((col) => {
                  const isStickyLeft = col.id === "index" || col.id === "code";
                  const isStickyRight = col.id === "status" || col.id === "actions";

                  let stickyClass = "";
                  const inlineStyle: React.CSSProperties = isStickyLeft || isStickyRight
                    ? { width: col.minWidth ? `${col.minWidth}px` : undefined, minWidth: col.minWidth ? `${col.minWidth}px` : undefined }
                    : { minWidth: col.minWidth ? `${col.minWidth}px` : undefined };

                  if (col.id === "index") {
                    stickyClass =
                      "sticky left-0 z-10 w-[48px] min-w-[48px] max-w-[48px] text-center px-1 bg-white dark:bg-[#1c1a1a] group-hover:bg-[#f3f3f3] dark:group-hover:bg-[#201e1e] shadow-[1px_0_0_0_var(--outline-variant,#e2e8f0)]";
                  } else if (col.id === "code") {
                    stickyClass =
                      "sticky left-[48px] z-10 w-[165px] min-w-[165px] max-w-[165px] px-3 bg-white dark:bg-[#1c1a1a] group-hover:bg-[#f3f3f3] dark:group-hover:bg-[#201e1e] border-r border-outline-variant/80 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.1)]";
                  } else if (col.id === "status") {
                    stickyClass =
                      "sticky right-[54px] z-10 w-[76px] min-w-[76px] max-w-[76px] px-1 text-center bg-white dark:bg-[#1c1a1a] group-hover:bg-[#f3f3f3] dark:group-hover:bg-[#201e1e] border-l border-outline-variant/80 shadow-[-2px_0_5px_-1px_rgba(0,0,0,0.1)]";
                  } else if (col.id === "actions") {
                    stickyClass =
                      "sticky right-0 z-10 w-[54px] min-w-[54px] max-w-[54px] px-1 text-center bg-white dark:bg-[#1c1a1a] group-hover:bg-[#f3f3f3] dark:group-hover:bg-[#201e1e] shadow-[-1px_0_0_0_var(--outline-variant,#e2e8f0)]";
                  }

                  if (col.id === "index") {
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className={`text-on-surface-variant ${stickyClass}`}
                      >
                        {(page - 1) * pageSize + index + 1}
                      </td>
                    );
                  }

                  if (col.id === "code") {
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className={`font-semibold text-primary whitespace-nowrap ${stickyClass}`}
                      >
                        <button
                          className="hover:underline text-left font-bold"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrawerItem(item);
                          }}
                          type="button"
                        >
                          {item.code}
                        </button>
                      </td>
                    );
                  }

                  if (col.id === "name") {
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className="min-w-[280px] px-3.5 py-2 font-medium text-on-surface align-middle"
                        title={item.name}
                      >
                        <div className="whitespace-normal break-words leading-snug">
                          {item.name}
                        </div>
                      </td>
                    );
                  }

                  if (col.id === "partNumber") {
                    const pn = item.form.partNumber?.trim();
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className="min-w-[170px] px-3.5 py-2.5 text-on-surface align-middle whitespace-nowrap"
                        title={pn || "-"}
                      >
                        {pn || "-"}
                      </td>
                    );
                  }

                  if (col.id === "model") {
                    const m = item.form.model?.trim();
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className="min-w-[130px] px-3.5 py-2.5 text-on-surface align-middle whitespace-nowrap"
                        title={m || "-"}
                      >
                        {m || "-"}
                      </td>
                    );
                  }

                  if (col.id === "type") {
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className="px-3 py-2.5 whitespace-nowrap"
                      >
                        <ItemTypeBadge code={item.typeCode} name={item.typeName} />
                      </td>
                    );
                  }

                  if (col.id === "image") {
                    const imgSrc =
                      item.form.primaryImage ||
                      (item.form as Record<string, unknown>).primary_image as string ||
                      "";
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className="px-2 py-1 text-center align-middle"
                        onClick={(e) => {
                          if (imgSrc) {
                            e.stopPropagation();
                            setPreviewImageUrl(imgSrc);
                          }
                        }}
                      >
                        {imgSrc ? (
                          <div className="group/img relative inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={item.name}
                              className="h-9 w-9 rounded border border-outline-variant bg-white object-contain p-0.5 shadow-sm transition-transform group-hover/img:scale-110 cursor-zoom-in"
                              src={imgSrc}
                            />
                          </div>
                        ) : (
                          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded border border-dashed border-outline-variant/60 text-on-surface-variant/30">
                            <ImageIcon size={16} />
                          </div>
                        )}
                      </td>
                    );
                  }

                  if (col.id === "status") {
                    return (
                      <td key={col.id} style={inlineStyle} className={`py-2 ${stickyClass}`}>
                        <span
                          className={`inline-block rounded-[3px] px-2 py-0.5 text-[12px] font-bold text-white whitespace-nowrap ${
                            item.status === "active"
                              ? "bg-emerald-700"
                              : "bg-neutral-500"
                          }`}
                        >
                          {item.status === "active" ? "ใช้งาน" : "ระงับ"}
                        </span>
                      </td>
                    );
                  }

                  if (col.id === "actions") {
                    const isMenuOpen = activeMenu?.item.id === item.id;
                    return (
                      <td
                        key={col.id}
                        style={inlineStyle}
                        className={`py-1 text-center ${stickyClass}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label={`จัดการ ${item.code}`}
                          aria-expanded={isMenuOpen}
                          className={`mx-auto grid h-7 w-7 place-items-center rounded-[4px] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface ${
                            isMenuOpen
                              ? "bg-surface-container text-on-surface ring-1 ring-outline-variant shadow-sm"
                              : ""
                          }`}
                          onClick={(e) => handleToggleMenu(e, item)}
                          title="จัดการรายการ"
                          type="button"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    );
                  }

                  // Default formatted value without word cutting
                  const cellValue = renderColumnValue(col.id, item, index, lookups);
                  return (
                    <td
                      key={col.id}
                      style={inlineStyle}
                      className="px-3.5 py-2.5 text-on-surface align-middle whitespace-nowrap"
                      title={cellValue}
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="py-14 text-center text-[14px] text-on-surface-variant">
            ไม่พบรายการสินค้าหรือวัตถุดิบตามเงื่อนไขที่ค้นหา
          </div>
        )}
      </div>

      {/* Floating Synced Horizontal Scrollbar (pinned to bottom of viewport when table extends below screen) */}
      {floatingScrollState.visible ? (
        <div
          aria-hidden="true"
          className="fixed bottom-0 z-40 overflow-x-auto border-t border-outline-variant/80 bg-surface-container/95 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150"
          onScroll={handleFloatingScroll}
          ref={floatingScrollRef}
          style={{
            left: `${floatingScrollState.left}px`,
            width: `${floatingScrollState.width}px`,
            height: "14px",
          }}
        >
          <div
            style={{
              width: `${floatingScrollState.scrollWidth}px`,
              height: "1px",
            }}
          />
        </div>
      ) : null}

      {/* Pagination Footer */}
      <div className="border border-t-0 border-outline-variant bg-surface-container-lowest">
        <Pagination
          currentPage={page}
          disabled={isFetching}
          onPageChange={handlePageChange}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
        />
      </div>

      {/* Side Drawer Quick View (10+ fields details) */}
      <ItemSideDrawer
        grades={initialData.grades}
        groups={initialData.groups}
        item={drawerItem}
        onClose={() => setDrawerItem(null)}
        onEdit={initialData.canManage ? (it) => setEditingItem(it) : undefined}
        onDelete={initialData.canManage ? (it) => handleStartDelete(it) : undefined}
        types={initialData.types}
        vendors={initialData.vendors}
        warehouses={initialData.warehouses}
      />

      {/* Intelligent Item Delete & Deactivate Prompt Modal */}
      <ItemDeletePromptModal
        actionLoading={isDeleting}
        checkData={deleteCheckData}
        checking={isCheckingDeletable}
        isOpen={Boolean(deletingItem)}
        onClose={() => {
          if (isDeleting) return;
          setDeletingItem(null);
          setDeleteCheckData(null);
        }}
        onConfirmDelete={handleDeleteConfirm}
        onDeactivate={handleDeactivate}
      />

      {/* Floating Action Menu Portal/Popover (immune to table overflow clipping) */}
      {activeMenu && (
        <div
          className="fixed z-[150] w-44 overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest py-1 text-[13px] font-medium shadow-2xl animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${activeMenu.top}px`,
            right: `${activeMenu.right}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container transition-colors"
            onClick={() => {
              const it = activeMenu.item;
              setActiveMenu(null);
              setDrawerItem(it);
            }}
          >
            <Eye size={15} className="text-on-surface-variant" />
            <span>ดูรายละเอียด</span>
          </button>

          {initialData.canManage ? (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-on-surface hover:bg-surface-container transition-colors"
                onClick={() => {
                  const it = activeMenu.item;
                  setActiveMenu(null);
                  setEditingItem(it);
                }}
              >
                <Edit3 size={15} className="text-on-surface-variant" />
                <span>แก้ไขข้อมูล</span>
              </button>

              <div className="my-1 border-t border-outline-variant/60" />

              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                onClick={() => {
                  const it = activeMenu.item;
                  setActiveMenu(null);
                  handleStartDelete(it);
                }}
              >
                <Trash2 size={15} />
                <span>ลบรายการ</span>
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Create / Edit Modal */}
      {open || editingItem ? (
        <ItemCreateModal
          data={initialData}
          initialTypeCode={type === "ALL" ? undefined : type}
          item={editingItem ?? undefined}
          onClose={() => {
            setOpen(false);
            setEditingItem(null);
          }}
          onSaved={() => {
            const isEdit = Boolean(editingItem);
            setOpen(false);
            setEditingItem(null);
            toast.success(
              isEdit
                ? "บันทึกการแก้ไขสินค้าเรียบร้อยแล้ว"
                : "เพิ่มรายการสินค้าใหม่เรียบร้อยแล้ว",
            );
            pageCacheRef.current.clear();
            fetchCatalogData(type, page, pageSize, query);
          }}
        />
      ) : null}

      {/* Image Zoom Preview Modal */}
      {previewImageUrl ? (
        <div
          aria-label="ดูภาพขนาดใหญ่"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setPreviewImageUrl(null)}
          role="dialog"
        >
          <div
            className="relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-lg bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="ปิดรูปภาพ"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
              onClick={() => setPreviewImageUrl(null)}
              type="button"
            >
              <X size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="รูปขยาย"
              className="max-h-[80vh] max-w-[80vw] object-contain"
              src={previewImageUrl}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
