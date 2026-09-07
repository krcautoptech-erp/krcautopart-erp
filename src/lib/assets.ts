export type AssetStatus =
  | "in_use"
  | "in_stock"
  | "under_repair"
  | "allocated"
  | "consumed"
  | "scrapped"
  | "disposed";

export type AssetRecord = {
  id: number;
  itemMasterId: number;
  itemCode: string;
  itemName: string;
  itemTypeCode: string;
  itemTypeName: string;
  serialNumber: string;
  status: AssetStatus;
  statusLabel: string;
  statusColor: string;
  departmentId: number | null;
  departmentName: string | null;
  custodianName: string | null;
  locationNote: string | null;
  warrantyExpiryDate: string | null;
  notes: string | null;
  receiptId: number | null;
  grNumber: string | null;
  receiptDate: string | null;
  purchaseOrderId: number | null;
  poNumber: string | null;
  vendorId: number | null;
  vendorName: string | null;
  unitPrice: number | null;
  unitName: string;
  warehouseId: number | null;
  warehouseName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetSummary = {
  totalCount: number;
  inUseCount: number;
  inStockCount: number;
  repairCount: number;
  disposedCount: number;
};

export type AssetFilterParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  departmentId?: string | number;
};

export type AssetLookupData = {
  departments: { id: number; name: string; code: string | null }[];
};

export function getAssetStatusMeta(status: string): { label: string; color: string } {
  switch (status) {
    case "in_use":
      return { label: "ใช้งานอยู่", color: "emerald" };
    case "in_stock":
      return { label: "พร้อมใช้งาน (ในคลัง)", color: "blue" };
    case "under_repair":
      return { label: "ส่งซ่อม/เคลม", color: "amber" };
    case "allocated":
      return { label: "จองแล้ว", color: "indigo" };
    case "consumed":
      return { label: "เบิกใช้แล้ว", color: "slate" };
    case "scrapped":
    case "disposed":
      return { label: "ตัดจำหน่าย", color: "rose" };
    default:
      return { label: status, color: "slate" };
  }
}
