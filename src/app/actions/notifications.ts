"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function markNotificationReadAction(notificationId: number) {
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
    return { error: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง", success: false as const };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false as const };
  }

  const { error } = await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", notificationId)
    .eq("recipient_user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("Unable to mark notification as read:", error);
    return {
      error: "ไม่สามารถอัปเดตการแจ้งเตือนได้",
      success: false as const,
    };
  }

  revalidatePath("/", "layout");
  return { success: true as const };
}

export async function markAllNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", success: false as const };
  }

  const { error } = await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("Unable to mark all notifications as read:", error);
    return {
      error: "ไม่สามารถอัปเดตการแจ้งเตือนได้",
      success: false as const,
    };
  }

  revalidatePath("/", "layout");
  return { success: true as const };
}
