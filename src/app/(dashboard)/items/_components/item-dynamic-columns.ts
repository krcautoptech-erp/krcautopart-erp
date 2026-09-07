import type { CatalogItem, ItemCatalogData, ItemTypeRecord } from "@/app/actions/items";

export type ColumnId =
  | "index"
  | "code"
  | "name"
  | "partNumber"
  | "model"
  | "brand"
  | "grade"
  | "dimensions"
  | "type"
  | "unit"
  | "warehouse"
  | "group"
  | "control"
  | "reorderPoint"
  | "standard"
  | "plating"
  | "sellingPrice"
  | "costPrice"
  | "vendor"
  | "leadTime"
  | "image"
  | "status"
  | "actions";

export interface ColumnDefinition {
  id: ColumnId;
  label: string;
  rank: 1 | 2 | 3 | 4; // 1: Core, 2: Key Spec, 3: Inventory/Location, 4: Commercial
  minWidth?: number;
  sticky?: "left" | "right";
  isCore?: boolean; // Cannot be disabled in column customizer
}

export const ALL_COLUMNS: ColumnDefinition[] = [
  { id: "index", label: "ลำดับ", rank: 1, minWidth: 48, sticky: "left", isCore: true },
  { id: "code", label: "รหัสสินค้า", rank: 1, minWidth: 165, sticky: "left", isCore: true },
  { id: "name", label: "ชื่อรายการ", rank: 1, minWidth: 280, sticky: "left", isCore: true },
  { id: "partNumber", label: "Part No.", rank: 2, minWidth: 170 },
  { id: "model", label: "รุ่น (Model)", rank: 2, minWidth: 130 },
  { id: "brand", label: "ยี่ห้อ (Brand)", rank: 2, minWidth: 120 },
  { id: "grade", label: "เกรด/วัสดุ", rank: 2, minWidth: 135 },
  { id: "dimensions", label: "ขนาด (หนา x กว้าง x ยาว)", rank: 2, minWidth: 170 },
  { id: "type", label: "ประเภท", rank: 1, minWidth: 90 },
  { id: "unit", label: "หน่วยนับ", rank: 1, minWidth: 85 },
  { id: "warehouse", label: "คลังหลัก", rank: 3, minWidth: 120 },
  { id: "group", label: "กลุ่มสินค้า", rank: 3, minWidth: 120 },
  { id: "control", label: "การควบคุม", rank: 3, minWidth: 85 },
  { id: "reorderPoint", label: "จุดสั่งซื้อซ้ำ", rank: 3, minWidth: 95 },
  { id: "standard", label: "มาตรฐาน", rank: 2, minWidth: 110 },
  { id: "plating", label: "การชุบผิว", rank: 2, minWidth: 110 },
  { id: "sellingPrice", label: "ราคาขาย", rank: 4, minWidth: 110 },
  { id: "costPrice", label: "ราคาทุน", rank: 4, minWidth: 110 },
  { id: "vendor", label: "ผู้จัดจำหน่าย", rank: 4, minWidth: 140 },
  { id: "leadTime", label: "Lead Time (วัน)", rank: 4, minWidth: 90 },
  { id: "image", label: "รูปภาพ", rank: 2, minWidth: 70 },
  { id: "status", label: "สถานะ", rank: 1, minWidth: 76, sticky: "right", isCore: true },
  { id: "actions", label: "จัดการ", rank: 1, minWidth: 54, sticky: "right", isCore: true },
];

/**
 * Calculates adaptive default columns according to Section 3.1 & 4.2 of the architecture guide
 */
export function getDefaultColumnsForType(
  typeCode: string,
  selectedTypeRecord?: ItemTypeRecord,
): ColumnId[] {
  // 1. All Items View (Global Core Columns)
  if (typeCode === "ALL" || !selectedTypeRecord) {
    return [
      "index",
      "code",
      "name",
      "type",
      "unit",
      "warehouse",
      "control",
      "status",
      "actions",
    ];
  }

  const template = selectedTypeRecord.formTemplate;
  const config = selectedTypeRecord.formFields;

  // 2. Finished Goods (FG)
  if (template === "finished_good" || typeCode === "FG") {
    return [
      "index",
      "code",
      "partNumber",
      "name",
      "grade",
      "unit",
      "image",
      "status",
      "actions",
    ];
  }

  // 3. Raw Materials (RM)
  if (template === "raw_material" || typeCode === "RM") {
    return [
      "index",
      "code",
      "name",
      "group",
      "grade",
      "dimensions",
      "unit",
      "warehouse",
      "status",
      "actions",
    ];
  }

  // 4. Custom/Generic types (Metadata-driven auto selection)
  const chosen: ColumnId[] = ["index", "code", "name"];

  const candidateFields: { key: keyof typeof config; colId: ColumnId }[] = [
    { key: "partNumber", colId: "partNumber" },
    { key: "brand", colId: "brand" },
    { key: "model", colId: "model" },
    { key: "materialGrade", colId: "grade" },
    { key: "dimensions", colId: "dimensions" },
    { key: "thickness", colId: "dimensions" },
    { key: "warehouse", colId: "warehouse" },
    { key: "reorderPoint", colId: "reorderPoint" },
    { key: "itemGroup", colId: "group" },
    { key: "sellingPrice", colId: "sellingPrice" },
    { key: "costPrice", colId: "costPrice" },
  ];

  let addedSpecs = 0;
  for (const { key, colId } of candidateFields) {
    if (chosen.includes(colId)) continue;
    const visibility = config?.[key];
    if (visibility === "required" || visibility === "optional") {
      chosen.push(colId);
      addedSpecs++;
      if (addedSpecs >= 3) break; // Limit visible columns to preserve HCI standards
    }
  }

  if (!chosen.includes("unit")) chosen.push("unit");
  if (addedSpecs < 2 && !chosen.includes("warehouse")) chosen.push("warehouse");

  chosen.push("status", "actions");
  return chosen;
}

export type ItemLookup = { id: number; name: string };

export function formatDimension(
  thickness?: number | null,
  width?: number | null,
  length?: number | null,
  unit = "มม.",
): string {
  const parts = [thickness, width, length].filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(Number(v)),
  );
  if (parts.length === 0) return "-";
  return `${parts.map((n) => Number(n).toLocaleString("th-TH")).join(" × ")} ${unit}`;
}

export function renderColumnValue(
  colId: ColumnId,
  item: CatalogItem,
  index: number,
  lookups: {
    warehouses: Map<number, string>;
    groups: Map<number, string>;
    grades: Map<number, string>;
    vendors: Map<number, string>;
  },
): string {
  const form = item.form;
  switch (colId) {
    case "index":
      return String(index + 1);
    case "code":
      return item.code || "-";
    case "name":
      return item.name || "-";
    case "partNumber":
      return form.partNumber?.trim() ? form.partNumber.trim() : "-";
    case "image":
      return form.primaryImage ? "มีรูปภาพ" : "-";
    case "model":
      return form.model || "-";
    case "brand":
      return form.brand || "-";
    case "grade":
      return (
        (form.gradeId ? lookups.grades.get(form.gradeId) : null) ||
        form.gradeName ||
        form.material ||
        "-"
      );
    case "dimensions":
      return formatDimension(
        form.thickness,
        form.width,
        form.length,
        form.dimensionUnit || "มม.",
      );
    case "type":
      return item.typeCode || "-";
    case "unit":
      return item.unit || "-";
    case "warehouse":
      return (form.warehouseId ? lookups.warehouses.get(form.warehouseId) : null) || "-";
    case "group":
      return (form.groupId ? lookups.groups.get(form.groupId) : null) || "-";
    case "control":
      return item.control || "-";
    case "reorderPoint":
      return form.reorderPoint !== null && form.reorderPoint !== undefined
        ? Number(form.reorderPoint).toLocaleString("th-TH")
        : "-";
    case "standard":
      return form.standard || "-";
    case "plating":
      return form.plating || "-";
    case "sellingPrice":
      return form.sellingPrice !== null && form.sellingPrice !== undefined
        ? `฿${Number(form.sellingPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
        : "-";
    case "costPrice":
      return form.costPrice !== null && form.costPrice !== undefined
        ? `฿${Number(form.costPrice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
        : "-";
    case "vendor":
      return (form.vendorId ? lookups.vendors.get(form.vendorId) : null) || "-";
    case "leadTime":
      return form.leadTimeDays !== null && form.leadTimeDays !== undefined
        ? `${form.leadTimeDays} วัน`
        : "-";
    case "status":
      return item.status === "active" ? "ใช้งาน" : "ระงับ";
    default:
      return "-";
  }
}

/**
 * Returns only the columns that are relevant and configured for this specific item type
 */
export function getAvailableColumnsForType(
  typeCode: string,
  selectedTypeRecord?: ItemTypeRecord,
): ColumnDefinition[] {
  if (typeCode === "ALL" || !selectedTypeRecord) {
    return ALL_COLUMNS;
  }

  const template = selectedTypeRecord.formTemplate;
  const config = selectedTypeRecord.formFields;

  return ALL_COLUMNS.filter((col) => {
    // Core columns always available
    if (col.isCore || col.id === "unit") return true;

    // Type code column is not needed when already inside a specific type tab
    if (col.id === "type") return false;

    // Standard FG template
    if (template === "finished_good" || typeCode === "FG") {
      return [
        "partNumber",
        "model",
        "grade",
        "standard",
        "plating",
        "costPrice",
        "sellingPrice",
        "image",
      ].includes(col.id);
    }

    // Standard RM template
    if (template === "raw_material" || typeCode === "RM") {
      return [
        "group",
        "grade",
        "dimensions",
        "warehouse",
        "reorderPoint",
        "control",
      ].includes(col.id);
    }

    // Custom types: inspect form_field_config
    if (!config) return true;

    switch (col.id) {
      case "partNumber":
        return config.partNumber !== "hidden";
      case "model":
        return config.model !== "hidden";
      case "brand":
        return config.brand !== "hidden";
      case "grade":
        return config.materialGrade !== "hidden";
      case "dimensions":
        return (
          config.dimensions !== "hidden" ||
          config.thickness !== "hidden" ||
          config.width !== "hidden" ||
          config.length !== "hidden"
        );
      case "group":
        return config.itemGroup !== "hidden";
      case "warehouse":
        return config.warehouse !== "hidden";
      case "reorderPoint":
        return config.reorderPoint !== "hidden";
      case "standard":
        return config.standard !== "hidden";
      case "plating":
        return config.plating !== "hidden";
      case "sellingPrice":
        return config.sellingPrice !== "hidden";
      case "costPrice":
        return config.costPrice !== "hidden";
      case "vendor":
        return config.vendors !== "hidden";
      case "leadTime":
        return config.leadTime !== "hidden";
      case "image":
        return config.image !== "hidden";
      case "control":
        return Boolean(
          selectedTypeRecord.lotControlled || selectedTypeRecord.serialControlled,
        );
      default:
        return true;
    }
  });
}
