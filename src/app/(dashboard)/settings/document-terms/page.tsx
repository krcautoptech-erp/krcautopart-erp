import type { Metadata } from "next";
import { getDocumentTermSettingsAction } from "@/app/actions/document-terms";
import { DocumentTermSettings } from "./_components/document-term-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตั้งค่าเงื่อนไขเอกสาร | KRC ERP" };

export default async function DocumentTermsPage() {
  const result = await getDocumentTermSettingsAction();
  if ("error" in result) return <div className="border border-red-300 bg-red-50 p-4 text-red-700">{result.error}</div>;
  return <DocumentTermSettings canManage={result.data.canManage} initialTemplates={result.data.templates} />;
}
