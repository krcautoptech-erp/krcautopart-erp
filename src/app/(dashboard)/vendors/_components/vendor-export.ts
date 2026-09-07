import type { VendorRecord } from "@/app/actions/vendors";

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function addressText(vendor: VendorRecord) {
  return vendor.vendor_addresses
    .map((address, index) => {
      const label = address.address_name || `ที่อยู่ ${index + 1}`;
      return `${label}: ${address.address_line}`;
    })
    .join(" | ");
}

export function exportVendorsToExcel(vendors: VendorRecord[]) {
  const headers = [
    "รหัสผู้ขาย",
    "ชื่อผู้ขาย",
    "กลุ่มผู้ขาย",
    "เลขผู้เสียภาษี",
    "สาขา",
    "ชื่อผู้ติดต่อ",
    "เบอร์โทร",
    "อีเมล",
    "เครดิตเทอม",
    "วิธีชำระเงิน",
    "ประเภทภาษี",
    "สถานะ",
    "หมายเหตุ",
    "ที่อยู่",
  ];

  const rows = vendors.map((vendor) => [
    vendor.vendor_code,
    vendor.vendor_name,
    vendor.vendor_group?.name ?? "",
    vendor.tax_no,
    vendor.branch ?? "",
    vendor.contact_name ?? "",
    vendor.phone ?? "",
    vendor.email ?? "",
    vendor.credit_term?.name ?? "",
    vendor.payment_method?.name ?? "",
    vendor.tax_type?.name ?? "",
    vendor.status,
    vendor.remark ?? "",
    addressText(vendor),
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
      <Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="ผู้ขาย">
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
  anchor.download = `vendors-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}
