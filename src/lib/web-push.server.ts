import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { type PushSubscription } from "web-push";

type PushTarget = {
  action_url: string | null;
  auth_key: string;
  endpoint: string;
  message: string;
  notification_id: number;
  p256dh_key: string;
  subscription_id: number;
  title: string;
};

type PushEvent = {
  entityId: number;
  eventKey: "approved" | "rejected" | "submitted";
};

type PushNotificationType = "purchase_order" | "purchase_requisition";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendDocumentPush(
  supabase: SupabaseClient,
  event: PushEvent,
  notificationType: PushNotificationType,
  fallbackUrl: string,
) {
  if (!configureWebPush()) {
    console.warn("Web Push is not configured. Missing VAPID environment variables.");
    return;
  }

  const { data, error } = await supabase.rpc(
    "get_document_push_targets",
    {
      p_entity_id: event.entityId,
      p_event_key: event.eventKey,
      p_notification_type: notificationType,
    },
  );

  if (error) {
    console.error("Unable to load Web Push targets:", {
      code: error.code,
      message: error.message,
    });
    return;
  }

  const targets = (data ?? []) as PushTarget[];
  if (targets.length === 0) {
    console.warn("No active Web Push targets found:", {
      entityId: event.entityId,
      eventKey: event.eventKey,
      notificationType,
    });
    return;
  }

  await Promise.allSettled(
    targets.map(async (target) => {
      const subscription: PushSubscription = {
        endpoint: target.endpoint,
        keys: {
          auth: target.auth_key,
          p256dh: target.p256dh_key,
        },
      };

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            actionUrl: target.action_url ?? fallbackUrl,
            body: target.message,
            tag: `notification-${target.notification_id}`,
            title: target.title,
          }),
          { TTL: 60 * 60, urgency: "high" },
        );
      } catch (pushError) {
        const statusCode =
          typeof pushError === "object" &&
          pushError !== null &&
          "statusCode" in pushError
            ? Number(pushError.statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          await supabase.rpc("report_invalid_document_push_subscription", {
            p_entity_id: event.entityId,
            p_event_key: event.eventKey,
            p_notification_type: notificationType,
            p_status_code: statusCode,
            p_subscription_id: target.subscription_id,
          });
          return;
        }

        console.error("Unable to send Web Push notification:", {
          entityId: event.entityId,
          eventKey: event.eventKey,
          notificationType,
          statusCode,
        });
      }
    }),
  );
}

export async function sendPurchaseRequisitionPush(
  supabase: SupabaseClient,
  event: PushEvent,
) {
  return sendDocumentPush(
    supabase,
    event,
    "purchase_requisition",
    "/purchase/pr",
  );
}

export async function sendPurchaseOrderPush(
  supabase: SupabaseClient,
  event: PushEvent,
) {
  return sendDocumentPush(supabase, event, "purchase_order", "/purchase/po");
}
