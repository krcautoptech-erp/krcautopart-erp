import type { Metadata } from "next";
import { getVendorSettingsAction } from "@/app/actions/vendor-settings";
import { VendorSettingsPanel } from "../vendor-settings/_components/vendor-settings-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าคู่ค้า | KRC ERP",
};

export default async function PartnerSettingsPage() {
  const result = await getVendorSettingsAction();
  const initialData = "success" in result ? result.data : null;
  const initialError = "error" in result ? result.error : null;

  return (
    <section className="space-y-lg">
      <VendorSettingsPanel
        initialData={initialData}
        initialError={initialError}
      />
    </section>
  );
}
