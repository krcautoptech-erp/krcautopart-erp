"use client";

import { useListState, useListScroll } from "@/lib/use-list-state";

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Download, PlusCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  bulkImportProductsAction,
  deleteProductAction,
  type ProductImportInput,
} from "@/app/actions/products";
import type { CatalogItem, ItemCatalogData } from "@/app/actions/items";
import { useApp } from "@/components/app-context";
import { ExcelExportButton } from "@/components/excel-export-button";
import { ConfirmModal } from "@/components/confirm-modal";
import { toast } from "@/components/toast";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { ProductAddModal } from "./product-add-modal";
import { ProductDetailModal } from "./product-detail-modal";
import { ProductEditModal } from "./product-edit-modal";
import { ProductTable } from "./product-table";
import { ItemCreateModal } from "@/app/(dashboard)/items/_components/item-create-modal";
import { readSpreadsheet } from "@/lib/spreadsheet-import";
import { ListFilterSelect, ListSearchField, MobileListFilters } from "@/components/list-filters";

export type ProductRecord = {
  id: string;
  part_number: string;
  part_name: string;
  material: string | null;
  plating: string | null;
  std_no: string | null;
  sheet_count: number | null;
  parts_per_sheet: number | null;
  primary_image: string | null;
  cost_price: number;
  selling_price: number;
  unit: string;
  status: string;
  model: string | null;
  created_at: string;
  erp_code: string | null;
};

type ExportColumn = {
  header: string;
  value: (product: ProductRecord, index: number) => string | number;
};

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: "ลำดับ", value: (_product, index) => index + 1 },
  { header: "รหัสสินค้า", value: (product) => product.erp_code || "" },
  { header: "Part Number", value: (product) => product.part_number || "" },
  { header: "ชื่อชิ้นงาน", value: (product) => product.part_name || "" },
  { header: "เกรดวัสดุ", value: (product) => product.material || "" },
  { header: "งานชุบเคลือบผิว", value: (product) => product.plating || "" },
  { header: "มาตรฐาน STD", value: (product) => product.std_no || "" },
  { header: "จำนวนแผ่น", value: (product) => product.sheet_count ?? "" },
  { header: "ชิ้นงานต่อแผ่น", value: (product) => product.parts_per_sheet ?? "" },
  { header: "ต้นทุน", value: (product) => product.cost_price ?? 0 },
  { header: "ราคาขายกลาง", value: (product) => product.selling_price ?? 0 },
  { header: "หน่วยนับ", value: (product) => product.unit || "" },
  { header: "รุ่น", value: (product) => product.model || "" },
  { header: "สถานะ", value: (product) => product.status || "" },
];

const IMPORT_HEADER_ALIASES: Record<string, keyof ProductImportInput | "ignore"> = {
  "ลำดับ": "ignore",
  "รหัสสินค้า": "erp_code",
  "erp code": "erp_code",
  "erp code / รหัสสินค้า": "erp_code",
  "part number": "part_number",
  "part no": "part_number",
  "ชื่อชิ้นงาน": "part_name",
  "part name": "part_name",
  "ชนิดวัสดุ": "material",
  "เกรดวัสดุ": "material",
  "material grade": "material",
  "material grade / เกรดวัสดุ": "material",
  "raw material": "material",
  "raw material / ชนิดวัตถุดิบ": "material",
  "งานชุบเคลือบผิว": "plating",
  "plating": "plating",
  "plating / งานชุบเคลือบผิว": "plating",
  "มาตรฐาน std": "std_no",
  "standard": "std_no",
  "standard / มาตรฐาน std": "std_no",
  "จำนวนแผ่น": "sheet_count",
  "sheets per unit": "sheet_count",
  "sheets per unit / จำนวนแผ่น": "sheet_count",
  "ชิ้นงานต่อแผ่น": "parts_per_sheet",
  "workpieces per sheet": "parts_per_sheet",
  "workpieces per sheet / ชิ้นงานต่อแผ่น": "parts_per_sheet",
  "ต้นทุน": "cost_price",
  "cost": "cost_price",
  "cost / ต้นทุน (บาท)": "cost_price",
  "ราคาขายกลาง": "selling_price",
  "selling price": "selling_price",
  "selling price / ราคาขายกลาง (บาท)": "selling_price",
  "หน่วยนับ": "unit",
  "unit": "unit",
  "unit / หน่วยนับ": "unit",
  "รุ่น": "model",
  "model": "model",
  "สถานะ": "status",
  "status": "status",
};

const EMPTY_IMPORT_ROW: ProductImportInput = {
  part_number: "",
  part_name: "",
  material: "",
  plating: "",
  std_no: "",
  sheet_count: null,
  parts_per_sheet: null,
  cost_price: 0,
  selling_price: 0,
  unit: "ชิ้น",
  status: "ใช้งาน",
  model: "",
  erp_code: "",
};

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = value.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildExcelWorksheet(products: ProductRecord[]) {
  const headerRow = EXPORT_COLUMNS.map(
    (column) =>
      `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeSpreadsheetXml(column.header)}</Data></Cell>`,
  ).join("");

  const bodyRows = products
    .map((product, index) => {
      const cells = EXPORT_COLUMNS.map((column) => {
        const rawValue = column.value(product, index);
        const cellType =
          typeof rawValue === "number" && Number.isFinite(rawValue) ? "Number" : "String";

        return `<Cell><Data ss:Type="${cellType}">${escapeSpreadsheetXml(rawValue)}</Data></Cell>`;
      }).join("");

      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Product Master">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function buildImportTemplateWorksheet() {
  const sampleRows = [
    EXPORT_COLUMNS.map((column) => column.header),
    [
      "1",
      "RM1000001",
      "PN-001",
      "ชิ้นงานตัวอย่าง",
      "SPCC",
      "ED Coating",
      "JIS G3141",
      "1",
      "24",
      "12.50",
      "18.75",
      "ชิ้น",
      "T-2024",
      "ใช้งาน",
    ],
  ];

  const rows = sampleRows
    .map(
      (row, rowIndex) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell${rowIndex === 0 ? ' ss:StyleID="header"' : ""}><Data ss:Type="String">${escapeSpreadsheetXml(
                cell,
              )}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Product Import Template">
    <Table>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function mapImportRow(headers: string[], rowValues: string[]) {
  const mappedRow: ProductImportInput = { ...EMPTY_IMPORT_ROW };

  headers.forEach((header, index) => {
    const field = IMPORT_HEADER_ALIASES[normalizeHeader(header)];
    const cellValue = rowValues[index]?.trim() ?? "";

    if (!field || field === "ignore") {
      return;
    }

    if (field === "sheet_count" || field === "parts_per_sheet") {
      mappedRow[field] = parseNumber(cellValue);
      return;
    }

    if (field === "cost_price" || field === "selling_price") {
      mappedRow[field] = parseNumber(cellValue) ?? 0;
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
  success: boolean;
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

  return parts.join(" • ");
}

export function ProductCatalog({
  itemCatalogData,
  products,
  materialGrades = [],
}: {
  itemCatalogData?: ItemCatalogData | null;
  products: ProductRecord[];
  materialGrades?: {
    id: number;
    grade_name: string;
    status: string;
  }[];
}) {
  useListScroll();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importDropdownRef = useRef<HTMLDivElement>(null);
  const { isAddModalOpen, setIsAddModalOpen } = useApp();
  const [searchQuery, setSearchQuery] = useListState("searchQuery", "");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [selectedMaterial, setSelectedMaterial] = useListState("selectedMaterial", "ทั้งหมด");
  const [currentPage, setCurrentPage] = useListState("currentPage", 1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductRecord | null>(null);
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);
  const [centralEditingItem, setCentralEditingItem] = useState<CatalogItem | null>(null);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<ProductRecord | null>(null);
  const [pendingImportRows, setPendingImportRows] = useState<ProductImportInput[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isImporting, startImportTransition] = useTransition();
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const itemsPerPage = 50;

  useBodyScrollLock(Boolean(previewImage));

  const items = useMemo(
    () => products.filter((product) => !deletedIds.has(product.id)),
    [deletedIds, products],
  );

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

  const materialGradeFilters = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.material) {
        values.add(item.material.trim().toUpperCase());
      }
    });
    return Array.from(values).sort();
  }, [items]);

  const filteredProducts = useMemo(() => {
    let result = items;
    const keyword = deferredQuery.trim().toLowerCase();

    if (keyword) {
      result = result.filter((product) =>
        [
          product.erp_code,
          product.part_number,
          product.part_name,
          product.material,
          product.plating,
          product.std_no,
          product.unit,
          product.model,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    if (selectedMaterial !== "ทั้งหมด") {
      result = result.filter(
        (product) => (product.material || "").trim().toUpperCase() === selectedMaterial,
      );
    }

    return result;
  }, [items, deferredQuery, selectedMaterial]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, safeCurrentPage]);

  const currentDetailIdx = detailProduct
    ? filteredProducts.findIndex((product) => product.id === detailProduct.id)
    : -1;
  const prevDisabled = currentDetailIdx <= 0;
  const nextDisabled =
    currentDetailIdx === -1 || currentDetailIdx >= filteredProducts.length - 1;

  const navigateDetail = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev" && !prevDisabled) {
        setDetailProduct(filteredProducts[currentDetailIdx - 1]);
        return;
      }

      if (direction === "next" && !nextDisabled) {
        setDetailProduct(filteredProducts[currentDetailIdx + 1]);
      }
    },
    [currentDetailIdx, filteredProducts, nextDisabled, prevDisabled],
  );

  useEffect(() => {
    if (!detailProduct) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        navigateDetail("prev");
      } else if (event.key === "ArrowRight") {
        navigateDetail("next");
      } else if (event.key === "Escape") {
        setDetailProduct(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailProduct, navigateDetail]);

  const handleExportExcel = () => {
    if (filteredProducts.length === 0) {
      setErrorMessage("ไม่มีข้อมูลสินค้าให้ส่งออก");
      setShowErrorModal(true);
      return;
    }

    const workbookXml = buildExcelWorksheet(filteredProducts);
    const blob = new Blob(["\uFEFF", workbookXml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `krc-product-master-${date}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const workbookXml = buildImportTemplateWorksheet();
    const blob = new Blob(["\uFEFF", workbookXml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "krc-product-import-template.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    startImportTransition(async () => {
      try {
        const rows = await parseImportFile(file);
        setPendingImportRows(rows);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอ่านไฟล์นำเข้า";
        setErrorMessage(message);
        setShowErrorModal(true);
      }
    });
  };

  const handleConfirmImport = () => {
    if (!pendingImportRows) return;
    startImportTransition(async () => {
      const result = await bulkImportProductsAction(pendingImportRows);
      setPendingImportRows(null);
      if (!("success" in result)) {
        setErrorMessage(result.error);
        setShowErrorModal(true);
        return;
      }
      setSuccessMessage(buildImportSummary(result));
      setShowSuccessModal(true);
      router.refresh();
    });
  };

  const handleDeleteProductClick = (product: ProductRecord) => {
    setDeleteConfirmProduct(product);
  };

  const openEditProduct = (product: ProductRecord) => {
    if (!itemCatalogData) {
      setEditProduct(product);
      return;
    }

    const catalogItem = itemCatalogData.items.find(
      (item) =>
        String(item.sourceId) === String(product.id) ||
        (product.erp_code && item.code === product.erp_code) ||
        (product.part_number && (item.code === product.part_number || item.form?.partNumber === product.part_number)),
    );
    if (!catalogItem) {
      setErrorMessage("ไม่พบข้อมูลสินค้าสำเร็จรูปในรายการกลาง");
      setShowErrorModal(true);
      return;
    }

    setCentralEditingItem(catalogItem);
  };

  const handleDeleteProductConfirm = async () => {
    if (!deleteConfirmProduct) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteProductAction(deleteConfirmProduct.id);
    setIsDeleting(false);

    if ("error" in result) {
      toast.error(result.error || "ไม่สามารถลบข้อมูลสินค้าได้", { title: "ไม่สามารถลบรายการได้" });
      setDeleteConfirmProduct(null);
      return;
    }

    setDeletedIds((current) => new Set(current).add(deleteConfirmProduct.id));
    toast.success(`ลบสินค้า ${deleteConfirmProduct.part_number} ออกจากระบบเรียบร้อยแล้ว`, { title: "ลบสำเร็จ" });
    setDeleteConfirmProduct(null);
  };

  return (
    <div className="space-y-lg">
      <header className="flex flex-col gap-sm border-b border-outline-variant pb-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-xs">
          <h1 className="text-[24px] font-bold leading-none text-on-surface">
            ข้อมูลชิ้นงานสินค้า
          </h1>
          <p className="text-[13px] font-medium leading-none text-secondary">
            จัดการข้อมูลชิ้นงานสินค้า, รูปสินค้า, การนำเข้า และการส่งออกข้อมูลสินค้ากลางของระบบ
          </p>
        </div>

        <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-sm">
            <div className="relative" ref={importDropdownRef}>
              <ActionButton
                icon={<Upload className="h-5 w-5" />}
                iconShellClassName="bg-slate-100 text-slate-700 dark:bg-surface-container-high dark:text-on-surface"
                label={isImporting ? "กำลังนำเข้า..." : "นำเข้า"}
                onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                variant="ghost"
                disabled={isImporting}
              />
              {isImportDropdownOpen && (
                <div className="absolute left-0 mt-1 z-50 w-56 rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
                  <button
                    onClick={() => {
                      setIsImportDropdownOpen(false);
                      handleImportButtonClick();
                    }}
                    className="flex w-full items-center gap-sm px-md py-sm text-left font-label-md text-label-md text-on-surface hover:bg-surface-container-low border-none bg-transparent cursor-pointer"
                    type="button"
                  >
                    <Upload className="h-4 w-4 text-secondary" />
                    <span>นำเข้าไฟล์สินค้า (.xlsx, .csv)</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsImportDropdownOpen(false);
                      handleDownloadTemplate();
                    }}
                    className="flex w-full items-center gap-sm px-md py-sm text-left font-label-md text-label-md text-on-surface hover:bg-surface-container-low border-none bg-transparent cursor-pointer border-t border-outline-variant/30"
                    type="button"
                  >
                    <Download className="h-4 w-4 text-secondary" />
                    <span>ดาวน์โหลดเทมเพลตนำเข้า</span>
                  </button>
                </div>
              )}
            </div>

            <ExcelExportButton onClick={handleExportExcel} />
            <ActionButton
              icon={<PlusCircle className="h-5 w-5" />}
              iconShellClassName="bg-white/15 text-on-primary"
              label="เพิ่มสินค้า"
              onClick={() => setIsAddModalOpen(true)}
              variant="primary"
            />
          </div>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".xlsx,.csv,.xls,.xml"
            onChange={handleImportFile}
          />
        </div>
      </header>

      <MobileListFilters
        activeCount={selectedMaterial === "ทั้งหมด" ? 0 : 1}
        onClear={() => { setSelectedMaterial("ทั้งหมด"); setCurrentPage(1); }}
        search={<ListSearchField onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }} placeholder="ค้นหารหัสสินค้า ชื่อสินค้า หรือรายละเอียด..." value={searchQuery} />}
      >
        <ListFilterSelect label="เกรดวัสดุ" onChange={(value) => { setSelectedMaterial(value); setCurrentPage(1); }} value={selectedMaterial}><option value="ทั้งหมด">ทั้งหมด ({items.length})</option>{materialGradeFilters.map((material) => <option key={material} value={material}>{material} ({items.filter((product) => (product.material || "").trim().toUpperCase() === material).length})</option>)}</ListFilterSelect>
      </MobileListFilters>
      <div className="hidden flex-col gap-sm md:flex md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-sm">
          <span className="text-[14px] font-semibold text-secondary">
            เกรดวัสดุ:
          </span>
          <select
            value={selectedMaterial}
            onChange={(event) => { setSelectedMaterial(event.target.value); setCurrentPage(1); }}
            className="h-[38px] min-w-[160px] rounded-[5px] border border-outline-variant bg-background px-4 text-[14px] font-semibold text-on-surface outline-none focus:border-primary"
          >
            <option value="ทั้งหมด">ทั้งหมด ({items.length})</option>
            {materialGradeFilters.map((material) => {
              const count = items.filter(
                (product) => (product.material || "").trim().toUpperCase() === material,
              ).length;

              return (
                <option key={material} value={material}>
                  {material} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <div className="text-[13px] font-medium text-secondary">
          พบสินค้า <span className="font-bold text-on-surface">{filteredProducts.length}</span> รายการ
        </div>
      </div>

      <ProductTable
        paginatedProducts={paginatedProducts}
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={filteredProducts.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onViewDetails={setDetailProduct}
        onEditProduct={openEditProduct}
        onDeleteProduct={handleDeleteProductClick}
        onPreviewImage={setPreviewImage}
      />

      {isAddModalOpen && itemCatalogData ? (
        <ItemCreateModal
          data={itemCatalogData}
          initialTypeCode="FG"
          onClose={() => setIsAddModalOpen(false)}
          onSaved={() => {
            setIsAddModalOpen(false);
            setSuccessMessage("บันทึกข้อมูลชิ้นงานใหม่เข้าระบบสำเร็จแล้ว");
            setShowSuccessModal(true);
            router.refresh();
          }}
        />
      ) : null}

      {isAddModalOpen && !itemCatalogData ? (
        <ProductAddModal
          materialGrades={materialGrades}
          onClose={() => setIsAddModalOpen(false)}
          onSaveSuccess={() => {
            setIsAddModalOpen(false);
            setSuccessMessage("บันทึกข้อมูลชิ้นงานใหม่เข้าระบบสำเร็จแล้ว");
            setShowSuccessModal(true);
            router.refresh();
          }}
          onError={(message) => {
            setErrorMessage(`ไม่สามารถบันทึกข้อมูลสินค้าได้: ${message}`);
            setShowErrorModal(true);
          }}
        />
      ) : null}

      {centralEditingItem && itemCatalogData ? (
        <ItemCreateModal
          data={itemCatalogData}
          initialTypeCode="FG"
          item={centralEditingItem}
          onClose={() => setCentralEditingItem(null)}
          onSaved={() => {
            setCentralEditingItem(null);
            setSuccessMessage("แก้ไขข้อมูลชิ้นงานเรียบร้อยแล้ว");
            setShowSuccessModal(true);
            router.refresh();
          }}
        />
      ) : null}

      {detailProduct ? (
        <ProductDetailModal
          detailProduct={detailProduct}
          onClose={() => setDetailProduct(null)}
          navigateDetail={navigateDetail}
          currentDetailIdx={currentDetailIdx}
          totalCount={filteredProducts.length}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
        />
      ) : null}

      {editProduct ? (
        <ProductEditModal
          editProduct={editProduct}
          materialGrades={materialGrades}
          onClose={() => setEditProduct(null)}
          onUpdateSuccess={() => {
            setEditProduct(null);
            setSuccessMessage("แก้ไขข้อมูลชิ้นงานเรียบร้อยแล้ว");
            setShowSuccessModal(true);
            router.refresh();
          }}
          onError={(message) => {
            setErrorMessage(`ไม่สามารถแก้ไขข้อมูลสินค้าได้: ${message}`);
            setShowErrorModal(true);
          }}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(pendingImportRows)}
        title="ยืนยันนำเข้าข้อมูลสินค้า"
        message={`ตรวจสอบไฟล์แล้ว ${pendingImportRows?.length ?? 0} รายการ รหัสที่มีอยู่จะถูกอัปเดต และรหัสใหม่จะถูกเพิ่ม`}
        confirmText="ยืนยันนำเข้า"
        cancelText="ยกเลิก"
        variant="primary"
        loading={isImporting}
        onConfirm={handleConfirmImport}
        onClose={() => setPendingImportRows(null)}
      />

      <ConfirmModal
        open={Boolean(deleteConfirmProduct)}
        title="ยืนยันการลบสินค้า"
        message={
          deleteConfirmProduct
            ? `คุณแน่ใจหรือไม่ว่าต้องการลบชิ้นงาน ${deleteConfirmProduct.part_number} (${deleteConfirmProduct.part_name}) ออกจากระบบ? รายการที่มีประวัติจัดซื้อหรือสต็อกจะไม่สามารถลบได้`
            : ""
        }
        confirmText="ใช่, ลบสินค้า"
        cancelText="ยกเลิก"
        danger
        loading={isDeleting}
        onConfirm={handleDeleteProductConfirm}
        onClose={() => setDeleteConfirmProduct(null)}
      />

      {previewImage ? (
        <div
          className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/90 p-md backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative flex w-full max-w-4xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="absolute -top-12 right-0 border-none bg-transparent text-white transition-colors hover:text-primary"
              onClick={() => setPreviewImage(null)}
              type="button"
            >
              <span className="material-symbols-outlined text-[32px]">close</span>
            </button>
            <img
              alt="ดูรูปสินค้าขนาดใหญ่"
              className="max-h-[85vh] max-w-full object-contain"
              src={previewImage}
            />
          </div>
        </div>
      ) : null}

      <FeedbackModal
        open={showSuccessModal}
        title="ดำเนินการสำเร็จ"
        message={successMessage}
        tone="success"
        onClose={() => setShowSuccessModal(false)}
      />

      <FeedbackModal
        open={showErrorModal}
        title="เกิดข้อผิดพลาด"
        message={errorMessage}
        tone="error"
        onClose={() => setShowErrorModal(false)}
      />
    </div>
  );
}

function ActionButton({
  disabled = false,
  icon,
  iconShellClassName,
  label,
  onClick,
  variant,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  iconShellClassName?: string;
  label: string;
  onClick: () => void;
  variant: "ghost" | "primary";
}) {
  const classes =
    variant === "primary"
      ? "border border-primary bg-primary text-on-primary shadow-[0_12px_30px_-18px_rgba(170,17,25,0.7)] hover:brightness-110 dark:border-primary"
      : "border border-outline-variant bg-white text-on-surface shadow-[0_10px_25px_-20px_rgba(15,23,42,0.45)] hover:bg-surface-container-low dark:border-white/10 dark:bg-surface-container-lowest dark:text-on-surface dark:hover:bg-surface-container-high";

  return (
    <button
      onClick={onClick}
      className={`flex h-12 items-center justify-center gap-sm rounded-md px-md text-[17px] font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
      disabled={disabled}
      type="button"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm ${
          iconShellClassName ?? "bg-black/5 text-current"
        }`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function FeedbackModal({
  message,
  onClose,
  open,
  title,
  tone,
}: {
  message: string;
  onClose: () => void;
  open: boolean;
  title: string;
  tone: "error" | "success";
}) {
  useBodyScrollLock(open);

  if (!open) {
    return null;
  }

  const toneClass =
    tone === "success"
      ? {
          action: "bg-primary text-on-primary hover:bg-primary/95",
          badge: "bg-emerald-500/10",
          icon: "text-emerald-500",
          symbol: "check_circle",
        }
      : {
          action: "bg-error text-white hover:bg-error/90",
          badge: "bg-error/10",
          icon: "text-error",
          symbol: "error",
        };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-md text-center backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[360px] space-y-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg text-center shadow-2xl animate-in zoom-in-95 duration-200 dark:border-white/10">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${toneClass.badge}`}>
          <span className={`material-symbols-outlined text-[28px] ${toneClass.icon}`}>
            {toneClass.symbol}
          </span>
        </div>
        <div className="space-y-xs">
          <h3 className="font-headline-md text-[18px] font-bold text-on-surface">{title}</h3>
          <p className="text-sm text-secondary">{message}</p>
        </div>
        <div className="pt-sm">
          <button
            onClick={onClose}
            className={`w-full rounded-lg border-none px-md py-sm font-label-md text-label-md font-bold transition-all active:scale-95 ${toneClass.action}`}
            type="button"
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}
