import "server-only";
import { createClient } from "@/utils/supabase/server";
import type { DeliverySchedule, ScheduleArchive } from "@/lib/delivery-schedules";

export const ARCHIVE_COLUMNS = "id,customer_id,customer_name,period,revision,supplier_code,filename,file_size,row_count,imported_by_name,created_at";
export const ARCHIVE_BUCKET = "delivery-schedules";

export async function scheduleAccess(permission = "delivery_schedule.view") {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "กรุณาเข้าสู่ระบบใหม่", status: 401 } as const;
  const permissions = [...new Set(["delivery_schedule.view", permission])];
  const checks = await Promise.all(permissions.map((code) => supabase.rpc("authorize", { requested_permission: code })));
  if (checks.some((c) => c.error || c.data !== true)) return { error: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้", status: 403 } as const;
  return { supabase, user } as const;
}

export async function loadScheduleArchive() {
  const access = await scheduleAccess();
  if ("error" in access) return { archives: [] as ScheduleArchive[], selected: null, error: access.error };
  const archives: ScheduleArchive[] = [];
  // Metadata only: snapshot contents are loaded for the selected revision, not every file.
  for (let start = 0; ; start += 500) {
    const result = await access.supabase.from("delivery_schedule_archives").select(ARCHIVE_COLUMNS)
      .order("period", { ascending: false }).order("revision", { ascending: false }).order("id").range(start, start + 499);
    if (result.error) return { archives, selected: null, error: "ยังไม่สามารถโหลดทะเบียนแผนส่งมอบได้ กรุณาตรวจสอบการติดตั้งฐานข้อมูลและสิทธิ์" };
    archives.push(...result.data as ScheduleArchive[]);
    if (result.data.length < 500) break;
  }
  if (!archives[0]) return { archives, selected: null, error: null };
  const result = await access.supabase.from("delivery_schedule_archives").select("payload").eq("id", archives[0].id).single();
  return { archives, selected: result.error ? null : result.data.payload as DeliverySchedule, error: result.error ? "อ่านรายละเอียดแผนส่งมอบไม่สำเร็จ" : null };
}
