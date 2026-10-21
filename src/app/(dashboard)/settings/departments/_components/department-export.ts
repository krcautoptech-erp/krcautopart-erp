import type { DepartmentRecord } from "@/app/actions/departments";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";


export function exportDepartmentsToExcel(departments: DepartmentRecord[]) {
  const headers = [
    "ลำดับ",
    "รหัสแผนก",
    "ชื่อแผนก",
    "หัวหน้าแผนก",
    "จำนวนผู้ใช้งาน",
    "สถานะ",
    "หมายเหตุ",
  ];
  const rows = departments.map((department, index) => [
    index + 1,
    department.code,
    department.name,
    department.managerName ?? "",
    department.userCount,
    department.status === "active" ? "ใช้งาน" : "ระงับ",
    department.remarks,
  ]);
  void exportExcelFile([headers, ...rows], `departments-${new Date().toISOString().slice(0, 10)}.xlsx`, "แผนก");
}
