import { renderHtmlToPdfBuffer } from "@/lib/server-pdf";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "กรุณาเข้าสู่ระบบก่อนดาวน์โหลด PDF" }, { status: 401 });
    }

    const body = await request.json();
    const { html, filename = "document.pdf", paperSize = "A4", orientation = "portrait" } = body;

    if (!html || typeof html !== "string") {
      return Response.json({ error: "ไม่พบข้อมูล HTML สำหรับสร้าง PDF" }, { status: 400 });
    }

    if (html.length > 15_000_000 || typeof filename !== "string" ||
      !["A4", "A5", "letter"].includes(paperSize) || !["portrait", "landscape"].includes(orientation)) {
      return Response.json({ error: "รูปแบบเอกสารหรือขนาดกระดาษไม่ถูกต้อง" }, { status: 400 });
    }

    const pdfBuffer = await renderHtmlToPdfBuffer(html, {
      paperSize: paperSize as "A4" | "A5" | "letter",
      orientation: orientation as "portrait" | "landscape",
    });

    const safeFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeFilename)}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("PDF generation route error:", error);
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการสร้างไฟล์ PDF";
    return Response.json({ error: message }, { status: 500 });
  }
}
