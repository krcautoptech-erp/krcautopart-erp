import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  NOTIFICATION_PAGE_SIZE,
  notificationSearchTerm,
  parseNotificationInboxFilters,
} from "@/lib/notification-inbox";
import {
  normalizeNotification,
  type AppNotification,
} from "@/lib/notifications";
import { createClient } from "@/utils/supabase/server";
import { resolveVapidConfiguration } from "@/lib/vapid-config";

import { NotificationInbox } from "./notification-inbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "ค้นหาและติดตามการแจ้งเตือนล่าสุดของคุณ",
  title: "การแจ้งเตือนทั้งหมด | KRC ERP",
};

type NotificationQueryRow = {
  action_url: string | null;
  created_at: string;
  id: number;
  message: string;
  notification_recipients:
    | { read_at: string | null; recipient_user_id: string }
    | Array<{ read_at: string | null; recipient_user_id: string }>;
  notification_type: string;
  title: string;
};

function toAppNotification(row: NotificationQueryRow): AppNotification | null {
  const recipient = Array.isArray(row.notification_recipients)
    ? row.notification_recipients[0]
    : row.notification_recipients;

  return normalizeNotification({
    notification: {
      action_url: row.action_url,
      created_at: row.created_at,
      id: row.id,
      message: row.message,
      notification_type: row.notification_type,
      title: row.title,
    },
    read_at: recipient?.read_at ?? null,
  });
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseNotificationInboxFilters(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const from = (filters.page - 1) * NOTIFICATION_PAGE_SIZE;
  const to = from + NOTIFICATION_PAGE_SIZE - 1;
  let query = supabase
    .from("notifications")
    .select(
      `
        id,
        notification_type,
        title,
        message,
        action_url,
        created_at,
        notification_recipients!inner (
          read_at,
          recipient_user_id
        )
      `,
      { count: "exact" },
    )
    .eq("notification_recipients.recipient_user_id", user.id);

  if (filters.status === "unread") {
    query = query.is("notification_recipients.read_at", null);
  } else if (filters.status === "read") {
    query = query.not("notification_recipients.read_at", "is", null);
  }
  if (filters.type !== "all") {
    query = query.eq("notification_type", filters.type);
  }
  if (filters.startDate) {
    query = query.gte("created_at", `${filters.startDate}T00:00:00+07:00`);
  }
  if (filters.endDate) {
    query = query.lte("created_at", `${filters.endDate}T23:59:59.999+07:00`);
  }
  const search = notificationSearchTerm(filters.q);
  if (search) {
    query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
  }

  const result = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const items = ((result.data ?? []) as unknown as NotificationQueryRow[])
    .map(toAppNotification)
    .filter((item): item is AppNotification => Boolean(item));
  let vapidPublicKey: string | null = null;
  try {
    vapidPublicKey = resolveVapidConfiguration(process.env).publicKey;
  } catch {
    // The control will report unsupported until server configuration is complete.
  }

  return (
    <NotificationInbox
      error={result.error ? "ไม่สามารถโหลดรายการแจ้งเตือนได้ กรุณาลองใหม่อีกครั้ง" : null}
      filters={filters}
      items={items}
      nowIso={new Date().toISOString()}
      totalItems={result.count ?? 0}
      vapidPublicKey={vapidPublicKey}
    />
  );
}
