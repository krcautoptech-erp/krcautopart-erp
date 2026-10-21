import { ARCHIVE_BUCKET, scheduleAccess } from "@/lib/delivery-schedules.server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return Response.json({ error: "ไม่พบเอกสาร" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const access = await scheduleAccess(download ? "delivery_schedule.export" : "delivery_schedule.view");
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
  const result = await access.supabase.from("delivery_schedule_archives").select(download ? "filename,file_path" : "payload").eq("id", id).single();
  if (result.error || !result.data) return Response.json({ error: "ไม่พบเอกสารหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  const row = result.data as unknown as { filename: string; file_path: string; payload: unknown };
  if (!download) return Response.json(row.payload, { headers: { "Cache-Control": "private, no-store" } });
  const file = await access.supabase.storage.from(ARCHIVE_BUCKET).download(row.file_path);
  if (file.error || !file.data) return Response.json({ error: "ดาวน์โหลดไฟล์ต้นฉบับไม่สำเร็จ" }, { status: 500 });
  return new Response(file.data, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="schedule.xlsx"; filename*=UTF-8''${encodeURIComponent(row.filename).replaceAll("'", "%27")}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
