import { getErpDashboardAction } from "@/app/actions/erp-dashboard";
import { ErpDashboard } from "./erp-dashboard";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string | string[] }>;
}) {
  const value = (await searchParams).asOf;
  return (
    <ErpDashboard
      data={await getErpDashboardAction(
        Array.isArray(value) ? value[0] : value,
      )}
    />
  );
}
