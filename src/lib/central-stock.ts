import type { ItemFormFieldKey, ItemFormFieldVisibility } from "./items.ts";

export type StockTrackingMethod = "none" | "lot" | "serial";
export type StockDetailTab = "overview" | "locations" | "lot" | "serial" | "attributes" | "history";
export type StockStateCode = "available" | "low_stock" | "out_of_stock" | "stale";

export type CentralStockRow = {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemNameEn: string;
  description: string;
  typeCode: string;
  typeName: string;
  warehouseId: number;
  warehouseName: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  reorderPoint: number;
  trackingMethod: StockTrackingMethod;
  expiryControlled: boolean;
  purchasable: boolean;
  unitName: string;
  unitSymbol: string;
  attributes: Record<string, unknown>;
  formFieldConfig: Partial<Record<ItemFormFieldKey, ItemFormFieldVisibility>>;
  updatedAt: string;
  totalCount: number;
};

export type StockState = {
  code: StockStateCode;
  label: string;
  tone: "success" | "pending" | "danger" | "neutral";
};

const DAY = 86_400_000;

export function getStockState(
  availableQty: number,
  reorderPoint: number,
  updatedAt: string,
  now = new Date(),
): StockState {
  if (availableQty <= 0) return { code: "out_of_stock", label: "หมดสต็อก", tone: "danger" };
  if (reorderPoint > 0 && availableQty <= reorderPoint) {
    return { code: "low_stock", label: "ใกล้จุดสั่งซื้อ", tone: "pending" };
  }
  const updatedTime = new Date(updatedAt).getTime();
  if (Number.isFinite(updatedTime) && now.getTime() - updatedTime > 90 * DAY) {
    return { code: "stale", label: "ค้างนาน", tone: "neutral" };
  }
  return { code: "available", label: "พร้อมใช้", tone: "success" };
}

export function stockDetailTabs(method: StockTrackingMethod): StockDetailTab[] {
  return [
    "overview",
    ...(method === "lot" ? ["lot" as const] : []),
    ...(method === "serial" ? ["serial" as const] : []),
    "history",
  ];
}

export function resolveInventoryActorName(
  createdBy: string | null,
  currentUserId: string,
  currentUserLabel: string,
) {
  if (!createdBy) return "ระบบอัตโนมัติ";
  if (createdBy === currentUserId) return currentUserLabel || "ผู้ใช้ปัจจุบัน";
  return "ผู้ใช้ระบบ";
}

const fieldMeta: Record<ItemFormFieldKey, { label: string; aliases: string[]; suffix?: string }> = {
  brand: { label: "ยี่ห้อ", aliases: ["brand"] },
  model: { label: "รุ่น", aliases: ["model"] },
  partNumber: { label: "หมายเลขอะไหล่ / Part No.", aliases: ["partNumber"] },
  dimensions: { label: "ข้อมูลขนาด", aliases: ["dimensions"] },
  image: { label: "รูปสินค้า", aliases: ["primaryImage"] },
  attachments: { label: "เอกสารแนบ", aliases: ["attachmentNames", "attachments"] },
  description: { label: "คำอธิบายเพิ่มเติม", aliases: ["description"] },
  leadTime: { label: "Lead Time", aliases: ["leadTimeDays", "leadTime"], suffix: " วัน" },
  vendors: { label: "ผู้จำหน่าย", aliases: ["vendorName", "vendorNames", "vendorId"] },
  materialGrade: { label: "เกรดวัสดุ", aliases: ["gradeName", "materialGrade", "material"] },
  itemGroup: { label: "กลุ่มสินค้า", aliases: ["groupName", "itemGroup", "groupId"] },
  thickness: { label: "ความหนา", aliases: ["thickness"] },
  width: { label: "ความกว้าง", aliases: ["width"] },
  length: { label: "ความยาว", aliases: ["length"] },
  warehouse: { label: "คลังหลัก", aliases: ["warehouseName", "warehouseId"] },
  reorderPoint: { label: "จุดสั่งซื้อ", aliases: ["reorderPoint"] },
  standard: { label: "มาตรฐาน", aliases: ["standard"] },
  plating: { label: "งานชุบเคลือบผิว", aliases: ["plating"] },
  sheetsPerUnit: { label: "จำนวนแผ่น", aliases: ["sheetsPerUnit"] },
  piecesPerSheet: { label: "ชิ้นงานต่อแผ่น", aliases: ["piecesPerSheet"] },
  costPrice: { label: "ต้นทุน", aliases: ["costPrice"], suffix: " บาท" },
  sellingPrice: { label: "ราคาขายกลาง", aliases: ["sellingPrice"], suffix: " บาท" },
};

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  return String(value ?? "").trim();
}

export function configuredStockFields(
  config: Partial<Record<ItemFormFieldKey, ItemFormFieldVisibility>>,
  attributes: Record<string, unknown>,
) {
  return (Object.keys(fieldMeta) as ItemFormFieldKey[]).flatMap((key) => {
    if (!config[key] || config[key] === "hidden") return [];
    const meta = fieldMeta[key];
    const raw = meta.aliases.map((alias) => attributes[alias]).find((value) => displayValue(value));
    const value = displayValue(raw);
    if (!value) return [];
    return [{ key, label: meta.label, value: `${value}${meta.suffix ?? ""}` }];
  });
}
