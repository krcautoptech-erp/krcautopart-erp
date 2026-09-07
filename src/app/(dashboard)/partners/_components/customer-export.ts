import type { CustomerRecord } from "@/app/actions/customers";

function escapeSpreadsheetXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function addressText(customer: CustomerRecord) {
  return customer.customer_addresses
    .map((address, index) => {
      const label = address.address_name || `ที่อยู่ ${index + 1}`;
      return `${label}: ${address.address_line}`;
    })
    .join(" | ");
}

export function exportCustomersToExcel(customers: CustomerRecord[]) {
  const headers = [
    "รหัสลูกค้า",
    "ชื่อลูกค้า",
    "ประเภทลูกค้า",
    "เลขผู้เสียภาษี",
    "สาขา",
    "ชื่อผู้ติดต่อ",
    "เบอร์โทร",
    "อีเมล",
    "เครดิตเทอม",
    "ประเภทภาษี",
    "สถานะ",
    "หมายเหตุ",
    "ที่อยู่",
  ];

  const rows = customers.map((customer) => [
    customer.customer_code,
    customer.customer_name,
    customer.customer_type?.name ?? "",
    customer.tax_no,
    customer.branch ?? "",
    customer.contact_name ?? "",
    customer.phone ?? "",
    customer.email ?? "",
    customer.credit_term?.name ?? "",
    customer.tax_type?.name ?? "",
    customer.status,
    customer.remark ?? "",
    addressText(customer),
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
  <Worksheet ss:Name="ลูกหนี้">
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
  anchor.download = `customers-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}
