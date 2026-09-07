export type ItemTypeStatus = "active" | "inactive";
export type ItemFormTemplate = "general" | "raw_material" | "finished_good" | "asset" | "service";
export type ItemFormFieldVisibility = "hidden" | "optional" | "required";
export type ItemFormFieldKey =
  | "brand"
  | "model"
  | "partNumber"
  | "dimensions"
  | "image"
  | "attachments"
  | "description"
  | "leadTime"
  | "vendors"
  | "materialGrade"
  | "itemGroup"
  | "thickness"
  | "width"
  | "length"
  | "warehouse"
  | "reorderPoint"
  | "standard"
  | "plating"
  | "sheetsPerUnit"
  | "piecesPerSheet"
  | "costPrice"
  | "sellingPrice";
export type ItemFormFields = Record<ItemFormFieldKey, ItemFormFieldVisibility>;

export const defaultItemFormFields: ItemFormFields = {
  brand: "optional",
  model: "optional",
  partNumber: "optional",
  dimensions: "hidden",
  image: "optional",
  attachments: "optional",
  description: "optional",
  leadTime: "optional",
  vendors: "optional",
  materialGrade: "hidden",
  itemGroup: "hidden",
  thickness: "hidden",
  width: "hidden",
  length: "hidden",
  warehouse: "hidden",
  reorderPoint: "hidden",
  standard: "hidden",
  plating: "hidden",
  sheetsPerUnit: "hidden",
  piecesPerSheet: "hidden",
  costPrice: "hidden",
  sellingPrice: "hidden",
};

export const rawMaterialItemFormFields: ItemFormFields = {
  ...Object.fromEntries(Object.keys(defaultItemFormFields).map((key) => [key, "hidden"])) as ItemFormFields,
  materialGrade: "required", itemGroup: "required", thickness: "required", width: "required",
  length: "required", warehouse: "required", reorderPoint: "optional", description: "optional",
};

export const finishedGoodItemFormFields: ItemFormFields = {
  ...Object.fromEntries(Object.keys(defaultItemFormFields).map((key) => [key, "hidden"])) as ItemFormFields,
  partNumber: "required", model: "optional", materialGrade: "optional", standard: "optional",
  plating: "optional", sheetsPerUnit: "optional", piecesPerSheet: "optional", image: "optional",
  costPrice: "optional", sellingPrice: "optional",
};

export function normalizeItemFormFieldsForTemplate(value: unknown, template: ItemFormTemplate): ItemFormFields {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyKeys = new Set(["brand", "model", "partNumber", "dimensions", "image", "attachments", "description", "leadTime", "vendors"]);
  const isLegacyGeneric = Object.keys(source).every((key) => legacyKeys.has(key));
  if (isLegacyGeneric && template === "raw_material") return { ...rawMaterialItemFormFields };
  if (isLegacyGeneric && template === "finished_good") return { ...finishedGoodItemFormFields };
  return normalizeItemFormFields(value);
}

export function normalizeItemFormFields(value: unknown): ItemFormFields {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const allowed = new Set<ItemFormFieldVisibility>(["hidden", "optional", "required"]);
  return Object.fromEntries(
    Object.entries(defaultItemFormFields).map(([key, fallback]) => [
      key,
      allowed.has(source[key] as ItemFormFieldVisibility)
        ? source[key]
        : fallback,
    ]),
  ) as ItemFormFields;
}

export type ItemTypeInput = {
  code: string;
  name: string;
  nameEn: string;
  formTemplate: ItemFormTemplate;
  codeMode: "auto" | "manual";
  codePrefix: string;
  stocked: boolean;
  purchasable: boolean;
  sellable: boolean;
  productionItem: boolean;
  lotControlled: boolean;
  serialControlled: boolean;
  expiryControlled: boolean;
  dimensionEnabled: boolean;
  reorderEnabled: boolean;
  formFields: ItemFormFields;
  status: ItemTypeStatus;
};

export type GenericItemInput = {
  typeId: number;
  code: string;
  name: string;
  nameEn: string;
  description: string;
  unitId: number | null;
  shelfLifeDays: number | null;
  reorderPoint: number | null;
  warehouseId: number | null;
  groupId: number | null;
  vendorId: number | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  dimensionUnit: string;
  expiryWarningDays: number | null;
  brand: string;
  model: string;
  partNumber: string;
  gradeId: number | null;
  gradeName?: string;
  material?: string;
  standard: string;
  plating: string;
  sheetsPerUnit: number | null;
  piecesPerSheet: number | null;
  leadTimeDays: number | null;
  costPrice: number | null;
  sellingPrice: number | null;
  primaryImage: string;
  attachmentNames: string[];
  status: ItemTypeStatus;
};

export function normalizeItemType(input: ItemTypeInput): ItemTypeInput {
  return {
    ...input,
    code: input.code.trim().toUpperCase().slice(0, 20),
    codePrefix: input.codePrefix.trim().toUpperCase().slice(0, 12),
    name: input.name.trim().slice(0, 120),
    nameEn: input.nameEn.trim().slice(0, 120),
    formFields: normalizeItemFormFields(input.formFields),
  };
}

export function validateItemType(input: ItemTypeInput) {
  if (!/^[A-Z][A-Z0-9_-]{1,19}$/.test(input.code)) return "รหัสประเภทต้องเป็นภาษาอังกฤษ 2-20 ตัว";
  if (!input.name) return "กรุณาระบุชื่อประเภทสินค้า";
  if (input.codeMode === "auto" && !/^[A-Z][A-Z0-9_-]{0,11}$/.test(input.codePrefix)) return "กรุณาระบุคำนำหน้ารหัสอัตโนมัติ";
  if (input.lotControlled && input.serialControlled) return "เลือกควบคุม Lot หรือ Serial ได้อย่างใดอย่างหนึ่ง";
  return null;
}
