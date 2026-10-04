import type { Metadata } from "next";
import { getAuditLogPageAction, type AuditLogFilters } from "@/app/actions/audit-logs";
import { AuditLogManagement } from "./_components/audit-log-management";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log การใช้งานระบบ | KRC ERP",
  description: "ตรวจสอบกิจกรรมและการเปลี่ยนแปลงที่เกิดขึ้นในระบบ",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const page = Number(first(parameters.page));
  const filters: AuditLogFilters = {
    action: first(parameters.action),
    endDate: first(parameters.endDate),
    module: first(parameters.module),
    outcome: first(parameters.outcome),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    search: first(parameters.search),
    startDate: first(parameters.startDate),
  };
  const result = await getAuditLogPageAction(filters);

  if ("error" in result) {
    return <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700">{result.error}</section>;
  }

  return <AuditLogManagement filters={filters} initialData={result.data} />;
}
