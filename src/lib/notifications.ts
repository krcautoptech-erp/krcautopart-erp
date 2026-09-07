export type AppNotification = {
  actionUrl: string | null;
  createdAt: string;
  id: number;
  message: string;
  readAt: string | null;
  title: string;
  type: "purchase_order" | "purchase_requisition";
};

type NotificationRelation = {
  action_url: string | null;
  created_at: string;
  id: number;
  message: string;
  notification_type: string;
  title: string;
};

export type NotificationRecipientRow = {
  notification: NotificationRelation | NotificationRelation[] | null;
  read_at: string | null;
};

export function normalizeNotification(
  row: NotificationRecipientRow,
): AppNotification | null {
  const notification = Array.isArray(row.notification)
    ? row.notification[0]
    : row.notification;

  if (
    !notification ||
    !["purchase_order", "purchase_requisition"].includes(
      notification.notification_type,
    )
  ) {
    return null;
  }

  return {
    actionUrl: notification.action_url,
    createdAt: notification.created_at,
    id: Number(notification.id),
    message: notification.message,
    readAt: row.read_at,
    title: notification.title,
    type: notification.notification_type as AppNotification["type"],
  };
}
