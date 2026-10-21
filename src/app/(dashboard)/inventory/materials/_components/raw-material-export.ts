import type { RawMaterialRecord } from "@/app/actions/raw-materials";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";


function formatNullable(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

export function exportRawMaterialsToExcel(rawMaterials: RawMaterialRecord[]) {
  const headers = [
    "รหัสวัตถุดิบ",
    "ชื่อวัตถุดิบ",
    "กลุ่มวัตถุดิบ",
    "เกรดวัสดุ",
    "ความหนา",
    "กว้าง",
    "ยาว",
    "หน่วย",
    "จุดสั่งซื้อ",
    "คลังหลัก",
    "สถานะ",
  ];

  const rows = rawMaterials.map((item) => [
    item.material_code,
    item.material_name,
    item.group.name,
    item.grade.name,
    item.thickness_mm.toFixed(2),
    formatNullable(item.width_mm),
    formatNullable(item.length_mm),
    item.unit.symbol,
    formatNullable(item.reorder_point),
    item.warehouse.name,
    item.status === "active" ? "ใช้งาน" : "ระงับ",
  ]);

  void exportExcelFile([headers, ...rows], `raw-materials-${new Date().toISOString().slice(0, 10)}.xlsx`, "ข้อมูลวัตถุดิบ");
}

export function downloadRawMaterialTemplate() {
  const headers = [
    "รหัสวัตถุดิบ",
    "ชื่อวัตถุดิบ",
    "กลุ่มวัตถุดิบ",
    "เกรดวัสดุ",
    "ความหนา",
    "กว้าง",
    "ยาว",
    "หน่วย",
    "จุดสั่งซื้อ",
    "คลังหลัก",
    "สถานะ",
  ];

  const sampleRow = [
    "RM-PLATE-001",
    "เหล็กแผ่นดำ SS400",
    "Steel Plate",
    "SS400",
    "2.00",
    "1219.00",
    "2438.00",
    "แผ่น",
    "10",
    "คลังวัตถุดิบหลัก",
    "ใช้งาน",
  ];

  void exportExcelFile([headers, sampleRow], "krc-raw-material-import-template.xlsx", "เทมเพลตนำเข้าวัตถุดิบ");
}

