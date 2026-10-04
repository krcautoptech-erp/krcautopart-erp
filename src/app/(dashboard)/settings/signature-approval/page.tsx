import type { Metadata } from "next";
import {
  getApprovalPolicies,
  getApprovalSignatureSettings,
} from "@/app/actions/approval-signatures";
import { getCompanyDocumentContext } from "@/lib/company-settings.server";
import { SignatureApprovalSettings } from "./signature-approval-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "จัดเตรียมลายเซ็นดิจิทัลส่วนบุคคลสำหรับการอนุมัติเอกสาร",
  title: "ลายเซ็นและการอนุมัติ | KRC ERP",
};

export default async function SignatureApprovalPage() {
  const [settings, policies, company] = await Promise.all([
    getApprovalSignatureSettings(),
    getApprovalPolicies(),
    getCompanyDocumentContext(),
  ]);

  if (!("data" in settings)) {
    return (
      <section className="border border-red-200 bg-red-50 px-5 py-4 text-[14px] font-bold text-red-700">
        {settings.error}
      </section>
    );
  }

  return (
    <SignatureApprovalSettings
      branding={company.branding}
      companyAddress={company.company.address}
      initialData={settings.data}
      initialPolicies={"data" in policies ? policies.data : []}
      canManagePolicies={"data" in policies && policies.canManage}
    />
  );
}
