import type { Metadata } from "next";
import { getRawMaterialSettingsAction } from "@/app/actions/raw-material-settings";
import { RawMaterialSettings } from "./_components/raw-material-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าวัตถุดิบ | KRC ERP",
  description: "จัดการกลุ่มวัตถุดิบ เกรดวัสดุ และหน่วยนับสำหรับข้อมูลกลางของระบบ",
};

export default async function MaterialSettingsPage() {
  const result = await getRawMaterialSettingsAction();

  if ("error" in result) {
    return (
      <section className="rounded-[8px] border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {result.error}
      </section>
    );
  }

  return <RawMaterialSettings initialData={result.data} />;
}
