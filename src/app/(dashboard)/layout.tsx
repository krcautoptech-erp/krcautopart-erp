import { AppShell } from "@/components/app-shell";
import { BackToTopButton } from "@/components/back-to-top-button";
import {
  normalizeNotification,
  type AppNotification,
  type NotificationRecipientRow,
} from "@/lib/notifications";
import { getPublicCompanyBranding } from "@/lib/company-settings.server";
import { createClient } from "@/utils/supabase/server";
import { UnsavedChangesProvider } from "@/components/unsaved-changes";
import { resolveVapidConfiguration } from "@/lib/vapid-config";

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
  let permissionCodes: string[] = [];
  let vapidPublicKey: string | null = null;
  try {
    vapidPublicKey = resolveVapidConfiguration(process.env).publicKey;
  } catch (error) {
    console.error("Web Push configuration is unavailable:", {
      message: error instanceof Error ? error.message : "invalid_configuration",
    });
  }

  if (user) {
    const [feedResult, unreadResult, ownerResult, permissionsResult] = await Promise.all([
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
        .limit(7),
      supabase
        .from("notification_recipients")
        .select("notification_id, notification:notifications!inner(id)", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .is("read_at", null),
      supabase.rpc("is_current_user_owner"),
      supabase.rpc("get_current_user_permission_codes"),
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
    if (permissionsResult.error) {
      if (permissionsResult.error.code !== "PGRST202") {
        console.error("Unable to load permissions:", permissionsResult.error);
      }
      if (isOwner) {
        const { data } = await supabase
          .from("app_permissions")
          .select("permission_code")
          .eq("status", "active");
        permissionCodes = (data ?? []).map((permission) => permission.permission_code);
      }
    } else {
      permissionCodes = (permissionsResult.data ?? []) as string[];
    }
  }

  return (
    <UnsavedChangesProvider>
    <AppShell
      branding={branding}
      initialNotifications={notifications}
      initialUnreadNotificationCount={unreadNotificationCount}
      isOwner={isOwner}
      permissionCodes={permissionCodes}
      userId={user?.id ?? null}
      vapidPublicKey={vapidPublicKey}
    >
      {children}
      <BackToTopButton />
    </AppShell>
    </UnsavedChangesProvider>
  );
}
