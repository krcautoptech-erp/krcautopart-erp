import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { type PushSubscription } from "web-push";

import { createAdminClient } from "@/utils/supabase/admin";

type PushTarget = {
  action_url: string | null;
  auth_key: string;
  delivery_id: number;
  endpoint: string;
  event_key: string;
  message: string;
  notification_id: number;
  p256dh_key: string;
  subscription_id: number;
  title: string;
};

export type PushEvent = {
  entityId: number;
  eventKey: "approved" | "assigned" | "cancelled" | "rejected" | "submitted";
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function pushErrorDetails(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { message: "push_delivery_failed", statusCode: 0 };
  }
  const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "push_delivery_failed";
  const responseBody =
    "body" in error && typeof error.body === "string"
      ? error.body.slice(0, 400)
      : "";
  return {
    message: responseBody || message,
    responseBody,
    statusCode:
      "statusCode" in error && Number.isFinite(Number(error.statusCode))
        ? Number(error.statusCode)
        : 0,
  };
}

function deliveryOptions(eventKey: string) {
  const urgent = ["assigned", "rejected", "submitted"].includes(eventKey);
  return {
    TTL: urgent ? 60 * 60 : 6 * 60 * 60,
    urgency: urgent ? ("high" as const) : ("normal" as const),
  };
}

async function completeDelivery(
  supabase: SupabaseClient,
  target: PushTarget,
  result: { error?: string; statusCode?: number; success: boolean },
) {
  const { error } = await supabase.rpc("complete_web_push_delivery", {
    p_delivery_id: target.delivery_id,
    p_error: result.error ?? null,
    p_status_code: result.statusCode || null,
    p_success: result.success,
  });
  if (error) {
    console.error("Unable to update Web Push delivery:", {
      code: error.code,
      deliveryId: target.delivery_id,
      message: error.message,
    });
  }
}

async function sendTargets(supabase: SupabaseClient, targets: PushTarget[]) {
  const settled = await Promise.allSettled(
    targets.map(async (target) => {
      const subscription: PushSubscription = {
        endpoint: target.endpoint,
        keys: { auth: target.auth_key, p256dh: target.p256dh_key },
      };
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            actionUrl: target.action_url ?? "/notifications",
            body: target.message,
            tag: `notification-${target.notification_id}`,
            title: target.title,
          }),
          {
            ...deliveryOptions(target.event_key),
            topic: `n${target.notification_id}`.slice(0, 32),
          },
        );
        await completeDelivery(supabase, target, { success: true });
        return true;
      } catch (error) {
        const details = pushErrorDetails(error);
        await completeDelivery(supabase, target, {
          error: details.message,
          statusCode: details.statusCode,
          success: false,
        });
        console.error("Unable to send Web Push notification:", {
          deliveryId: target.delivery_id,
          notificationId: target.notification_id,
          providerResponse: details.responseBody || undefined,
          statusCode: details.statusCode,
        });
        return false;
      }
    }),
  );

  return {
    attempted: targets.length,
    delivered: settled.filter(
      (result) => result.status === "fulfilled" && result.value,
    ).length,
  };
}

export async function dispatchQueuedWebPush(
  supabase: SupabaseClient,
  limit = 50,
) {
  if (!configureWebPush()) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("claim_web_push_deliveries", {
    p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
  });
  if (error) throw new Error(`WEB_PUSH_CLAIM_FAILED:${error.message}`);
  return sendTargets(supabase, (data ?? []) as PushTarget[]);
}

async function dispatchAfterEvent(event: PushEvent) {
  try {
    return await dispatchQueuedWebPush(createAdminClient(), 100);
  } catch (error) {
    // The in-app notification remains authoritative and the queue retains the
    // delivery for the scheduled worker; document actions must not fail here.
    console.error("Web Push event dispatch deferred:", {
      entityId: event.entityId,
      eventKey: event.eventKey,
      error,
    });
    return { attempted: 0, delivered: 0 };
  }
}

export function sendPurchaseRequisitionPush(
  _supabase: SupabaseClient,
  event: PushEvent,
) {
  return dispatchAfterEvent(event);
}

export function sendPurchaseOrderPush(
  _supabase: SupabaseClient,
  event: PushEvent,
) {
  return dispatchAfterEvent(event);
}

export function sendStockCountPush(
  _supabase: SupabaseClient,
  event: PushEvent,
) {
  return dispatchAfterEvent(event);
}
