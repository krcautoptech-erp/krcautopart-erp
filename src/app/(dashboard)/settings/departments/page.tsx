import type { Metadata } from "next";
import { getDepartmentSettingsAction } from "@/app/actions/departments";
import { DepartmentManagement } from "./_components/department-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าแผนก | KRC ERP",
  description: "จัดการข้อมูลแผนกสำหรับผู้ใช้งานและเอกสารในระบบ",
};

export default async function DepartmentSettingsPage() {
  const result = await getDepartmentSettingsAction();

  if ("error" in result) {
    return (
      <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {result.error}
      </section>
    );
  }

  return <DepartmentManagement initialData={result.data} />;
}
