import type { Metadata } from "next";
import { loadScheduleArchive, scheduleAccess } from "@/lib/delivery-schedules.server";
import { ScheduleWorkspace } from "./schedule-workspace";

export const metadata: Metadata = { title: "แผนส่งมอบลูกค้า | KRC ERP" };
export const dynamic = "force-dynamic";

export default async function DeliverySchedulesPage() {
  const data = await loadScheduleArchive();
  const access = await scheduleAccess("delivery_schedule.create");
  const customers = "error" in access ? null : await access.supabase.from("customers").select("id,customer_name").order("customer_name");
  return <ScheduleWorkspace archives={data.archives} initialPayload={data.selected} initialError={data.error ?? null}
    customers={customers?.data ?? []} />;
}
