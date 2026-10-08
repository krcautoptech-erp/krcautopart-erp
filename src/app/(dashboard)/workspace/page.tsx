import { getErpDashboardAction } from "@/app/actions/erp-dashboard";
import { ErpDashboard } from "./erp-dashboard";


export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    asOf?: string | string[];
    warehouse?: string | string[];
    startDate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const asOf = Array.isArray(params.asOf) ? params.asOf[0] : params.asOf;
  const warehouse = Array.isArray(params.warehouse)
    ? params.warehouse[0]
    : params.warehouse;
  const startDate = Array.isArray(params.startDate)
    ? params.startDate[0]
    : params.startDate;
  return (
    <ErpDashboard
      data={await getErpDashboardAction(asOf, warehouse, startDate)}
    />
  );
}
