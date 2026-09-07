import type { RawMaterialRecord } from "@/app/actions/raw-materials";

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  const headerRow = headers
    .map(
      (header) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${row
          .map(
            (value) =>
              `<Cell><Data ss:Type="String">${escapeSpreadsheetXml(value)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="ข้อมูลวัตถุดิบ">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `raw-materials-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
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

  const headerRow = headers
    .map(
      (header) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`,
    )
    .join("");

  const sampleRowXml = `<Row>${sampleRow
    .map(
      (value) =>
        `<Cell><Data ss:Type="String">${escapeSpreadsheetXml(value)}</Data></Cell>`,
    )
    .join("")}</Row>`;

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="เทมเพลตนำเข้าวัตถุดิบ">
    <Table>
      <Row>${headerRow}</Row>
      ${sampleRowXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "krc-raw-material-import-template.xls";
  anchor.click();
  URL.revokeObjectURL(url);
}

