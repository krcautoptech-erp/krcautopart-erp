import type { Metadata } from "next";
import { getCompanySettingsAction } from "@/app/actions/company-settings";
import { CompanySettingsForm } from "./_components/company-settings-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "จัดการข้อมูลบริษัท โลโก้ สาขา และรูปแบบหัวเอกสารของระบบ",
  title: "ตั้งค่าข้อมูลบริษัท | KRC ERP",
};

export default async function CompanySettingsPage() {
  const result = await getCompanySettingsAction();

  if (!("data" in result)) {
    return (
      <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {result.error}
      </section>
    );
  }

  return (
    <CompanySettingsForm
      initialData={result.data}
      key={`${result.data.profile.id}:${result.data.profile.updatedAt}`}
    />
  );
}
