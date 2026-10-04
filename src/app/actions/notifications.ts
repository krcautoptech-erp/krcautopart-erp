"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  normalizeNotification,
  type AppNotification,
  type NotificationRecipientRow,
} from "@/lib/notifications";

export async function getNotificationBellAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [] as AppNotification[], unreadCount: 0 };

  const [feedResult, unreadResult] = await Promise.all([
    supabase
      .from("notification_recipients")
      .select(`read_at, notification:notifications!notification_recipients_notification_id_fkey (id, notification_type, title, message, action_url, created_at)`)
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(7),
    supabase
      .from("notification_recipients")
      .select("notification_id, notification:notifications!inner(id)", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("read_at", null),
  ]);

  if (feedResult.error || unreadResult.error) {
    console.error("Unable to refresh notification bell:", {
      feedError: feedResult.error?.message,
      unreadError: unreadResult.error?.message,
    });
    return { notifications: [] as AppNotification[], unreadCount: 0 };
  }

  const notifications = ((feedResult.data ?? []) as unknown as NotificationRecipientRow[])
    .map(normalizeNotification)
    .filter((item): item is AppNotification => Boolean(item));
  return { notifications, unreadCount: unreadResult.count ?? 0 };
}

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
  revalidatePath("/notifications");
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
  revalidatePath("/notifications");
  return { success: true as const };
}
