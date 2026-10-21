import { createHash, randomUUID } from "node:crypto";
import { parseDeliverySchedule, SCHEDULE_FILE_LIMIT } from "@/lib/delivery-schedules";
import { ARCHIVE_BUCKET, scheduleAccess } from "@/lib/delivery-schedules.server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const access = await scheduleAccess("delivery_schedule.create");
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  if (Number(request.headers.get("content-length") ?? 0) > SCHEDULE_FILE_LIMIT + 65536) return Response.json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 5 MB" }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const customerId = Number(form.get("customerId"));
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.name.length > 255 || file.size < 1 || file.size > SCHEDULE_FILE_LIMIT || !Number.isSafeInteger(customerId) || customerId <= 0) {
      return Response.json({ error: "เลือกลูกค้าและไฟล์ .xlsx ขนาดไม่เกิน 5 MB" }, { status: 400 });
    }
    const customer = await access.supabase.from("customers").select("id,customer_name").eq("id", customerId).single();
    if (customer.error || !customer.data) return Response.json({ error: "ไม่พบลูกค้าหรือไม่มีสิทธิ์อ่านข้อมูลลูกค้า" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let payload;
    try { payload = await parseDeliverySchedule(bytes); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ" }, { status: 400 }); }
    const id = randomUUID();
    const path = `${access.user.id}/${id}.xlsx`;
    const uploaded = await access.supabase.storage.from(ARCHIVE_BUCKET).upload(path, bytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
    if (uploaded.error) return Response.json({ error: "เก็บไฟล์ต้นฉบับไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และพื้นที่จัดเก็บ" }, { status: 500 });
    const profile = await access.supabase.from("user_profiles").select("first_name,last_name").eq("user_id", access.user.id).maybeSingle();
    const saved = await access.supabase.from("delivery_schedule_archives").insert({
      id, customer_id: customerId, customer_name: customer.data.customer_name, period: payload.period, revision: payload.revision,
      supplier_code: payload.supplierCode, filename: file.name, file_path: path, file_object_id: uploaded.data.id, file_size: file.size,
      file_sha256: createHash("sha256").update(bytes).digest("hex"), row_count: payload.rows.length, payload,
      imported_by: access.user.id, imported_by_name: profile.data ? `${profile.data.first_name} ${profile.data.last_name}`.trim() : access.user.email ?? "ผู้ใช้งาน",
    });
    if (saved.error) {
      const cleanup = await access.supabase.storage.from(ARCHIVE_BUCKET).remove([path]);
      if (cleanup.error) console.error("Failed to clean unpublished delivery schedule", path, cleanup.error.message);
      return Response.json({ error: saved.error.code === "23505" ? "มีแผนของลูกค้า เดือน ผู้ส่งมอบ และ Revision นี้แล้ว กรุณาตรวจสอบฉบับเดิม" : "บันทึกแผนส่งมอบไม่สำเร็จ" }, { status: saved.error.code === "23505" ? 409 : 500 });
    }
    return Response.json({ id, warnings: payload.warnings }, { status: 201 });
  } catch (error) {
    console.error("Delivery schedule import failed", error);
    return Response.json({ error: "นำเข้าไฟล์ไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองใหม่" }, { status: 500 });
  }
}
