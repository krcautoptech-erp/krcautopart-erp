"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import { Download, Pencil, Plus, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { CompanyFormLogo } from "@/components/company-logo";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  useEffect,
  useDeferredValue,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createRawMaterialAction,
  deleteRawMaterialAction,
  reserveRawMaterialCodeAction,
  updateRawMaterialAction,
  bulkImportRawMaterialsAction,
  type RawMaterialImportInput,
  type RawMaterialInput,
  type RawMaterialLookup,
  type RawMaterialRecord,
  type RawMaterialUnitLookup,
} from "@/app/actions/raw-materials";
import type { CatalogItem, ItemCatalogData } from "@/app/actions/items";
import { ActiveStatusBadge } from "@/components/status-badge";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Pagination } from "@/components/pagination";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ItemCreateModal } from "@/app/(dashboard)/items/_components/item-create-modal";
import { exportRawMaterialsToExcel, downloadRawMaterialTemplate } from "./raw-material-export";
import { ListFilterButton, ListFilterSelect, ListFilterToolbar, ListSearchField, MobileListFilters } from "@/components/list-filters";
import { readSpreadsheet } from "@/lib/spreadsheet-import";

type RawMaterialManagementProps = {
  initialGrades: RawMaterialLookup[];
  initialGroups: RawMaterialLookup[];
  initialRawMaterials: RawMaterialRecord[];
  initialUnits: RawMaterialUnitLookup[];
  initialWarehouses: RawMaterialLookup[];
  itemCatalogData?: ItemCatalogData | null;
};

type MaterialStatus = RawMaterialInput["status"];

type MaterialFormState = {
  material_code: string;
  material_name: string;
  group_id: string;
  grade_id: string;
  thickness_mm: string;
  width_mm: string;
  length_mm: string;
  unit_id: string;
  reorder_point: string;
  warehouse_id: string;
  remark: string;
  status: MaterialStatus;
};

const ITEMS_PER_PAGE = 50;
const DIMENSION_UNIT_CODES = new Set(["MM", "MILLIMETER"]);
const emptyFormState: MaterialFormState = {
  material_code: "",
  material_name: "",
  group_id: "",
  grade_id: "",
  thickness_mm: "",
  width_mm: "",
  length_mm: "",
  unit_id: "",
  reorder_point: "",
  warehouse_id: "",
  remark: "",
  status: "active",
};

const IMPORT_HEADER_ALIASES: Record<string, keyof RawMaterialImportInput | "ignore"> = {
  "ลำดับ": "ignore",
  "รหัสวัตถุดิบ": "material_code",
  "material code": "material_code",
  "รหัส": "material_code",
  "ชื่อวัตถุดิบ": "material_name",
  "material name": "material_name",
  "ชื่อ": "material_name",
  "กลุ่มวัตถุดิบ": "group_name",
  "group": "group_name",
  "กลุ่ม": "group_name",
  "เกรดวัสดุ": "grade_name",
  "grade": "grade_name",
  "เกรด": "grade_name",
  "ความหนา": "thickness_mm",
  "thickness": "thickness_mm",
  "ความหนา (มม.)": "thickness_mm",
  "กว้าง": "width_mm",
  "width": "width_mm",
  "ความกว้าง (มม.)": "width_mm",
  "ยาว": "length_mm",
  "length": "length_mm",
  "ความยาว (มม.)": "length_mm",
  "หน่วย": "unit_symbol",
  "unit": "unit_symbol",
  "หน่วยนับ": "unit_symbol",
  "จุดสั่งซื้อ": "reorder_point",
  "reorder point": "reorder_point",
  "คลังหลัก": "warehouse_name",
  "warehouse": "warehouse_name",
  "คลังสินค้า": "warehouse_name",
  "สถานะ": "status",
  "status": "status",
  "หมายเหตุ": "remark",
  "remark": "remark",
};

const EMPTY_IMPORT_ROW: RawMaterialImportInput = {
  material_code: "",
  material_name: "",
  group_name: "",
  grade_name: "",
  thickness_mm: 0,
  width_mm: null,
  length_mm: null,
  unit_symbol: "",
  reorder_point: null,
  warehouse_name: "",
  status: "ใช้งาน",
  remark: "",
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseNumber(value: string) {
  if (!value) return null;
  const num = parseFloat(value.replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

function mapImportRow(headers: string[], rowValues: string[]) {
  const mappedRow: RawMaterialImportInput = { ...EMPTY_IMPORT_ROW };

  headers.forEach((header, index) => {
    const field = IMPORT_HEADER_ALIASES[normalizeHeader(header)];
    const cellValue = rowValues[index]?.trim() ?? "";

    if (!field || field === "ignore") {
      return;
    }

    if (
      field === "thickness_mm" ||
      field === "width_mm" ||
      field === "length_mm" ||
      field === "reorder_point"
    ) {
      mappedRow[field] = parseNumber(cellValue) as never;
      return;
    }

    mappedRow[field] = cellValue as never;
  });

  return mappedRow;
}

async function parseImportFile(file: File) {
  const { headers, rows } = await readSpreadsheet(file);
  return rows.map((row) => mapImportRow(headers, row));
}

function buildImportSummary(result: {
  createdCount: number;
  errors?: string[];
  skippedCount: number;
  updatedCount: number;
}) {
  const parts = [
    `เพิ่มใหม่ ${result.createdCount} รายการ`,
    `อัปเดต ${result.updatedCount} รายการ`,
  ];

  if (result.skippedCount > 0) {
    parts.push(`ข้าม ${result.skippedCount} รายการ`);
  }

  if (result.errors && result.errors.length > 0) {
    parts.push(`พบข้อผิดพลาด ${result.errors.length} รายการ`);
  }

  const summary = parts.join(" • ");

  if (result.errors && result.errors.length > 0) {
    const errorDetails = result.errors.slice(0, 5).join("\n");
    const suffix = result.errors.length > 5 ? `\n... และอีก ${result.errors.length - 5} รายการ` : "";
    return `${summary}\n\nรายละเอียดข้อผิดพลาด:\n${errorDetails}${suffix}`;
  }

  return summary;
}

function validateImportRowClient(
  row: RawMaterialImportInput,
  groups: RawMaterialLookup[],
  grades: RawMaterialLookup[],
  units: RawMaterialUnitLookup[],
  warehouses: RawMaterialLookup[],
) {
  const errors: string[] = [];

  if (!row.material_name?.trim()) {
    errors.push("ไม่พบชื่อวัตถุดิบ");
  }

  const groupNameClean = row.group_name?.trim().toLowerCase();
  const hasGroup = groups.some((g) => g.name.trim().toLowerCase() === groupNameClean);
  if (!hasGroup) {
    errors.push(`กลุ่ม "${row.group_name}" ไม่มีในระบบ`);
  }

  const gradeNameClean = row.grade_name?.trim().toLowerCase();
  const hasGrade = grades.some((g) => g.name.trim().toLowerCase() === gradeNameClean);
  if (!hasGrade) {
    errors.push(`เกรด "${row.grade_name}" ไม่มีในระบบ`);
  }

  const unitSymbolClean = row.unit_symbol?.trim().toLowerCase();
  const hasUnit = units.some(
    (u) =>
      u.symbol.trim().toLowerCase() === unitSymbolClean ||
      u.code.trim().toLowerCase() === unitSymbolClean,
  );
  if (!hasUnit) {
    errors.push(`หน่วยนับ "${row.unit_symbol}" ไม่มีในระบบ`);
  }

  const warehouseNameClean = row.warehouse_name?.trim().toLowerCase();
  const hasWarehouse = warehouses.some((w) => w.name.trim().toLowerCase() === warehouseNameClean);
  if (!hasWarehouse) {
    errors.push(`คลัง "${row.warehouse_name}" ไม่มีในระบบ`);
  }

  const thickness = parseFloat(String(row.thickness_mm));
  if (isNaN(thickness) || thickness <= 0) {
    errors.push("ความหนาไม่ถูกต้อง");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function RawMaterialManagement({
  initialGrades,
  initialGroups,
  initialRawMaterials,
  initialUnits,
  initialWarehouses,
  itemCatalogData,
}: RawMaterialManagementProps) {
  useListScroll();
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importDropdownRef = useRef<HTMLDivElement>(null);
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<RawMaterialImportInput[] | null>(null);
  const [searchQuery, setSearchQuery] = useListState("searchQuery", "");
  const [groupFilter, setGroupFilter] = useListState("groupFilter", "all");
  const [gradeFilter, setGradeFilter] = useListState("gradeFilter", "all");
  const [statusFilter, setStatusFilter] = useListState("statusFilter", "all");
  const [currentPage, setCurrentPage] = useListState("currentPage", 1);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<RawMaterialRecord | null>(null);
  const [centralFormMode, setCentralFormMode] = useState<"create" | "edit" | null>(null);
  const [centralEditingItem, setCentralEditingItem] = useState<CatalogItem | null>(null);
  const [formState, setFormState] = useState<MaterialFormState>(emptyFormState);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<RawMaterialRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isImportDropdownOpen) return;
    const handleClose = (e: MouseEvent) => {
      if (
        importDropdownRef.current &&
        !importDropdownRef.current.contains(e.target as Node)
      ) {
        setIsImportDropdownOpen(false);
      }
    };
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [isImportDropdownOpen]);

  const stockUnits = useMemo(
    () =>
      initialUnits.filter(
        (unit) => unit.status === "active" && !DIMENSION_UNIT_CODES.has(unit.code.toUpperCase()),
      ),
    [initialUnits],
  );

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredRawMaterials = useMemo(() => {
    const keyword = deferredSearchQuery.trim().toLowerCase();

    return initialRawMaterials.filter((item) => {
      const matchesKeyword =
        keyword.length === 0 ||
        [
          item.material_code,
          item.material_name,
          item.group.name,
          item.grade.name,
          item.warehouse.name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      const matchesGroup = groupFilter === "all" || String(item.group_id) === groupFilter;
      const matchesGrade = gradeFilter === "all" || String(item.grade_id) === gradeFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;

      return matchesKeyword && matchesGroup && matchesGrade && matchesStatus;
    });
  }, [gradeFilter, groupFilter, initialRawMaterials, deferredSearchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRawMaterials.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRawMaterials = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredRawMaterials.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRawMaterials, safeCurrentPage]);

  const closeFormModal = () => {
    setFormMode(null);
    setSelectedMaterial(null);
    setFormState(emptyFormState);
  };

  const openCreateModal = async () => {
    if (itemCatalogData) {
      setFeedback(null);
      setCentralEditingItem(null);
      setCentralFormMode("create");
      return;
    }

    setFeedback(null);
    setSelectedMaterial(null);

    const defaultUnit =
      stockUnits.find((unit) => unit.code.toUpperCase() === "SHEET") ??
      stockUnits.find((unit) => unit.code.toUpperCase() === "PCS") ??
      stockUnits[0];

    const reservation = await reserveRawMaterialCodeAction();
    if (!reservation.success) {
      setFeedback({
        tone: "error",
        message: reservation.error,
      });
      return;
    }

    setFormState({
      ...emptyFormState,
      material_code: reservation.data,
      group_id: initialGroups[0] ? String(initialGroups[0].id) : "",
      grade_id: initialGrades[0] ? String(initialGrades[0].id) : "",
      unit_id: defaultUnit ? String(defaultUnit.id) : "",
      warehouse_id: initialWarehouses[0] ? String(initialWarehouses[0].id) : "",
    });
    setFormMode("create");
  };

  const openEditModal = (material: RawMaterialRecord) => {
    if (itemCatalogData) {
      const catalogItem = itemCatalogData.items.find(
        (item) =>
          Number(item.sourceId) === material.id ||
          (material.material_code && item.code === material.material_code),
      );
      if (!catalogItem) {
        setFeedback({ tone: "error", message: "ไม่พบข้อมูลวัตถุดิบในรายการกลาง" });
        return;
      }
      setFeedback(null);
      setCentralEditingItem(catalogItem);
      setCentralFormMode("edit");
      return;
    }

    setFeedback(null);
    setSelectedMaterial(material);
    setFormState({
      material_code: material.material_code,
      material_name: material.material_name,
      group_id: String(material.group_id),
      grade_id: String(material.grade_id),
      thickness_mm: formatDecimal(material.thickness_mm),
      width_mm: formatDecimal(material.width_mm),
      length_mm: formatDecimal(material.length_mm),
      unit_id: String(material.unit_id),
      reorder_point: formatNullableNumber(material.reorder_point),
      warehouse_id: String(material.warehouse_id),
      remark: material.remark ?? "",
      status: material.status,
    });
    setFormMode("edit");
  };

  const resetFilters = () => {
    setSearchQuery("");
    setGroupFilter("all");
    setGradeFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setFeedback(null);

    startTransition(async () => {
      try {
        const rows = await parseImportFile(file);
        if (rows.length === 0) {
          setFeedback({
            tone: "error",
            message: "ไม่พบข้อมูลวัตถุดิบในไฟล์สำหรับนำเข้า",
          });
          return;
        }
        setImportPreviewRows(rows);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอ่านไฟล์นำเข้า";
        setFeedback({
          tone: "error",
          message,
        });
      }
    });
  };

  const handleConfirmImport = () => {
    if (!importPreviewRows) return;

    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await bulkImportRawMaterialsAction(importPreviewRows);
        setImportPreviewRows(null); // Close modal

        if ("error" in result) {
          setFeedback({
            tone: "error",
            message: result.error,
          });
          return;
        }

        const hasErrors = result.errors && result.errors.length > 0;
        setFeedback({
          tone: hasErrors ? "error" : "success",
          message: buildImportSummary(result),
        });

        startTransition(() => router.refresh());
      } catch (error) {
        setImportPreviewRows(null); // Close modal
        const message =
          error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการนำเข้าข้อมูล";
        setFeedback({
          tone: "error",
          message,
        });
      }
    });
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildMaterialPayload(formState, formMode === "create");

    if ("error" in payload) {
      setFeedback({ tone: "error", message: payload.error });
      return;
    }

    setIsSubmitting(true);
    const result =
      formMode === "edit" && selectedMaterial
        ? await updateRawMaterialAction(selectedMaterial.id, payload.data)
        : await createRawMaterialAction(payload.data);
    setIsSubmitting(false);

    if ("error" in result) {
      setFeedback({ tone: "error", message: result.error ?? "ไม่สามารถบันทึกข้อมูลได้" });
      return;
    }

    setFeedback({
      tone: "success",
      message: formMode === "edit" ? "อัปเดตข้อมูลวัตถุดิบเรียบร้อยแล้ว" : "บันทึกวัตถุดิบเรียบร้อยแล้ว",
    });
    closeFormModal();
    startTransition(() => router.refresh());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsSubmitting(true);
    const result = await deleteRawMaterialAction(deleteTarget.id);
    setIsSubmitting(false);

    if ("error" in result) {
      setFeedback({ tone: "error", message: result.error ?? "ไม่สามารถลบข้อมูลได้" });
      setDeleteTarget(null);
      return;
    }

    setDeleteTarget(null);
    setFeedback({ tone: "success", message: "ลบวัตถุดิบเรียบร้อยแล้ว" });
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-4">
      <section className="bg-transparent px-0 py-0 shadow-none">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-[22px] font-bold leading-none tracking-[-0.03em] text-on-surface">
              ข้อมูลวัตถุดิบ
            </h1>
            <p className="mt-1 text-[12px] font-medium text-secondary">
              จัดการวัตถุดิบหลักสำหรับงานจัดซื้อ คลังสินค้า และการผลิต
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ExcelExportButton onClick={() => exportRawMaterialsToExcel(filteredRawMaterials)} />
            <div className="relative" ref={importDropdownRef}>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-primary bg-surface-container-lowest px-5 text-[14px] font-bold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                type="button"
                disabled={isPending}
              >
                <Upload size={17} />
                {isPending ? "กำลังนำเข้า..." : "นำเข้า"}
              </button>
              {isImportDropdownOpen && (
                <div className="absolute left-0 mt-1 z-50 w-56 rounded-[8px] border border-outline-variant bg-surface-container-lowest py-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      setIsImportDropdownOpen(false);
                      handleImportClick();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-medium text-on-surface hover:bg-surface-container-low border-none bg-transparent cursor-pointer"
                    type="button"
                  >
                    <Upload size={15} className="text-secondary" />
                    <span>นำเข้าไฟล์วัตถุดิบ (.xlsx, .csv)</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsImportDropdownOpen(false);
                      downloadRawMaterialTemplate();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-medium text-on-surface hover:bg-surface-container-low border-none bg-transparent cursor-pointer border-t border-outline-variant/30"
                    type="button"
                  >
                    <Download size={15} className="text-secondary" />
                    <span>ดาวน์โหลดเทมเพลตนำเข้า</span>
                  </button>
                </div>
              )}
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-primary bg-primary px-5 text-[14px] font-bold text-white transition-colors hover:bg-primary/95"
              onClick={openCreateModal}
              type="button"
            >
              <Plus size={17} />
              เพิ่มวัตถุดิบ
            </button>
            <input
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={handleImportChange}
              ref={importInputRef}
              type="file"
            />
          </div>
        </div>

        {feedback ? (
          <div
            className={`mt-5 rounded-[12px] border px-4 py-3 text-[14px] font-bold whitespace-pre-line ${
              feedback.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <MobileListFilters activeCount={[groupFilter !== "all", gradeFilter !== "all", statusFilter !== "all"].filter(Boolean).length} onClear={resetFilters} resultLabel={`แสดง ${filteredRawMaterials.length.toLocaleString("th-TH")} รายการ`} search={<ListSearchField onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }} placeholder="ค้นหารหัสวัตถุดิบ / ชื่อวัตถุดิบ / เกรดวัสดุ" value={searchQuery} />}>
          <ListFilterSelect label="กลุ่มวัตถุดิบ" onChange={(value) => { setGroupFilter(value); setCurrentPage(1); }} value={groupFilter}><option value="all">ทั้งหมด</option>{initialGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</ListFilterSelect>
          <ListFilterSelect label="เกรดวัสดุ" onChange={(value) => { setGradeFilter(value); setCurrentPage(1); }} value={gradeFilter}><option value="all">ทั้งหมด</option>{initialGrades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</ListFilterSelect>
          <ListFilterSelect label="สถานะ" onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }} value={statusFilter}><option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ระงับ</option></ListFilterSelect>
        </MobileListFilters>

        <ListFilterToolbar className="mt-5 hidden md:grid xl:grid-cols-[minmax(280px,1.6fr)_repeat(3,minmax(170px,1fr))_auto] xl:items-center">
          <ListSearchField
              onChange={(value) => {
                setSearchQuery(value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหารหัสวัตถุดิบ / ชื่อวัตถุดิบ / เกรดวัสดุ"
              value={searchQuery}
          />

          <ListFilterSelect
            label="กลุ่มวัตถุดิบ"
            onChange={(value) => {
              setGroupFilter(value);
              setCurrentPage(1);
            }}
            value={groupFilter}
          >
            <option value="all">ทั้งหมด</option>
            {initialGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </ListFilterSelect>
          <ListFilterSelect
            label="เกรดวัสดุ"
            onChange={(value) => {
              setGradeFilter(value);
              setCurrentPage(1);
            }}
            value={gradeFilter}
          >
            <option value="all">ทั้งหมด</option>
            {initialGrades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </ListFilterSelect>
          <ListFilterSelect
            label="สถานะ"
            onChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}
            value={statusFilter}
          >
            <option value="all">ทั้งหมด</option>
            <option value="active">ใช้งาน</option>
            <option value="inactive">ระงับ</option>
          </ListFilterSelect>
          <ListFilterButton
            icon={<SlidersHorizontal size={17} />}
            onClick={resetFilters}
          >
            ล้างตัวกรอง
          </ListFilterButton>
        </ListFilterToolbar>

        <div className="mt-5 relative rounded-[12px] border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div className="overflow-x-auto rounded-t-[12px]">
            <table className="erp-data-table min-w-[980px]">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[9%]" />
                <col className="w-[28%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead className="bg-[#f8fafc] dark:bg-white/[0.04]">
                <tr className="border-b border-outline-variant">
                  {[
                    "ลำดับ",
                    "รหัสวัตถุดิบ",
                    "ชื่อวัตถุดิบ",
                    "กลุ่มวัตถุดิบ",
                    "เกรดวัสดุ",
                    "ขนาด",
                    "จุดสั่งซื้อ",
                    "สถานะ",
                    "จัดการ",
                  ].map((header, index) => (
                    <th
                      className={`h-10 px-3 text-center text-[13px] font-extrabold text-on-surface ${
                        index === 2 ? "text-left" : ""
                      }`}
                      key={header}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRawMaterials.length === 0 ? (
                  <tr>
                    <td className="h-[64px] px-4 text-center text-[15px] font-bold text-secondary" colSpan={11}>
                      ไม่พบข้อมูลวัตถุดิบตามเงื่อนไขที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  paginatedRawMaterials.map((item, index) => (
                    <tr
                      className="!h-[54px] border-b border-outline-variant/80 hover:bg-surface-container-low/60"
                      key={item.id}
                    >
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {(safeCurrentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </td>
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {item.material_code}
                      </td>
                      <td className="px-3 text-left text-[13px] font-medium text-on-surface" title={item.material_name}>
                        <span className="line-clamp-2 break-words whitespace-normal leading-[18px]">
                          {item.material_name}
                        </span>
                      </td>
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {item.group.name}
                      </td>
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {item.grade.name}
                      </td>
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {formatSizeSpec(item)}
                      </td>
                      <td className="px-3 text-center text-[13px] font-medium text-on-surface">
                        {formatDisplayNumber(item.reorder_point)}
                      </td>
                      <td className="px-3 text-center">
                        <StatusChip status={item.status} />
                      </td>
                      <td className="px-3">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            className="text-secondary transition-colors hover:text-on-surface"
                            onClick={() => openEditModal(item)}
                            type="button"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            className="text-primary transition-colors hover:opacity-80"
                            onClick={() => setDeleteTarget(item)}
                            type="button"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination currentPage={safeCurrentPage} onPageChange={setCurrentPage} pageSize={ITEMS_PER_PAGE} totalItems={filteredRawMaterials.length} totalPages={totalPages} />
        </div>
      </section>

      {formMode ? (
        <RawMaterialFormModal
          formMode={formMode}
          formState={formState}
          initialGrades={initialGrades}
          initialGroups={initialGroups}
          initialUnits={stockUnits}
          initialWarehouses={initialWarehouses}
          isPending={isPending}
          isSubmitting={isSubmitting}
          onClose={closeFormModal}
          onFormStateChange={setFormState}
          onSubmit={handleFormSubmit}
        />
      ) : null}

      {itemCatalogData && centralFormMode ? (
        <ItemCreateModal
          data={itemCatalogData}
          initialTypeCode="RM"
          item={centralEditingItem ?? undefined}
          onClose={() => {
            setCentralFormMode(null);
            setCentralEditingItem(null);
          }}
          onSaved={() => {
            setCentralFormMode(null);
            setCentralEditingItem(null);
            setFeedback({
              tone: "success",
              message: centralEditingItem ? "อัปเดตข้อมูลวัตถุดิบเรียบร้อยแล้ว" : "บันทึกวัตถุดิบเรียบร้อยแล้ว",
            });
            startTransition(() => router.refresh());
          }}
        />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-5">
          <div className="w-full max-w-[420px] rounded-[16px] border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
            <h3 className="text-[24px] font-black tracking-[-0.03em] text-on-surface">ยืนยันการลบวัตถุดิบ</h3>
            <p className="mt-3 text-[15px] font-medium leading-7 text-secondary">
              ต้องการลบวัตถุดิบ <span className="font-extrabold text-on-surface">{deleteTarget.material_code}</span> ออกจากระบบใช่หรือไม่
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-outline-variant px-5 text-[14px] font-bold text-on-surface transition-colors hover:bg-surface-container-low"
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                ยกเลิก
              </button>
              <button
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-primary bg-primary px-5 text-[14px] font-bold text-white transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={handleDelete}
                type="button"
              >
                {isSubmitting ? "กำลังลบ..." : "ลบรายการ"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importPreviewRows ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-0 backdrop-blur-sm sm:p-5">
          <div className="flex h-[100dvh] w-full max-w-[1140px] flex-col border border-outline-variant bg-surface-container-lowest p-4 shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:h-auto sm:max-h-[90vh] sm:rounded-[16px] sm:p-6">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-4">
              <div>
                <h3 className="text-[20px] font-bold tracking-[-0.03em] text-on-surface">ตรวจสอบข้อมูลนำเข้าวัตถุดิบ</h3>
                <p className="mt-1 text-[13px] font-medium text-secondary">
                  รายการวัตถุดิบที่ตรวจพบในไฟล์ของคุณ โปรดตรวจสอบความถูกต้องของข้อมูลก่อนกดยืนยันนำเข้า
                </p>
              </div>
              <button
                className="text-secondary transition-colors hover:text-on-surface"
                onClick={() => setImportPreviewRows(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {importPreviewRows.some(row => !validateImportRowClient(row, initialGroups, initialGrades, initialUnits, initialWarehouses).isValid) && (
              <div className="mb-4 rounded-[8px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 text-[13px] font-bold text-red-700 dark:text-red-400">
                ⚠️ มีรายการที่ไม่ถูกต้อง (ไฮไลต์แถบสีแดง) รายการเหล่านี้จะถูกข้ามในการนำเข้า
              </div>
            )}

            {/* Preview Table Container */}
            <div className="flex-1 overflow-auto border border-outline-variant rounded-[8px] max-h-[50vh]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-container-low border-b border-outline-variant font-bold text-on-surface z-10 whitespace-nowrap">
                  <tr>
                    <th className="px-2 py-2.5 text-center">ลำดับ</th>
                    <th className="px-2 py-2.5">รหัสวัตถุดิบ</th>
                    <th className="px-2 py-2.5">ชื่อวัตถุดิบ</th>
                    <th className="px-2 py-2.5">กลุ่มวัตถุดิบ</th>
                    <th className="px-2 py-2.5">เกรดวัสดุ</th>
                    <th className="px-2 py-2.5 text-center">หนา (มม.)</th>
                    <th className="px-2 py-2.5 text-center">กว้าง x ยาว (มม.)</th>
                    <th className="px-2 py-2.5 text-center">หน่วยนับ</th>
                    <th className="px-2 py-2.5">คลังหลัก</th>
                    <th className="px-2 py-2.5 text-center">สถานะ</th>
                    <th className="px-2 py-2.5 text-center">ผลการตรวจ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40 bg-surface-container-lowest">
                  {importPreviewRows.map((row, index) => {
                    const validation = validateImportRowClient(
                      row,
                      initialGroups,
                      initialGrades,
                      initialUnits,
                      initialWarehouses
                    );
                    const isRowValid = validation.isValid;

                    const groupInvalid = !initialGroups.some(g => g.name.toLowerCase() === row.group_name?.trim().toLowerCase());
                    const gradeInvalid = !initialGrades.some(g => g.name.toLowerCase() === row.grade_name?.trim().toLowerCase());
                    const unitInvalid = !initialUnits.some(u => u.symbol.toLowerCase() === row.unit_symbol?.trim().toLowerCase() || u.code.toLowerCase() === row.unit_symbol?.trim().toLowerCase());
                    const warehouseInvalid = !initialWarehouses.some(w => w.name.toLowerCase() === row.warehouse_name?.trim().toLowerCase());

                    return (
                      <tr
                        key={index}
                        className={`hover:bg-surface-container-low ${
                          !isRowValid ? "bg-red-500/5" : ""
                        }`}
                      >
                        <td className="px-2 py-2.5 text-center text-secondary font-medium whitespace-nowrap align-top">{index + 1}</td>
                        <td className="px-2 py-2.5 font-mono font-medium whitespace-nowrap align-top">
                          {row.material_code || <span className="text-[12px] text-primary bg-primary/10 px-2 py-0.5 rounded-[4px] font-sans font-bold">Auto</span>}
                        </td>
                        <td className="px-2 py-2.5 font-bold text-on-surface whitespace-normal align-top min-w-[180px] max-w-[240px]">
                          <div className="line-clamp-2 break-words leading-tight">{row.material_name}</div>
                        </td>
                        <td className={`px-2 py-2.5 font-medium whitespace-nowrap align-top ${groupInvalid ? "text-red-600 bg-red-500/10 font-bold" : ""}`}>
                          {row.group_name}
                        </td>
                        <td className={`px-2 py-2.5 font-medium whitespace-nowrap align-top ${gradeInvalid ? "text-red-600 bg-red-500/10 font-bold" : ""}`}>
                          {row.grade_name}
                        </td>
                        <td className="px-2 py-2.5 text-center font-bold whitespace-nowrap align-top">{row.thickness_mm}</td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap align-top">
                          {row.width_mm && row.length_mm ? `${row.width_mm} x ${row.length_mm}` : "-"}
                        </td>
                        <td className={`px-2 py-2.5 text-center font-medium whitespace-nowrap align-top ${unitInvalid ? "text-red-600 bg-red-500/10 font-bold" : ""}`}>
                          {row.unit_symbol}
                        </td>
                        <td className={`px-2 py-2.5 font-medium whitespace-nowrap align-top ${warehouseInvalid ? "text-red-600 bg-red-500/10 font-bold" : ""}`}>
                          {row.warehouse_name}
                        </td>
                        <td className="px-2 py-2.5 text-center whitespace-nowrap align-top">
                          <span className={`inline-flex h-[22px] items-center rounded-[3px] border px-[8px] text-[11px] font-bold leading-none ${
                            row.status === "ระงับ" || row.status === "inactive"
                              ? "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500"
                              : "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                          }`}>
                            {row.status === "ระงับ" || row.status === "inactive" ? "ระงับ" : "ใช้งาน"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-left whitespace-nowrap align-top font-medium">
                          {isRowValid ? (
                            <span className="text-[12px] text-emerald-600 font-bold bg-emerald-100/50 px-2 py-0.5 rounded-[4px] whitespace-nowrap">พร้อมนำเข้า</span>
                          ) : (
                            <div className="flex flex-col gap-1.5 whitespace-nowrap">
                              <div>
                                <span className="text-[12px] text-red-600 font-bold bg-red-100 px-2 py-0.5 rounded-[4px]">ไม่ถูกต้อง</span>
                              </div>
                              <ul className="text-[11px] text-red-500 font-bold list-disc list-inside space-y-0.5 pl-0.5">
                                {validation.errors.map((err, i) => (
                                  <li key={i} className="whitespace-nowrap">{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Preview Footer Actions */}
            <div className="mt-5 flex items-center justify-between border-t border-outline-variant/60 pt-4">
              <span className="text-[14px] font-medium text-secondary">
                ทั้งหมด <span className="font-extrabold text-on-surface">{importPreviewRows.length}</span> รายการ 
                (พร้อมนำเข้า <span className="font-extrabold text-emerald-600">{importPreviewRows.filter(row => validateImportRowClient(row, initialGroups, initialGrades, initialUnits, initialWarehouses).isValid).length}</span> รายการ)
              </span>
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-[10px] border border-outline-variant px-5 text-[14px] font-bold text-on-surface transition-colors hover:bg-surface-container-low"
                  onClick={() => setImportPreviewRows(null)}
                  type="button"
                  disabled={isPending}
                >
                  ยกเลิก
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-[10px] border border-primary bg-primary px-5 text-[14px] font-bold text-white transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending || importPreviewRows.filter(row => validateImportRowClient(row, initialGroups, initialGrades, initialUnits, initialWarehouses).isValid).length === 0}
                  onClick={handleConfirmImport}
                  type="button"
                >
                  {isPending ? "กำลังนำเข้าข้อมูล..." : "ยืนยันนำเข้า"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RawMaterialFormModal({
  formMode,
  formState,
  initialGrades,
  initialGroups,
  initialUnits,
  initialWarehouses,
  isPending,
  isSubmitting,
  onClose,
  onFormStateChange,
  onSubmit,
}: {
  formMode: "create" | "edit";
  formState: MaterialFormState;
  initialGrades: RawMaterialLookup[];
  initialGroups: RawMaterialLookup[];
  initialUnits: RawMaterialUnitLookup[];
  initialWarehouses: RawMaterialLookup[];
  isPending: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onFormStateChange: (state: MaterialFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-0 backdrop-blur-sm sm:p-5">
      <div className="h-[100dvh] w-full max-w-[760px] overflow-y-auto border border-outline-variant bg-surface-container-lowest shadow-[0_24px_56px_rgba(15,23,42,0.18)] dark:shadow-[0_24px_56px_rgba(0,0,0,0.5)] sm:h-auto sm:max-h-[90dvh] sm:rounded-[12px]">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[18px] font-bold leading-none tracking-[-0.02em] text-on-surface">
              {formMode === "edit" ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}
            </h2>
            <CompanyFormLogo />
          </div>
          <button className="text-secondary transition-colors hover:text-on-surface" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="space-y-5 px-5 py-4">
            <section className="space-y-3">
              <SectionTitle index="01" title="ข้อมูลหลักวัตถุดิบ" />
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 md:grid-cols-3">
                <Field label="รหัสวัตถุดิบ">
                  <input
                    className={inputClassName}
                    readOnly
                    type="text"
                    value={formState.material_code || "(ระบบรันอัตโนมัติ)"}
                  />
                </Field>
                <Field className="md:col-span-2" label="ชื่อวัตถุดิบ" required>
                  <input
                    className={inputClassName}
                    onChange={(event) => onFormStateChange({ ...formState, material_name: event.target.value })}
                    placeholder="เช่น SS400 3.0 x 100 x 1220"
                    type="text"
                    value={formState.material_name}
                  />
                </Field>
                <Field label="เกรดวัสดุ" required>
                  <select
                    className={inputClassName}
                    onChange={(event) => onFormStateChange({ ...formState, grade_id: event.target.value })}
                    value={formState.grade_id}
                  >
                    <option value="">เลือกเกรดวัสดุ</option>
                    {initialGrades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        {grade.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="กลุ่มวัตถุดิบ" required>
                  <select
                    className={inputClassName}
                    onChange={(event) => onFormStateChange({ ...formState, group_id: event.target.value })}
                    value={formState.group_id}
                  >
                    <option value="">เลือกกลุ่มวัตถุดิบ</option>
                    {initialGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="สถานะใช้งาน">
                  <ToggleSwitch checked={formState.status === "active"} label={formState.status === "active" ? "ใช้งาน" : "ระงับ"} onChange={(checked) => onFormStateChange({ ...formState, status: checked ? "active" : "inactive" })} />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <SectionTitle index="02" title="ขนาดวัตถุดิบและหน่วยนับ" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4">
                <Field label="ความหนา" required>
                  <DimensionInput
                    onChange={(value) =>
                      onFormStateChange({ ...formState, thickness_mm: value })
                    }
                    placeholder="เช่น 2.00"
                    value={formState.thickness_mm}
                  />
                </Field>
                <Field label="กว้าง" required>
                  <DimensionInput
                    onChange={(value) => onFormStateChange({ ...formState, width_mm: value })}
                    placeholder="เช่น 45"
                    value={formState.width_mm}
                  />
                </Field>
                <Field label="ยาว" required>
                  <DimensionInput
                    onChange={(value) => onFormStateChange({ ...formState, length_mm: value })}
                    placeholder="เช่น 1220"
                    value={formState.length_mm}
                  />
                </Field>
                <Field label="หน่วยนับ / หน่วยสต็อก" required>
                  <select
                    className={inputClassName}
                    onChange={(event) => onFormStateChange({ ...formState, unit_id: event.target.value })}
                    value={formState.unit_id}
                  >
                    <option value="">เลือกหน่วยนับ</option>
                    {initialUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <SectionTitle index="03" title="การวางแผนและคลัง" />
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 md:grid-cols-2">
                <Field label="จุดสั่งซื้อ">
                  <input
                    className={inputClassName}
                    inputMode="decimal"
                    onChange={(event) => onFormStateChange({ ...formState, reorder_point: event.target.value })}
                    placeholder="เช่น 20"
                    type="text"
                    value={formState.reorder_point}
                  />
                </Field>
                <Field label="คลังหลัก" required>
                  <select
                    className={inputClassName}
                    onChange={(event) => onFormStateChange({ ...formState, warehouse_id: event.target.value })}
                    value={formState.warehouse_id}
                  >
                    <option value="">เลือกคลังหลัก</option>
                    {initialWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="หมายเหตุ">
                <textarea
                  className={`${textareaClassName} min-h-[76px] resize-none py-2.5`}
                  maxLength={255}
                  onChange={(event) => onFormStateChange({ ...formState, remark: event.target.value })}
                  placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
                  value={formState.remark}
                />
                <p className="mt-2 text-right text-[12px] font-medium text-secondary">
                  {formState.remark.length} / 255
                </p>
              </Field>
            </section>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-outline-variant px-5 py-3">
            <button
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-outline-variant px-7 text-[13px] font-bold text-on-surface transition-colors hover:bg-surface-container-low"
              onClick={onClose}
              type="button"
            >
              ยกเลิก
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-primary bg-primary px-7 text-[13px] font-bold text-white transition-colors hover:bg-primary/95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || isPending}
              type="submit"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกวัตถุดิบ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectionTitle({ className = "", index, title }: { className?: string; index: string; title: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">
          {index}
        </span>
        <h3 className="text-[14px] font-bold tracking-[-0.01em] text-on-surface">{title}</h3>
      </div>
    </div>
  );
}

function Field({
  children,
  className = "",
  label,
  required,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-bold text-on-surface">
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function DimensionInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="relative">
      <input
        className={`${inputClassName} pr-12`}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-secondary"
      >
        มม.
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: MaterialStatus }) {
  return <ActiveStatusBadge active={status === "active"} />;
}

function buildMaterialPayload(formState: MaterialFormState, isCreate: boolean): { data: RawMaterialInput } | { error: string } {
  if (!isCreate && !/^RM\d{3,}$/.test(formState.material_code)) {
    return { error: "รูปแบบรหัสวัตถุดิบไม่ถูกต้อง" };
  }
  if (isCreate && formState.material_code !== "" && !/^RM\d{3,}$/.test(formState.material_code)) {
    return { error: "รูปแบบรหัสวัตถุดิบไม่ถูกต้อง" };
  }
  if (!formState.material_name.trim()) return { error: "กรุณากรอกชื่อวัตถุดิบ" };
  if (!formState.group_id) return { error: "กรุณาเลือกกลุ่มวัตถุดิบ" };
  if (!formState.grade_id) return { error: "กรุณาเลือกเกรดวัสดุ" };
  if (!formState.unit_id) return { error: "กรุณาเลือกหน่วยนับ" };
  if (!formState.warehouse_id) return { error: "กรุณาเลือกคลังหลัก" };

  const thickness = Number(formState.thickness_mm);
  const width = Number(formState.width_mm);
  const length = Number(formState.length_mm);
  if (Number.isNaN(thickness) || thickness < 0) return { error: "กรุณากรอกความหนาให้ถูกต้อง" };
  if (Number.isNaN(width) || width < 0) return { error: "กรุณากรอกความกว้างให้ถูกต้อง" };
  if (Number.isNaN(length) || length < 0) return { error: "กรุณากรอกความยาวให้ถูกต้อง" };

  const reorderPoint = formState.reorder_point.trim().length > 0 ? Number(formState.reorder_point) : null;
  if (reorderPoint !== null && (Number.isNaN(reorderPoint) || reorderPoint < 0)) {
    return { error: "กรุณากรอกจุดสั่งซื้อให้ถูกต้อง" };
  }

  return {
    data: {
      material_code: formState.material_code,
      material_name: formState.material_name.trim(),
      group_id: Number(formState.group_id),
      grade_id: Number(formState.grade_id),
      thickness_mm: thickness,
      width_mm: width,
      length_mm: length,
      unit_id: Number(formState.unit_id),
      reorder_point: reorderPoint,
      warehouse_id: Number(formState.warehouse_id),
      remark: formState.remark.trim() || null,
      status: formState.status,
    },
  };
}


const integerFormatter = new Intl.NumberFormat("en-US");
const dimensionFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});

function formatDecimal(value: number) {
  return value.toFixed(2);
}

function formatDimension(value: number) {
  if (Number.isInteger(value)) {
    return integerFormatter.format(value);
  }

  return dimensionFormatter.format(value);
}

function formatNullableNumber(value: number | null) {
  if (value === null) return "";
  return String(value);
}

function formatDisplayNumber(value: number | null) {
  if (value === null) return "-";
  if (Number.isInteger(value)) return integerFormatter.format(value);
  return String(value);
}

function formatSizeSpec(item: RawMaterialRecord) {
  return `${formatDecimal(item.thickness_mm)} x ${formatDimension(item.width_mm)} x ${formatDimension(item.length_mm)}`;
}

const inputClassName =
  "h-9 w-full rounded-[8px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px] font-medium text-on-surface outline-none transition-colors placeholder:text-[#8a8a8a] placeholder:opacity-100 dark:placeholder:text-[#9ca3af] focus:border-primary";

const textareaClassName =
  "w-full rounded-[8px] border border-outline-variant bg-surface-container-lowest px-3 text-[12px] font-medium text-on-surface outline-none transition-colors placeholder:text-[#8a8a8a] placeholder:opacity-100 dark:placeholder:text-[#9ca3af] focus:border-primary";
