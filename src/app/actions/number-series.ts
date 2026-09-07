"use server";

import { createClient } from "@/utils/supabase/server";

export type ReservableNumberSeries = "CT" | "GR" | "PO" | "PR" | "VG";

type ReserveNumberResult =
  | { success: true; number: string }
  | { success: false; error: string };

export async function reserveBusinessNumberAction(
  series: ReservableNumberSeries,
  effectiveDate: string,
): Promise<ReserveNumberResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return { success: false, error: "วันที่เอกสารไม่ถูกต้อง" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reserve_business_number", {
      p_effective_date: effectiveDate,
      p_series_key: series,
    });

    if (error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.error("Unable to reserve business number:", {
        code: error.code,
        email: user?.email ?? null,
        message: error.message,
        metadataRole: user?.app_metadata?.role ?? null,
        series,
        userId: user?.id ?? null,
      });

      return {
        success: false,
        error:
          error.code === "42501"
            ? "บัญชีนี้ไม่มีสิทธิ์สร้างเลขเอกสาร"
            : "ไม่สามารถสร้างเลขเอกสารได้",
      };
    }

    const firstRow = Array.isArray(data) ? data[0] : data;
    const number =
      firstRow && typeof firstRow === "object" && "business_number" in firstRow
        ? String(firstRow.business_number)
        : "";

    if (!number) {
      return { success: false, error: "ไม่สามารถสร้างเลขเอกสารได้" };
    }

    return { success: true, number };
  } catch (error) {
    console.error("reserveBusinessNumberAction error:", error);
    return { success: false, error: "ไม่สามารถสร้างเลขเอกสารได้" };
  }
}
