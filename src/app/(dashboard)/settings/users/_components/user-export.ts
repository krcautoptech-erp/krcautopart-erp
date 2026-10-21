import type { UserRecord } from "@/app/actions/users";

import { exportExcelFile } from "@/lib/spreadsheet-delivery";


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
  void exportExcelFile([headers, ...rows], `krc-users-${new Date().toISOString().slice(0, 10)}.xlsx`, "ผู้ใช้งาน");
}
