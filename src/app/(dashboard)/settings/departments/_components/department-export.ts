import type { DepartmentRecord } from "@/app/actions/departments";

function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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
  const tableRows = [headers, ...rows]
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="${
                typeof cell === "number" ? "Number" : "String"
              }">${escapeXml(cell)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="แผนก">
  <Table>${tableRows}</Table>
 </Worksheet>
</Workbook>`;
  const blob = new Blob([`\uFEFF${workbook}`], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `departments-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
