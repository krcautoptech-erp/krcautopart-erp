import { AppShell } from "@/components/app-shell";
import { BackToTopButton } from "@/components/back-to-top-button";
import {
  normalizeNotification,
  type AppNotification,
  type NotificationRecipientRow,
} from "@/lib/notifications";
import { getPublicCompanyBranding } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const branding = await getPublicCompanyBranding();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let notifications: AppNotification[] = [];
  let unreadNotificationCount = 0;
  let isOwner = false;

  if (user) {
    const [feedResult, unreadResult, ownerResult] = await Promise.all([
      supabase
        .from("notification_recipients")
        .select(
          `
            read_at,
            notification:notifications!notification_recipients_notification_id_fkey (
              id,
              notification_type,
              title,
              message,
              action_url,
              created_at
            )
          `,
        )
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("notification_recipients")
        .select("notification_id", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .is("read_at", null),
      supabase.rpc("is_current_user_owner"),
    ]);

    if (feedResult.error || unreadResult.error) {
      console.error("Unable to load notifications:", {
        feedError: feedResult.error,
        unreadError: unreadResult.error,
      });
    } else {
      notifications = (
        (feedResult.data ?? []) as unknown as NotificationRecipientRow[]
      )
        .map(normalizeNotification)
        .filter(
          (notification): notification is AppNotification =>
            Boolean(notification),
        );
      unreadNotificationCount = unreadResult.count ?? 0;
    }
    isOwner = ownerResult.data === true;
  }

  return (
    <AppShell
      branding={branding}
      initialNotifications={notifications}
      initialUnreadNotificationCount={unreadNotificationCount}
      isOwner={isOwner}
      userId={user?.id ?? null}
    >
      {children}
      <BackToTopButton />
    </AppShell>
  );
}
