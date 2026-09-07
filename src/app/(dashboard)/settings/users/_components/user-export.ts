import type { UserRecord } from "@/app/actions/users";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function exportUsersToExcel(users: UserRecord[]) {
  const headers = [
    "รหัสพนักงาน",
    "ชื่อ-นามสกุล",
    "Username",
    "แผนก",
    "Role",
    "เข้าใช้ล่าสุด",
    "สถานะ",
  ];
  const rows = users.map((user) => [
    user.employeeCode,
    `${user.firstName} ${user.lastName}`,
    user.username,
    `${user.departmentCode} - ${user.departmentName}`,
    `${user.roleCode} - ${user.roleName}`,
    user.lastSignInAt
      ? new Intl.DateTimeFormat("th-TH", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(user.lastSignInAt))
      : "ยังไม่เคยเข้าสู่ระบบ",
    user.status === "active" ? "ใช้งาน" : "ระงับ",
  ]);
  const tableRows = [headers, ...rows]
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="ผู้ใช้งาน"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;
  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `krc-users-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}
